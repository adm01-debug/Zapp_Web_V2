# SLOs e monitoramento de disponibilidade — ZAPP WEB V2

> Estado em 2026-09-05. O que está **medido hoje** vs. o que é **alvo**. Nada aqui é
> aspiracional sem dizer de onde sai o número.

## Atualização 2026-10-08 (item S2-4 da auditoria de 2026-09-05)

Reconciliação com o código desta data; o retrato de 05/09 abaixo continua como histórico.

- **Monitor externo de uptime continua não existindo.** Não há workflow, script nem painel
  registrado no repositório que alcance as URLs de fora (`/version.json`, REST do Supabase,
  Evolution GO). Por isso a tabela de SLOs ganhou a coluna **Fonte hoje**, com `REAL`,
  `PARCIAL` ou `PENDENTE` por linha: nenhuma linha pode citar medição que não existe.
- **`x-request-id` existe na borda, não ponta a ponta.** `supabase/functions/_shared/validation.ts`
  (`getCorsHeaders`) lê o `x-request-id` da requisição ou sorteia um `crypto.randomUUID()`,
  devolve em `X-Request-ID` e libera o header em `Access-Control-Expose-Headers`;
  `supabase/functions/_shared/ai-routing.ts` o lista em `ALLOWED_HEADER_NAMES`. O front **não**
  envia o header (nenhuma ocorrência em `src/`), então o id de correlação não nasce no cliente
  e não há log casado entre os dois lados.
- `db-live-guard.yml` passou a rodar **todo dia** (03:13 BRT), não só segunda: o SLO de drift
  passou a ter amostra diária.
- Referências de arquivo corrigidas: o health check sob demanda mora em
  `src/hooks/system/useDiagnosticsData.ts:241` e
  `src/components/monitoring/hooks/useMonitoringActions.ts:17` (o antigo useDiagnosticsData.ts
  saiu da árvore de diagnóstico e a citação do retrato de 05/09 não apontava mais para o
  arquivo).

## Componentes e sinais que já existem

| Componente | Onde roda | Sinal disponível hoje |
|---|---|---|
| Front (SPA) | Vercel `zapp_web_v2` | `GET /version.json` (build atual); Vercel Analytics/Runtime Logs via MCP `Vercel` |
| Banco + Auth + Storage | Supabase Cloud `tnnnlkbymytvtqngbbqh` | `DB Live Guard` (GitHub Actions, drift de schema); `db_health` no MCP |
| Edge Functions | Supabase Cloud | logs por função no Dashboard; `edge_rate_limits` (429 por chave); `csp-report` (violações de CSP em modo report-only) |
| WhatsApp (Evolution GO) | Hostinger `evolution-go-rxj2` | edge `connection-health-check` → `connection_health_logs` + alerta em `EvolutionDisconnectBanner` (realtime em `whatsapp_connections.status`) |
| Jobs (pg_cron) | Supabase Cloud | `cron.job_run_details` — 6 jobs ativos **lidos de `cron.job` em 2026-09-05**: `avatars-refresh` (hora em hora), `gmail-incremental-sync` (5 min), `cleanup-link-preview-cache` (03:00), `vacuum-contacts-daily` (03:30), `cleanup-edge-rate-limits` (a cada 15 min), `vacuum-messages-post-expurgo` (anual). Os dois `vacuum-*` foram criados direto no banco (sem migration no repo); `purge-processed-webhook-events` (`supabase/migrations/_foreign/20260612141500`) é do Supabase self-hosted (AtomicaBR): `evolution_webhook_events` não existe neste banco, então **não se aplica aqui** (ver `supabase/migrations/_foreign/README.md`) |

**O que não existe hoje:** monitor externo (uptime check de fora da infra), alerta
automático quando `connection-health-check` marca instância `disconnected` (a edge só roda
quando alguém abre Diagnóstico/Monitoramento — `src/hooks/system/useDiagnosticsData.ts:241`,
`src/components/monitoring/hooks/useMonitoringActions.ts:17`), e página de status.

## SLOs propostos (janela de 30 dias)

`Fonte hoje`: **REAL** = existe artefato medindo; **PARCIAL** = existe dado, mas sem consulta,
cadência ou alerta; **PENDENTE** = a fonte citada ainda não existe no repositório.

