-- transfer_conversation_unica_e_fila_aguardando
-- Auditoria Conversas 2026-11-13, P0-3 + P1-3.
--
-- Rollback (SQL executável, na ordem):
--   Recriar public.transfer_conversation(uuid, uuid, uuid, text, uuid) com o corpo de
--   20261015182236_transfer_conversation_limpa_agente_e_cas.sql (bloco
--   "create function ... $function$;" + revoke/grant/comment), trocando "create function"
--   por "create or replace function". A sobrecarga de 4 argumentos NÃO deve voltar
--   (era ela que tornava toda chamada ambígua).
--
-- P0-3 — O QUE ESTAVA ERRADO
--   A 20261015182236 fez DROP da versão de 4 argumentos e criou a de 5
--   (p_expected_agent_id). Em produção a de 4 foi recriada por fora (hotfix de 18/10),
--   então existem DUAS: (uuid,uuid,uuid,text) e (uuid,uuid,uuid,text,uuid), ambas com
--   defaults. Toda chamada por argumentos nomeados sem o 5º casa as duas e o Postgres
--   responde 42725 "function ... is not unique" (PostgREST: PGRST203). Medido: 0
--   eventos 'transfer' em toda a história; "Transferir" e "Assumir" sempre falham.
--   Correção: DROP da de 4 argumentos. A de 5 é a canônica.
--
-- P1-3 — Transferir para FILA deixava a conversa 'open' sem dono (some de
--   "Aguardando", ninguém vê que precisa atender). Agora, na mesma transação:
--     destino fila  + status 'open'    -> 'waiting' (sem dono = aguardando, regra §4.1)
--     destino agente + status 'waiting' -> 'open'    (ganhou dono = em atendimento)
--   resolved/archived não mudam de status (transferir não reabre conversa encerrada).
--   O gatilho de FSM (enforce_conversation_status_transition) aceita as duas
--   transições e carimba conversation_status_changed_at.
--
-- Fora isso o corpo é IDÊNTICO ao de 20261015182236 (sessão, destino único,
-- can_edit_contact, compare-and-set 40001 com FOR UPDATE, evento com metadata.note).
--
-- PRÉ-CONDIÇÃO: a versão de 5 argumentos existe (20261015182236 aplicada).
-- PÓS-CONDIÇÃO: existe exatamente UMA public.transfer_conversation.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('public.transfer_conversation(uuid, uuid, uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'pre-condicao: transfer_conversation(uuid,uuid,uuid,text,uuid) ausente — aplique 20261015182236 antes';
  END IF;
END
$pre$;

DROP FUNCTION IF EXISTS public.transfer_conversation(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.transfer_conversation(
  p_contact_id uuid,
  p_to_agent_id uuid default null,
  p_to_queue_id uuid default null,
  p_note text default null,
  p_expected_agent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from_agent uuid;
  v_from_queue uuid;
  v_from_status text;
  v_next_status text;
  v_event_id uuid;
  v_jwt_role text;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');

  if v_jwt_role <> 'service_role' and auth.uid() is null then
    raise exception 'Sem sessao autenticada.' using errcode = 'insufficient_privilege';
  end if;

  if p_contact_id is null then
    raise exception 'transfer_conversation: p_contact_id obrigatorio' using errcode = '22023';
  end if;
  if (p_to_agent_id is null) = (p_to_queue_id is null) then
    raise exception 'transfer_conversation: informe exatamente um destino (p_to_agent_id ou p_to_queue_id).'
      using errcode = '22023';
  end if;

  select c.assigned_to, c.queue_id, c.conversation_status
    into v_from_agent, v_from_queue, v_from_status
    from public.contacts c
   where c.id = p_contact_id
   for update;

  if not found then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_jwt_role <> 'service_role'
     and not public.can_edit_contact(v_from_agent, v_from_queue) then
    raise exception 'Contato nao encontrado ou sem permissao para transferir.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_expected_agent_id is not null
     and v_from_agent is distinct from p_expected_agent_id then
    raise exception 'Contato ja foi transferido por outro atendente.'
      using errcode = '40001';
  end if;

  -- P1-3: status acompanha o dono. Fila sem dono = aguardando; agente = em atendimento.
  v_next_status := case
    when p_to_queue_id is not null and v_from_status = 'open' then 'waiting'
    when p_to_agent_id is not null and v_from_status = 'waiting' then 'open'
    else v_from_status
  end;

  update public.contacts c
     set assigned_to         = p_to_agent_id,
         queue_id            = coalesce(p_to_queue_id, c.queue_id),
         conversation_status = v_next_status
   where c.id = p_contact_id;

  insert into public.conversation_events
    (contact_id, event_type, from_agent_id, from_queue_id,
     to_agent_id, to_queue_id, performed_by, metadata)
  values
    (p_contact_id, 'transfer', v_from_agent, v_from_queue,
     p_to_agent_id, p_to_queue_id,
     public.get_profile_id_for_user(auth.uid()),
     jsonb_build_object('note', p_note,
                        'from_status', v_from_status,
                        'to_status', v_next_status))
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) to authenticated, service_role;

comment on function public.transfer_conversation(uuid, uuid, uuid, text, uuid) is
  'R2-INB-009 item 88 + PK-03 + P0-3/P1-3 (2026-11-13): ÚNICA versão. Transferência atômica (UPDATE contacts + INSERT conversation_events). Destino fila libera o contato (assigned_to NULL) e open->waiting; destino agente mantém a fila e waiting->open. p_expected_agent_id = compare-and-set do dono (40001). SECURITY DEFINER com can_edit_contact; service_role livre.';

DO $post$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'transfer_conversation';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'pos-condicao: esperado 1 transfer_conversation, ha %', v_count;
  END IF;
END
$post$;

COMMIT;
