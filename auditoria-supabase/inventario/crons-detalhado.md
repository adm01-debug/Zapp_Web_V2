# Inventário de Cron Jobs — 16 jobs ativos (2026-10-22)

Fonte: `cron.job` + `cron.job_run_details` (30 dias).

| jobid | jobname | schedule | falhas_30d | sucessos_30d | última execução | risco |
|-------|---------|----------|-----------|--------------|-----------------|-------|
| 1 | cleanup-link-preview-cache | `12 3 * * *` (diário 03:12) | 1 | 29 | 2026-10-22 03:12 | BAIXO |
| 4 | gmail-incremental-sync | `0-55/5 * * * *` (a cada 5min) | 354 | 8282 | 2026-10-22 14:50 | MÉDIO |
| 5 | vacuum-messages-post-expurgo | `20 3 2 9 *` (2 set) | 0 | 0 | — (sazonal) | INFO |
| 6 | vacuum-contacts-daily | `42 3 * * *` (diário 03:42) | 1 | 29 | 2026-10-22 03:42 | BAIXO |
| 9 | cleanup-edge-rate-limits | `7-52/15 * * * *` (a cada 15min) | 119 | 2760 | 2026-10-22 14:37 | BAIXO |
| 11 | talkx-scheduler-1min | `* * * * *` (a cada 1min) | 3878 | 39301 | 2026-10-22 14:51 | MÉDIO |
| 13 | expire-stale-agent-presence | `1-59/2 * * * *` (a cada 2min) | 779 | 18797 | 2026-10-22 14:51 | BAIXO |
| 15 | multiplix-send-trigger | `0-58/2 * * * *` (a cada 2min) | 763 | 17277 | 2026-10-22 14:50 | BAIXO |
| 16 | tasks-notify-due | `* * * * *` (a cada 1min) | 1390 | 32809 | 2026-10-22 14:51 | BAIXO |
| 17 | connection-health-check | `2-57/5 * * * *` (a cada 5min) | 288 | 5994 | 2026-10-22 14:47 | BAIXO |
| 18 | avatars-refresh | `7 * * * *` (horário, min 7) | 28 | 495 | 2026-10-22 14:07 | BAIXO |
| 20 | ai-jobs-tick-1min | `1-59 * * * *` (a cada 1min) | 1043 | 27263 | 2026-10-22 14:51 | BAIXO |
| 21 | searchbox-budget-alert | `0 12 * * *` (diário 12:00) | 0 | 20 | 2026-10-22 12:00 | BAIXO |
| 22 | crm-sync-outbox | `1-59/2 * * * *` (a cada 2min) | 2 | 4156 | 2026-10-22 14:51 | BAIXO |
| 23 | crm-sync-outbox-cleanup | `17 4 * * *` (diário 04:17) | 0 | 6 | 2026-10-22 04:17 | BAIXO |
| 24 | search-events-retention | `10 4 * * *` (diário 04:10) | 0 | 6 | 2026-10-22 04:10 | BAIXO |

## Análise por job

### 1. cleanup-link-preview-cache
- **O que faz:** `SELECT public.cleanup_link_preview_cache()` — apaga registros expirados da tabela `link_preview_cache`
- **Auth:** chamada SQL direta, sem segredo externo
- **Token exposto:** NÃO
- **Falhas:** 1/30d (job startup timeout — spike de 02/10)
- **Achado:** NENHUM — funcionamento normal

### 4. gmail-incremental-sync
- **O que faz:** `net.http_post` → edge `gmail-cron-sync`; autenticação via `apikey` (anon key do vault) + `x-cron-secret` (vault `gmail_cron_secret`)
- **Auth:** segredos lidos do vault em runtime — CORRETO
- **Token exposto:** NÃO (vault em runtime); versão anterior (`20260829110000`) tinha JWT hardcoded — ver achado B4
- **Falhas:** 354/30d (4,1% — job startup timeouts, spikes de 02/10 e 15/10)
- **Achado:** B4 histórico (JWT hardcoded na migration mais antiga, já substituída)

### 5. vacuum-messages-post-expurgo
- **O que faz:** `VACUUM FULL ANALYZE public.messages` — manutenção pós-expurgo sazonal (2 de setembro)
- **Auth:** SQL direto, sem segredo
- **Falhas:** 0 (sazonal, não executado nos últimos 30d)
- **Achado:** NENHUM — job de manutenção correto

