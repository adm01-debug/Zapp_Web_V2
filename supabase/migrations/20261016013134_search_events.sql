-- search_events
-- Rollback: desagenda o job 'search-events-retention' (se pg_cron existir) e remove,
-- Rollback: na ordem inversa, as funcoes e a tabela criadas por esta migration.
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'search-events-retention'; end if; end $$;
--   drop function if exists public.search_insights(integer);
--   drop function if exists public.purge_old_search_events();
--   drop table if exists public.search_events;
--
-- Busca global: hoje nao existe NENHUM registro de uso da busca. Nao da para
-- saber se o time usa a busca, quais buscas nao devolvem nada (usuario desiste)
-- nem em que tipo de resultado se clica. Esta migration cria o registro de
-- eventos de busca SEM TEXTO LIVRE (criterio do cartao t_a86eec01):
--   * o termo digitado NAO e gravado — nem em claro, nem em hash (hash de termo
--     curto e' reversivel por dicionario, entao nao entra). Fica so o
--     comprimento, para medir o tamanho medio da busca;
--   * de quem foi a busca (`user_id`), se devolveu resultado (`had_results`),
--     em que tipo de resultado se clicou (`result_kind`) e se houve clique
--     (`clicked`);
--   * retencao de 90 dias (funcao de limpeza + job diario).
--
-- Leitura: NINGUEM le a tabela direto. O agente so INSERE o proprio evento
-- (policy de INSERT com `user_id = auth.uid()`); o agregado sai pela RPC
-- `search_insights(p_days)`, restrita a admin/supervisor. Como nao existe
-- policy de SELECT, nem superuser de aplicacao le linha a linha pelo cliente.
--
-- Sem PII em log: nenhuma funcao desta migration imprime o termo ou qualquer
-- dado do usuario — `raise`/retorno so carregam contagens.
--
-- So ADITIVO: tabela nova (nada existente e' alterado). Idempotente o bastante
-- para reaplicar: nao ha `create table if not exists` de proposito — reaplicar
-- deve falhar alto, nao passar em silencio.

create table public.search_events (
  id            uuid primary key default gen_random_uuid(),
  -- Quem buscou. FK para auth.users (o `profiles.id` e' outro id, proprio).
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Comprimento do termo digitado. O termo em si NAO e' gravado.
  term_length   integer not null,
  -- A busca devolveu algum resultado? falso = busca sem resultado.
  had_results   boolean not null,
  -- Tipo do resultado clicado ('other' cobre tipo ainda nao previsto).
  result_kind   text,
  -- Houve clique em algum resultado?
  clicked       boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Termo vazio nao e' busca; acima de 200 caracteres e' entrada invalida.
  constraint search_events_term_length_range
    check (term_length between 1 and 200),
  constraint search_events_result_kind_valid
    check (result_kind is null or result_kind in ('message', 'contact', 'transcription', 'action', 'crm', 'other')),
  -- Um tipo de resultado so' existe quando houve clique, e clique sem tipo
  -- informado nao e' evento valido: os dois campos andam juntos.
  constraint search_events_click_kind_coherence
    check (clicked = (result_kind is not null))
);

-- Retencao (varredura por janela) e agregacao por periodo.
create index search_events_created_at_idx on public.search_events (created_at);

alter table public.search_events enable row level security;

-- O agente registra a propria busca. Nao e' possivel registrar em nome de outro
-- usuario (`auth.uid()` e' o unico valor aceito) nem ler a linha de volta.
create policy "Users can register their own search events"
  on public.search_events
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Negar por padrao: a tabela nasce fechada; so' o INSERT proprio entra.
-- Nenhum papel de cliente recebe SELECT/UPDATE/DELETE — nem o proprio agente,
-- nem admin/supervisor (que leem o agregado pela RPC).
revoke all on table public.search_events from public, anon, authenticated;
grant insert on table public.search_events to authenticated;

comment on table public.search_events is
  'Eventos de uso da busca global, sem texto livre: comprimento do termo, se devolveu resultado, tipo do resultado clicado. Retencao de 90 dias.';
comment on column public.search_events.term_length is
  'Comprimento do termo digitado. O termo em si nunca e gravado (nem hash).';
comment on column public.search_events.had_results is
  'falso = a busca nao devolveu nenhum resultado.';
comment on column public.search_events.result_kind is
  'Tipo do resultado clicado; null quando nao houve clique.';

-- ---------------------------------------------------------------------------
-- Limpeza: retencao de 90 dias. Manutencao, so' o job (service_role) executa.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_search_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Retencao definida pelo cartao t_a86eec01: 90 dias.
  c_retention constant interval := interval '90 days';
  v_removed integer;
begin
  delete from public.search_events
   where created_at < now() - c_retention;
  get diagnostics v_removed = row_count;
  -- Devolve apenas a contagem: nenhum dado do usuario sai na mensagem.
  return v_removed;
end;
$$;

revoke all on function public.purge_old_search_events()
  from public, anon, authenticated;
grant execute on function public.purge_old_search_events() to service_role;

-- Job diario (04:10) quando pg_cron existir (local e producao tem a extension).
-- Idempotente: desagenda o job homonimo antes de recriar.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'search-events-retention';
    perform cron.schedule(
      'search-events-retention',
      '10 4 * * *',
      'select public.purge_old_search_events()'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Agregado da busca para admin/supervisor. Nunca expoe o termo — so' numeros.
-- ---------------------------------------------------------------------------
create or replace function public.search_insights(p_days integer default 30)
returns table (
  total_searches            bigint,
  searches_without_results  bigint,
  searches_with_click       bigint,
  average_term_length       numeric,
  searches_by_kind          jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c_days integer;
  c_from timestamptz;
begin
  -- Autorizacao pelo usuario da requisicao (auth.uid()), nao por argumento:
  -- agente comum e anon nao leem o agregado.
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'not authorized'
      using errcode = '42501',
            hint = 'search_insights e restrita a admin e supervisor';
  end if;

  -- Janela: 1 a 365 dias. Valor ausente ou fora da faixa vira o padrao/teto
  -- (nao estoura nem devolve a base inteira).
  c_days := case
              when p_days is null then 30
              when p_days < 1 then 1
              when p_days > 365 then 365
              else p_days
            end;
  c_from := now() - make_interval(days => c_days);

  return query
  select
    count(*)::bigint,
    count(*) filter (where not e.had_results)::bigint,
    count(*) filter (where e.clicked)::bigint,
    round(avg(e.term_length)::numeric, 1),
    coalesce(
      (
        select jsonb_object_agg(k.result_kind, k.total order by k.result_kind)
          from (
            select e2.result_kind, count(*)::bigint as total
              from public.search_events e2
             where e2.created_at >= c_from
               and e2.result_kind is not null
             group by e2.result_kind
          ) k
      ),
      '{}'::jsonb
    )
  from public.search_events e
  where e.created_at >= c_from;
end;
$$;

revoke all on function public.search_insights(integer)
  from public, anon;
grant execute on function public.search_insights(integer)
  to authenticated, service_role;
