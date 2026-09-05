# SLOs e monitoramento de disponibilidade — ZAPP WEB V2

> Estado em 2026-09-05. O que está **medido hoje** vs. o que é **alvo**. Nada aqui é
> aspiracional sem dizer de onde sai o número.

## Componentes e sinais que já existem

| Componente | Onde roda | Sinal disponível hoje |
|---|---|---|
| Front (SPA) | Vercel `zapp_web_v2` | `GET /version.json` (build atual); Vercel Analytics/Runtime Logs via MCP `Vercel` |
| Banco + Auth + Storage | Supabase Cloud `tnnnlkbymytvtqngbbqh` | `DB Live Guard` (GitHub Actions, drift de schema); `db_health` no MCP |
| Edge Functions (64) | Supabase Cloud | logs por função no Dashboard; `edge_rate_limits` (429 por chave); `csp-report` (violações de CSP em modo report-only) |
| WhatsApp (Evolution GO) | Hostinger `evolution-go-rxj2` | edge `connection-health-check` → `connection_health_logs` + alerta em `EvolutionDisconnectBanner` (realtime em `whatsapp_connections.status`) |
| Jobs (pg_cron) | Supabase Cloud | `cron.job_run_details` — 6 jobs ativos: `avatars-refresh` (hora em hora), `gmail-incremental-sync` (5 min), `cleanup-link-preview-cache` (03:00), `vacuum-contacts-daily` (03:30), `cleanup-edge-rate-limits` (04:15), `vacuum-messages-post-expurgo` (anual) |

**O que não existe hoje:** monitor externo (uptime check de fora da infra), alerta
automático quando `connection-health-check` marca instância `disconnected` (a edge só roda
quando alguém abre Diagnóstico/Monitoramento — `useDiagnosticsData.ts:151`,
`useMonitoringActions.ts:17`), e página de status.

## SLOs propostos (janela de 30 dias)

| SLO | Alvo | Como medir (fonte real) |
|---|---|---|
| Front disponível | 99,9 % | uptime check externo em `https://zapp-web-v2.vercel.app/version.json` (HTTP 200 + JSON) a cada 1 min |
| Webhook inbound aceito | 99,5 % das entregas com 2xx | logs da edge `evolution-webhook` (status ≠ 2xx / total), Supabase Dashboard → Edge Functions → Logs |
| Mensagem inbound visível | p95 < 5 s entre `messages.created_at` (timestamp do WhatsApp) e `now()` no INSERT | `ingest_inbound_message` grava `created_at` do provedor; comparar com `clock_timestamp()` numa view diária |
| Instância WhatsApp conectada | 99 % do tempo por instância | `connection_health_logs` (amostras `healthy` / total) — exige o cron abaixo |
| Login funcional | 99,9 % | `login_attempts` + `check-account-lock`/`record-failed-login` sem 5xx nos logs |
| Schema sem drift | 100 % dos dias com `DB Live Guard` verde | GitHub Actions, workflow `db-live-guard.yml` |

Error budget de 99,9 % em 30 dias = **43 min**. Estourou o budget → congela feature e prioriza
confiabilidade até o mês virar.

## Próximos passos concretos (em ordem)

1. **Cron do health check** — `cron.schedule('connection-health-check', '*/5 * * * *',
   net.http_post(... '/functions/v1/connection-health-check' ...))`, mesmo padrão do
   `avatars-refresh`. Sem isso o SLO de instância não tem amostra.
2. **Uptime externo** — checar `/version.json` de fora (qualquer monitor HTTP com alerta por
   e-mail/WhatsApp); registrar aqui a URL do painel quando existir.
3. **Alerta de desconexão** — trigger em `connection_health_logs` (status `disconnected` por
   2 amostras seguidas) → `net.http_post` para a instância `PRINCIPAL` avisando o admin.
4. **View `slo_inbound_latency_daily`** — p50/p95 por dia a partir de `messages` (sender =
   `contact`), para o SLO de latência ter histórico.

## Runbook curto quando algo cai

| Sintoma | Primeiro comando |
|---|---|
| Front fora | `mcp Vercel → get_deployment` do último deploy; `list_deployments` para rollback |
| Webhook 5xx | Dashboard → Edge Functions → `evolution-webhook` → Logs; `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20` |
| Instância desconectada | banner no app → "Reconectar"; se persistir, MCP `HOSTINGER` → container `evolution-go-rxj2-api-1` (ver `docs/runbooks/deploy.md`) |
| Banco lento | `db_health`, `db_slow_queries`, `db_locks` no MCP `SUPABASE - ZAPP WEB V2 - MCP` |
