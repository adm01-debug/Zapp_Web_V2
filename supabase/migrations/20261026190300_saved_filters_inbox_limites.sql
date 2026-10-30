-- saved_filters_inbox_limites
-- Migration ADITIVA: não toca em policy, não renomeia, não apaga nem altera linha existente.
-- Rollback (comentado; SQL executável, na ordem):
--   drop trigger if exists enforce_saved_filters_inbox_limite_trigger on public.saved_filters;
--   drop function if exists public.enforce_saved_filters_inbox_limite();
--   drop index if exists public.saved_filters_inbox_user_lower_name_key;
--
-- FILTROS SALVOS DO INBOX — limites dos presets (`entity_type = 'inbox_filters'`, tipo NOVO):
--
--   1. Nome único por usuário, IGNORANDO maiúsculas/minúsculas: índice único PARCIAL em
--      (user_id, lower(name)) só para o tipo do inbox. O defeito do V3 era "sobrescrever
--      outro preset" porque o upsert por nome usava ILIKE — em ILIKE, '%' e '_' são curinga.
--      O índice em lower(name) compara o nome literal. É PARCIAL de propósito: os demais
--      tipos de filtro salvo (dado existente) não podem ser tocados nem fazer a criação do
--      índice falhar por duplicata antiga.
--
--   2. Teto de 20 presets do inbox por usuário: gatilho recusa a 21ª linha com erro claro.
--
--   3. Preset de inbox NUNCA aparece para outro usuário. A policy de compartilhamento
--      ("Users can view shared filters": is_shared = true) continua EXATAMENTE como está —
--      reescrevê-la exigiria DROP POLICY, proibido. O mesmo efeito vem do gatilho: preset de
--      inbox não pode ficar com is_shared = true, então a policy nunca o enxerga. Nenhum
--      acesso é ampliado: nenhuma policy foi criada, alterada ou removida.

set search_path = public, pg_temp;

-- 1. Nome único por usuário (ignora caixa, sem curinga) só para os presets do inbox.
create unique index if not exists saved_filters_inbox_user_lower_name_key
  on public.saved_filters (user_id, lower(name))
  where entity_type = 'inbox_filters';

-- 2 e 3. Teto de 20 e "preset de inbox é privado" (recusa is_shared = true).
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
  if new.entity_type is distinct from 'inbox_filters' then
    return new;
  end if;

  -- Privado: a policy de compartilhamento (is_shared = true) nunca pode alcançar um preset.
  if new.is_shared is true then
    raise exception 'Filtro salvo do inbox e do dono e nao pode ser compartilhado.'
      using errcode = 'check_violation';
  end if;

  -- Serializa gravações do mesmo usuário: sem esta trava, duas transações simultâneas
  -- passariam juntas pelo count(*) e gravariam a 21ª linha (consultar-e-inserir tem corrida).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':inbox_filters', 0));

  -- Conta as OUTRAS linhas do usuário (exclui a própria em UPDATE): um usuário com 20
  -- presets ainda consegue editar um deles; o que é recusado é a 21ª linha.
  select count(*) into v_total
    from public.saved_filters
   where user_id = new.user_id
     and entity_type = 'inbox_filters'
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
