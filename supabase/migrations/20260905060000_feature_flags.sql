-- Feature flags server-side: liga/desliga funcionalidade sem deploy (front le, admin escreve).
-- Consumo: src/hooks/system/useFeatureFlag.ts. Chave em kebab/snake ASCII para caber em URL e log.
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_select_authenticated ON public.feature_flags FOR SELECT TO authenticated USING (true);

CREATE POLICY feature_flags_admin_write ON public.feature_flags FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.feature_flags FROM anon;

GRANT SELECT ON public.feature_flags TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;

COMMENT ON TABLE public.feature_flags IS 'Feature flags globais (key -> enabled). Leitura por qualquer usuario autenticado, escrita apenas admin via RLS. Consumido por useFeatureFlag no front.';
