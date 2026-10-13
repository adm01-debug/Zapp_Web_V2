-- autoria_e_oraculo_de_papel
-- Prova da migration 20261013210006_autoria_e_oraculo_de_papel.sql:
--   F1 autoria de conversation_closures.closed_by / conversation_events.performed_by;
--   F2 WITH CHECK nas policies de UPDATE de calls e email_messages;
--   F3 funcoes de papel sem oraculo (secd_caller_ok) + anon bloqueado.
--
-- Roda como postgres no banco LOCAL da tarefa (nunca producao), exercitando RLS pelo
-- papel real (set local role authenticated + request.jwt.claims):
--   zapp-db-local psql . <conjunto> -f supabase/tests/autoria_e_oraculo_de_papel.sql
--
-- Tudo em UMA transacao com ROLLBACK no fim: nenhum dado fica. Qualquer assertiva
-- falha com excecao (ON_ERROR_STOP do chamador reprova); passa com 'OK'.
--
-- A prova NAO e tautologica: cada assertiva contradiz o comportamento antigo —
-- F1 insere sem autoria (antes gravava NULL), F2 reescreve o dono (antes passava) e
-- F3 pergunta por um usuario que E admin (antes respondia true).

begin;

-- ============================================================================
-- Fixtures (como postgres, com gatilhos de dominio desligados: replica)
-- ============================================================================
set local session_replication_role = replica;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000a0001'), -- admin (alvo do oraculo)
  ('00000000-0000-0000-0000-0000000a0002'), -- agente chamador
  ('00000000-0000-0000-0000-0000000a0003'); -- outro agente

insert into public.profiles (id, user_id, name, role, access_level, permissions, is_active) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000a0001', 'Admin Alvo',        'admin', 'full',  '{}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000a0002', 'Agente Chamador',   'agent', 'basic', '{}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000a0003', 'Outro Agente',      'agent', 'basic', '{}'::jsonb, true);

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin'),
  ('00000000-0000-0000-0000-0000000a0002', 'agent'),
  ('00000000-0000-0000-0000-0000000a0003', 'agent');

insert into public.contacts (id, name, phone, assigned_to) values
  ('00000000-0000-0000-0000-0000000c0001', 'Contato Um',  '+5511900000001', '00000000-0000-0000-0000-0000000f0002'),
  ('00000000-0000-0000-0000-0000000c0002', 'Contato Dois','+5511900000002', '00000000-0000-0000-0000-0000000f0002');

insert into public.calls (id, contact_id, agent_id, direction, status) values
  ('00000000-0000-0000-0000-0000000d0005', '00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-0000000f0002', 'outbound', 'ended');

insert into public.gmail_accounts (id, user_id, email_address) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000a0002', 'agente@exemplo.test'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000a0003', 'outro@exemplo.test');

insert into public.email_threads (id, gmail_account_id, gmail_thread_id) values
  ('00000000-0000-0000-0000-0000000d0006', '00000000-0000-0000-0000-0000000b0001', 'thread-teste-1');

insert into public.email_messages (
  id, thread_id, gmail_message_id, gmail_account_id, from_address, to_addresses,
  subject, body_text, body_html, snippet, label_ids, internal_date, direction
) values (
  '00000000-0000-0000-0000-0000000d0007', '00000000-0000-0000-0000-0000000d0006', 'msg-teste-1',
  '00000000-0000-0000-0000-0000000b0001', 'cliente@exemplo.test', array['agente@exemplo.test'],
  'Assunto', 'corpo', '<p>corpo</p>', 'trecho', array[]::text[], now(), 'inbound'
);

set local session_replication_role = origin;

-- ============================================================================
-- F1. Autoria carimbada pelo gatilho (sob o papel authenticated)
-- ============================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
set local role authenticated;

do $$
declare v_ok boolean;
begin
  -- fecha sem informar closed_by (caminho FSM): o gatilho carimba o chamador.
  insert into public.conversation_closures (id, contact_id, close_reason) values
    ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000c0001', 'resolvido');
  -- tenta forjar outro autor: o gatilho sobrescreve.
  insert into public.conversation_closures (id, contact_id, close_reason, closed_by) values
    ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000c0002', 'resolvido', '00000000-0000-0000-0000-0000000f0001');
  -- idem para eventos.
  insert into public.conversation_events (id, contact_id, event_type) values
    ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000c0001', 'note');
  insert into public.conversation_events (id, contact_id, event_type, performed_by) values
    ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000c0002', 'note', '00000000-0000-0000-0000-0000000f0001');
