# S6 — pg_cron: Jobs e Falhas

**Coletado em:** 2026-11-01

## Resumo

| Métrica | Valor |
|---|---|
| Total de jobs ativos | 24 |
| Jobs com > 5% falha | 10 |
| Causa de TODAS as falhas | "job startup timeout" (pool esgotado) |

## Jobs por Taxa de Falha

```sql
SELECT jobname, schedule, runs_total, failures_total,
  round(failures_total::numeric/NULLIF(runs_total,0)*100,1) as fail_pct
FROM (
  SELECT j.jobname, j.schedule,
    count(d.runid) as runs_total,
    count(d.runid) FILTER (WHERE d.status='failed') as failures_total
  FROM cron.job j LEFT JOIN cron.job_run_details d USING(jobid)
  GROUP BY j.jobname, j.schedule
) x ORDER BY fail_pct DESC;
```

| Job | Schedule | Runs | Falhas | Falha% |
|---|---|---|---|---|
| `talkx-scheduler-1min` | `* * * * *` | 77447 | **4950** | **6.4%** |
| `dispatch-scheduled-messages` | `* * * * *` | 13103 | 1018 | 7.8% |
| `csat-reply-capture-tick` | `*/2 * * * *` | 6586 | 513 | 7.8% |
| `close-stale-calls` | `*/5 * * * *` | 2638 | 226 | 8.6% |
| `voice-changer-tmp-purge` | `17 * * * *` | 220 | 20 | 9.1% |
| `reconnection-logs-retention-30d` | `30 4 * * *` | 9 | 1 | 11.1% |

## Causa Raiz das Falhas

Todas as falhas apresentam **"job startup timeout"** — pool de conexões do pg_cron esgotado.
Com 8+ jobs rodando a cada minuto, o pg_cron precisa de conexões simultâneas que excedem o pool.

**Proposta:** P05_fix_pgcron_pool.sql