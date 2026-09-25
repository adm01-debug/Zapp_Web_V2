-- E44 (plano de 50 etapas, Fase 6): casos de borda de dashboard_kpi (RPC, E23).
--
-- Achado ao auditar E44 nesta sessão: desde E23, a RPC dashboard_kpi calcula
-- TUDO no servidor (contagens por dia, percentile_cont p50/p90, buckets de 3h,
-- conversão de timezone) — aggregateDashboardKpi (client, useDashboardKpi.ts)
-- só aplica o guard de amostra mínima (E19) sobre o resultado já agregado.
-- Os 4 casos pedidos pelo E44 ("0 linhas, 1 outlier de 10h, virada de dia,
-- timezone SP") testam lógica que não existe mais em JS — não dá pra cobrir
-- com vitest sem reinventar a lógica só pro teste. Ver comentário equivalente
-- em src/hooks/dashboard/__tests__/useDashboardKpi.test.ts.
--
-- Este arquivo documenta a verificação real desses 4 casos, rodada ao vivo
-- contra a definição de dashboard_kpi em produção nesta sessão (25/09/2026).
-- T1 chama a RPC de verdade (sem tocar em dados: p_since no futuro garante
-- zero linhas). T2-T4 replicam as expressões exatas da RPC sobre dados
-- sintéticos via VALUES — nenhuma tabela é lida ou escrita. Seguro de
-- re-executar a qualquer momento (só SELECT, sem side effects).

-- T1: 0 linhas — RPC real, p_since 10 anos no futuro não bate com nenhuma
-- linha de conversation_closures/conversation_sla. Espera-se: contagens 0,
-- médias/percentis null (não erro de divisão por zero), arrays zerados.
SELECT public.dashboard_kpi(now() + interval '10 years') AS t1_zero_rows;
-- Resultado observado 25/09/2026: resolvedToday=0, resolvedYesterday=0,
-- avgResponseToday=null, avgResponseYesterday=null, p90ResponseToday=null,
-- slaBreachedToday=0, answeredTodayCount=0, answeredYesterdayCount=0,
-- resolvedHourly8=[0,0,0,0,0,0,0,0], responseHourly8=[0,0,0,0,0,0,0,0]. OK.

-- T2: 1 outlier de 10h (36000s) entre 5 respostas normais (60-150s). A RPC
-- usa percentile_cont(0.5) pro card (não média) — mediana não pode ser
-- puxada pelo outlier; percentile_cont(0.9), usado só no tooltip, deve
-- refletir o outlier normalmente (esse é o design: p90 avisa, p50 não distorce).
WITH answered_today(response_seconds) AS (
  VALUES (60::numeric), (120), (90), (150), (110), (36000)
)
SELECT
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_seconds))::int AS t2_avg_response_p50,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY response_seconds))::int AS t2_p90_response
FROM answered_today;
-- Resultado observado 25/09/2026: p50=115s (perto da mediana real das 5
-- respostas normais, outlier não distorce o card), p90=18075s (reflete o
-- outlier, só aparece no tooltip). OK — mediana robusta a outlier confirmada.

-- T3/T4: virada de dia + timezone SP. A RPC bucketa por
-- (created_at AT TIME ZONE 'America/Sao_Paulo')::date — um evento às 23:30
-- em SP (que já é 02:30 UTC do dia seguinte) tem que cair no dia SP, não no
-- dia UTC (que já teria virado).
SELECT
  '2026-09-25 23:30:00-03'::timestamptz AS evento_2330_sp,
  ('2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AS t3_dia_bucket_sp,
  ('2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'UTC')::date AS dia_seria_se_fosse_utc,
  extract(hour FROM '2026-09-25 23:30:00-03'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::int AS t4_hora_bucket_sp
UNION ALL
SELECT
  '2026-09-26 02:15:00+00'::timestamptz,
  ('2026-09-26 02:15:00+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date,
  ('2026-09-26 02:15:00+00'::timestamptz AT TIME ZONE 'UTC')::date,
  extract(hour FROM '2026-09-26 02:15:00+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::int;
-- Resultado observado 25/09/2026 (2 linhas, mesmo instante em 2 notações):
-- t3_dia_bucket_sp='2026-09-25' em ambas, enquanto dia_seria_se_fosse_utc
-- já seria '2026-09-26' — confirma que a RPC bucketa pelo dia civil de SP,
-- não UTC. t4_hora_bucket_sp=23 em ambas (bucket least(7, 23/3) = bucket 7,
-- último bucket de 3h do dia) — hora local correta, não a hora UTC (2h).

-- Conclusão E44: os 4 casos pedidos pelo plano já são cobertos corretamente
-- pela RPC dashboard_kpi (SQL, produção). Nenhum gap encontrado, nenhum
-- código alterado — só verificação, mesmo espírito do E29 (EXPLAIN ANALYZE).