end $$;

reset role;

do $$
declare v_closed uuid; v_perf uuid;
begin
  select closed_by into v_closed from public.conversation_closures where id = '00000000-0000-0000-0000-0000000d0001';
  if v_closed is distinct from '00000000-0000-0000-0000-0000000f0002' then
    raise exception 'F1a FALHOU: fechamento sem autor ficou closed_by=%', v_closed;
  end if;
  raise notice 'F1a OK: fechamento ganhou o autor (chamador)';

  select closed_by into v_closed from public.conversation_closures where id = '00000000-0000-0000-0000-0000000d0002';
  if v_closed is distinct from '00000000-0000-0000-0000-0000000f0002' then
    raise exception 'F1b FALHOU: autoria forjada persistiu (% em vez do chamador)', v_closed;
  end if;
  raise notice 'F1b OK: autoria forjada foi sobrescrita pelo chamador';

  select performed_by into v_perf from public.conversation_events where id = '00000000-0000-0000-0000-0000000d0003';
  if v_perf is distinct from '00000000-0000-0000-0000-0000000f0002' then
    raise exception 'F1c FALHOU: evento sem autor ficou performed_by=%', v_perf;
  end if;
  raise notice 'F1c OK: evento ganhou o autor (chamador)';

  select performed_by into v_perf from public.conversation_events where id = '00000000-0000-0000-0000-0000000d0004';
  if v_perf is distinct from '00000000-0000-0000-0000-0000000f0002' then
    raise exception 'F1d FALHOU: autoria forjada do evento persistiu (%)', v_perf;
  end if;
  raise notice 'F1d OK: autoria forjada do evento foi sobrescrita';
end $$;

-- ============================================================================
-- F2. WITH CHECK nas policies de UPDATE (calls e email_messages)
-- ============================================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
set local role authenticated;

do $$
declare v_n int;
begin
  -- chamada do proprio agente: update legitimo passa.
  update public.calls set agent_notes = 'nota do agente' where id = '00000000-0000-0000-0000-0000000d0005';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'F2a FALHOU: update legitimo da propria chamada afetou % linhas', v_n;
  end if;

  -- reatribuir a chamada a outro agente: o WITH CHECK tem de negar.
  begin
    update public.calls set agent_id = '00000000-0000-0000-0000-0000000f0003' where id = '00000000-0000-0000-0000-0000000d0005';
    raise exception 'F2b FALHOU: UPDATE reatribuiu a chamada a outro agente';
  exception when others then
    if sqlerrm like '%F2b FALHOU%' then raise; end if;
    raise notice 'F2b OK: reatribuicao da chamada negada (%)', sqlerrm;
  end;

  -- mensagem de e-mail: update legitimo passa.
  update public.email_messages set is_read = true where id = '00000000-0000-0000-0000-0000000d0007';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'F2c FALHOU: update legitimo da propria mensagem afetou % linhas', v_n;
  end if;

  -- mover a mensagem para a conta de outro usuario: o WITH CHECK tem de negar.
  begin
    update public.email_messages set gmail_account_id = '00000000-0000-0000-0000-0000000b0002' where id = '00000000-0000-0000-0000-0000000d0007';
    raise exception 'F2d FALHOU: UPDATE moveu a mensagem para a conta de outro usuario';
  exception when others then
    if sqlerrm like '%F2d FALHOU%' then raise; end if;
    raise notice 'F2d OK: mudanca de conta da mensagem negada (%)', sqlerrm;
  end;
end $$;

-- Confirma que o alvo nao foi tocado pelas tentativas negadas.
reset role;
do $$
declare v_agent uuid; v_acc uuid;
begin
  select agent_id into v_agent from public.calls where id = '00000000-0000-0000-0000-0000000d0005';
  if v_agent is distinct from '00000000-0000-0000-0000-0000000f0002' then
    raise exception 'F2e FALHOU: chamada terminou com agent_id=% apos o UPDATE negado', v_agent;
  end if;
  select gmail_account_id into v_acc from public.email_messages where id = '00000000-0000-0000-0000-0000000d0007';
  if v_acc is distinct from '00000000-0000-0000-0000-0000000b0001' then
    raise exception 'F2f FALHOU: mensagem terminou com conta=% apos o UPDATE negado', v_acc;
  end if;
  raise notice 'F2e/F2f OK: os registros negados permaneceram com o dono original';
