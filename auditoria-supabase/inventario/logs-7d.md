# Logs de 7 Dias — Cron Jobs (2026-10-15 a 2026-10-22)

Fonte: `cron.job_run_details JOIN cron.job WHERE start_time >= now() - interval '7 days'`

## Status por job (7d)

| Job | failed | succeeded | taxa_falha |
|-----|--------|-----------|-----------|
| ai-jobs-tick-1min | 405 | 9.507 | 4,1% |
| avatars-refresh | 9 | 159 | 5,4% |
| cleanup-edge-rate-limits | 32 | 640 | 4,8% |
| cleanup-link-preview-cache | 1 | 6 | 14,3% |
| connection-health-check | 85 | 1.931 | 4,2% |
| crm-sync-outbox | 2 | 4.159 | 0,05% |
| crm-sync-outbox-cleanup | 0 | 6 | 0% |
| expire-stale-agent-presence | 213 | 4.827 | 4,2% |
| gmail-incremental-sync | 97 | 1.919 | 4,8% |
| multiplix-send-trigger | 204 | 4.836 | 4,0% |
| search-events-retention | 0 | 6 | 0% |
| searchbox-budget-alert | 0 | 7 | 0% |
| talkx-scheduler-1min | 429 | 9.651 | 4,3% |
| tasks-notify-due | 414 | 9.666 | 4,1% |
| vacuum-contacts-daily | 0 | 7 | 0% |

## Análise de falhas

### Padrão: ~4-5% de falhas é baseline estável
Todos os jobs com frequência >= 1min mostram ~4-5% de falhas. Esse baseline é consistente
com "job startup timeout" — o PostgreSQL tenta disparar o cron, mas a sessão de cron não
consegue conectar a tempo (pool de conexões ocupado, latência de pod).

O período 15-18/10 mostra concentração de falhas (`oldest` de vários jobs em 16/10 às 08:07–10:02
UTC), compatível com o spike S6-01 identificado na auditoria de 30 dias.

### Cleanup-link-preview-cache: 14.3% em 7d
- 1 falha, 6 sucessos → denominador pequeno (diário). Taxa alta por amostra pequena, não tendência.

### Crm-sync-outbox: 0,05% (2 falhas em 4.161 execuções)
- Taxa excepcional — confirma que esse job não sofre com job startup timeout da mesma forma
  (possível diferença: `SELECT` simples vs HTTP call via `pg_net`)

### Alerta do spike 15/10
- `connection-health-check`: oldest=`2026-10-15T22:18` (falha) até 16/10 10:02
- `gmail-incremental-sync`: oldest=`2026-10-15T23:42` 
- `multiplix-send-trigger`: oldest=`2026-10-15T22:18`
Padrão: ~ 220 falhas concentradas em ~12h (15-16/10) → mesmo padrão do spike de 02/10.

## Logs de edge functions

**NÃO VERIFICADO via esta auditoria.** O MCP `query_logs` não retornou logs de edge functions
sem autenticação edge. Ver PENDENCIAS.md item P7.

Funções de alto risco para verificação manual no dashboard:
- `evolution-webhook` — entrada de mensagens WhatsApp
- `whatsapp-webhook` — idem
- `external-db-bridge` / `external-db-proxy` — acesso ao banco externo (CRM)
- `public-api` — API pública exposta
