-- prioridade manual do contato (campo da equipe) separado da prioridade da IA
-- Rollback: revoga as ACLs novas, remove os objetos novos e as 3 colunas manuais; a prioridade MANUAL registrada e descartada (nao ha dado pre-existente dependente dela). ai_priority continua existindo. Os comentarios somem junto com as funcoes/colunas removidas.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists contacts_manual_priority_guard on public.contacts;
--   drop function if exists public.prevent_direct_manual_priority_update();
--   revoke execute on function public.set_manual_priority(uuid, text) from authenticated, service_role;
--   revoke execute on function public.effective_priority(public.contacts) from authenticated, service_role;
--   drop function if exists public.set_manual_priority(uuid, text);
--   drop function if exists public.effective_priority(public.contacts);
--   alter table public.contacts drop constraint if exists contacts_manual_priority_canonical;
--   alter table public.contacts drop column if exists manual_priority_at;
--   alter table public.contacts drop column if exists manual_priority_by;
--   alter table public.contacts drop column if exists manual_priority;
--
-- PROBLEMA (E97): `ai_priority` e reescrito a cada analise da IA
-- (persist_conversation_analysis). Nao existia campo para a prioridade decidida por
-- uma PESSOA — entao a escolha da equipe era sobrescrita na proxima passada do modelo.
-- Correcao em tres partes, na mesma migration:
--   1. Colunas manual_priority / manual_priority_by / manual_priority_at (aditivas,
--      nullable). O dominio de manual_priority e o MESMO de ai_priority (low, medium,
--      high, urgent), validado pelo helper public.ai_is_canonical_priority(text) --
--      um so lugar define o vocabulario.
--   2. RPC public.set_manual_priority(uuid, text): UNICO caminho de escrita (a coluna
--      nao e editavel por UPDATE direto do cliente, so por esta RPC). Usa o MESMO
--      predicado de permissao do modulo Contatos, public.can_edit_contact(assigned_to,
--      queue_id, visible_agent_ids, profile_id, is_admin), com os valores do chamador
--      precomputados dentro da RPC, e registra o evento em audit_logs. p_priority = NULL limpa.
--   3. Funcao pura public.effective_priority(public.contacts) = coalesce(manual, ia),
--      o overlay em tempo de leitura (nao reescreve a coluna da IA).
--
-- Efeitos colaterais conferidos: nenhum GRANT/papel fora dos objetos NOVOS aqui; o
-- UPDATE da RPC dispara apenas `update_contacts_updated_at` (a linha de fato mudou) --
-- os demais gatilhos de contacts tem WHEN por coluna e nao disparam; leitura nula -> prioridade da IA.
-- A RPC e SECURITY DEFINER para conseguir gravar audit_logs, mas a escrita em contacts
-- NAO confia no dono da funcao: ela revalida explicitamente o escopo do auth.uid() pelo
-- predicado de 5 argumentos usado pelas policies.

-- 1) Colunas ------------------------------------------------------------------
alter table public.contacts
  add column if not exists manual_priority    text,
  add column if not exists manual_priority_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_priority_at timestamptz;

-- Mesmo dominio de ai_priority (helper canonico). NOT VALID evita reconferir as
-- linhas antigas durante a criacao; VALIDATE logo abaixo marca a constraint como
-- valida apos a checagem controlada desta migration.
alter table public.contacts
  add constraint contacts_manual_priority_canonical
  check (public.ai_is_canonical_priority(manual_priority)) not valid;

alter table public.contacts
  validate constraint contacts_manual_priority_canonical;

comment on column public.contacts.manual_priority is
  'Prioridade definida manualmente pela equipe (low|medium|high|urgent; NULL = sem prioridade manual). Sobrepõe ai_priority em public.effective_priority(contacts). So e escrita por public.set_manual_priority.';
comment on column public.contacts.manual_priority_by is
  'auth.uid() de quem definiu manual_priority; NULL quando nao ha prioridade manual.';
comment on column public.contacts.manual_priority_at is
  'Instante da ultima definicao de manual_priority; NULL quando nao ha prioridade manual.';

