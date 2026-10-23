-- Crew chat: voice notes and read receipts for direct messages.
-- Additive only (no DROP), so it can be applied with execute_sql.
--
-- Voice notes are ordinary messages with an attachment: the audio file lives in
-- the private crew-voice bucket and attachment_meta says what it is
-- ({"kind":"audio","duration":12.4,"mime":"audio/webm","peaks":[...]}).
-- Storage paths are <team id>/<conversation>/<file>, where <conversation> is
-- general, strategy, show-<booking id> or dm-<lower user id>_<higher user id>.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_meta JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_attachment_shape') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_shape CHECK (
      attachment_path IS NULL
      OR (length(attachment_path) BETWEEN 10 AND 300 AND attachment_path LIKE team_id::text || '/%')
    );
  END IF;
END $$;

-- Edits may change the text only; the attachment stays as sent.
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
  NEW.attachment_path := OLD.attachment_path;
  NEW.attachment_meta := OLD.attachment_meta;
  NEW.edited_at := now();
  RETURN NEW;
END;
$$;

-- The other person in a direct message can see how far you have read it,
-- which drives the blue ticks. Nobody else can.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'message_reads' AND policyname = 'DM partners see read markers') THEN
    CREATE POLICY "DM partners see read markers"
      ON public.message_reads FOR SELECT
      TO authenticated
      USING (
        channel_key = 'dm:' || auth.uid()::text
        AND EXISTS (
          SELECT 1 FROM public.team_members
          WHERE team_members.team_id = message_reads.team_id
            AND team_members.user_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
  END IF;
END $$;

-- Private bucket for voice notes: 8 MB, audio only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crew-voice', 'crew-voice', false, 8388608,
        ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'])
ON CONFLICT (id) DO NOTHING;

-- Who may touch a voice note: someone in the team, and for direct messages
-- only the two people whose ids are in the folder name.
CREATE OR REPLACE FUNCTION public.can_access_crew_voice(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_members.user_id = auth.uid()
      AND team_members.team_id::text = split_part(object_name, '/', 1)
  )
  AND (
    split_part(object_name, '/', 2) NOT LIKE 'dm-%'
    OR auth.uid()::text = ANY (string_to_array(substr(split_part(object_name, '/', 2), 4), '_'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_crew_voice(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_crew_voice(TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Crew can play voice notes') THEN
    CREATE POLICY "Crew can play voice notes"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'crew-voice' AND public.can_access_crew_voice(name));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Crew can upload voice notes') THEN
    CREATE POLICY "Crew can upload voice notes"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'crew-voice' AND public.can_access_crew_voice(name));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Crew can delete own voice notes') THEN
    CREATE POLICY "Crew can delete own voice notes"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'crew-voice' AND owner = auth.uid());
  END IF;
END $$;
