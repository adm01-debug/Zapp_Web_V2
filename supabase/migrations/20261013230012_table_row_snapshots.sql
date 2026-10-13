-- table_row_snapshots
-- Rollback: remove a RPC public.admin_table_row_snapshots(numeric), a função de job public.capture_table_row_snapshots() e a tabela public.table_row_snapshots; o historico de contagem de linhas vai embora (a tabela e nova, nao havia dado). Estado anterior = sem monitor de perda de linhas.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.admin_table_row_snapshots(numeric);
--   drop function if exists public.capture_table_row_snapshots();
--   drop table if exists public.table_row_snapshots;
--
-- SL-051 (P1, infra/banco): a V3 tem o `db-health-monitor` (conectividade, contagem
-- de linhas, pool, Sentry). A V2 ficou sem monitor. Sem um retrato diario da
-- contagem de linhas nao ha como perceber que uma tabela PERDEU linhas (delete em
-- massa acidental, migration destrutiva, ingestao que parou de gravar).
--
-- Esta migration entrega a UNICA peca de banco que o monitor precisa: a tabela de
-- retratos, a FUNCAO de job que a preenche (e faz a retencao) e a RPC de leitura
-- para o painel admin. Agendamento do job e do PE-102 (fora deste cartao): aqui
-- NAO ha `cron.schedule` nem chamada a Edge Function.
--
-- Desenho:
--   table_row_snapshots -> um retrato POR (dia, tabela) das ~15 tabelas criticas,
--     com a contagem EXATA (`count(*)`) e a ESTIMADA (`pg_class.reltuples`, barata).
--     A exata e a verdadeira; a estimada serve para comparar com o plano do planner.
--   capture_table_row_snapshots() -> job. Percorre a lista fixa de tabelas criticas
--     (whitelist, sem SQL montado de texto livre), grava/reagrava o retrato do dia
--     (idempotente: ON CONFLICT) e apaga retratos com mais de 90 dias (retencao).
--     Se uma tabela critica deixar de existir, FALHA ALTO (raise) em vez de sumir
--     do monitor: perder a tabela e exatamente o sintoma que isto existe para pegar.
--   admin_table_row_snapshots(p_drop_pct) -> RPC somente leitura para o painel:
--     compara o ultimo dia com o dia anterior e marca `is_alert` quando a queda
--     percentual passa do limiar (padrao 20%). Sem dia anterior nao inventa sinal
--     (is_alert = false, drop_pct = null).
--
-- Seguranca (skill funcao-segura-no-banco):
--   - Tabela nova nasce FECHADA: ENABLE ROW LEVEL SECURITY (sem policy = ninguem
--     acessa pelo cliente) + REVOKE ALL de PUBLIC/anon/authenticated. O painel le
--     pela RPC, nao pela tabela.
--   - As duas funcoes sao SECURITY DEFINER com `SET search_path = public, pg_temp`.
--   - admin_table_row_snapshots exige admin/supervisor (is_admin_or_supervisor(auth.uid())),
--     senao levanta 42501. EXECUTE so para authenticated e service_role.
--   - capture_table_row_snapshots e de servico: EXECUTE so para service_role.
--   - Nada de PII: devolve contagem de linhas por tabela, nunca conteudo.
--
-- Natureza: ADITIVA (tabela, funcoes e grants novos). Nao altera dado existente
-- nem objeto com dado. Idempotente (create ... if not exists / or replace).

create table if not exists public.table_row_snapshots (
  id              bigint generated always as identity primary key,
  snapshot_date   date        not null,
  table_name      text        not null,
  estimated_rows  bigint      not null default 0,
  exact_rows      bigint      not null,
  captured_at     timestamptz not null default now(),
  constraint table_row_snapshots_uniq unique (snapshot_date, table_name),
  constraint table_row_snapshots_table_name_fmt check (table_name ~ '^[a-z][a-z0-9_]*$'),
  constraint table_row_snapshots_rows_nonneg check (estimated_rows >= 0 and exact_rows >= 0)
);

comment on table public.table_row_snapshots is
  'Retrato diario da contagem de linhas das tabelas criticas (SL-051). Um retrato por (dia, tabela); retencao 90 dias.';

alter table public.table_row_snapshots enable row level security;

revoke all on table public.table_row_snapshots from public, anon, authenticated;
grant select on table public.table_row_snapshots to service_role;

-- Job: preenche o retrato do dia e aplica a retencao de 90 dias.
create or replace function public.capture_table_row_snapshots()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Lista FIXA (whitelist) das tabelas criticas. Nome vem daqui, nunca de texto
  -- livre; a tabela e citada com %I no format() mesmo assim (defesa em profundidade).
  v_tabelas text[] := array[
    'contacts',
    'messages',
    'profiles',
    'user_roles',
    'conversation_sla',
    'audit_logs',
    'whatsapp_connections',
    'departments',
    'campaigns',
    'talkx_campaigns',
    'team_conversations',
    'team_conversation_members',
    'notifications',
    'message_reactions',
    'user_settings'
  ];
  v_t        text;
  v_oid      oid;
  v_exata    bigint;
  v_estimada bigint;
  v_dia      date := (now() at time zone 'utc')::date;
  v_gravadas integer := 0;
  -- TETO de voltas por chamada: o loop tem lista fixa, mas o teto explicito
  -- impede que uma edicao futura transforme isto numa drenagem sem limite numa
  -- transacao so (recusa real de 06/10).
  v_teto_tabelas  constant integer := 64;
  -- TETO de exclusoes por chamada na retencao: o job roda todo dia e drena aos
  -- poucos; nunca apaga um volume ilimitado de uma vez. 90 dias x 15 tabelas
  -- =~ 1350 linhas, muito abaixo do teto.
  v_teto_retencao constant integer := 5000;
