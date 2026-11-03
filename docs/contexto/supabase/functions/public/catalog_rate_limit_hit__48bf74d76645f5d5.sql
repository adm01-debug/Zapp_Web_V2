CREATE OR REPLACE FUNCTION public.catalog_rate_limit_hit(p_user uuid, p_action text, p_limit integer, p_window_ms integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action text;
  v_limit  integer;
  v_window interval;
  v_count  integer;
begin
  if p_user is null then
    raise exception 'catalog_rate_limit_hit: p_user e obrigatorio'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Guarda de identidade (inalterada): quem chama com JWT de usuario so gasta a PROPRIA cota.
  -- O service_role (auth.uid() nulo) pode passar qualquer usuario, que e como a edge chama.
  if auth.uid() is not null and auth.uid() <> p_user then
    return false;
  end if;

  -- R2-DB-010: cota e janela saem da politica confiavel compilada. p_limit e p_window_ms NAO
  -- sao lidos (ficam na assinatura so para o chamador existente continuar valido).
  v_action := case p_action
    when 'list_products' then 'list_products'
    when 'get_product' then 'get_product'
    when 'list_categories' then 'list_categories'
    when 'list_suppliers' then 'list_suppliers'
    when 'catalog_stats' then 'catalog_stats'
    when 'bootstrap' then 'bootstrap'
    when 'global' then 'global'
    else 'global'
  end;

  v_limit := case v_action
    when 'list_products' then 120
    else 60
  end;
  v_window := interval '60 seconds';

  insert into public.catalog_rate_limit_hits (user_id, action) values (p_user, v_action);

  -- Expurgo oportunista: apaga so o que JA saiu da janela EFETIVA (a da politica). Nenhum
  -- argumento do chamador alcanca este DELETE, entao ele nunca apaga hit dentro da janela.
  delete from public.catalog_rate_limit_hits
   where user_id = p_user and action = v_action and hit_at <= now() - v_window;

  select count(*) into v_count
    from public.catalog_rate_limit_hits
   where user_id = p_user and action = v_action and hit_at > now() - v_window;

  return v_count <= v_limit;
end;
$function$
