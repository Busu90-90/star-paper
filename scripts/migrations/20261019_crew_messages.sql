-- Crew messaging: channels, show chats, direct messages, replies, edits,
-- mentions and read tracking. Additive only, so it can be
-- applied with execute_sql. Existing rows land in the General channel.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_channel_shape') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_channel_shape CHECK (
      (channel = 'dm' AND recipient_id IS NOT NULL AND recipient_id <> user_id)
      OR (channel IN ('general', 'strategy') AND recipient_id IS NULL)
      OR (channel LIKE 'show:%' AND length(channel) BETWEEN 6 AND 120 AND recipient_id IS NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_length') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_content_length CHECK (length(content) BETWEEN 1 AND 4000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS messages_team_created_idx ON public.messages (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_team_channel_idx ON public.messages (team_id, channel, created_at DESC);

-- Direct messages are visible only to the two people in them.
ALTER POLICY "Team members can view messages" ON public.messages
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
        AND team_members.user_id = auth.uid()
    )
    AND (messages.recipient_id IS NULL OR messages.user_id = auth.uid() OR messages.recipient_id = auth.uid())
  );

-- A direct message must go to someone in the same team.
ALTER POLICY "Team members can post messages" ON public.messages
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = messages.team_id
        AND team_members.user_id = auth.uid()
    )
    AND (
      messages.recipient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.team_members r
        WHERE r.team_id = messages.team_id
          AND r.user_id = messages.recipient_id
      )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'Users can edit own messages') THEN
    CREATE POLICY "Users can edit own messages"
      ON public.messages FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.team_members
          WHERE team_members.team_id = messages.team_id
            AND team_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Only content and edited_at may change on an edit; pins go through set_message_pinned.
CREATE OR REPLACE FUNCTION public.messages_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_setting('sp.pinning', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.team_id := OLD.team_id;
  NEW.user_id := OLD.user_id;
  NEW.username := OLD.username;
  NEW.channel := OLD.channel;
  NEW.recipient_id := OLD.recipient_id;
  NEW.reply_to := OLD.reply_to;
  NEW.pinned := OLD.pinned;
  NEW.created_at := OLD.created_at;
  NEW.edited_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'messages_guard_update') THEN
    CREATE TRIGGER messages_guard_update
      BEFORE UPDATE ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.messages_guard_update();
  END IF;
END $$;

-- Anyone in the conversation can pin or unpin a message.
CREATE OR REPLACE FUNCTION public.set_message_pinned(p_message_id UUID, p_pinned BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  m public.messages%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = m.team_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this team';
  END IF;
  IF m.recipient_id IS NOT NULL AND auth.uid() NOT IN (m.user_id, m.recipient_id) THEN
    RAISE EXCEPTION 'Not part of this conversation';
  END IF;
  PERFORM set_config('sp.pinning', 'on', true);
  UPDATE public.messages SET pinned = COALESCE(p_pinned, false) WHERE id = p_message_id;
  PERFORM set_config('sp.pinning', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_message_pinned(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_message_pinned(UUID, BOOLEAN) TO authenticated;

-- What each person has read, per conversation (channel key, or dm:<other user id>).
CREATE TABLE IF NOT EXISTS public.message_reads (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  channel_key  TEXT NOT NULL CHECK (length(channel_key) BETWEEN 1 AND 120),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id, channel_key)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'message_reads' AND policyname = 'Users manage own read markers') THEN
    CREATE POLICY "Users manage own read markers"
      ON public.message_reads FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.team_members
          WHERE team_members.team_id = message_reads.team_id
            AND team_members.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Live updates for edits, pins and deletes as well as new messages.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
