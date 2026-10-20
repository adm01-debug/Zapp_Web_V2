-- ia_usage_outbox_duravel
-- Rollback: drop table if exists public.ai_usage_outbox;
--
-- Item 44 (IA-TIMEOUT-001) — a OUTBOX DURÁVEL que o código da ponta JÁ usa.
--
-- Por que esta migration existe: `supabase/functions/_shared/ai-usage.ts` (já na
-- ponta, commit c8c6018f9) grava em `public.ai_usage_outbox` a linha do log
-- essencial de IA que não pôde ser entregue e só dá baixa (`processed_at`) depois
-- de a linha existir em `ai_usage_logs`. Nenhuma migration criava essa tabela:
-- o POST batia num alvo inexistente e o `catch` do código engolia a falha, então
-- o log essencial voltava a ser BEST EFFORT — o defeito medido no item 44.
--
-- Contrato lido do código da ponta (não inventado):
--   payload      -> `{linha}` pronta para reenvio;
--   motivo       -> texto da baixa (payload_invalido | tentativas_esgotadas | ...);
--   tentativas   -> contador de reprocessamentos (teto MAX_TENTATIVAS_REPROCESSO = 5);
--   processed_at -> NULL = pendente; a leitura filtra `processed_at=is.null`;
--   id           -> chave do PATCH de baixa (a leitura pede `select=id,payload,tentativas`);
--   created_at   -> desempate da fila (ordem `tentativas.asc,created_at.asc`).
--
-- Natureza: ADITIVA e IDEMPOTENTE (`create table if not exists`). Tabela nova,
-- sem backfill e sem tocar nenhuma tabela existente. Sem `CONCURRENTLY`
-- (convenção do projeto: a migration roda em transação única).
-- O dono da tabela é o papel que roda as migrations (postgres): os privilégios de
-- dono são implícitos e NÃO são concedidos a mais ninguém abaixo.

create table if not exists public.ai_usage_outbox (
  id uuid not null default gen_random_uuid() primary key,
  payload jsonb not null,
  motivo text not null,
  tentativas integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Índice da ÚNICA consulta que a fila faz: pendentes do que menos tentou para o
-- que mais tentou e, no empate, do mais antigo. Parcial (só pendentes) para o
-- índice não crescer com o histórico já entregue.
create index if not exists idx_ai_usage_outbox_pendentes
  on public.ai_usage_outbox (tentativas, created_at)
  where processed_at is null;

-- Fila INTERNA da Edge Function: nenhum usuário final (anon/authenticated) lê ou
-- escreve; o acesso é só do service_role — mesmo desenho de `ai_usage_logs`.
-- A RLS é a trava de LINHA; o GRANT é a trava de TABELA. A policy é de service_role
-- e cobre também o caso de o papel não ter BYPASSRLS.
alter table public.ai_usage_outbox enable row level security;

drop policy if exists ai_usage_outbox_service_role on public.ai_usage_outbox;
create policy ai_usage_outbox_service_role
  on public.ai_usage_outbox
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.ai_usage_outbox from public;
revoke all on public.ai_usage_outbox from anon;
revoke all on public.ai_usage_outbox from authenticated;
grant all on public.ai_usage_outbox to service_role;
