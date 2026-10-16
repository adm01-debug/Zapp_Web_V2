-- csat_pipeline — ciclo da pesquisa de satisfação: convite agendado, envio e
-- captura da nota (cartão t_69726cda).
-- Rollback: desfaz colunas, os 3 índices, constraints, as 2 policies, RPCs e o job pg_cron criados aqui.
-- Rollback (SQL executável, na ordem — espelha o corpo: cron, 2 RPCs, 2 policies, 3 constraints, 3 índices, 5 colunas, 2 NOT NULL):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'csat-reply-capture-tick'; end if; end $$;
--   drop function if exists public.fn_capture_csat_replies(integer);
--   drop function if exists public.claim_due_csat_surveys(integer);
--   drop policy if exists "Service role manages CSAT surveys" on public.csat_surveys;
--   drop policy if exists "Users can insert CSAT surveys" on public.csat_surveys;
--   create policy "Users can insert CSAT surveys" on public.csat_surveys for insert to authenticated with check (agent_id is null or agent_id in (select id from public.profiles where user_id = auth.uid()) or public.is_admin_or_supervisor(auth.uid()));
--   alter table public.csat_surveys drop constraint if exists csat_surveys_responded_consistency;
--   alter table public.csat_surveys drop constraint if exists csat_surveys_rating_range;
--   alter table public.csat_surveys drop constraint if exists csat_surveys_status_check;
--   drop index if exists public.uq_csat_surveys_conversation;
--   drop index if exists public.idx_csat_surveys_dispatch;
--   drop index if exists public.idx_csat_surveys_contact_invites;
--   alter table public.csat_surveys drop column if exists message_text;
--   alter table public.csat_surveys drop column if exists conversation_id;
--   alter table public.csat_surveys drop column if exists responded_at;
--   alter table public.csat_surveys drop column if exists send_at;
--   alter table public.csat_surveys drop column if exists status;
--   -- NOTA: rating/agent_id só voltam a NOT NULL sem linha nula; o rollback não apaga convite,
--   -- então em banco que já recebeu convite (agent_id nulo) ele falha de propósito, em vez de mentir.
--   alter table public.csat_surveys alter column rating set not null;
--   alter table public.csat_surveys alter column agent_id set not null;
--
-- PROBLEMA: csat_surveys só sabia guardar RESPOSTA (rating e agent_id NOT NULL): não
-- havia onde registrar um convite agendado, quando ele saiu e qual mensagem foi enviada,
-- e nada ligava a resposta "1..5" do contato de volta à pesquisa. Sem isso o ciclo
-- (agendar → enviar → capturar) não existia e a nota só entrava por digitação.
--
-- DECISÕES (registradas aqui porque são de projeto, não de código):
--   * consent_status = 'revoked' BLOQUEIA o convite (o convite vira 'failed'); 'granted',
--     'unknown', 'opt_in' e nulo liberam. Não há CHECK de consent_status na base, então a
--     leitura é por valor: só 'revoked' barra. Não há 'opt_out' na base e nenhum
--     outro valor (nem nulo, via coalesce(..., 'unknown')) bloqueia.
--   * O cooldown conta CONVITES (linhas de csat_surveys em 'sent'/'responded' criadas nos
--     últimos 30 dias), não encerramentos de conversa. Um convite que falhou ('failed') não
--     consome o cooldown; duas pesquisas para a MESMA conversa nunca coexistem (índice único
--     parcial em conversation_id).
--   * V2 não tem tabela de conversas (a conversa é o contato): conversation_id fica sem FK,
--     só como identificador da conversa de origem informado pelo sistema.
--   * A janela de 72 h da captura conta de send_at (horário agendado do disparo).
--     send_at é o envio efetivo por construção: o claim despacha tudo que está
--     devido e o cron roda a cada 2 min, então o atraso normal é de ~2 min e a
--     resposta anterior a send_at nunca casa (provado no T3). Exceção conhecida:
--     após indisponibilidade, o lote atrasa e uma resposta entre send_at e o
--     disparo tardio pode casar — aceito porque a captura é idempotente por
--     convite (um convite ganha uma nota; a 2ª rodada captura 0) e um convite
--     nunca é reenviado. (recusa rodada 1, ponto 4)
-- ADITIVO: nenhuma coluna, policy, grant ou dado existente é removido. RLS já está ligada
-- em csat_surveys; a leitura por agente/admin (policies atuais) fica como está.

-- ── 1. colunas do ciclo ──────────────────────────────────────────────────────
alter table public.csat_surveys
  add column if not exists status         text,
  add column if not exists send_at        timestamptz,
  add column if not exists responded_at   timestamptz,
  add column if not exists conversation_id uuid,
  add column if not exists message_text   text;

