-- qr_attempts
-- Rollback: dropa a função de retenção e a tabela nova (o DROP TABLE leva junto índice, policy e grants).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.qr_attempts_purge();
--   drop table if exists public.qr_attempts;
--
-- Cartão t_7af815d8 (área migrations). O QR de pareamento de uma conexão do WhatsApp hoje
-- não é auditável: cada leitura gera um QR de vida curta e some sem rastro. Sem registro não
-- se sabe se o dono da conexão chegou a escanear, quantas tentativas houve nem por que uma
-- tentativa morreu — e sem um lugar para dizer "conectado" não há como fechar o ciclo do
-- pareamento no banco.
--
-- O que esta migration cria (só o lado banco; quem ESCREVE a tentativa é o worker de Edge e o
-- front, que ficam em cartões próprios):
--   * a tabela `public.qr_attempts`, uma linha por tentativa de pareamento, com o CONTRATO do
--     cartão:
--       conexão   -> `connection_id` (FK para `whatsapp_connections`, ON DELETE CASCADE: apagar
--                    a conexão leva junto o histórico de QR dela, que deixou de ter sentido);
--       criado_em -> `created_at` (default now());
--       expira_em -> `expires_at`;
--       status    -> `status`, domínio fechado ('pendente','conectado','expirado','erro');
--       motivo    -> `reason` (texto livre, explica por que a tentativa virou 'expirado'/'erro').
--   * índice de leitura pela conexão (`connection_id, created_at desc`) e índice por `created_at`
--     (o da retenção, abaixo), para a tabela não virar varredura com o tempo.
--   * RLS LIGADA e fechada: nada de leitura por usuário comum. Só o STAFF de conexões (admin ou
--     supervisor, via `public.is_admin_or_supervisor(auth.uid())` — a mesma autoridade que já
--     governa `whatsapp_connections`) lê e escreve. `anon` não recebe grant nenhum; `service_role`
--     passa por cima da RLS (policy não cobre service_role, que é BYPASSRLS).
--   * RETENÇÃO de 30 dias: a função `public.qr_attempts_purge()` apaga o que passou de 30 dias e
--     devolve a contagem. É `security definer`, fechada para `public`/`anon`/`authenticated` e
--     concedida só a `service_role` (é chamada por cron/Edge, não por cliente). O agendamento do
--     cron (`select cron.schedule('cleanup-qr-attempts', '0 4 * * *', 'SELECT public.qr_attempts_purge()')`)
--     é do dono do workflow/infra, não deste cartão — aqui fica só o mecanismo de limpeza.
--
-- DDL idempotente (`create table if not exists`, `create index if not exists`,
-- `drop policy if exists` antes do `create policy`), porque o replay do banco local desta tarefa
-- reaplica os arquivos da pasta.
--
-- Provado em Postgres 17 descartável por
-- `scripts/db-audit/qr-attempts-contract.test.sh`: BLOCO A (defeito — a tabela não existe), BLOCO B
-- (contrato — colunas/FK, domínio de status, RLS staff x usuário comum x anon, cascade na conexão,
-- retenção de 30 dias preservando o recente e purga fechada para authenticated).

create table if not exists public.qr_attempts (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  status        text not null default 'pendente',
  reason        text,
  constraint qr_attempts_status_check check (status in ('pendente', 'conectado', 'expirado', 'erro'))
);

-- Leitura pela conexão (o painel abre pelo histórico de QR de uma conexão).
create index if not exists idx_qr_attempts_connection_created
  on public.qr_attempts (connection_id, created_at desc);

-- Da retenção: `qr_attempts_purge` filtra por created_at sozinho.
create index if not exists idx_qr_attempts_created_at
  on public.qr_attempts (created_at);

alter table public.qr_attempts enable row level security;

-- Uma única policy FOR ALL: staff (admin/supervisor) lê e escreve. `using` cobre SELECT/UPDATE/
-- DELETE; `with check` cobre INSERT/UPDATE. Fora do staff, a RLS responde vazio/nega.
drop policy if exists qr_attempts_staff_all on public.qr_attempts;
create policy qr_attempts_staff_all on public.qr_attempts
  for all
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()));

-- Grants explícitos: sem grant para `anon` (nem leitura), grant cheio para `authenticated` (que a
-- RLS filtra) e `service_role` (a Edge que grava a tentativa e o cron de retenção).
revoke all on public.qr_attempts from anon;
grant select, insert, update, delete on public.qr_attempts to authenticated;
grant all on public.qr_attempts to service_role;

-- Retenção: 30 dias. Uma instrução só (delete ... returning + count), falha fechada por construção
-- (a janela é literal — não há parâmetro que possa virar purge total).
create or replace function public.qr_attempts_purge()
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.qr_attempts as q
     where q.created_at < now() - interval '30 days'
    returning 1
  )
  select coalesce(count(*), 0)::integer from removed;
$$;

revoke all on function public.qr_attempts_purge() from public, anon, authenticated;
grant execute on function public.qr_attempts_purge() to service_role;

comment on table public.qr_attempts is
  'Uma tentativa de pareamento por QR de uma conexao do WhatsApp (cartao t_7af815d8). Leitura/escrita so para staff (admin/supervisor) via RLS; escrita canonica pela Edge; retencao de 30 dias por public.qr_attempts_purge().';
comment on column public.qr_attempts.connection_id is
  'Conexao (conexao) alvo do QR. FK para whatsapp_connections com ON DELETE CASCADE: apagar a conexao leva o historico de QR dela.';
comment on column public.qr_attempts.created_at is
  'criado_em: instante em que o QR foi emitido.';
comment on column public.qr_attempts.expires_at is
  'expira_em: instante em que o QR deixa de valer.';
comment on column public.qr_attempts.status is
  'pendente | conectado | expirado | erro. Default pendente (QR emitido, ainda nao escaneado).';
comment on column public.qr_attempts.reason is
  'motivo: texto livre explicando por que a tentativa virou expirado/erro. NULL enquanto pendente.';
comment on function public.qr_attempts_purge() is
  'Retencao de 30 dias: apaga tentativas de QR com created_at < now() - 30 dias e devolve a contagem. security definer, so service_role (cron/Edge).';
