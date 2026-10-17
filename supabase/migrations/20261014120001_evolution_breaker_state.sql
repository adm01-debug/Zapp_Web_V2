-- evolution_breaker_state
-- Rollback: dropa as duas RPCs novas e a tabela (nenhum objeto existente é tocado).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.evolution_breaker_record(text, boolean, integer, integer);
--   drop function if exists public.evolution_breaker_state(text);
--   drop table if exists public.evolution_breaker_state;
--
-- E22/OB1 — o disjuntor da Evolution (supabase/functions/_shared/evolution-api-proxy.ts)
-- contava as falhas num Map EM MEMÓRIA do isolate ("5 falhas em 60 s → abre"). A
-- Edge Function sobe e desce e roda em várias instâncias ao mesmo tempo: a sequência
-- quase nunca chegava a 5, e a instância que abria o circuito podia não ser a que
-- recebia a chamada seguinte. Na prática o disjuntor não protegia o provedor.
-- Esta tabela + as duas funções atômicas passam a ser a fonte de verdade; o Map do
-- isolate fica só como fallback quando o banco não responde (proteção degradada,
-- nunca ausente) — ver o comentário no código da ponta.
--
-- Natureza: ADITIVA e IDEMPOTENTE. Tabela nova, sem backfill e sem tocar nada que
-- já existe. Sem policy para anon/authenticated: nenhum usuário final lê ou escreve
-- esta tabela; o acesso é só do service_role (as edges), pelas funções abaixo.
-- Sem `CONCURRENTLY` (convenção do projeto: a migration roda em transação única).

create table if not exists public.evolution_breaker_state (
  breaker_key text primary key,
  failures integer not null default 0,
  open_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.evolution_breaker_state is 'Estado do disjuntor da Evolution por instância: falhas consecutivas e até quando o circuito fica aberto. Fonte de verdade de supabase/functions/_shared/evolution-api-proxy.ts; chave = id da instância (ou __admin).';

alter table public.evolution_breaker_state enable row level security;

drop policy if exists evolution_breaker_state_service_role on public.evolution_breaker_state;
create policy evolution_breaker_state_service_role
  on public.evolution_breaker_state
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.evolution_breaker_state from public;
revoke all on public.evolution_breaker_state from anon;
revoke all on public.evolution_breaker_state from authenticated;
grant all on public.evolution_breaker_state to service_role;

-- Leitura do estado, ANTES de chamar o provedor (o proxy chama a cada requisição).
-- Um circuito aberto cujo prazo já passou é rearmado (half-open) na PRÓPRIA leitura:
-- zera a sequência e devolve o circuito fechado, para uma única falha nova não
-- reabri-lo de imediato. Sem linha (instância nunca falhou) devolve 0 linhas.
create or replace function public.evolution_breaker_state(p_key text)
 returns table(failures integer, open_until timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.evolution_breaker_state b
     set failures = 0, open_until = null, updated_at = now()
   where b.breaker_key = p_key
     and b.open_until is not null
     and b.open_until <= now();

  return query
    select b.failures, b.open_until
      from public.evolution_breaker_state b
     where b.breaker_key = p_key;
end;
$function$;

-- Registro do resultado de cada chamada (o complemento do OB1: abrir/fechar fica
-- GRAVADO, não só na memória de um isolate). Sucesso zera a sequência e fecha o
-- circuito; falha soma 1 e, ao bater o limite (p_threshold), abre por p_open_ms.
create or replace function public.evolution_breaker_record(
  p_key text,
  p_success boolean,
  p_threshold integer,
  p_open_ms integer
)
 returns table(failures integer, open_until timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.evolution_breaker_state as b (breaker_key, failures, open_until, updated_at)
  values (
    p_key,
    case when p_success then 0 else 1 end,
    case
      when p_success then null
      when 1 >= greatest(p_threshold, 1)
        then now() + make_interval(secs => (greatest(p_open_ms, 0)::double precision) / 1000.0)
      else null
    end,
    now()
  )
  on conflict (breaker_key) do update
    set failures = case when p_success then 0 else b.failures + 1 end,
        open_until = case
          when p_success then null
          when b.failures + 1 >= greatest(p_threshold, 1)
            then now() + make_interval(secs => (greatest(p_open_ms, 0)::double precision) / 1000.0)
          else b.open_until
        end,
        updated_at = now();

  return query
    select b.failures, b.open_until
      from public.evolution_breaker_state b
     where b.breaker_key = p_key;
end;
$function$;

revoke execute on function public.evolution_breaker_state(text) from public;
revoke execute on function public.evolution_breaker_state(text) from anon;
revoke execute on function public.evolution_breaker_state(text) from authenticated;
grant execute on function public.evolution_breaker_state(text) to service_role;

revoke execute on function public.evolution_breaker_record(text, boolean, integer, integer) from public;
revoke execute on function public.evolution_breaker_record(text, boolean, integer, integer) from anon;
revoke execute on function public.evolution_breaker_record(text, boolean, integer, integer) from authenticated;
grant execute on function public.evolution_breaker_record(text, boolean, integer, integer) to service_role;
