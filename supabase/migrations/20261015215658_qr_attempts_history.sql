-- qr_attempts_history
-- Rollback: desagenda o job 'purge-qr-attempts' (se pg_cron existir), dropa a funcao e a tabela.
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'purge-qr-attempts'; end if; end $$;
--   drop function if exists public.purge_qr_attempts();
--   drop table if exists public.qr_attempts;
--
-- Historico de tentativas de conexao por QR Code.
-- Hoje o app nao guarda nada: quando o QR expira, o suporte nao tem como saber
-- se o cliente tentou conectar, quantas vezes, nem se o erro foi do lado do
-- provedor. Esta migration cria SO UMA tabela de historico (aditiva: nenhuma
-- tabela, coluna, policy ou dado existente e alterado) com:
--   * status em ingles ('pending'|'connected'|'expired'|'error');
--   * error_message (mensagem JA SANITIZADA pelo escritor, sem token/PII) para
--     o suporte entender a falha e para medir a taxa de erro;
--   * created_at para medir o tempo e a taxa de falha por conexao.
--
-- Escrita: SO o service_role (Edge Function). O cliente nao insere nada: nao ha
-- policy de INSERT/UPDATE/DELETE para anon nem authenticated, e o GRANT de
-- escrita nao existe para esses papeis.
-- Leitura: espelha EXATAMENTE quem enxerga a conexao — a policy consulta a
-- propria whatsapp_connections, cuja RLS (admin/supervisor) decide o acesso.
-- Assim a regra nao duplica o predicado e acompanha qualquer mudanca futura na
-- visibilidade de conexoes.
-- Retencao: o agendador existente (pg_cron) chama 1x/dia public.purge_qr_attempts(),
-- que apaga o que passou de 30 dias (dado operacional, sem valor de auditoria).
-- ON DELETE CASCADE: apagada a conexao, o historico dela vai junto.

create table public.qr_attempts (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  status        text not null,
  error_message text,
  created_at    timestamptz not null default now(),
  constraint qr_attempts_status_check
    check (status in ('pending', 'connected', 'expired', 'error')),
  constraint qr_attempts_error_message_len_check
    check (error_message is null or char_length(error_message) between 1 and 500)
);

comment on table public.qr_attempts is
  'Historico de tentativas de conexao por QR Code. Escrita so pelo service_role (Edge Function); leitura por quem enxerga a conexao. Apagado aos 30 dias pelo job purge-qr-attempts.';
comment on column public.qr_attempts.connection_id is
  'Conexao que gerou a tentativa. ON DELETE CASCADE: o historico nao sobrevive a conexao.';
comment on column public.qr_attempts.status is
  'pending (QR gerado), connected (pareado), expired (QR venceu sem leitura), error (falha do provedor).';
comment on column public.qr_attempts.error_message is
  'Mensagem de erro JA SANITIZADA (sem token, sem PII). Nula quando nao ha erro.';

-- Indice por conexao/data: alimenta a tela de suporte (historico da conexao em
-- ordem decrescente) e cobre a busca da FK no cascade.
create index qr_attempts_connection_id_created_at_idx
  on public.qr_attempts (connection_id, created_at desc);

-- Indice da varredura de retencao (delete ... where created_at < corte).
create index qr_attempts_created_at_idx
  on public.qr_attempts (created_at);

-- Permissao: negar por padrao e abrir so o que e necessario.
revoke all on table public.qr_attempts from public, anon, authenticated;
-- leitura para o papel logado (o que ele enxerga e decidido pela RLS abaixo)
grant select on table public.qr_attempts to authenticated;
-- escrita apenas para o service_role (Edge Function) — e quem ignora RLS
grant select, insert, update, delete on table public.qr_attempts to service_role;

alter table public.qr_attempts enable row level security;

create policy "Quem enxerga a conexao enxerga as tentativas de QR"
  on public.qr_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.whatsapp_connections c
       where c.id = qr_attempts.connection_id
    )
  );

-- ------------------------------------------------------------------ retencao
create or replace function public.purge_qr_attempts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_retencao constant interval := interval '30 days';
  v_apagadas integer := 0;
begin
  delete from public.qr_attempts
   where created_at < now() - c_retencao;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

comment on function public.purge_qr_attempts() is
  'Retencao do historico de tentativas de QR: apaga o que passou de 30 dias. Devolve quantas linhas apagou.';

-- Negar por padrao: rotina de manutencao, executada so pelo job (service_role).
revoke all on function public.purge_qr_attempts() from public, anon, authenticated;
grant execute on function public.purge_qr_attempts() to service_role;

-- Agendamento no agendador existente (pg_cron), 1x/dia as 03:25 UTC.
-- Idempotente: desagenda o job homonimo antes de recriar.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'purge-qr-attempts';
    perform cron.schedule(
      'purge-qr-attempts',
      '25 3 * * *',
      'select public.purge_qr_attempts()'
    );
  end if;
end $$;