begin
  if coalesce(array_length(v_tabelas, 1), 0) > v_teto_tabelas then
    raise exception 'table_row_snapshots: lista de tabelas acima do teto de %', v_teto_tabelas
      using errcode = '54000';
  end if;

  foreach v_t in array v_tabelas loop
    if v_gravadas >= v_teto_tabelas then
      raise exception 'table_row_snapshots: teto de voltas (%) excedido', v_teto_tabelas
        using errcode = '54000';
    end if;
    v_oid := to_regclass('public.' || v_t);
    if v_oid is null then
      -- Tabela critica sumiu: e o proprio sintoma que o monitor existe para ver.
      -- Falhar alto, nao ignorar em silencio.
      raise exception 'table_row_snapshots: tabela critica ausente em public: %', v_t
        using errcode = '42704';
    end if;

    execute format('select count(*) from public.%I', v_t) into v_exata;

    select greatest(coalesce(c.reltuples, 0), 0)::bigint
      into v_estimada
      from pg_class c
     where c.oid = v_oid;

    insert into public.table_row_snapshots
      (snapshot_date, table_name, estimated_rows, exact_rows)
    values
      (v_dia, v_t, coalesce(v_estimada, 0), v_exata)
    on conflict (snapshot_date, table_name) do update
      set estimated_rows = excluded.estimated_rows,
          exact_rows     = excluded.exact_rows,
          captured_at    = now();

    v_gravadas := v_gravadas + 1;
  end loop;

  -- Retencao: 90 dias. So apaga retratos deste monitor, nunca dado de negocio.
  -- Limitada por chamada (v_teto_retencao): nunca uma exclusao sem teto numa
  -- transacao so. O job roda todo dia e drena o excedente aos poucos.
  with alvo as (
    select id
      from public.table_row_snapshots
     where snapshot_date < v_dia - 90
     order by snapshot_date
     limit v_teto_retencao
  )
  delete from public.table_row_snapshots s
   where s.id in (select id from alvo);

  return v_gravadas;
end;
$$;

comment on function public.capture_table_row_snapshots() is
  'Job diario (SL-051): grava/reagrava o retrato de linhas das tabelas criticas e aplica retencao de 90 dias. So service_role.';

-- Leitura para o painel admin: compara o ultimo dia com o dia anterior.
create or replace function public.admin_table_row_snapshots(p_drop_pct numeric default 20)
returns table (
  table_name     text,
  snapshot_date  date,
  previous_date  date,
  exact_rows     bigint,
  previous_rows  bigint,
  delta_rows     bigint,
  drop_pct       numeric,
  is_alert       boolean,
  threshold_pct  numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ultimo date;
  v_anterior date;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_drop_pct is null or p_drop_pct < 0 or p_drop_pct > 100 then
    raise exception 'invalid_threshold' using errcode = '22023';
  end if;

  select max(s.snapshot_date) into v_ultimo from public.table_row_snapshots s;
  select max(s.snapshot_date) into v_anterior
    from public.table_row_snapshots s
   where s.snapshot_date < v_ultimo;

  return query
  select
    l.table_name,
    l.snapshot_date,
    p.snapshot_date,
    l.exact_rows,
    p.exact_rows,
    (l.exact_rows - coalesce(p.exact_rows, 0))::bigint,
    case
      when coalesce(p.exact_rows, 0) = 0 then null::numeric
      else round((p.exact_rows - l.exact_rows)::numeric * 100.0 / p.exact_rows, 2)
    end,
    (
      p.exact_rows is not null
      and p.exact_rows > 0
      and ((p.exact_rows - l.exact_rows)::numeric * 100.0 / p.exact_rows) > p_drop_pct
    ),
    p_drop_pct
  from (
    select s.table_name, s.snapshot_date, s.exact_rows
      from public.table_row_snapshots s
     where s.snapshot_date = v_ultimo
  ) l
  left join (
    select s.table_name, s.snapshot_date, s.exact_rows
      from public.table_row_snapshots s
     where s.snapshot_date = v_anterior
  ) p on p.table_name = l.table_name
  order by 8 desc, 7 desc nulls last, 1;
end;
$$;

comment on function public.admin_table_row_snapshots(numeric) is
  'Painel admin (SL-051): compara o ultimo retrato com o anterior e sinaliza queda acima do limiar. So admin/supervisor.';

revoke all on function public.capture_table_row_snapshots() from public, anon, authenticated;
grant execute on function public.capture_table_row_snapshots() to service_role;

revoke all on function public.admin_table_row_snapshots(numeric) from public, anon;
grant execute on function public.admin_table_row_snapshots(numeric) to authenticated, service_role;
