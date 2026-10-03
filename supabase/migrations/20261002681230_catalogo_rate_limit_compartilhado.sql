-- CT-19 — limitador de taxa com estado COMPARTILHADO.
--
-- O limitador da edge (supabase/functions/promogifts-catalog/index.ts:135) guardava o
-- contador num `Map` em memoria do ISOLATE. Requisicoes paralelas sao atendidas por
-- isolates diferentes, cada um com o proprio Map zerado, entao o contador por usuario
-- nunca somava o teto. Medido em producao, com o codigo publicado, em tres momentos:
-- rajadas de 61, 120 e 300 chamadas de `bootstrap` em paralelo (9,1 s / 15,9 s /
-- 34,3 s, todas dentro da janela de 60 s) devolveram ZERO respostas 429.
--
-- Aqui o contador vira uma linha por (usuario, acao) e a checagem vira UMA instrucao
-- atomica: o `insert ... on conflict do update` serializa no indice unico, entao
-- incrementar e decidir acontecem juntos, sem corrida entre isolates.
--
-- A semantica NAO muda: janela fixa que comeca no primeiro hit e expira em
-- p_window_ms, cota por (usuario, acao) e o mesmo fallback global para acao
-- desconhecida. O que muda e ONDE o numero mora.
--
-- A tabela nao precisa de expurgo: a propria linha e resetada quando a janela vira, e
-- existe no maximo uma linha por (usuario, acao) por vez -- um punhado por usuario, nao
-- cresce com o trafego.
--
-- rollback: drop function if exists public.catalog_rate_limit_hit(uuid, text, integer, integer); drop table if exists public.catalog_rate_limits;

create table if not exists public.catalog_rate_limits (
  user_id      uuid        not null,
  action       text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null,
  primary key (user_id, action)
);

comment on table public.catalog_rate_limits is
  'CT-19: contador do limite de taxa por (usuario, acao), compartilhado entre os isolates da edge. Nao e lido nem escrito direto por ninguem: o unico caminho e a funcao catalog_rate_limit_hit().';

alter table public.catalog_rate_limits enable row level security;

-- Sem policies, de proposito: nem o app nem o anon tocam a tabela direto. O unico
-- caminho e a funcao SECURITY DEFINER abaixo.
revoke all on table public.catalog_rate_limits from public, anon, authenticated;

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
$$;

comment on function public.catalog_rate_limit_hit(uuid, text, integer, integer) is
  'CT-19: conta um hit e devolve true enquanto o usuario estiver dentro da cota (p_limit por p_window_ms). Atomico: o insert/on conflict serializa no PK, entao chamadas concorrentes somam corretamente entre isolates. Devolve false para JWT de usuario tentando gastar a cota de outro.';

revoke all on function public.catalog_rate_limit_hit(uuid, text, integer, integer) from public, anon;
grant execute on function public.catalog_rate_limit_hit(uuid, text, integer, integer) to service_role, authenticated;