-- Backfill das linhas legadas (só resposta): elas já nasceram respondidas.
-- Não há gatilho em csat_surveys (conferido no teste), então este UPDATE não
-- reescreve data de ninguém nem dispara efeito colateral.
update public.csat_surveys
   set status       = 'responded',
       send_at      = coalesce(conversation_resolved_at, created_at),
       responded_at = created_at
 where status is null;

alter table public.csat_surveys alter column status  set default 'scheduled';
alter table public.csat_surveys alter column send_at set default now();
alter table public.csat_surveys alter column status  set not null;
alter table public.csat_surveys alter column send_at set not null;

-- Convite não tem nota nem agente até o envio/registro: as duas colunas afrouxam.
alter table public.csat_surveys alter column rating   drop not null;
alter table public.csat_surveys alter column agent_id drop not null;

-- ── 2. invariantes ───────────────────────────────────────────────────────────
-- not valid + validate: não trava escrita concorrente durante a validação.
-- drop antes do add: o replay local reaplica as migrations, então o arquivo
-- precisa poder rodar duas vezes sem estourar 'constraint already exists'.
alter table public.csat_surveys drop constraint if exists csat_surveys_status_check;
alter table public.csat_surveys
  add constraint csat_surveys_status_check
  check (status in ('scheduled', 'sent', 'responded', 'failed')) not valid;
alter table public.csat_surveys validate constraint csat_surveys_status_check;

alter table public.csat_surveys drop constraint if exists csat_surveys_rating_range;
alter table public.csat_surveys
  add constraint csat_surveys_rating_range
  check (rating is null or rating between 1 and 5) not valid;
alter table public.csat_surveys validate constraint csat_surveys_rating_range;

-- 'responded' e responded_at andam juntos (nem resposta sem carimbo, nem carimbo sem resposta).
alter table public.csat_surveys drop constraint if exists csat_surveys_responded_consistency;
alter table public.csat_surveys
  add constraint csat_surveys_responded_consistency
  check ((status = 'responded') = (responded_at is not null)) not valid;
alter table public.csat_surveys validate constraint csat_surveys_responded_consistency;

-- ── 3. índices do ciclo ──────────────────────────────────────────────────────
-- Uma pesquisa por conversa (convite é único; conversa repetida não gera 2º convite).
create unique index if not exists uq_csat_surveys_conversation
  on public.csat_surveys (conversation_id)
  where conversation_id is not null;

-- Fila do claim: só os pendentes importam.
create index if not exists idx_csat_surveys_dispatch
  on public.csat_surveys (send_at)
  where status = 'scheduled';

-- Cooldown por contato (conta convites entregues).
create index if not exists idx_csat_surveys_contact_invites
  on public.csat_surveys (contact_id, created_at)
  where status in ('sent', 'responded');

-- ── 4. policy do sistema ─────────────────────────────────────────────────────
-- O sistema grava com service_role (que já tem BYPASSRLS); a policy fica explícita,
-- como no resto do schema. A leitura por agente/admin NÃO é tocada.
drop policy if exists "Service role manages CSAT surveys" on public.csat_surveys;
create policy "Service role manages CSAT surveys" on public.csat_surveys
  for all to service_role using (true) with check (true);

-- Convite agendado só pelo sistema: authenticated grava só o formato legado
-- (resposta já dada: status 'responded' + nota + carimbo). Sem isso um agente
-- plantava 'scheduled' com message_text livre e o claim despachava o texto
-- ao cliente. O sistema grava via service_role (bypass + policy acima).
-- (recusa rodada 1, ponto 1)
drop policy if exists "Users can insert CSAT surveys" on public.csat_surveys;
create policy "Users can insert CSAT surveys" on public.csat_surveys
  for insert to authenticated
  with check (
    status = 'responded'
    and rating is not null
    and responded_at is not null
    and (
      agent_id is null
      or agent_id in (select id from public.profiles where user_id = auth.uid())
      or public.is_admin_or_supervisor(auth.uid())
    )
  );

