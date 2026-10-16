-- custom_emoji_use_rpc
-- Rollback: dropa a RPC do contador; a tabela, as policies e os demais objetos ficam como estavam (nada mais foi tocado).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.increment_custom_emoji_use(uuid);
--
-- PB-35 (paridade V3->V2): `public.custom_emojis` tem RLS de UPDATE só para o dono
-- ou admin/supervisor (policy vigente desde 20260320133103). Logo o `use_count + 1`
-- no emoji de OUTRO atendente não é recusado com erro: o UPDATE atinge 0 linhas e o
-- contador fica parado — a ordenação por uso (StickerPicker/MediaLibraryAdmin) fica
-- enviesada. A correção NÃO abre UPDATE na tabela: cria uma RPC estreita que só faz
-- `use_count = use_count + 1`, com o dono (DEFINER) escrevendo no lugar do atendente.
--
-- Contrato: RETURN o novo use_count; 22023 para p_emoji_id nulo; P0002 se o emoji
-- não existe; 42501 se não há sessão de usuário. Não toca em name, category,
-- is_favorite, uploaded_by nem updated_at (o contador não é uma edição do emoji).
--
-- ACL: EXECUTE só para `authenticated` (o caminho do app é o PostgREST com esse papel);
-- PUBLIC, anon e service_role ficam de fora. Nenhum GRANT de tabela muda.

create function public.increment_custom_emoji_use(p_emoji_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.increment_custom_emoji_use(uuid) is
  'PB-35: sobe use_count do emoji personalizado em 1 para QUALQUER atendente (inclusive emoji de outro dono), sem abrir UPDATE na tabela. Não altera nenhum outro campo. Devolve o novo contador (P0002 se o emoji não existe).';

revoke all on function public.increment_custom_emoji_use(uuid) from public;
revoke all on function public.increment_custom_emoji_use(uuid) from anon;
revoke all on function public.increment_custom_emoji_use(uuid) from service_role;
grant execute on function public.increment_custom_emoji_use(uuid) to authenticated;