-- Guardrail: o unico caminho de escrita de manual_priority* e a RPC abaixo.
create or replace function public.prevent_direct_manual_priority_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if (old.manual_priority is distinct from new.manual_priority
      or old.manual_priority_by is distinct from new.manual_priority_by
      or old.manual_priority_at is distinct from new.manual_priority_at)
     and coalesce(current_setting('app.set_manual_priority_allowed', true), '') <> 'on' then
    raise exception 'manual_priority so pode ser alterada por public.set_manual_priority.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$function$;

comment on function public.prevent_direct_manual_priority_update() is
  'Trigger guard: recusa UPDATE direto das colunas manual_priority*; public.set_manual_priority libera a escrita por transacao via GUC local.';

drop trigger if exists contacts_manual_priority_guard on public.contacts;
create trigger contacts_manual_priority_guard
before update of manual_priority, manual_priority_by, manual_priority_at on public.contacts
for each row
execute function public.prevent_direct_manual_priority_update();

-- 2) RPC de escrita -----------------------------------------------------------
create or replace function public.set_manual_priority(p_contact_id uuid, p_priority text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$ declare
  v_id uuid;
  v_visible_agent_ids uuid[];
  v_profile_id uuid;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Sem sessao autenticada.' using errcode = 'insufficient_privilege';
  end if;

  if p_priority is not null and not public.ai_is_canonical_priority(p_priority) then
    raise exception 'Prioridade manual invalida: %. Valores aceitos: low, medium, high, urgent ou nulo para limpar.', p_priority
      using errcode = '22023';
  end if;

  -- Mesmo predicado das policies, com os parametros do chamador precomputados.
  -- Isto mantem o escopo explicito mesmo a funcao sendo SECURITY DEFINER para auditar.
  select array_agg(v) into v_visible_agent_ids from public.get_visible_agent_ids(auth.uid()) v;
  v_profile_id := public.get_profile_id_for_user(auth.uid());
  v_is_admin := public.is_admin_or_supervisor(auth.uid());

  -- A trigger contacts_manual_priority_guard recusa UPDATE direto; libera so esta transacao da RPC.
  perform set_config('app.set_manual_priority_allowed', 'on', true);

  update public.contacts c
     set manual_priority    = p_priority,
         manual_priority_by = case when p_priority is null then null else auth.uid() end,
         manual_priority_at = case when p_priority is null then null else now() end
   where c.id = p_contact_id
     and c.deleted_at is null
     and public.can_edit_contact(c.assigned_to, c.queue_id, v_visible_agent_ids, v_profile_id, v_is_admin)
  returning c.id into v_id;

  if v_id is null then
    raise exception 'Contato nao encontrado ou sem permissao para alterar a prioridade.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Trilha de auditoria (sem PII; so o valor). SECURITY DEFINER -> INSERT permitido.
  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'contact_manual_priority_changed', 'contacts', v_id,
          jsonb_build_object('priority', p_priority));
end;
$function$;

comment on function public.set_manual_priority(uuid, text) is
  'Define (ou limpa com NULL) a prioridade MANUAL do contato. Unico caminho de escrita; exige public.can_edit_contact e registra audit_logs (contact_manual_priority_changed).';

-- 3) Prioridade efetiva -------------------------------------------------------
-- Funcao PURA sobre a propria linha de contacts: nao depende da RLS (roda como
-- chamador) e nao altera views existentes (diferente de coluna gerada, que faria
-- reescrita da tabela sob ACCESS EXCLUSIVE). Uso: SELECT effective_priority(c) FROM contacts c.
create or replace function public.effective_priority(p public.contacts)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select coalesce(p.manual_priority, p.ai_priority);
$function$;

comment on function public.effective_priority(public.contacts) is
  'Prioridade efetiva = coalesce(manual_priority, ai_priority). A escolha manual da equipe vence a da IA; sem prioridade manual, cai na da IA.';

-- 4) ACL: nada novo aberto ao anonimo. ---------------------------------------
revoke execute on function public.set_manual_priority(uuid, text) from public, anon;
grant execute on function public.set_manual_priority(uuid, text) to authenticated, service_role;
revoke execute on function public.effective_priority(public.contacts) from public, anon;
grant execute on function public.effective_priority(public.contacts) to authenticated, service_role;
