# S10 — Logs (7 dias)

**Coletado em:** 2026-11-01

## net._http_response (Edge Functions / pg_net)

```sql
SELECT date_trunc('day', created) as day, status_code, count(*)
FROM net._http_response
WHERE created >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2 ORDER BY 1 DESC;
```

| Dia | Status | Requests |
|---|---|---|
| 2026-11-01 | 200 | 1208 |
| 2026-11-01 | NULL | 6 |

**Apenas 1 dia de dados** — net._http_response tem retenção ~1h (cleanup-edge-rate-limits roda a cada 15min).

## Auth Audit Log

```sql
SELECT count(*), min(created_at), max(created_at) FROM auth.audit_log_entries;
-- Resultado: count=0 (VAZIO)
```

**Audit log de autenticação VAZIO** — zero eventos registrados em toda a história do banco.

## pg_cron Failures

Ver S6 para análise completa. Causa de todas as falhas: "job startup timeout" (pool exhaustion).

## Logs de Erros do PostgreSQL

**NÃO VERIFICADO** — acesso a pg_log requer acesso administrativo ao filesystem ou ao painel Supabase.

## Status

| Fonte de Log | Status |
|---|---|
| net._http_response | ✓ VERIFICADO (retenção ~1h) |
| auth.audit_log_entries | ✓ VERIFICADO (vazio) |
| pg_log / erros PostgreSQL | NÃO VERIFICADO |
| cron.job_run_details falhas | ✓ VERIFICADO (ver S6) |