| SLO | Alvo | Como medir (fonte real) | Fonte hoje |
|---|---|---|---|
| Front disponível | 99,9 % | uptime check externo em `https://zapp-web-v2.vercel.app/version.json` (HTTP 200 + JSON) a cada 1 min | PENDENTE — nenhum monitor externo no repositório (passo 2) |
| Webhook `evolution-webhook` erro / aceitação | erro ≤ 0,5 % ⇔ aceitação ≥ 99,5 % — alvo único do webhook, sem meta paralela (as duas leituras são o mesmo número, só muda o lado olhado) | logs da edge `evolution-webhook` (`status` ≠ 2xx / total), Supabase Dashboard → Edge Functions → Logs | PARCIAL — os logs existem; falta consulta versionada e alerta |
| Webhook `evolution-webhook` latência | p95 < 500 ms | duração por invocação, lida dos **logs da Edge Function** no Supabase (Dashboard → Edge Functions → `evolution-webhook` → Logs); `extensions.pg_stat_statements` **não** serve de fonte — mede tempo de SQL, não a duração da função | PARCIAL — a duração por invocação está nos logs da Edge Function; falta consulta versionada e alerta |
| Mensagem inbound visível | p95 < 5 s entre `messages.created_at` (timestamp do WhatsApp) e `now()` no INSERT | `ingest_inbound_message` grava o `created_at` do provedor; a view diária `slo_inbound_latency_daily` compara com `now()` | PENDENTE — a view `slo_inbound_latency_daily` não existe em `supabase/schema-manifest.json` (passo 4) |
| Instância WhatsApp conectada | 99 % do tempo por instância | `connection_health_logs` (amostras `healthy` / total) | PARCIAL — amostra só quando alguém abre Diagnóstico/Monitoramento; o cron do passo 1 não existe |
| Login funcional | 99,9 % | logs da edge `auth-login` (sem 5xx) + `login_attempts` (linhas com `locked_until`); as edges `check-account-lock`/`record-failed-login` foram removidas em 01/10/2026 | PARCIAL — logs e tabela existem; sem consulta nem alerta |
| Schema sem drift | 100 % dos dias com `DB Live Guard` verde | GitHub Actions, workflow `db-live-guard.yml` | REAL — o workflow roda todo dia |

Error budget de 99,9 % em 30 dias = **43 min**. Estourou o budget → congela feature e prioriza
confiabilidade até o mês virar.

## x-request-id ponta a ponta

Medido em 2026-10-08:

| Elo | Estado | Onde |
|---|---|---|
| Cliente envia `x-request-id` | **não** | nenhuma ocorrência em `src/` |
| Borda lê/sorteia e devolve | **sim** | `supabase/functions/_shared/validation.ts` — `getCorsHeaders` |
| Borda permite na chamada da IA | sim | `supabase/functions/_shared/ai-routing.ts` — `ALLOWED_HEADER_NAMES` |
| Log casado cliente ↔ borda | **não** | não há correlação registrada nos dois lados |

Correlação ponta a ponta exige que o cliente gere o id e o envie (e que ele apareça no log
estruturado dos dois lados); hoje o id nasce na borda, então dois pedidos do mesmo usuário não
seguem o mesmo id.

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
| Falhas por classe | `multiplix_delivery_items.error_class` (com `status` `failed` / `failed_transient`) e a trilha `multiplix_events` (`item_failed` traz `error_class`) | ≤ 5 % dos itens por disparo | Engenharia (módulo Multiplix) | Separar transitória (ainda tem `next_attempt_at`, o sistema retenta) de dead letter (`failed` + `next_attempt_at IS NULL`) — §dead letter do `docs/INCIDENT-RUNBOOK.md` |
| Latência de voz | **sem fonte hoje**: a fila de TTS do F65 não existe e `multiplix_voice_assets` guarda `caracteres`/`duracao_ms` do áudio, não o tempo de geração | instrumentar antes de fixar alvo | Engenharia (Voz/IA) com o dono do Multiplix | Cenário 3 do runbook: item de bloco de voz sem ativo válido não sai; registrar erro do provedor e não marcar como enviado |
| Consumo estimado × real | estimativa da ação `estimate` do `multiplix-dispatch` (blocos × aptos, versões de roteiro, voz) contra o realizado: itens com `sent_at` e `sum(multiplix_voice_assets.caracteres)` dos itens | ±5 % (F50/F66) | Operação (dono do disparo) com Engenharia | Cenário 5 do runbook: `pause_reason='daily_limit'` é esperado e volta sozinho no dia seguinte; acima do combinado, pausar (`action: "pause"`) e falar com o dono do disparo |
| Não conciliados | `multiplix_delivery_items` com `status='outcome_unknown'` (provedor não confirmou e o recibo não casou pelo `external_id`); recibos reconciliados pelo F58 | 0 sustentado; qualquer item parado em quarentena pede investigação | Engenharia (módulo Multiplix) | Conferir o `external_id` do item e o log do `evolution-webhook` (recibos); não reenviar em massa — quarentena é para não duplicar mensagem |
| Conexão em risco | `register_multiplix_connection_failure` → eventos `connection_at_risk`/`connection_failure` em `multiplix_events` + `multiplix_dispatches.pause_reason='connection_at_risk'` | 0 evento novo por conexão/dia | Operação (on-call) | Cenário 4 do runbook (SEV-2): não insistir em reconectar em loop; a retomada dos disparos é manual (`action: "start"`) |

**Rastreio por `correlation_id`:** o id do clique é gravado em `multiplix_events.correlation_id`
(F34/F43). Hoje o mesmo id **não** atravessa os três saltos (clique → worker `multiplix-send` →
`evolution-webhook`), porque cada edge gera o próprio id por requisição; o procedimento de
rastreio e o estado atual medido estão em `docs/runbooks/multiplix-incidentes.md` (seção
"Rastreio de 1 envio").