-- ── 5. RPC do envio: claim atômico dos convites devidos ──────────────────────
create or replace function public.claim_due_csat_surveys(p_limit integer default 50)
returns table (
  id uuid,
  contact_id uuid,
  agent_id uuid,
  phone text,
  message_text text,
  send_at timestamptz,
  conversation_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_csat_limit' using errcode = '22023';
  end if;
  v_limit := least(p_limit, 200);

  -- 1) convite que NÃO pode sair: contato ausente/apagado ou consentimento revogado.
  --    Vira terminal ('failed') em vez de ficar preso na fila para sempre.
  update public.csat_surveys s
     set status = 'failed'
   where s.status = 'scheduled'
     and not exists (
       select 1
         from public.contacts c
        where c.id = s.contact_id
          and c.deleted_at is null
          and coalesce(c.consent_status, 'unknown') <> 'revoked'
     );

  -- 2) claim: marca 'sent' e devolve o lote. Um convite por contato por chamada
  --    (candidatos: distinct on, o mais antigo devido; o outro 'scheduled' do mesmo
  --    contato fica para a próxima — recusa rodada 1, ponto 2). for update skip
  --    locked evita dois workers pegarem a mesma linha; a rechecagem de
  --    status='scheduled' no update fecha a corrida entre a escolha e a trava.
  --    O cooldown conta convites dos últimos 30 dias.
  return query
  with candidatos as (
    select distinct on (s.contact_id) s.id as id
      from public.csat_surveys s
      join public.contacts c on c.id = s.contact_id
     where s.status = 'scheduled'
       and s.send_at <= now()
       and c.deleted_at is null
       and coalesce(c.consent_status, 'unknown') <> 'revoked'
       and not exists (
         select 1
           from public.csat_surveys anterior
          where anterior.contact_id = s.contact_id
            and anterior.id <> s.id
            and anterior.status in ('sent', 'responded')
            and anterior.created_at > now() - interval '30 days'
       )
     order by s.contact_id, s.send_at, s.created_at
     limit v_limit
  ),
  devidos as (
    select s.id, s.contact_id, s.agent_id, c.phone, s.message_text, s.send_at, s.conversation_id
      from public.csat_surveys s
      join public.contacts c on c.id = s.contact_id
     where s.id in (select candidatos.id from candidatos)
     order by s.send_at, s.created_at
     for update of s skip locked
  )
  update public.csat_surveys s
     set status = 'sent'
    from devidos d
   where s.id = d.id
     and s.status = 'scheduled'
  returning s.id, d.contact_id, d.agent_id, d.phone, d.message_text, d.send_at, d.conversation_id;
end;
$$;

comment on function public.claim_due_csat_surveys(integer) is
  'Reivindica convites de CSAT devidos (scheduled, send_at <= now(), contato elegível e fora do cooldown de 30 dias), marca sent e devolve o lote. Só service_role.';

-- ── 6. RPC da captura: resposta "1..5" do contato vira nota ──────────────────
create or replace function public.fn_capture_csat_replies(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_captured integer := 0;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_csat_limit' using errcode = '22023';
  end if;
  v_limit := least(p_limit, 500);

  -- Resposta = mensagem ENTRANTE (sender 'contact'), texto de um dígito 1..5,
  -- dentro da janela de 72 h do convite. A mais antiga da janela é a resposta.
  -- Idempotente: só linhas ainda 'sent' e sem nota entram; rodar de novo captura 0.
  with respostas as (
    select distinct on (s.id)
           s.id               as survey_id,
           btrim(m.content)::integer as rating,
           m.created_at       as responded_at
      from public.csat_surveys s
      join public.messages m
        on m.contact_id = s.contact_id
       and m.sender = 'contact'
       and coalesce(m.is_deleted, false) = false
       and btrim(m.content) ~ '^[1-5]$'
       and m.created_at >= s.send_at
       and m.created_at <= s.send_at + interval '72 hours'
     where s.status = 'sent'
       and s.rating is null
       and s.responded_at is null
     order by s.id, m.created_at
     limit v_limit
  )
  update public.csat_surveys s
     set rating       = r.rating,
         responded_at = r.responded_at,
         status       = 'responded'
    from respostas r
   where s.id = r.survey_id
     and s.status = 'sent'
     and s.rating is null
     and s.responded_at is null;
  get diagnostics v_captured = row_count;
  return v_captured;
end;
$$;

comment on function public.fn_capture_csat_replies(integer) is
  'Captura a resposta 1..5 do contato na janela de 72 h do convite e grava a nota na mesma transação. Idempotente. Só service_role.';

-- ── 7. ACL: negar por padrão e abrir só para service_role ────────────────────
revoke all on function public.claim_due_csat_surveys(integer) from public, anon, authenticated;
grant execute on function public.claim_due_csat_surveys(integer) to service_role;

revoke all on function public.fn_capture_csat_replies(integer) from public, anon, authenticated;
grant execute on function public.fn_capture_csat_replies(integer) to service_role;

-- ── 8. agendamento (modelo PE-102) ───────────────────────────────────────────
-- Comando de cron é a chamada qualificada da função (sem DDL/DML direto), igual ao
-- 'close-stale-calls'. Só quando pg_cron existe (local e produção têm).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'csat-reply-capture-tick';
    perform cron.schedule(
      'csat-reply-capture-tick',
      '*/2 * * * *',
      'select public.fn_capture_csat_replies()'
    );
  end if;
end $$;
