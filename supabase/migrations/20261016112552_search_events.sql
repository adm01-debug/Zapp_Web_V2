-- search_events
-- Rollback: desfaz tudo o que esta migration criou — as tres funcoes e a tabela
-- (o DROP da tabela leva junto indices, COMMENT e a propria RLS). Nenhum dado
-- preexistente e tocado, entao nao ha dado a restaurar.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.log_search_event(text, integer, boolean);
--   drop function if exists public.get_search_insights(integer);
--   drop function if exists public.purge_search_events(integer);
--   drop table if exists public.search_events;
--
-- Analise de buscas (paridade V3->V2, achado HZ1-06; desenho aprovado pelo dono
-- em 13/10/2026). Cria a tabela public.search_events e as tres rotinas que a
-- alimentam/leem/expurgam:
--   1. public.log_search_event(p_term, p_result_count, p_clicked) — unico caminho
--      de escrita. Normaliza o termo (minusculas, sem acento, espacos colapsados,
--      no maximo 80 caracteres) e DESCARTA (nao grava nada) termos que parecem
--      telefone (7+ digitos), e-mail ('@'), CPF/CNPJ (formato pontuado) ou token
--      longo (corrida de 32+ caracteres de token/hash/JWT). Tem limite de taxa
--      por usuario (30 eventos por minuto).
--   2. public.get_search_insights(p_days) — agregacoes (top consultas, buscas sem
--      resultado, taxa de clique, total). SO admin/supervisor; os demais recebem
--      42501 (o 403 do PostgREST).
--   3. public.purge_search_events(p_limit) — expurgo em lote do que passou de
--      90 dias (retencao documentada em docs/LGPD-RETENTION-POLICY.md, secao 4.3).
--      Nao ha cron aqui: o agendamento e decisao do dono.
--
-- Por que a tabela NAO tem policy nem GRANT para o cliente: o termo gravado e
-- sempre o normalizado, e quem normaliza (e descarta PII) e a funcao DEFINER.
-- Liberar INSERT direto ao cliente deixaria o navegador gravar o texto BRUTO —
-- exatamente o bug da V3 que o dono mandou nao portar. Leitura tambem fica fora:
-- so a RPC de agregacao le, e so para admin/supervisor.
--
-- Efeitos colaterais: nenhuma tabela, coluna, policy ou dado preexistente e
-- alterado; nenhum trigger; nenhuma publication; nenhuma extensao nova; nenhum
-- cron. Idempotente (IF NOT EXISTS / CREATE OR REPLACE + REVOKE/GRANT).

-- ── 1) Tabela ────────────────────────────────────────────────────────────────
create table if not exists public.search_events (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  -- Sempre o termo normalizado; o tamanho e limitado na propria RPC e aqui.
  term_normalized text        not null,
  result_count    integer     not null default 0,
  clicked         boolean     not null default false,
  created_at      timestamptz not null default now(),
  constraint search_events_term_len_chk     check (length(term_normalized) between 1 and 80),
  constraint search_events_result_count_chk check (result_count >= 0)
);

comment on table public.search_events is
  'Analise de buscas (HZ1-06): um evento por busca global executada. Guarda apenas o termo NORMALIZADO e anonimizado na origem (sem telefone, e-mail, CPF/CNPJ ou token); retencao de 90 dias (purge_search_events). Sem acesso de cliente: escrita so por log_search_event(), leitura so por get_search_insights().';
comment on column public.search_events.result_count is
  'Quantidade de resultados que a busca devolveu; 0 marca a busca sem resultado (lacuna na base).';

-- Expurgo por created_at (o purge varre por prazo) e taxa por usuario.
create index if not exists search_events_created_at_idx on public.search_events (created_at);
create index if not exists search_events_user_created_idx on public.search_events (user_id, created_at desc);

-- RLS ligada e SEM policy: negar por padrao. Sem GRANT de tabela a anon/authenticated,
-- o cliente nem chega a avaliar a RLS; se um dia um GRANT aparecer, a RLS sem policy
-- continua negando. Só service_role (BYPASSRLS) e o dono leem direto.
alter table public.search_events enable row level security;
revoke all on table public.search_events from public, anon, authenticated;
grant select, insert on table public.search_events to service_role;

