-- department_invite_contract_audit_vocabulary
-- Rollback: alter table public.department_audit_logs drop constraint if exists department_audit_logs_action_check; alter table public.department_audit_logs add constraint department_audit_logs_action_check check (action in ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group')) not valid; alter table public.department_invitations drop constraint if exists department_invitations_status_check, drop constraint if exists department_invitations_use_count_within_max, drop constraint if exists department_invitations_code_format; drop trigger if exists department_invitations_code_format_insert_trg on public.department_invitations; drop function if exists public.enforce_department_invitations_code_format_on_insert(); alter table public.department_invitations add constraint department_invitations_code_format check (length(code) between 6 and 64); CREATE OR REPLACE FUNCTION public.accept_department_invite(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_invite public.department_invitations%ROWTYPE; v_profile_id uuid; BEGIN v_profile_id := public.current_profile_id(); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT * INTO v_invite FROM public.department_invitations WHERE code = upper(trim(p_code)) AND status = 'pending' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code'); END IF; IF v_invite.use_count >= v_invite.max_uses THEN RETURN jsonb_build_object('ok', false, 'error', 'invite_exhausted'); END IF; UPDATE public.department_invitations SET use_count = use_count + 1, used_at = CASE WHEN use_count + 1 >= max_uses THEN now() ELSE used_at END, used_by = CASE WHEN use_count + 1 >= max_uses THEN v_profile_id ELSE used_by END, status = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END WHERE id = v_invite.id; UPDATE public.profiles SET department_id = v_invite.department_id WHERE id = v_profile_id; INSERT INTO public.department_audit_logs(department_id, action, profile_id, details) VALUES (v_invite.department_id, 'accept_invite', v_profile_id, jsonb_build_object('code', v_invite.code, 'invite_id', v_invite.id)); RETURN jsonb_build_object('ok', true, 'department_id', v_invite.department_id); END; $f$; CREATE OR REPLACE FUNCTION public.create_department_invite(p_department_id uuid, p_max_uses integer DEFAULT 1, p_expires_hours integer DEFAULT 72) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_profile_id uuid; v_is_admin boolean; v_code text; v_invite_id uuid; BEGIN v_profile_id := public.current_profile_id(); IF v_profile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; SELECT (role IN ('admin','supervisor')) INTO v_is_admin FROM public.profiles WHERE id = v_profile_id; IF NOT v_is_admin THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authorized'); END IF; v_code := upper(substring(replace(encode(gen_random_bytes(9), 'base64'), '/', 'A'), 1, 12)); INSERT INTO public.department_invitations(department_id, code, max_uses, expires_at, created_by, status) VALUES (p_department_id, v_code, GREATEST(1, p_max_uses), now() + (p_expires_hours || ' hours')::interval, v_profile_id, 'pending') RETURNING id INTO v_invite_id; INSERT INTO public.department_audit_logs(department_id, action, profile_id, details) VALUES (p_department_id, 'create_invite', v_profile_id, jsonb_build_object('invite_id', v_invite_id, 'code', v_code, 'max_uses', p_max_uses)); RETURN jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code); END; $f$;
--
-- TC-008 / item 163 do BACKLOG_VERIFICADO (P2, área migrations):
-- "Contrato de convites e vocabulário de auditoria permanecem legados".
-- Reverificação ao vivo apontou dois objetos legados: as RPCs de convite e o
-- CHECK de `department_audit_logs.action` com 12 verbos antigos.
--
-- Estado antes, definido pelo que o repositório aplica hoje (arquivos e14/e17) e
-- REPRODUZIDO no teste `scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh`
-- (BLOCO A), que aplica esses 4 arquivos reais num Postgres 17 descartável:
--   * `department_audit_logs_action_check` = 12 verbos
--     ('accept_invite','create_invite','join_department','leave_department',
--      'remove_member','update_settings','delete_department','create_department',
--      'update_role','kick_member','create_group','delete_group') — nenhum deles
--     é o vocabulário canônico (seção 0 do PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS
--     e F09), e o hook em uso grava 'delete_invite'/'add_member'/'save_whatsapp',
--     que o CHECK nem aceita;
--   * `create_department_invite` gera código de 12 caracteres de base64, autoriza
--     pelo espelho `profiles.role` e grava action 'create_invite' COM o código em
--     `details`;
--   * `accept_department_invite` grava action 'accept_invite' COM o código em
--     `details`, fecha o convite como status 'used' e não distingue quem já é do
--     departamento.
--
-- O que esta migration faz (só o lado banco do item; o front e o DROP da tabela
-- legada são de outros cartões):
--   1. vocabulário ÚNICO de auditoria: 8 verbos canônicos
--      (invite_created, invite_revoked, invite_accepted, member_added,
--       member_removed, whatsapp_updated, department_transferred,
--       access_requested) em lugar dos 12 antigos;
--   2. contrato do convite no banco: código '^[A-Z0-9]{8}$' para INSERT novo
--      (trigger, sem revalidar UPDATE de legado), status canônico
--      ('pending','accepted','expired','revoked') e `use_count <= max_uses`;
--   3. as duas RPCs de convite reescritas IN-PLACE (mesma assinatura, mesmo GRANT):
--      código canônico de 8 caracteres com retry, autorização por
--      `is_admin_or_supervisor(auth.uid())` (a verdade é `user_roles`; `profiles.role`
--      é espelho) e auditoria sem o código em `details`.
-- DDL idempotente (todo `add constraint` vem com o `drop constraint if exists`):
-- o replay do banco local desta tarefa reaplica os arquivos da pasta.
--
-- As 3 constraints de auditoria/status/uso entram como NOT VALID de propósito: a
-- tabela pode carregar linhas legadas (status 'used', verbos antigos em
-- `department_audit_logs`) gravadas pelas RPCs antigas. Para o código do convite,
-- a regra é um trigger BEFORE INSERT: linha nova deve ter '^[A-Z0-9]{8}$', mas
-- UPDATE de convite legado pendente não revalida o código de 12 caracteres já
-- emitido nem invalida a credencial que o convidado tem em mãos. O
-- `VALIDATE CONSTRAINT` fica para o cartão que migrar os dados/consumidores
-- (front).
-- Pelo mesmo motivo, o inverso da constraint de auditoria no `-- Rollback` também
-- entra NOT VALID: as linhas canônicas gravadas pelas RPCs novas, entre a
-- aplicação e o rollback, impedem convalidar a definição antiga sem apagar
-- auditoria. A definição antiga e a vigência para linhas novas voltam iguais.

