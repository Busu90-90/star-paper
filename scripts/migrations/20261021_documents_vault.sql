-- Documents vault: contracts, endorsements, travel papers, registrations,
-- receipts and show paperwork, each with its key dates and its files.
-- Additive only (no DROP), so it can be applied with execute_sql.
--
-- A document is one record (dates, links to an artist or booking, notes);
-- its files are versions in document_files (a signed copy replaces a draft
-- without losing it). Files live in the private team-docs bucket at
-- <scope>/<document id>/<file>, where <scope> is the team id, or u-<user id>
-- for a personal workspace.
--
-- Sensitive documents (passports, IDs) are seen only by the team's owner and
-- admins and whoever added them.

CREATE TABLE IF NOT EXISTS public.documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'other'
              CHECK (kind IN ('contract', 'endorsement', 'travel', 'registration', 'money', 'show', 'other')),
  title       TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  party       TEXT NOT NULL DEFAULT '' CHECK (length(party) <= 160),
  artist_id   UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  booking_id  UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  signed_on   DATE,
  starts_on   DATE,
  ends_on     DATE,
  notice_on   DATE,
  key_dates   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(key_dates) = 'array'),
  amount      NUMERIC CHECK (amount IS NULL OR amount >= 0),
  sensitive   BOOLEAN NOT NULL DEFAULT false,
  archived    BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_team_idx ON public.documents (team_id);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON public.documents (owner_id);
CREATE INDEX IF NOT EXISTS documents_artist_idx ON public.documents (artist_id);
CREATE INDEX IF NOT EXISTS documents_booking_idx ON public.documents (booking_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.document_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path         TEXT NOT NULL UNIQUE CHECK (length(path) BETWEEN 10 AND 300),
  name         TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  mime         TEXT NOT NULL DEFAULT '',
  size         INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  label        TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 40),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_files_document_idx ON public.document_files (document_id);
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

-- Who may see a document, and who may change it.
CREATE OR REPLACE FUNCTION public.can_see_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = p_document_id
      AND (
        (d.team_id IS NULL AND d.owner_id = auth.uid())
        OR (d.team_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = d.team_id
            AND tm.user_id = auth.uid()
            AND (NOT d.sensitive OR tm.role IN ('owner', 'admin') OR d.owner_id = auth.uid())
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.can_see_document(p_document_id) AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = p_document_id
      AND (
        (d.team_id IS NULL AND d.owner_id = auth.uid())
        OR (d.team_id IS NOT NULL AND public.has_team_permission(d.team_id, 'edit'))
      )
  );
$$;

-- The folder a document's files must live in.
CREATE OR REPLACE FUNCTION public.document_folder(p_document_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(d.team_id::text, 'u-' || d.owner_id::text) || '/' || d.id::text || '/'
  FROM public.documents d
  WHERE d.id = p_document_id;
$$;

-- Storage object names are <scope>/<document id>/<file>; anything else is refused.
CREATE OR REPLACE FUNCTION public.team_doc_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN split_part(object_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN split_part(object_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_see_document(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_document(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.document_folder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.document_folder(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_doc_id(TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'Members can read documents') THEN
    CREATE POLICY "Members can read documents" ON public.documents FOR SELECT TO authenticated
      USING (
        (team_id IS NULL AND owner_id = auth.uid())
        OR (team_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = documents.team_id
            AND tm.user_id = auth.uid()
            AND (NOT documents.sensitive OR tm.role IN ('owner', 'admin') OR documents.owner_id = auth.uid())
        ))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'Editors can add documents') THEN
    CREATE POLICY "Editors can add documents" ON public.documents FOR INSERT TO authenticated
      WITH CHECK (
        owner_id = auth.uid()
        AND (team_id IS NULL OR public.has_team_permission(team_id, 'edit'))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'Editors can change documents') THEN
    CREATE POLICY "Editors can change documents" ON public.documents FOR UPDATE TO authenticated
      USING (public.can_edit_document(id))
      WITH CHECK ((team_id IS NULL AND owner_id = auth.uid()) OR (team_id IS NOT NULL AND public.has_team_permission(team_id, 'edit')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'Editors can remove documents') THEN
    CREATE POLICY "Editors can remove documents" ON public.documents FOR DELETE TO authenticated
      USING (public.can_edit_document(id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_files' AND policyname = 'Members can read document files') THEN
    CREATE POLICY "Members can read document files" ON public.document_files FOR SELECT TO authenticated
      USING (public.can_see_document(document_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_files' AND policyname = 'Editors can add document files') THEN
    CREATE POLICY "Editors can add document files" ON public.document_files FOR INSERT TO authenticated
      WITH CHECK (
        owner_id = auth.uid()
        AND public.can_edit_document(document_id)
        AND path LIKE public.document_folder(document_id) || '%'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_files' AND policyname = 'Editors can change document files') THEN
    CREATE POLICY "Editors can change document files" ON public.document_files FOR UPDATE TO authenticated
      USING (public.can_edit_document(document_id))
      WITH CHECK (public.can_edit_document(document_id) AND path LIKE public.document_folder(document_id) || '%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'document_files' AND policyname = 'Editors can remove document files') THEN
    CREATE POLICY "Editors can remove document files" ON public.document_files FOR DELETE TO authenticated
      USING (public.can_edit_document(document_id));
  END IF;
END $$;

-- A document stays in the workspace it was made in.
CREATE OR REPLACE TRIGGER prevent_documents_workspace_reassignment
  BEFORE UPDATE OF owner_id, team_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_workspace_reassignment();

-- Private bucket: 20 MB per file, PDFs and photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('team-docs', 'team-docs', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Members can open team documents') THEN
    CREATE POLICY "Members can open team documents"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'team-docs' AND public.can_see_document(public.team_doc_id(name)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Editors can upload team documents') THEN
    CREATE POLICY "Editors can upload team documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'team-docs'
        AND public.can_edit_document(public.team_doc_id(name))
        AND name LIKE public.document_folder(public.team_doc_id(name)) || '%'
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Editors can remove team documents') THEN
    CREATE POLICY "Editors can remove team documents"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'team-docs' AND public.can_edit_document(public.team_doc_id(name)));
  END IF;
END $$;
