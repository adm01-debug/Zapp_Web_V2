-- sla_delivery_rules_extras
-- Rollback: dropa a RPC com escopo, remove as 3 colunas novas e recria resolve_sla_delivery_rule(uuid) com o corpo anterior e os grants de antes.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.resolve_sla_delivery_rule(uuid, text);
--   alter table public.sla_delivery_rules drop column if exists applies_to;
--   alter table public.sla_delivery_rules drop column if exists custom_message;
--   alter table public.sla_delivery_rules drop column if exists name;
--   create or replace function public.resolve_sla_delivery_rule(p_contact_id uuid) returns table (rule_id uuid, contact_id uuid, warning_minutes integer, breach_minutes integer, source text) language plpgsql stable security definer set search_path = pg_catalog, public as $$ declare v_rule public.sla_delivery_rules%rowtype; begin if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if; if p_contact_id is not null then select r.* into v_rule from public.sla_delivery_rules r where r.contact_id = p_contact_id and r.is_active order by r.created_at desc, r.id desc limit 1; if found then return query select v_rule.id, v_rule.contact_id, v_rule.warning_minutes, v_rule.breach_minutes, 'contact'::text; return; end if; end if; select r.* into v_rule from public.sla_delivery_rules r where r.contact_id is null and r.is_active order by r.created_at desc, r.id desc limit 1; if found then return query select v_rule.id, v_rule.contact_id, v_rule.warning_minutes, v_rule.breach_minutes, 'global'::text; return; end if; return query select null::uuid, null::uuid, 30, 60, 'default'::text; end; $$;
--   revoke all on function public.resolve_sla_delivery_rule(uuid) from public, anon, authenticated;
--   grant execute on function public.resolve_sla_delivery_rule(uuid) to authenticated, service_role;
--
-- Paridade V3 -> V2 (auditoria 12/10/2026, docs 02-features-batch1 / 03-features-batch2): a
-- regra de atraso de ENTREGA (public.sla_delivery_rules, criada no SD1) ganha o que a V3 tinha
-- e faltava aqui — nome próprio, mensagem própria do alerta e escopo por instância/canal
-- (applies_to NULL = vale para todas). A RPC resolve_sla_delivery_rule passa a devolver esses
-- campos e a respeitar o escopo pedido, mantendo a precedência contato > global > padrão 30/60.
--
-- Classe: aditiva na tabela — só ADD COLUMN, e os CHECK aceitam NULL, então a linha que já
-- existe (o seed global 30/60 do SD1) passa a validação sem backfill e sem tocar updated_at.
-- Sem DML em dado existente, sem DROP de tabela/coluna viva, sem mexer em RLS, policy, GRANT
-- de tabela ou gatilho.
-- A única remoção é o DROP da RPC antiga resolve_sla_delivery_rule(uuid): para respeitar o
-- escopo ela precisa do canal como parâmetro, e manter as duas assinaturas criaria ambiguidade
-- de overload. Não há consumidor da versão antiga (conferido com
-- `git grep -n resolve_sla_delivery_rule -- src` fora do types.ts gerado), e o parâmetro novo
-- tem default, então quem chamar com um argumento continua funcionando.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas. CHECK com `is null or` = dado legado passa sem backfill.
-- ---------------------------------------------------------------------------
alter table public.sla_delivery_rules
  add column if not exists name           text,
  add column if not exists custom_message text,
  add column if not exists applies_to     text;

comment on column public.sla_delivery_rules.name is
  'Rotulo proprio da regra (opcional, 1..120 caracteres apos trim). NULL = a tela usa o rotulo padrao.';
comment on column public.sla_delivery_rules.custom_message is
  'Mensagem propria do alerta: texto simples, 1..1000 caracteres apos trim, sem HTML. NULL = mensagem padrao do app.';
comment on column public.sla_delivery_rules.applies_to is
  'Escopo da regra por instancia/canal (id da whatsapp_connections ou apelido do canal). NULL = vale para todas; escopo igual ao pedido vence escopo NULL.';

alter table public.sla_delivery_rules
  drop constraint if exists sla_delivery_rules_name_check,
  add constraint sla_delivery_rules_name_check
    check (name is null or length(btrim(name)) between 1 and 120),
  drop constraint if exists sla_delivery_rules_custom_message_check,
  add constraint sla_delivery_rules_custom_message_check
    check (
      custom_message is null
      or (
        length(btrim(custom_message)) between 1 and 1000
        and custom_message !~ '<[[:alpha:]/!]'
      )
    ),
  drop constraint if exists sla_delivery_rules_applies_to_check,
  add constraint sla_delivery_rules_applies_to_check
    check (applies_to is null or applies_to ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$');

-- ---------------------------------------------------------------------------
-- 2. RPC com escopo. Troca da assinatura (uuid) -> (uuid, text): a antiga sai.
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_sla_delivery_rule(uuid);

create or replace function public.resolve_sla_delivery_rule(
  p_contact_id uuid,
  p_applies_to text default null
)
returns table (
  rule_id         uuid,
  contact_id      uuid,
  name            text,
  warning_minutes integer,
  breach_minutes  integer,
  custom_message  text,
  applies_to      text,
  source          text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.sla_delivery_rules%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select r.* into v_rule
    from public.sla_delivery_rules r
   where r.is_active
     and (r.contact_id is null or (p_contact_id is not null and r.contact_id = p_contact_id))
     -- Escopo: regra sem escopo (NULL) vale para todas; regra com escopo só entra quando o
     -- escopo pedido é igual. Sem escopo pedido (p_applies_to NULL = canal desconhecido) só
     -- entram as regras sem escopo — uma regra de outra instância nunca vaza para esta.
     and (r.applies_to is null or r.applies_to = p_applies_to)
   order by
     (r.contact_id is not null) desc,               -- regra do contato vence a global
     (r.applies_to = p_applies_to) desc nulls last, -- escopo pedido vence escopo NULL
     r.created_at desc,
     r.id desc
   limit 1;

  if found then
    return query select
      v_rule.id,
      v_rule.contact_id,
      v_rule.name,
      v_rule.warning_minutes,
      v_rule.breach_minutes,
      v_rule.custom_message,
      v_rule.applies_to,
      case when v_rule.contact_id is null then 'global'::text else 'contact'::text end;
    return;
  end if;

  return query select null::uuid, null::uuid, null::text, 30, 60, null::text, null::text, 'default'::text;
end;
$$;

comment on function public.resolve_sla_delivery_rule(uuid, text) is
  'Paridade V3: regra efetiva de atraso de entrega — contato ativo mais recente, senao global '
  'ativa mais recente, senao 30/60 (source = contact|global|default). Devolve nome, mensagem '
  'propria e escopo; p_applies_to (instancia/canal) filtra as regras e o escopo igual ao pedido '
  'vence o escopo NULL (todas).';

revoke all on function public.resolve_sla_delivery_rule(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_sla_delivery_rule(uuid, text) to authenticated, service_role;
