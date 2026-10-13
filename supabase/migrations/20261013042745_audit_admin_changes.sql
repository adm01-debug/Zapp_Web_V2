-- audit_admin_changes
-- Rollback: remove os 8 gatilhos administrativos e a funcao generica; nenhum dado e apagado (a trilha ja gravada em audit_logs permanece).
-- Rollback (SQL executavel, na ordem):
--   drop trigger if exists trg_audit_admin_profile_access on public.profiles;
--   drop trigger if exists trg_audit_admin_agent_visibility_grants on public.agent_visibility_grants;
--   drop trigger if exists trg_audit_admin_global_settings on public.global_settings;
--   drop trigger if exists trg_audit_admin_ip_whitelist on public.ip_whitelist;
--   drop trigger if exists trg_audit_admin_blocked_ips on public.blocked_ips;
--   drop trigger if exists trg_audit_admin_blocked_countries on public.blocked_countries;
--   drop trigger if exists trg_audit_admin_geo_blocking_settings on public.geo_blocking_settings;
--   drop trigger if exists trg_audit_admin_rate_limit_configs on public.rate_limit_configs;
--   drop function if exists public.audit_admin_change();
--
-- PARIDADE VS DOCS 04 A 16 (achado de auditoria 12/10): a trilha de auditoria cobria
-- papeis (user_roles), permissoes de papel (role_permissions), contatos e a trilha de
-- departamento. Nada auditava as ACOES ADMINISTRATIVAS de perfil, visibilidade de
-- agente, configuracoes globais e rede (lista de IPs liberados, IPs/paises bloqueados,
-- modo geografico e limites de requisicao). `audit_logs` nega INSERT do cliente (policy
-- "Block direct audit log inserts" com WITH CHECK false), entao a escrita tem de sair de
-- um gatilho SECURITY DEFINER — exatamente o padrao de `audit_role_changes`.
--
-- CLASSE: ADITIVA PURA. So cria uma funcao nova e oito gatilhos novos; nenhum DDL em
-- objeto vivo, nenhum GRANT/REVOKE de tabela, nenhum DML, nada que atinja o historico.
-- Reaplicavel: `create or replace function` e `drop trigger if exists` (antes do create).
--
-- SEGREDO NUNCA VAI PARA A TRILHA. `global_settings.value` guarda, por exemplo, o
-- `api_token` da API publica. Como o gatilho e GENERICO (uma funcao para oito tabelas),
-- ele nao pode conhecer a semantica de cada coluna; por isso grava SO OS NOMES dos campos
-- alterados, nunca os VALORES. O unico dado de linha que atravessa e a CHAVE de
-- `global_settings` (nome, nao segredo) e o proprio `id` (uuid) do alvo — o mesmo que
-- `audit_logs.entity_id` ja guarda. Nada de telefone, e-mail, token ou texto.
--
-- ATOR: `auth.uid()` quando ha JWT; quando a escrita vem de `service_role`/SQL direto
-- (sem JWT) o `user_id` fica NULO e `details.actor_kind = 'service_role_or_direct_sql'`
-- identifica a origem — mesmo vocabulario de `audit_role_changes`.

create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_old        jsonb;
  v_new        jsonb;
  v_changed    text[];
  v_watch      text[];
  v_entity_id  uuid;
  v_operation  text;
  v_details    jsonb;