alter table public.department_audit_logs
  drop constraint if exists department_audit_logs_action_check;

alter table public.department_audit_logs
  add constraint department_audit_logs_action_check check (
    action in (
      'invite_created',
      'invite_revoked',
      'invite_accepted',
      'member_added',
      'member_removed',
      'whatsapp_updated',
      'department_transferred',
      'access_requested'
    )
  ) not valid;

alter table public.department_invitations
  drop constraint if exists department_invitations_code_format;

drop trigger if exists department_invitations_code_format_insert_trg
  on public.department_invitations;

drop function if exists public.enforce_department_invitations_code_format_on_insert();

create function public.enforce_department_invitations_code_format_on_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $trigger$
begin
  if new.code is null or new.code !~ '^[A-Z0-9]{8}$' then
    raise exception 'department_invitations_code_format'
      using errcode = '23514',
            constraint = 'department_invitations_code_format',
            table = 'department_invitations',
            schema = 'public';
  end if;

  return new;
end;
$trigger$;

create trigger department_invitations_code_format_insert_trg
  before insert on public.department_invitations
  for each row
  execute function public.enforce_department_invitations_code_format_on_insert();

alter table public.department_invitations
  drop constraint if exists department_invitations_status_check;

alter table public.department_invitations
  add constraint department_invitations_status_check check (
    status in ('pending', 'accepted', 'expired', 'revoked')
  ) not valid;

alter table public.department_invitations
  drop constraint if exists department_invitations_use_count_within_max;

alter table public.department_invitations
  add constraint department_invitations_use_count_within_max check (use_count <= max_uses) not valid;

