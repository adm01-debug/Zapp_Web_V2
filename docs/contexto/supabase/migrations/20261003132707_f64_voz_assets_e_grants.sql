CREATE TABLE public.multiplix_voice_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL,
  caminho text NOT NULL,
  voice_id text NOT NULL,
  modelo text,
  caracteres integer,
  duracao_ms integer,
  created_by uuid,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_voice_assets_hash_key UNIQUE (hash),
  CONSTRAINT multiplix_voice_assets_caracteres_nao_negativo
    CHECK (caracteres IS NULL OR caracteres >= 0),
  CONSTRAINT multiplix_voice_assets_duracao_nao_negativa
    CHECK (duracao_ms IS NULL OR duracao_ms >= 0)
)

CREATE INDEX idx_multiplix_voice_assets_voice_id
  ON public.multiplix_voice_assets(voice_id)

CREATE INDEX idx_multiplix_voice_assets_validos
  ON public.multiplix_voice_assets(created_at DESC)
  WHERE invalidated_at IS NULL

CREATE TABLE public.multiplix_voice_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL,
  titular text NOT NULL,
  roles public.app_role[],
  perfis uuid[],
  origem text,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_voice_grants_alvo_obrigatorio
    CHECK (roles IS NOT NULL OR perfis IS NOT NULL)
)

CREATE INDEX idx_multiplix_voice_grants_voice_id
  ON public.multiplix_voice_grants(voice_id)
  WHERE revoked_at IS NULL

REVOKE ALL ON TABLE public.multiplix_voice_assets FROM anon

REVOKE ALL ON TABLE public.multiplix_voice_grants FROM anon

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.multiplix_voice_assets FROM authenticated

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.multiplix_voice_grants FROM authenticated

GRANT SELECT ON TABLE public.multiplix_voice_assets TO authenticated

GRANT SELECT ON TABLE public.multiplix_voice_grants TO authenticated

ALTER TABLE public.multiplix_voice_assets FORCE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_voice_grants FORCE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_voice_assets ENABLE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_voice_grants ENABLE ROW LEVEL SECURITY

CREATE POLICY "Granted callers can read voice assets" ON public.multiplix_voice_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.multiplix_voice_grants g
      WHERE g.voice_id = multiplix_voice_assets.voice_id
        AND g.revoked_at IS NULL
        AND (
          (g.roles IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(g.roles) AS r WHERE public.has_role(auth.uid(), r)
          ))
          OR (g.perfis IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = ANY (g.perfis)
          ))
        )
    )
    OR created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  )

CREATE POLICY "Admins read every voice grant" ON public.multiplix_voice_grants
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

CREATE POLICY "Callers read their own voice grants" ON public.multiplix_voice_grants
  FOR SELECT
  TO authenticated
  USING (
    revoked_at IS NULL
    AND (
      (roles IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(roles) AS r WHERE public.has_role(auth.uid(), r)
      ))
      OR (perfis IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid() AND p.id = ANY (perfis)
      ))
    )
  )

INSERT INTO storage.buckets (id, name, public)
VALUES ('multiplix-voice', 'multiplix-voice', false)
ON CONFLICT (id) DO NOTHING
