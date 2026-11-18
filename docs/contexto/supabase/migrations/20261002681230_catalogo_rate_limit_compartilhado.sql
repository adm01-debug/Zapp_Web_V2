create table if not exists public.catalog_rate_limits (
  user_id      uuid        not null,
  action       text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null,
  primary key (user_id, action)
)

comment on table public.catalog_rate_limits is
  'CT-19: contador do limite de taxa por (usuario, acao), compartilhado entre os isolates da edge. Nao e lido nem escrito direto por ninguem: o unico caminho e a funcao catalog_rate_limit_hit().'

alter table public.catalog_rate_limits enable row level security

revoke all on table public.catalog_rate_limits from public, anon, authenticated

create or replace function public.catalog_rate_limit_hit(
  p_user      uuid,
  p_action    text,
  p_limit     integer,
  p_window_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- Guarda de identidade: quem chama com JWT de usuario so pode gastar a PROPRIA cota.
  -- O service_role (auth.uid() nulo) pode passar qualquer usuario, que e como a edge
  -- chama. Sem isso, um usuario autenticado poderia consumir a cota de outro.
  if auth.uid() is not null and auth.uid() <> p_user then
    return false;
  end if;

  insert into public.catalog_rate_limits as t (user_id, action, window_start, count)
  values (p_user, p_action, now(), 1)
  on conflict (user_id, action) do update
    set count = case
          when t.window_start <= now() - make_interval(secs => p_window_ms / 1000.0) then 1
          else t.count + 1
        end,
        window_start = case
          when t.window_start <= now() - make_interval(secs => p_window_ms / 1000.0) then now()
          else t.window_start
        end
  returning t.count into v_count;

  return v_count <= p_limit;
end;
$$

comment on function public.catalog_rate_limit_hit(uuid, text, integer, integer) is
  'CT-19: conta um hit e devolve true enquanto o usuario estiver dentro da cota (p_limit por p_window_ms). Atomico: o insert/on conflict serializa no PK, entao chamadas concorrentes somam corretamente entre isolates. Devolve false para JWT de usuario tentando gastar a cota de outro.'

revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon

grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated
