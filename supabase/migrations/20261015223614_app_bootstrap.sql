-- app_bootstrap
-- Rollback: dropa a função public.app_bootstrap(). Nada mais é criado por esta migration (sem tabela, coluna, índice, policy, GRANT em tabela ou dado tocado).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.app_bootstrap();
--
-- Boot do app em UMA chamada (paridade V3 -> V2, cartão t_2b931517).
--
-- A V3 troca 6+ leituras do boot por uma única RPC. Na V2 o boot lê separado
-- user_roles, role_permissions, global_settings e user_settings. Esta migration
-- só CRIA a função agregadora; nenhuma tabela, coluna, policy ou dado existente
-- é alterado.
--
-- QUEM PODE CHAMAR: só `authenticated`. EXECUTE é revogado de PUBLIC, anon e
-- service_role (Supabase concede EXECUTE a anon/authenticated por padrão em
-- funções novas, então o REVOKE explícito é o que fecha a porta).
--
-- O QUE O RPC DEVOLVE (tudo do PRÓPRIO usuário de auth.uid()):
--   profile              — a linha do próprio profiles (campos curados)
--   roles                — papéis do próprio usuário (user_roles)
--   permissions          — catálogo de permissões (só para admin/supervisor, como a RLS)
--   role_permissions     — mapa papel -> permissão (só para admin/supervisor, como a RLS)
--   global_settings      — MESMO recorte da RLS de public.global_settings
--   user_settings        — a própria linha de user_settings
--   departments          — só departamentos ativos, SEM as colunas de segredo
--   unread_notifications — contagem de public.notifications não lidas do próprio usuário
--   fetched_at           — instante da leitura
--
-- NÃO VAZA PARA OUTRO USUÁRIO. Sendo SECURITY DEFINER, a RLS não barra a
-- leitura dentro da função — por isso CADA bloco que toca dado de pessoa
-- filtra por auth.uid() na mão (profile, roles, user_settings e
-- notifications). Nenhum bloco entrega mais do que a RLS entrega hoje:
-- permissions e role_permissions só para admin/supervisor (policy
-- 20260830080000, "Admin supervisor can view ...": agente NÃO lê a matriz);
-- global_settings repete o recorte da policy 20261011192905 (admin lê tudo;
-- supervisor só o que NÃO é segredo — chave terminando em
-- _api_key/_secret/_token; papel comum não lê nada). Departments vem só com
-- as colunas de catálogo (OMITE whatsapp_api_key/whatsapp_instance_id), o que
-- é mais restrito do que a policy departments_select (USING true).

create or replace function public.app_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_is_admin   boolean := false;
  v_is_priv    boolean := false;
  v_profile    jsonb;
  v_roles      jsonb;
  v_perms      jsonb;
  v_role_perms jsonb;
  v_globals    jsonb;
  v_user_set   jsonb;
  v_departs    jsonb;
  v_unread     int;
begin
  -- Sem sessão não há o que montar (e não se devolve dado de ninguém).
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_is_admin := public.is_admin(v_user_id);
  v_is_priv  := public.is_admin_or_supervisor(v_user_id);

  -- 1. Perfil próprio (campos curados; nada de coluna de outro usuário).
  select jsonb_build_object(
           'id',            p.id,
           'user_id',       p.user_id,
           'name',          p.name,
           'email',         p.email,
           'avatar_url',    p.avatar_url,
           'role',          p.role,
           'job_title',     p.job_title,
           'department',    p.department,
           'department_id', p.department_id,
           'phone',         p.phone,
           'nickname',      p.nickname,
           'signature',     p.signature,
           'access_level',  p.access_level,
           'permissions',   p.permissions,
           'is_active',     p.is_active,
           'can_download',  p.can_download,
           'max_chats',     p.max_chats,
           'birthday',      p.birthday,
           'created_at',    p.created_at,
           'updated_at',    p.updated_at
         )
    into v_profile
    from public.profiles p
   where p.user_id = v_user_id
   limit 1;

  -- 2. Papéis do próprio usuário.
  select coalesce(jsonb_agg(r.role::text order by r.role::text), '[]'::jsonb)
    into v_roles
    from public.user_roles r
   where r.user_id = v_user_id;

  -- 3. Catálogo de permissões — MESMO recorte da RLS (só admin/supervisor;
  -- agente usa user_has_permission()). Não expande acesso.
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name,
             'description', p.description, 'category', p.category
           ) order by p.category, p.name),
           '[]'::jsonb
         )
    into v_perms
    from public.permissions p
   where v_is_priv;

  -- 4. Mapa papel -> permissão — MESMO recorte da RLS (só admin/supervisor).
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'role', rp.role::text,
             'permission_id', rp.permission_id,
             'permission', jsonb_build_object(
               'id', pm.id, 'name', pm.name,
               'description', pm.description, 'category', pm.category
             )
           )),
           '[]'::jsonb
         )
    into v_role_perms
    from public.role_permissions rp
    left join public.permissions pm on pm.id = rp.permission_id
   where v_is_priv;

  -- 5. Configurações globais — mesmo recorte da policy de leitura
  -- (20261011192905_global_settings_secrets): admin lê tudo; supervisor só o
  -- que não é segredo; papel comum, nada. Segredo = chave terminando em
  -- _api_key, _secret ou _token.
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', gs.id, 'key', gs.key,
             'value', gs.value, 'description', gs.description
           ) order by gs.key),
           '[]'::jsonb
         )
    into v_globals
    from public.global_settings gs
   where v_is_admin
      or (public.is_admin_or_supervisor(v_user_id)
          and gs.key !~ '(_api_key|_secret|_token)$');

  -- 6. Configurações do próprio usuário.
  select to_jsonb(us)
    into v_user_set
    from public.user_settings us
   where us.user_id = v_user_id
   limit 1;

  -- 7. Departamentos ativos, SEM whatsapp_api_key / whatsapp_instance_id.
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', d.id, 'name', d.name, 'whatsapp_mode', d.whatsapp_mode,
             'is_active', d.is_active,
             'created_at', d.created_at, 'updated_at', d.updated_at
           ) order by d.name),
           '[]'::jsonb
         )
    into v_departs
    from public.departments d
   where d.is_active;

  -- 8. Notificações não lidas do próprio usuário.
  select count(*)
    into v_unread
    from public.notifications n
   where n.user_id = v_user_id
     and n.is_read is not true;

  return jsonb_build_object(
    'profile',              coalesce(v_profile, 'null'::jsonb),
    'roles',                v_roles,
    'permissions',          v_perms,
    'role_permissions',     v_role_perms,
    'global_settings',      v_globals,
    'user_settings',        coalesce(v_user_set, 'null'::jsonb),
    'departments',          v_departs,
    'unread_notifications', coalesce(v_unread, 0),
    'fetched_at',           now()
  );
end;
$$;

comment on function public.app_bootstrap() is
  'Boot do app em uma chamada: perfil, papéis, permissões, configurações (globais e do usuário), departamentos ativos e não lidas do PRÓPRIO auth.uid(). SECURITY DEFINER com filtro explícito por usuário; nunca entrega mais do que a RLS vigente (permissions/role_permissions só a admin/supervisor; global_settings com o recorte de segredo).';

-- Negar por padrão: só o usuário logado chama a própria montagem de boot.
revoke all on function public.app_bootstrap() from public, anon, service_role;
grant execute on function public.app_bootstrap() to authenticated;
