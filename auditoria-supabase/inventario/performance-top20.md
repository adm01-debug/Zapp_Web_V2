# Performance — Top 20 queries por total_exec_time (2026-10-22)

Fonte: `extensions.pg_stat_statements` (schema `extensions`, não `public`).

## Top 20 queries

| # | Query (truncada) | Calls | Total (ms) | Avg (ms) | Rows |
|---|---|---|---|---|---|
| 1 | SELECT wal->>$5 as type (Realtime WAL processor) | 1.673.714 | 39.580.350 | 23,6 | 2.069.567 |
| 2 | SELECT public.trigger_talkx_engine_tick() | 16.915 | 15.364.557 | **908,3** | 16.915 |
| 3 | WITH pgrst_source… mcp_exec | 7.796 | 9.754.983 | **1.251,3** | 7.796 |
| 4 | INSERT INTO email_messages | 323.210 | 3.318.841 | 10,3 | 323.210 |
| 5 | SELECT id FROM storage.objects WHERE name = $1 | 1.329 | 1.745.374 | **2.427,5** | 719 |
| 6 | SELECT contacts.created_at, contact_type, company | 17.905 | 2.602.685 | 145,4 | 17.905 |
| 7 | INSERT INTO cron.job_run_details (start) | 82.176 | 2.492.797 | 30,3 | 82.176 |
| 8 | contacts_count_by_type() | 11.819 | 2.401.871 | **203,2** | 11.819 |
| 9 | search_contacts RPC | 11.944 | 2.285.734 | 191,4 | 11.944 |
| 10 | sub_tables realtime (publication check) | 418.801 | 1.955.383 | 4,7 | 418.801 |
| 11 | pgrst bulk RPC (get_inbox_contact_summaries?) | 719 | 1.745.374 | **2.427,5** | 719 |
| 12 | select public.trigger_ai_jobs_tick() | 16.645 | 1.638.029 | 98,4 | 16.645 |
| 13 | SELECT email_threads.id WHERE is_unread = $1 | 85.072 | 1.405.956 | 16,5 | 85.072 |
| 14 | SELECT public.notify_due_tasks() | 16.925 | 1.226.964 | 72,5 | 16.925 |
| 15 | pgrst_scalar audit log action | 51.937 | 1.208.344 | 23,3 | 51.937 |
| 16 | SELECT public.trigger_pending_multiplix_dispatches() | 8.463 | 1.149.242 | 135,8 | 8.463 |
| 17 | UPDATE cron.job_run_details SET status | 82.176 | 1.052.965 | 12,8 | 82.176 |
| 18 | pgrst_scalar ai_jobs_tick worker | 16.599 | 908.855 | 54,8 | 16.599 |
| 19 | UPDATE cron.job_run_details SET return_message | 2.382 | 753.758 | **316,4** | 2.382 |
| 20 | SELECT contacts.tags (distinct non-null) | 1.602 | 639.086 | **398,9** | 1.602 |

## EXPLAIN para trigger_talkx_engine_tick()

```sql
EXPLAIN SELECT public.trigger_talkx_engine_tick();
-- QUERY PLAN: Result  (cost=0.00..0.26 rows=1 width=4)
```

O plano é trivial (uma chamada de função — `Result` com custo ~0). O custo real está **dentro**
da função `trigger_talkx_engine_tick()` e não é visível via EXPLAIN sem ANALYZE.
Tempo médio: **908ms** por execução (16.915 chamadas).

## Achados de performance

### P-01 — trigger_talkx_engine_tick() 908ms médio (MÉDIO)
- Cron a cada 1 min, 908ms médio = 90% do slot ocupado
- Risco: se o motor ficar > 60s, o próximo cron dispara com o anterior ainda rodando
- Mitigação existente: cron `talkx-scheduler-1min` tem `3878 falhas` em 30d, que podem ser
  exatamente esse cenário (timeout de startup = "slot ocupado")
- Recomendação: adicionar advisory lock na função para evitar execução simultânea

### P-02 — storage.objects lookup 2.427ms médio (BAIXO)
- Apenas 1.329 chamadas mas ~40 min de tempo acumulado
- Possível ausência de índice em `storage.objects(name, bucket_id)`
- Verificar: `SELECT indexname FROM pg_indexes WHERE tablename='objects' AND schemaname='storage'`

### P-03 — user_roles 18.8M seq scans (B3, já documentado)
- Tabela de 1 linha com 18.8M sequential scans (dado da auditoria S5)
- Raiz: políticas RLS de outras tabelas chamam `is_admin_or_supervisor()` que lê `user_roles`
- EXPLAIN (sem ANALYZE) não disponível para queries parametrizadas em pg_stat_statements

## Nota sobre EXPLAIN ANALYZE

`EXPLAIN ANALYZE` foi omitido propositalmente — esta auditoria é READ-ONLY e `ANALYZE`
executa a query de verdade no banco de produção.
