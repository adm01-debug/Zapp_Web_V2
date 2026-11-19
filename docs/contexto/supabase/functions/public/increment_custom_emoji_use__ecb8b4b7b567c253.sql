CREATE OR REPLACE FUNCTION public.increment_custom_emoji_use(p_emoji_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_use_count integer;
begin
  -- Segunda barreira: o EXECUTE já é só de authenticated; esta checagem garante que
  -- um afrouxamento acidental da ACL ainda exija uma sessão de usuário logado.
  if auth.uid() is null then
    raise exception 'autenticacao_obrigatoria' using errcode = '42501';
  end if;

  if p_emoji_id is null then
    raise exception 'custom_emoji_id_obrigatorio' using errcode = '22023';
  end if;

  update public.custom_emojis as e
     set use_count = coalesce(e.use_count, 0) + 1
   where e.id = p_emoji_id
  returning e.use_count into v_use_count;

  if not found then
    raise exception 'custom_emoji_nao_encontrado' using errcode = 'P0002';
  end if;

  return v_use_count;
end;
$function$