### 6. vacuum-contacts-daily
- **O que faz:** `VACUUM ANALYZE public.contacts` — manutenção diária de bloat
- **Auth:** SQL direto
- **Falhas:** 1/30d (job startup timeout)
- **Achado:** NENHUM

### 9. cleanup-edge-rate-limits
- **O que faz:** `DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interval '1 hour'` — TTL de rate limit
- **Auth:** SQL direto, sem autenticação externa
- **Falhas:** 119/30d (4,1% — job startup timeouts)
- **Achado:** NENHUM — funcionalidade de limpeza correta

### 11. talkx-scheduler-1min
- **O que faz:** `SELECT public.trigger_talkx_engine_tick()` — tick do motor de campanhas TalkX
- **Auth:** SQL direto
- **Falhas:** 3878/30d (9,9% — maior volume de falhas absolutas; causa: job startup timeout nos spikes de 02/10 e 15/10)
- **Achado:** S6-01 (spikes de cron failures)

### 13. expire-stale-agent-presence
- **O que faz:** `SELECT public.expire_stale_agent_presence()` — expira presença de agentes inativos
- **Auth:** SQL direto
- **Falhas:** 779/30d (4,0%)
- **Achado:** NENHUM

### 15. multiplix-send-trigger
- **O que faz:** `SELECT public.trigger_pending_multiplix_dispatches()` — dispara envios pendentes do Multiplix
- **Auth:** SQL direto
- **Falhas:** 763/30d (4,2%)
- **Achado:** NENHUM

### 16. tasks-notify-due
- **O que faz:** `SELECT public.notify_due_tasks()` — notifica tarefas vencidas
- **Auth:** SQL direto
- **Falhas:** 1390/30d (4,1%)
- **Achado:** NENHUM

### 17. connection-health-check
- **O que faz:** `net.http_post` → edge `connection-health-check`; autenticação via `x-cron-secret` (vault `connection_health_check_cron_secret`)
- **Auth:** segredo do vault em runtime — CORRETO
- **Falhas:** 288/30d (4,6%)
- **Achado:** NENHUM

### 18. avatars-refresh
- **O que faz:** `net.http_post` → edge `batch-fetch-avatars`; autenticação via `x-cron-secret` (vault `avatars_refresh_cron_secret`)
- **Auth:** segredo do vault em runtime — CORRETO (versão anterior com bug de key foi corrigida em `20260902000200`)
- **Falhas:** 28/30d (5,3%)
- **Achado:** NENHUM

### 20. ai-jobs-tick-1min
- **O que faz:** `select public.trigger_ai_jobs_tick()` — tick do motor de AI jobs
- **Auth:** SQL direto
- **Falhas:** 1043/30d (3,7%)
- **Achado:** NENHUM

### 21. searchbox-budget-alert
- **O que faz:** `SELECT public.notify_searchbox_budget()` + `net.http_post` → edge `searchbox-budget-alert`; `x-cron-secret` do vault
- **Auth:** segredo do vault em runtime — CORRETO
- **Falhas:** 0/30d — 100% confiável
- **Achado:** NENHUM

### 22. crm-sync-outbox
- **O que faz:** `select public.trigger_crm_sync_outbox()` — drena outbox de sincronização CRM
- **Auth:** SQL direto
- **Falhas:** 2/30d (< 0,1%)
- **Achado:** NENHUM

### 23. crm-sync-outbox-cleanup
- **O que faz:** `select public.run_crm_sync_outbox_cleanup()` — limpeza do outbox CRM
- **Auth:** SQL direto
- **Falhas:** 0/30d
- **Achado:** NENHUM

### 24. search-events-retention
- **O que faz:** `select public.purge_old_search_events()` — TTL de eventos de busca (retenção LGPD)
- **Auth:** SQL direto
- **Falhas:** 0/30d
- **Achado:** NENHUM

## Resumo de riscos

| Achado | Severidade | Jobs afetados |
|--------|-----------|---------------|
| S6-01: Spikes de job startup timeout | MÉDIO | 11 (talkx-scheduler), 4 (gmail-sync), 13, 15, 16, 17, 18, 20 |
| B4: JWT anon hardcoded em migration antiga | BAIXO | job 4 (histórico, versão atual usa vault) |
| Cron sem TTL para login_attempts | MÉDIO | ausente — ver achado S12-01 |