begin
  v_operation := lower(tg_op);  -- insert | update | delete

  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end;

  v_entity_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  -- Campos alterados: NOMES das colunas cujo valor realmente mudou, ignorando os
  -- carimbos de tempo (que o gatilho de `updated_at` reescreve sozinho).
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(e.key order by e.key), '{}'::text[])
      into v_changed
      from jsonb_each(v_new) as e
     where e.key not in ('updated_at', 'created_at')
       and (v_old -> e.key) is distinct from e.value;
  end if;

  -- Em `profiles` a auditoria e restrita aos campos de acesso. O gatilho ja e
  -- `AFTER UPDATE OF` essas colunas; este filtro garante que um UPDATE que mexa
  -- nelas E em outras (nome, avatar...) registre apenas as quatro de acesso.
  if tg_table_name = 'profiles' then
    v_watch := array['is_active', 'access_level', 'max_chats', 'can_download'];
    v_changed := array(
      select unnest(v_changed) intersect select unnest(v_watch)
    );
  end if;

  -- UPDATE em que nada dos campos vigiados mudou de fato (ex.: so `updated_at`):
  -- nao polui a trilha.
  if tg_op = 'UPDATE' and coalesce(array_length(v_changed, 1), 0) = 0 then
    return null;
  end if;

  v_details := jsonb_build_object(
    'operation',         v_operation,
    'actor_kind',        case when auth.uid() is not null
                              then 'jwt' else 'service_role_or_direct_sql' end,
    'actor_db_role',     current_user,
    'actor_app_name',    nullif(current_setting('application_name', true), ''),
    'actor_addr',        coalesce(host(inet_client_addr()), 'local')
  );

  if v_changed is not null then
    v_details := v_details || jsonb_build_object('changed_fields', to_jsonb(v_changed));
  end if;

  -- Excecao deliberada: a CHAVE (nome) da configuracao e identificador, nao segredo.
  if tg_table_name = 'global_settings' then
    v_details := v_details || jsonb_build_object(
      'key', coalesce(v_new ->> 'key', v_old ->> 'key')
    );
  end if;

  if v_entity_id is null then
    return null;
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    tg_table_name || '_' || v_operation,
    tg_table_name,
    v_entity_id,
    v_details
  );

  return null;
end;
$function$;

-- A funcao e de uso interno do proprio banco (chamada por gatilho): ninguem precisa de
-- EXECUTE por assinatura. Nega por padrao para fechar a superficie aberta do Postgres.
revoke all on function public.audit_admin_change() from public, anon, authenticated, service_role;

-- Perfil/administracao: so os campos de acesso, e so em UPDATE (INSERT/DELETE de perfil
-- tem policies e trilhas proprias).
drop trigger if exists trg_audit_admin_profile_access on public.profiles;
create trigger trg_audit_admin_profile_access
after update of is_active, access_level, max_chats, can_download
on public.profiles
for each row
execute function public.audit_admin_change();

-- Visibilidade de agente (concede/revoga: so nasce e morre em INSERT/DELETE).
drop trigger if exists trg_audit_admin_agent_visibility_grants on public.agent_visibility_grants;
create trigger trg_audit_admin_agent_visibility_grants
after insert or update or delete
on public.agent_visibility_grants
for each row
execute function public.audit_admin_change();

-- Configuracoes globais (sem valor na trilha — so a chave).
drop trigger if exists trg_audit_admin_global_settings on public.global_settings;
create trigger trg_audit_admin_global_settings
after insert or update or delete
on public.global_settings
for each row
execute function public.audit_admin_change();

-- Rede: lista de IPs liberados.
drop trigger if exists trg_audit_admin_ip_whitelist on public.ip_whitelist;
create trigger trg_audit_admin_ip_whitelist
after insert or update or delete
on public.ip_whitelist
for each row
execute function public.audit_admin_change();

-- Rede: IPs bloqueados.
drop trigger if exists trg_audit_admin_blocked_ips on public.blocked_ips;
create trigger trg_audit_admin_blocked_ips
after insert or update or delete
on public.blocked_ips
for each row
execute function public.audit_admin_change();

-- Rede: paises bloqueados.
drop trigger if exists trg_audit_admin_blocked_countries on public.blocked_countries;
create trigger trg_audit_admin_blocked_countries
after insert or update or delete
on public.blocked_countries
for each row
execute function public.audit_admin_change();

-- Rede: modo de bloqueio geografico.
drop trigger if exists trg_audit_admin_geo_blocking_settings on public.geo_blocking_settings;
create trigger trg_audit_admin_geo_blocking_settings
after insert or update or delete
on public.geo_blocking_settings
for each row
execute function public.audit_admin_change();

-- Rede: limites de requisicao.
drop trigger if exists trg_audit_admin_rate_limit_configs on public.rate_limit_configs;
create trigger trg_audit_admin_rate_limit_configs
after insert or update or delete
on public.rate_limit_configs
for each row
execute function public.audit_admin_change();