-- ── 2) Registro do evento (unico caminho de escrita) ─────────────────────────
create or replace function public.log_search_event(
  p_term text,
  p_result_count integer default 0,
  p_clicked boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_len      constant integer  := 80;
  c_rate_window  constant interval := interval '60 seconds';
  c_rate_max     constant integer  := 30;
  c_accented     constant text := 'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ';
  c_plain        constant text := 'aaaaaaeeeeiiiiooooouuuucnyaaaaaaeeeeiiiiooooouuuucny';
  v_raw    text;
  v_term   text;
  v_digits integer;
  v_id     uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'not_authenticated');
  end if;

  v_raw := btrim(coalesce(p_term, ''));
  if v_raw = '' then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'empty');
  end if;

  -- 2a) Descarte de PII ANTES de normalizar: o '@' do e-mail desaparece na
  --     normalizacao, entao o teste e sobre o texto cru.
  if position('@' in v_raw) > 0 then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'pii_email');
  end if;

  v_digits := length(regexp_replace(v_raw, '\D', '', 'g'));
  if v_digits >= 7 then
    -- CPF/CNPJ sao reconhecidos pelo FORMATO pontuado; um numero de 11 digitos
    -- "solto" e indistinguivel de um telefone com DDD, entao cai como telefone.
    -- Nos dois casos o termo nao e gravado — a razao e so explicativa.
    if v_raw ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$'
       or v_raw ~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'pii_document');
    end if;
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'pii_phone');
  end if;

  -- Token longo: corrida de 32+ caracteres de token/hash/JWT/URL assinada.
  if v_raw ~ '[A-Za-z0-9._~+/=-]{32,}' then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'pii_token');
  end if;

  -- 2b) Normalizacao: minusculas, sem acento, pontuacao vira espaco (colapsa os
  --     espacos de sobra) e corte em 80 caracteres.
  v_term := btrim(left(btrim(regexp_replace(
    translate(lower(v_raw), c_accented, c_plain),
    '[^a-z0-9]+', ' ', 'g'
  )), c_max_len));
  if v_term = '' then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'empty');
  end if;

  -- 2c) Limite de taxa por usuario (a corrida de dois INSERTs simultaneos no
  --     limite e aceitavel: o controle e anti-abuso, nao invariante).
  if (select count(*) from public.search_events e
       where e.user_id = auth.uid()
         and e.created_at > now() - c_rate_window) >= c_rate_max then
    return jsonb_build_object('ok', false, 'recorded', false, 'reason', 'rate_limited');
  end if;

  insert into public.search_events (user_id, term_normalized, result_count, clicked)
  values (auth.uid(), v_term, greatest(coalesce(p_result_count, 0), 0), coalesce(p_clicked, false))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'recorded', true, 'id', v_id, 'term_normalized', v_term);
end;
$$;

comment on function public.log_search_event(text, integer, boolean) is
  'HZ1-06: registra um evento de busca global. Normaliza o termo (minusculas, sem acento, espacos colapsados, max. 80) e DESCARTA telefone (7+ digitos), e-mail, CPF/CNPJ pontuado e token longo (32+). Limite de 30 eventos por minuto por usuario. Devolve {ok, recorded, reason}.';

revoke all on function public.log_search_event(text, integer, boolean) from public, anon;
grant execute on function public.log_search_event(text, integer, boolean) to authenticated, service_role;

-- ── 3) Agregacao (SO admin/supervisor) ───────────────────────────────────────
create or replace function public.get_search_insights(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_days constant integer := 365;
  v_days       integer;
  v_since      timestamptz;
  v_total      integer;
  v_no_result  integer;
  v_clicks     integer;
  v_click_rate numeric;
  v_top        jsonb;
  v_nores      jsonb;
begin
  -- Checagem explicita: o DEFINER ignora RLS, entao esta e a UNICA barreira.
  -- 42501 = insufficient_privilege -> 403 no PostgREST.
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  v_days  := case
               when p_days is null or p_days < 1 then 30
               when p_days > c_max_days then c_max_days
               else p_days
             end;
  v_since := now() - make_interval(days => v_days);

  select count(*),
         count(*) filter (where e.result_count = 0),
         count(*) filter (where e.clicked)
    into v_total, v_no_result, v_clicks
    from public.search_events e
   where e.created_at >= v_since;

  -- Divisao protegida: sem eventos, a taxa e 0 e nao ha erro.
  v_click_rate := case when v_total > 0 then round(v_clicks::numeric / v_total, 4) else 0 end;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top
    from (
      select e.term_normalized as term, count(*)::integer as count
        from public.search_events e
       where e.created_at >= v_since
       group by e.term_normalized
       order by count(*) desc, e.term_normalized
       limit 10
    ) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_nores
    from (
      select e.term_normalized as term, count(*)::integer as count
        from public.search_events e
       where e.created_at >= v_since
         and e.result_count = 0
       group by e.term_normalized
       order by count(*) desc, e.term_normalized
       limit 10
    ) t;

  return jsonb_build_object(
    'days',            v_days,
    'total',           v_total,
    'no_results',      v_no_result,
    'clicks',          v_clicks,
    'click_rate',      v_click_rate,
    'top_queries',     v_top,
    'no_result_terms', v_nores
  );
end;
$$;

comment on function public.get_search_insights(integer) is
  'HZ1-06: KPIs da busca global (total, buscas sem resultado, taxa de clique, top 10 consultas e top 10 termos sem resultado) na janela de p_days (default 30, teto 365). SO admin/supervisor; os demais recebem 42501. Sem PII: le apenas term_normalized.';

revoke all on function public.get_search_insights(integer) from public, anon;
grant execute on function public.get_search_insights(integer) to authenticated, service_role;

-- ── 4) Expurgo (retencao de 90 dias) ─────────────────────────────────────────
create or replace function public.purge_search_events(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_retention constant interval := interval '90 days';
  v_limit  integer;
  v_apagadas integer := 0;
begin
  v_limit := greatest(coalesce(p_limit, 1000), 0);

  with vencidos as (
    select e.id
      from public.search_events e
     where e.created_at < now() - c_retention
     order by e.id
     limit v_limit
  )
  delete from public.search_events e
   using vencidos
   where e.id = vencidos.id;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

comment on function public.purge_search_events(integer) is
  'HZ1-06 / LGPD: expurgo em lote dos search_events acima de 90 dias (docs/LGPD-RETENTION-POLICY.md, 4.3), no maximo p_limit por chamada (default 1000). Devolve quantas linhas apagou. Rotina de manutencao: EXECUTE so para service_role; sem cron nesta migration.';

-- Negar por padrao: funcao de manutencao, so o operador (service_role) executa.
revoke all on function public.purge_search_events(integer) from public, anon, authenticated;
grant execute on function public.purge_search_events(integer) to service_role;
