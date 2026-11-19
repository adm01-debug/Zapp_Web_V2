set search_path = public, pg_temp

create unique index if not exists saved_filters_inbox_user_lower_name_key
  on public.saved_filters (user_id, lower(name))
  where entity_type = 'inbox_filters'

create or replace function public.enforce_saved_filters_inbox_limite()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  if new.entity_type is distinct from 'inbox_filters' then
    return new;
  end if;
  if new.is_shared is true then
    raise exception 'Filtro salvo do inbox e do dono e nao pode ser compartilhado.'
      using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':inbox_filters', 0));
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
$$


revoke all on function public.enforce_saved_filters_inbox_limite() from public, anon, authenticated

create or replace trigger enforce_saved_filters_inbox_limite_trigger
  before insert or update on public.saved_filters
  for each row execute function public.enforce_saved_filters_inbox_limite()
