-- IA-051 — Correlacionar toda execução (Bloco 06 — observabilidade).
--
-- Por que esta migration existe:
--   Hoje uma execução de IA não pode ser seguida ponta a ponta. O
--   `ai_usage_logs` registra QUEM consumiu e QUANTO, mas não QUAL operação
--   gerou aquele consumo — então um incidente em uma análise não se liga à
--   ação que o pediu nem ao job da fila que o executou, e o consumo não se
--   reconcilia por ação (é a base da IA-054).
--
-- O que entra:
--   `request_id` — uuid v4 opaco, criado no cliente (a identidade do IA-048,
--                  `src/lib/aiRequest/context.ts`) ou no worker. NUNCA dado
--                  pessoal: a etapa proíbe usar contato, telefone ou e-mail
--                  como identificador de log, então o `contactId` que vive na
--                  identidade do IA-048 fica DE FORA deste campo. O helper
--                  `_shared/ai-usage.ts` recusa qualquer valor que não seja
--                  uuid, para que o campo não vire depósito de PII.
--   `job_id`     — o job da fila (`ai_jobs.id`) que originou a execução,
--                  quando a execução veio do worker.
--   `attempt`    — a tentativa correspondente (`ai_jobs.attempt_count`).
--                  É um contador, não uma entidade com id próprio: a fila
--                  modela tentativa assim, e criar um "attemptId" aqui seria
--                  inventar um conceito que o schema não tem.
--
-- Natureza: ADITIVA e IDEMPOTENTE. Só colunas novas nullable e índices novos.
-- Nenhum backfill: as linhas anteriores ficam com NULL, que é a verdade —
-- naquele momento não existia correlação alguma a registrar.
--
-- Sem `CONCURRENTLY` (convenção do projeto: migrations rodam em transação).
--
-- rollback: drop index if exists public.idx_ai_usage_logs_request_id; drop index if exists public.idx_ai_usage_logs_job_id; alter table public.ai_usage_logs drop column if exists attempt; alter table public.ai_usage_logs drop column if exists job_id; alter table public.ai_usage_logs drop column if exists request_id;

alter table public.ai_usage_logs
  add column if not exists request_id uuid,
  add column if not exists job_id uuid,
  add column if not exists attempt smallint;

-- A investigação de um incidente começa pelo request_id.
create index if not exists idx_ai_usage_logs_request_id
  on public.ai_usage_logs (request_id);

-- A outra ponta da correlação: do job da fila para o que ele consumiu.
-- Índice parcial porque a maioria das linhas não vem da fila.
create index if not exists idx_ai_usage_logs_job_id
  on public.ai_usage_logs (job_id)
  where job_id is not null;

comment on column public.ai_usage_logs.request_id is
  'IA-051: uuid opaco da operação de IA (cliente/worker). Nunca dado pessoal.';
comment on column public.ai_usage_logs.job_id is
  'IA-051: job da fila (ai_jobs.id) que originou a execução, quando houver.';
comment on column public.ai_usage_logs.attempt is
  'IA-051: tentativa do job (ai_jobs.attempt_count) no momento da execução.';