-- create_department_invite: mesma assinatura, mesmo GRANT (CREATE OR REPLACE).
-- Mudanças: código '^[A-Z0-9]{8}$' com até 5 tentativas contra o UNIQUE, autorização
-- canônica por user_roles e auditoria 'invite_created' sem o código.
create or replace function public.create_department_invite(
  p_department_id uuid,
  p_max_uses integer default 1,
  p_expires_hours integer default 72
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_profile_id uuid;
  v_code       text;
  v_invite_id  uuid;
  v_attempt    integer;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.is_admin_or_supervisor(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  for v_attempt in 1..5 loop
    v_code := upper(substr(translate(encode(gen_random_bytes(16), 'base64'), '+/=', ''), 1, 8));
    begin
      insert into public.department_invitations(
        department_id, code, max_uses, expires_at, created_by, status
      ) values (
        p_department_id,
        v_code,
        greatest(1, p_max_uses),
        now() + (greatest(1, p_expires_hours) || ' hours')::interval,
        v_profile_id,
        'pending'
      )
      returning id into v_invite_id;
      exit;
    exception when unique_violation then
      v_invite_id := null;
    end;
  end loop;

  if v_invite_id is null then
    return jsonb_build_object('ok', false, 'error', 'code_generation_failed');
  end if;

  insert into public.department_audit_logs(department_id, action, profile_id, details)
  values (
    p_department_id,
    'invite_created',
    v_profile_id,
    jsonb_build_object('invite_id', v_invite_id, 'max_uses', greatest(1, p_max_uses))
  );

  return jsonb_build_object('ok', true, 'invite_id', v_invite_id, 'code', v_code);
end;
$f$;

-- accept_department_invite: mesma assinatura, mesmo GRANT (CREATE OR REPLACE).
-- Mudanças: erro 'already_member' sem consumir uso, status final 'accepted' (não
-- mais 'used') e auditoria 'invite_accepted' sem o código.
create or replace function public.accept_department_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_invite     public.department_invitations%rowtype;
  v_profile_id uuid;
  v_dept_atual uuid;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_invite
  from public.department_invitations
  where code = upper(trim(p_code))
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  end if;

  select department_id into v_dept_atual
  from public.profiles
  where id = v_profile_id;

  if v_dept_atual is not null and v_dept_atual = v_invite.department_id then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  update public.department_invitations
  set use_count = use_count + 1,
      used_at   = case when use_count + 1 >= max_uses then now() else used_at end,
      used_by   = case when use_count + 1 >= max_uses then v_profile_id else used_by end,
      status    = case when use_count + 1 >= max_uses then 'accepted' else status end
  where id = v_invite.id;

  -- Toca UMA linha: o perfil de quem aceita (o mesmo UPDATE que a RPC antiga já
  -- fazia). O gatilho do ambiente `update_profiles_updated_at` (BEFORE UPDATE, por
  -- linha) regrava o updated_at só dessa linha — não é backfill de tabela inteira.
  -- Provado linha a linha no teste deste cartão (asserts B.7f–B.7i).
  update public.profiles
  set department_id = v_invite.department_id
  where id = v_profile_id;

  insert into public.department_audit_logs(department_id, action, profile_id, details)
  values (
    v_invite.department_id,
    'invite_accepted',
    v_profile_id,
    jsonb_build_object('invite_id', v_invite.id)
  );

  return jsonb_build_object('ok', true, 'department_id', v_invite.department_id);
end;
$f$;

-- Rodapé de conferência: os objetos do contrato existem com o nome esperado
-- (3 constraints + trigger de formato) e as 2 RPCs continuam com a MESMA
-- assinatura (nenhum GRANT/papel mudou).
do $assert$
declare
  v_int int;
  t text[] := array[
    'department_audit_logs_action_check',
    'department_invitations_status_check',
    'department_invitations_use_count_within_max'
  ];
begin
  select count(*) into v_int
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conname = any (t);
  if v_int <> 3 then
    raise exception 'esperado 3 constraints do contrato, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_trigger
  where tgrelid = 'public.department_invitations'::regclass
    and tgname = 'department_invitations_code_format_insert_trg'
    and not tgisinternal;
  if v_int <> 1 then
    raise exception 'trigger department_invitations_code_format_insert_trg: esperado 1, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_department_invite'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_department_id uuid, p_max_uses integer, p_expires_hours integer';
  if v_int <> 1 then
    raise exception 'create_department_invite(uuid,integer,integer): esperado 1, encontrado %', v_int;
  end if;

  select count(*) into v_int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'accept_department_invite'
    and pg_get_function_identity_arguments(p.oid) = 'p_code text';
  if v_int <> 1 then
    raise exception 'accept_department_invite(text): esperado 1, encontrado %', v_int;
  end if;
end;
$assert$;
