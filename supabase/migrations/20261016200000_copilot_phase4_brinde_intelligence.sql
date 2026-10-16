-- CV-031/037/038/039: Colunas de inteligência de venda da Fase 4 RADAR
-- Adicionadas a copilot_sessions sem DDL destrutivo.

-- CV-031: evidência de onde saiu cada letra B·R·I·N·D·E
--   { "B": "msg-uuid", "R": null, ... }
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS brinde_evidence jsonb NOT NULL DEFAULT
    '{"B":null,"R":null,"I":null,"N":null,"D":null,"E":null}';

-- CV-037: estilo de comunicação detectado do cliente
--   formal | informal | concise | verbose | emoji | fast_responder | slow_responder
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS comm_style text[] NOT NULL DEFAULT '{}';

-- CV-038: papel do interlocutor na decisão de compra
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS decision_role text
    CHECK (decision_role IN ('buyer','user','approver','intermediary','unknown'));

-- CV-035/036: ocasião comercial detectada
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS occasion text;

-- CV-039: mapa de interessados mencionados
--   [{ "name": "...", "role": "...", "first_mention_msg_id": "..." }]
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]';

-- CV-040: RPC para gravar justificativa de insight
-- O campo justification é gravado diretamente no INSERT do copilot_insights.
-- Nenhuma coluna nova necessária: a coluna `sources` já carrega evidência estruturada.
-- Apenas documenta o contrato: sources[i] = { "text": "...", "msg_id": "...", "letter": "B" }

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
