-- CV-070 fix P2: torna created_by nullable para compatibilidade com service_role
-- auth.uid() retorna NULL em contexto service_role; NOT NULL rejeitava inserts de
-- edge functions e triggers. A politica RLS de SELECT continua restringindo
-- authenticated: cada usuario ve so o proprio feedback (created_by = auth.uid()).
-- service_role ignora RLS por padrao e pode inserir com created_by = NULL.
ALTER TABLE public.copilot_feedback ALTER COLUMN created_by DROP NOT NULL;
