-- prioridade manual do contato (campo da equipe) separado da prioridade da IA
-- Rollback: remove os 3 objetos novos e as 3 colunas; a prioridade MANUAL registrada e descartada (nao ha dado pre-existente dependente dela) e ai_priority/manual volta a nao existir.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.set_manual_priority(uuid, text);
--   drop function if exists public.effective_priority(public.contacts);
--   alter table public.contacts drop constraint if exists contacts_manual_priority_canonical;
--   alter table public.contacts drop column if exists manual_priority, drop column if exists manual_priority_by, drop column if exists manual_priority_at;
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
--      queue_id), e registra o evento em audit_logs. p_priority = NULL limpa.
--   3. Funcao pura public.effective_priority(public.contacts) = coalesce(manual, ia),
--      o overlay em tempo de leitura (nao reescreve a coluna da IA).
--
-- Efeitos colaterais conferidos: nenhum GRANT/papel fora dos objetos NOVOS aqui; o
-- UPDATE da RPC dispara apenas `update_contacts_updated_at` (a linha de fato mudou) --
-- os demais gatilhos de contacts tem WHEN por coluna e nao disparam; leitura nula -> prioridade da IA.

-- 1) Colunas ------------------------------------------------------------------
alter table public.contacts
  add column if not exists manual_priority    text,
  add column if not exists manual_priority_by uuid references auth.users(id) on delete set null,
  add column if not exists manual_priority_at timestamptz;

-- Mesmo dominio de ai_priority (helper canonico). NOT VALID evita reconferir as
-- linhas antigas; VALIDATE logo abaixo (SKIP por nada, tabela de contatos) deixa a
-- constraint marcada como valida sem bloquear escrita.
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

-- 2) RPC de escrita -----------------------------------------------------------
create or replace function public.set_manual_priority(p_contact_id uuid, p_priority text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$ declare v_id uuid; begin
  if auth.uid() is null then
    raise exception 'Sem sessao autenticada.' using errcode = 'insufficient_privilege';
  end if;

  if not public.ai_is_canonical_priority(p_priority) then
    raise exception 'Prioridade manual invalida: %. Valores aceitos: low, medium, high, urgent ou nulo para limpar.', p_priority
      using errcode = '22023';
  end if;

  -- A permissao e o mesmo predicado do modulo Contatos. Restringe a linhas de contato
  -- do chamador (assigned_to / fila / admin), sem SELECT extra por linha.
  update public.contacts c
     set manual_priority    = p_priority,
         manual_priority_by = case when p_priority is null then null else auth.uid() end,
         manual_priority_at = case when p_priority is null then null else now() end
   where c.id = p_contact_id
     and c.deleted_at is null
     and public.can_edit_contact(c.assigned_to, c.queue_id)
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
