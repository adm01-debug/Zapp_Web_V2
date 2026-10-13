-- saved_filters_inbox_limites
-- Rollback: restaura a policy de compartilhamento anterior (só `is_shared = true`), dropa o gatilho, a função e o índice único.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists enforce_saved_filters_inbox_limite_trigger on public.saved_filters;
--   drop function if exists public.enforce_saved_filters_inbox_limite();
--   drop index if exists public.saved_filters_user_entity_lower_name_key;
--   drop policy if exists "Users can view shared filters" on public.saved_filters;
--   create policy "Users can view shared filters" on public.saved_filters for select to authenticated using (is_shared = true);
--
-- FILTROS SALVOS DO INBOX — paridade de limites V3 -> V2 (três correções, só aditivas):
--
--   1. Nome único por usuário e tipo de entidade, IGNORANDO maiúsculas/minúsculas:
--      índice único em (user_id, entity_type, lower(name)). O V3 tinha o defeito de
--      "sobrescrever outro preset" porque o upsert por nome usava ILIKE — e em ILIKE os
--      caracteres '%' e '_' são CURINGA, não texto. O índice em lower(name) compara o nome
--      literal (sem curinga) e o banco recusa a duplicata independentemente do caixa.
--
--   2. Teto de 20 presets do inbox por usuário: gatilho recusa a 21ª gravação com erro claro.
--      Escopo: só entity_type = 'inbox_filters' (tipo NOVO, sem dado legado no banco) — os
--      demais tipos de filtro salvo seguem SEM teto, para não quebrar dado existente.
--
--   3. Preset de inbox NUNCA aparece para outro usuário: a policy de compartilhamento
--      ("Users can view shared filters") passa a excluir entity_type = 'inbox_filters',
--      fechando o vazamento de preset privado que o is_shared abria.

set search_path = public, pg_temp;

-- 1. Nome único por (usuário, entidade) ignorando caixa, sem curinga.
create unique index if not exists saved_filters_user_entity_lower_name_key
  on public.saved_filters (user_id, entity_type, lower(name));

-- 2. Teto de 20 presets do inbox por usuário (recusa a 21ª linha).
create or replace function public.enforce_saved_filters_inbox_limite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  -- Só o tipo novo de preset do inbox é limitado; nada muda para os demais filtros salvos.
  if new.entity_type <> 'inbox_filters' then
    return new;
  end if;

  -- Serializa gravações do mesmo usuário: sem esta trava, duas transações simultâneas
  -- passariam juntas pelo count(*) e gravaríam a 21ª linha (consultar-e-inserir tem corrida).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':inbox_filters', 0));

  -- Conta as OUTRAS linhas do usuário (exclui a própria em UPDATE): um usuário com 20
  -- presets ainda consegue editar um deles; o que é recusado é a 21ª linha.
  select count(*) into v_total
    from public.saved_filters
   where user_id = new.user_id
     and entity_type = new.entity_type
     and id <> new.id;

  if v_total >= 20 then
    raise exception 'Limite de 20 filtros salvos do inbox por usuario atingido.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Gatilho não é chamado por usuário: fecha a execução direta da função.
revoke all on function public.enforce_saved_filters_inbox_limite() from public, anon, authenticated;

create or replace trigger enforce_saved_filters_inbox_limite_trigger
  before insert or update on public.saved_filters
  for each row execute function public.enforce_saved_filters_inbox_limite();

-- 3. Preset de inbox não vaza para outro usuário pela policy de compartilhamento.
drop policy if exists "Users can view shared filters" on public.saved_filters;
create policy "Users can view shared filters"
  on public.saved_filters for select to authenticated
  using (is_shared = true and entity_type <> 'inbox_filters');
