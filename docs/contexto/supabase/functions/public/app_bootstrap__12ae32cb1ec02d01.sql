CREATE OR REPLACE FUNCTION public.app_bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
