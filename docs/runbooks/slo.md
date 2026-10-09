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
| Jobs (pg_cron) | Supabase Cloud | `cron.job_run_details` — 6 jobs ativos **lidos de `cron.job` em 2026-09-05**: `avatars-refresh` (hora em hora), `gmail-incremental-sync` (5 min), `cleanup-link-preview-cache` (03:00), `vacuum-contacts-daily` (03:30), `cleanup-edge-rate-limits` (a cada 15 min), `vacuum-messages-post-expurgo` (anual). Os dois `vacuum-*` foram criados direto no banco (sem migration no repo); `purge-processed-webhook-events` (`supabase/migrations/_foreign/20260612141500`) é do Supabase self-hosted (AtomicaBR): `evolution_webhook_events` não existe neste banco, então **não se aplica aqui** (ver `_foreign/README.md`) |

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
| Login funcional | 99,9 % | logs da edge `auth-login` (sem 5xx) + `login_attempts` (linhas com `locked_until`). As edges `check-account-lock`/`record-failed-login` foram removidas em 01/10/2026 |
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

## Multiplix — fila, voz, consumo e conexão (F91)

> Medido em 2026-10-08. Cada métrica tem **dono** e **ação**: um alerta sem dono não é alerta,
> é ruído. "Fonte real hoje" é a tabela/RPC de onde o número sai; onde não há fonte, o texto diz
> **sem fonte hoje** em vez de inventar um alvo — a ação, nesse caso, é instrumentar.
> Os procedimentos de resposta estão em `docs/runbooks/multiplix-incidentes.md`; os sinais de
> leitura usam as tabelas do módulo (`multiplix_delivery_items`, `multiplix_dispatches`,
> `multiplix_events`, `multiplix_voice_assets`, `whatsapp_connections`).

### Métricas do Multiplix

| Métrica | Fonte real hoje | Alvo | Dono | Ação quando dispara |
|---|---|---|---|---|
| Tempo de fila | `multiplix_delivery_items`: `sent_at - created_at` por item (fila = `status IN ('pending','failed_transient')` com `next_attempt_at` vencido) | p95 ≤ 10 min (o worker roda a cada 2 min) | Engenharia (módulo Multiplix) | Cenário 1 do runbook: conferir `cron.job` (`multiplix-send-trigger`) e `cron.job_run_details`; lease vencido volta ao claim sozinho (não reenviar à mão) |
| Falhas por classe | `multiplix_delivery_items.error_class` (com `status` `failed` / `failed_transient`) e a trilha `multiplix_events` (`item_failed` traz `error_class`) | ≤ 5 % dos itens por disparo | Engenharia (módulo Multiplix) | Separar transitória (ainda tem `next_attempt_at`, o sistema retenta) de dead letter (`failed` + `next_attempt_at IS NULL`) — §dead letter do `INCIDENT-RUNBOOK.md` |
| Latência de voz | **sem fonte hoje**: a fila de TTS do F65 não existe e `multiplix_voice_assets` guarda `caracteres`/`duracao_ms` do áudio, não o tempo de geração | instrumentar antes de fixar alvo | Engenharia (Voz/IA) com o dono do Multiplix | Cenário 3 do runbook: item de bloco de voz sem ativo válido não sai; registrar erro do provedor e não marcar como enviado |
| Consumo estimado × real | estimativa da ação `estimate` do `multiplix-dispatch` (blocos × aptos, versões de roteiro, voz) contra o realizado: itens com `sent_at` e `sum(multiplix_voice_assets.caracteres)` dos itens | ±5 % (F50/F66) | Operação (dono do disparo) com Engenharia | Cenário 5 do runbook: `pause_reason='daily_limit'` é esperado e volta sozinho no dia seguinte; acima do combinado, pausar (`action: "pause"`) e falar com o dono do disparo |
| Não conciliados | `multiplix_delivery_items` com `status='outcome_unknown'` (provedor não confirmou e o recibo não casou pelo `external_id`); recibos reconciliados pelo F58 | 0 sustentado; qualquer item parado em quarentena pede investigação | Engenharia (módulo Multiplix) | Conferir o `external_id` do item e o log do `evolution-webhook` (recibos); não reenviar em massa — quarentena é para não duplicar mensagem |
| Conexão em risco | `register_multiplix_connection_failure` → eventos `connection_at_risk`/`connection_failure` em `multiplix_events` + `multiplix_dispatches.pause_reason='connection_at_risk'` | 0 evento novo por conexão/dia | Operação (on-call) | Cenário 4 do runbook (SEV-2): não insistir em reconectar em loop; a retomada dos disparos é manual (`action: "start"`) |

**Rastreio por `correlation_id`:** o id do clique é gravado em `multiplix_events.correlation_id`
(F34/F43). Hoje o mesmo id **não** atravessa os três saltos (clique → worker `multiplix-send` →
`evolution-webhook`), porque cada edge gera o próprio id por requisição; o procedimento de
rastreio e o estado atual medido estão em `docs/runbooks/multiplix-incidentes.md` (seção
"Rastreio de 1 envio").
