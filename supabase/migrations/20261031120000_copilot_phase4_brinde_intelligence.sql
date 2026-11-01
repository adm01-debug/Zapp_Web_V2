-- CV-031/037/038/039: Colunas de inteligência de venda da Fase 4 RADAR
-- Adicionadas a copilot_sessions sem DDL destrutivo.

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS brinde_evidence jsonb NOT NULL DEFAULT
    '{"B":null,"R":null,"I":null,"N":null,"D":null,"E":null}';

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS comm_style text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS intent text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS sentiment text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS decision_role text
    CHECK (decision_role IN ('buyer','user','approver','intermediary','unknown'));

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS occasion text;

ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.copilot_sessions.brinde_evidence IS
  'CV-031 — id da mensagem que originou cada letra B·R·I·N·D·E.';
COMMENT ON COLUMN public.copilot_sessions.comm_style IS
  'CV-037 — etiquetas de estilo de comunicação do cliente.';
COMMENT ON COLUMN public.copilot_sessions.decision_role IS
  'CV-038 — papel do interlocutor na decisão (buyer/approver/intermediary/…).';
COMMENT ON COLUMN public.copilot_sessions.occasion IS
  'CV-035/036 — ocasião comercial detectada (natal, sipat, outubro_rosa, …).';
COMMENT ON COLUMN public.copilot_sessions.stakeholders IS
  'CV-039 — pessoas citadas na conversa que participam da decisão.';