end $$;

-- ============================================================================
-- F3. Funcoes de papel sem oraculo
-- ============================================================================
-- (a) agente comum nao descobre o papel de outro usuario (o alvo E admin).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
set local role authenticated;

do $$
declare v boolean; v_n int;
begin
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0001');
  if v is not false then
    raise exception 'F3a FALHOU: oraculo — agente descobriu que outro usuario e admin (%)', v;
  end if;
  v := public.has_role('00000000-0000-0000-0000-0000000a0001', 'admin');
  if v is not false then
    raise exception 'F3b FALHOU: has_role vazou o papel de outro usuario (%)', v;
  end if;
  -- resposta identica para usuario que existe (admin) e que nao existe: sem oraculo.
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000000ff');
  if v is not false then
    raise exception 'F3c FALHOU: id inexistente respondeu % (distingue de caso existente)', v;
  end if;
  select count(*) into v_n from public.get_profile_role_for_check('00000000-0000-0000-0000-0000000a0001');
  if v_n <> 0 then
    raise exception 'F3d FALHOU: get_profile_role_for_check devolveu % linha(s) de outro usuario', v_n;
  end if;
  -- e o proprio papel continua consultavel.
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0002');
  if v is not false then
    raise exception 'F3e FALHOU: agente nao pode estar marcado como admin (%)', v;
  end if;
  raise notice 'F3a-e OK: agente nao consulta papel alheio e nao ha oraculo';
end $$;

-- (b) admin pode consultar qualquer papel (regra interna preservada).
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0001","role":"authenticated"}';
set local role authenticated;
do $$
declare v boolean;
begin
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0002');
  if v is not false then
    raise exception 'F3f FALHOU: admin leu errado o papel do agente (%)', v;
  end if;
  v := public.has_role('00000000-0000-0000-0000-0000000a0002', 'agent');
  if v is not true then
    raise exception 'F3g FALHOU: admin nao conseguiu consultar papel de outro usuario';
  end if;
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0001');
  if v is not true then
    raise exception 'F3h FALHOU: admin nao reconheceu o proprio papel';
  end if;
  raise notice 'F3f-h OK: admin consulta qualquer papel (regra interna preservada)';
end $$;

-- (c) interno/service role (sem JWT) continua consultando qualquer papel.
reset role;
set local request.jwt.claims = '{}';
do $$
declare v boolean;
begin
  v := public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0001');
  if v is not true then
    raise exception 'F3i FALHOU: chamada interna perdeu acesso ao papel alheio (%)', v;
  end if;
  v := public.has_role('00000000-0000-0000-0000-0000000a0002', 'agent');
  if v is not true then
    raise exception 'F3j FALHOU: chamada interna nao consultou papel';
  end if;
  raise notice 'F3i-j OK: service_role/interno segue consultando qualquer papel';
end $$;

-- (d) anon nao executa as funcoes de papel.
set local role anon;
do $$
begin
  begin
    perform public.has_role('00000000-0000-0000-0000-0000000a0001', 'admin');
    raise exception 'F3k FALHOU: anon executou has_role';
  exception when others then
    if sqlerrm like '%F3k FALHOU%' then raise; end if;
    raise notice 'F3k OK: anon bloqueado em has_role (%)', sqlerrm;
  end;
end $$;
reset role;

-- (e) guarda check-secdef-public-execute: nenhuma funcao DEFINER desta migration
--     executavel por anon.
do $$
declare v_off int;
begin
  select count(*) into v_off
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and p.proname in ('has_role','is_admin_or_supervisor','is_admin','get_profile_role_for_check',
                       'bind_conversation_closure_author','bind_conversation_event_author')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_off <> 0 then
    raise exception 'F3l FALHOU: % funcao(oes) SECURITY DEFINER alcancavel(is) por anon', v_off;
  end if;
  raise notice 'F3l OK: nenhuma funcao DEFINER da migration executavel por anon';
end $$;

rollback;
