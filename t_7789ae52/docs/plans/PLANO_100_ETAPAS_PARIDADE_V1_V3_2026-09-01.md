# Plano de melhorias do ZAPP WEB V2 em 100 etapas — paridade com V1 e V3

> **Data:** 2026-09-01 (America/Sao_Paulo)
> **Repositório alvo:** `adm01-debug/Zapp_Web_V2` · branch de trabalho `claude/v1-v3-analysis-v2-improvements-8aw2ns`
> **Baselines analisadas (HEAD local no momento da análise):**
> `Zapp_Web_V1` = `2df111e` · `Zapp_Web_V2` = `b8fa9ca` · `Zapp_Web_V3` = `56f24d1`
> **Escopo desta entrega:** planejamento. Nenhum código de produto, dado ou objeto de banco foi alterado.
> **Natureza da análise:** comparação **a nível de repositório** (código, migrations, workflows, scripts, docs). O estado
> em runtime (banco vivo, edges implantadas, flags ligadas) **não** foi consultado nesta sessão — onde a decisão depende
> do runtime, a etapa marca `[VERIFICAR AO VIVO]`.

---

## 0. Como este plano se diferencia do plano de excelência já existente

O V2 já possui um plano de 100 etapas (`docs/handoffs/handoff_cline_100_etapas_2026_08_30.md`, auditado em
`docs/handoffs/auditoria_exaustiva_plano_100_etapas_2026_08_30.md`). Aquele plano é de **higiene de engenharia**
(supply chain, coverage, TypeScript estrito, bundle, RLS, DR, release). Este plano é **complementar** e responde a uma
pergunta diferente: *quais funcionalidades e ferramentas existem no V1 e no V3 e não existem no V2?*

Onde há sobreposição, a etapa referencia a etapa correspondente do plano anterior (`[≈ Cline 0NN]`) para evitar trabalho
duplicado. Nenhuma etapa aqui repete uma tarefa de higiene pura; todas nascem de um artefato concreto de V1/V3.

---

## 1. Inventário comparativo (contagens por repositório)

| Dimensão | V1 | V2 | V3 | Observação |
|---|---:|---:|---:|---|
| Arquivos em `src/` | 1.614 | 1.236 | 2.374 | |
| Páginas (`src/pages`) | 41 | 20 | 47 | V2 navega por `ViewRouter` (56 views) — breadth de módulos de negócio é **maior** no V2 |
| Hooks (`src/hooks`, arquivos) | 225 | 341 | 405 | 230 nomes existem só no V3; 71 só no V1 |
| Diretórios em `src/components` | 59 | 61 | 58 | V3/V1 têm `debug`, `evoApiHealth`, `providers`, `routing`, `system` (V1 também `dev`) |
| Edge Functions | 106 | 61 | 122 | ~70 nomes existem só no V3; 47 só no V1 (maioria em comum com V3) |
| Helpers em `supabase/functions/_shared` | 30 | 18 | 60 | V3: `contract-kit`, `providers/*`, `rate-limiter`, `sentry`, `vault`, `dlq-backoff`, `send-idempotency` |
| Migrations | 462 | 328 | 119 (+ snapshot canônico) | V3 consolidou em snapshot `scripts/decouple/snapshots/zapp_schema_snapshot.sql` |
| Tabelas (catálogo/snapshot) | ~230 | 125 (`supabase/schema-catalog.json`) | ~400 | |
| Funções SQL catalogadas | — | 49 | ~990 (`CREATE FUNCTION` no snapshot, inclui `evo`) | |
| Workflows GitHub Actions | 6 | 7 | 51 | |
| Scripts em `scripts/` | 15 | 39 | 128 | |
| Arquivos de teste fora de `src` (`tests/`, `e2e/`) | 70 | 4 | 101 | V2 tem 158 `*.test.*` dentro de `src`, mas **zero** E2E |
| Documentos em `docs/` | 52 | 75 | 1.012 | |
| Dependências exclusivas (vs V2) | 37 | — | 43 | Playwright, Storybook, Sentry, husky, commitlint, web-vitals, react-hotkeys-hook, use-stick-to-bottom… |

### 1.1 O que o V2 tem e V1/V3 não têm (não regredir)

Para não perder o que já é vantagem do V2, as etapas abaixo preservam explicitamente:

- `db-migrate.yml` com prova de identidade do banco, "exatamente uma migration ausente" e paridade integral pré/pós;
- `types-sync.yml` que abre PR de sincronização com 3 gates (tsc, usage-guard, remoções destrutivas);
- `deploy-functions.yml` com manifesto remoto, atestado e smoke positivo/negativo por função (`scripts/edge-deploy/*`);
- `scripts/ci/check-workflow-pins.mjs` (pins imutáveis de actions) e `lint-ratchet.mjs`;
- `scripts/db-audit/*` (usage-guard, catálogo, manifesto, identidade do banco, ACL de `mcp_exec`);
- módulos de negócio sem equivalente no V3: `public-api`, `sicoob-bridge*`, `promogifts-catalog`, `external-db-*`,
  `bitrix-api`, suíte `elevenlabs-*`, `webauthn`, `wallet`, `gamification`, `crm360`, `meta-capi`, `payments`.

Qualquer etapa deste plano que toque esses pontos deve manter o comportamento atual (aceite inclui "guards existentes
continuam verdes").

---

## 2. Método

1. Diff de nomes por camada (páginas, rotas, hooks, componentes, edges, `_shared`, scripts, workflows, dependências,
   tabelas via `CREATE TABLE` das migrations/snapshot e `schema-catalog.json`).
2. Leitura do cabeçalho/propósito de cada artefato exclusivo (comentário de topo de `index.ts`, hooks e libs).
3. Verificação no V2 por grep de tabela (`CREATE TABLE`), uso (`.from('x')`) e mecanismo (ex.: `IndexedDB`,
   `CircuitBreaker`, `@sentry`, `playwright`, `husky`).
4. Classificação de cada lacuna: **AUSENTE** (nada equivalente), **PARCIAL** (existe algo com nome/escopo diferente),
   **EQUIVALENTE** (não entra no plano — listado na seção 4).
5. Fontes documentais cruzadas: `FEATURE_REGISTRY.md`, `ESTADO.md`, `TESTING_CONVENTION.md`, `DECOUPLING.md`,
   `docs/ci-workflow-inventory.md` (V3); `docs/handoffs/HANDOFF_ZAPP_WEB_V2_2026-08-29.md`,
   `docs/FORGOTTEN_FEATURES_REPORT.md` (V2); `AGENTS.md`, `docs/architecture/*` (V1).

---

## 3. Matriz de lacunas por domínio

Legenda de estado no V2: **A** = ausente · **P** = parcial · (evidência entre parênteses).

### 3.1 Governança de repositório e CI

| Capacidade | Origem | Estado V2 |
|---|---|---|
| Hooks de commit (`husky` + `.lintstagedrc` + `.commitlintrc.json`, pre-commit roda `check-schema-usage`) | V3 raiz | A (grep `husky\|commitlint` = 0) |
| Prettier com `prettier-plugin-tailwindcss`, `eslint-plugin-tailwindcss` | V3 `package.json` | P (`.prettierrc` sem plugin) |
| Issue templates YAML (`bug_report.yml`, `feature_request.yml`, `config.yml`) | V3 `.github/ISSUE_TEMPLATE` | P (V2 tem templates markdown) |
| `actionlint.yaml`, `CODEOWNERS` por área | V3 `.github` | P (CODEOWNERS só default) |
| `codeql.yml`, `security.yml` (audit deps + RLS report semanal), gitleaks | V1/V3 | A |
| `branch-protection-sentinel.yml` (bloqueia `console.log`/`any` novos) | V1/V3 | A |
| `pr-size-gate.yml`, `notify-ci-failure.yml`, `ai-agent-pr-policy.yml`, `ownership-gate.yml` | V3 | A |
| `flaky-test-detector.yml`, `regression-test-gate.yml` (E46: fix exige teste) | V3 | A |
| `ratchet-tighten.yml` (aperta baseline automaticamente) | V3 | P (V2 tem ratchet ESLint, sem aperto automático) |
| `migration-lint.yml`, `migration-uniqueness.yml`, `migration-smoke-test.yml` | V3 | P (V2 valida migrations no `db-guard.yml`, sem linter estático dedicado) |
| `security-invoker-gate.yml` (views sem `security_invoker`) | V3 | A |
| `check-realtime-dead-channels.yml` (subscription silenciosa) | V3 | A |
| `edge-drift-check.yml`, `edge-env-completeness.yml`, `edge-auth-smoke.yml`, `edge-parse-gate.yml`, `edge-schema-parity.yml` | V3 | P (V2 tem manifesto + smoke no deploy manual) |
| `bundle-secret-guard.yml` (barra `service_role` no bundle e valida anon key no gateway) | V3 | A |
| `ESTADO.md` (o que está ligado e quem chama), `FEATURE_REGISTRY.md` (Full/Partial/Suggested com evidência), `TESTING_CONVENTION.md` | V3 raiz | A |

### 3.2 Testes

| Capacidade | Origem | Estado V2 |
|---|---|---|
| Playwright (`@playwright/test`, 3 configs: boot, e2e full, a11y; `global.setup.ts` com storageState) | V3 `e2e/`, `playwright*.config.ts` | A (grep `playwright` = 0) |
| 60+ specs E2E (auth, inbox, chat, teams, reactions, DLQ, resilience, visual regression) | V3 `e2e/*.spec.ts` | A |
| `@axe-core/playwright` (a11y automatizada) | V3 | A |
| Storybook 9 + `addon-a11y` + `addon-vitest` (13 stories) | V3/V1 `.storybook` | A |
| Testes de contrato Deno das edges (`deno-contract-tests.yml`, `_shared/*.test.ts`) | V3 | P (V2: 1 `*.test.ts` em `supabase/functions`; contratos em `tests/contracts` rodam em vitest) |
| `fast-check` (property-based) | V3/V1 | A |
| `scripts/fuzz-edge-functions.ts`, `scripts/stress-test.ts` | V3 | A |
| `check-coverage-ratchet.mjs` + `coverage-baseline.json` | V3 | A (`@vitest/coverage-v8` ausente) `[≈ Cline 015/025]` |
| `e2e-fixtures` / `e2e-webhook-fixture` (seed determinístico + webhook sintético) | V1 edges | A |
| `seed-e2e-user.yml`, `seed-e2e-contacts.yml`, `cleanup-e2e-data.yml` | V3 | A |
| `happy-dom` (mais rápido que jsdom), `pool: forks`, `retry` em CI | V3 `vitest.config.ts` | P |

### 3.3 Resiliência de envio e pipeline de mensagens

| Capacidade | Origem | Estado V2 |
|---|---|---|
| DLQ `failed_messages` + `reprocess-failed-messages` (cron 15 min) + `AdminFailedMessagesPage` (RPCs `rpc_dlq_list_audit`, `rpc_dlq_retry_now`, `rpc_dlq_abandon`) | V3 | P (V2 tem tabela `webhook_failures` e ACL testada, sem edge de reprocessamento nem UI) |
| `message_attempts` + `MessageAttemptsTimeline`, `MessageSendHistorySheet`, `MessageStatusTimeline/Panel` | V3 chat | A |
| `_shared/send-idempotency.ts` + tabela `evolution_send_idempotency` + `src/lib/sendIdempotency.ts` | V3 | P (V2 tem `ux_messages_dedup` no banco; sem cache server-side de envio) |
| `_shared/dlq-backoff.ts` (backoff determinístico + idempotency key) | V3/V1 | A |
| `src/lib/offlineQueue.ts` (IndexedDB) + `useOfflineQueue` | V3 / V1 | A (V2: `useOfflineCache` só cache; grep `IndexedDB` = 0) |
| `src/lib/evolutionCircuitBreaker.ts` por instância | V3 | A |
| `src/lib/crossTabSendDedupe.ts` + `crossTabDedupe*` (BroadcastChannel) | V3/V1 | A |
| `useSendThrottle` (intervalo mínimo + burst) | V3 inbox | A |
| `evolutionSendRetry.ts` (backoff exponencial + `retryAlerts`, `retryConfig`, `RetryConfigPanel` admin) | V3 | P (`src/lib/retry.ts` genérico) |
| `instance-pause-control` edge + `instance_processing_pauses` + `AdminInstancePausesPage` | V3/V1 | A |
| `evolution-retry-metrics` edge + `evolution_retry_metrics` + `useFailureMetricsBatch` | V3/V1 | A |
| `useMessageQueue`, `ChatQueueProgress`, `ChatSendProgress`, `SendErrorBanner`, `FailureFilterBar` | V3 chat | A |
| `optimisticConcurrency.ts`, `requestDeduplicator.ts` | V3 lib | A |

### 3.4 Observabilidade

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `@sentry/react` no front + `_shared/sentry.ts` nas edges + `location = /sentry-tunnel` no nginx | V3/V1 | P (V2 menciona Sentry em 3 arquivos, sem SDK instalado) `[≈ Cline 046/073]` |
| `web-vitals` (lib) → edge `client-observability` (204, nunca 500) | V3 | P (V2 `src/lib/web-vitals.ts` só loga no console) `[≈ Cline 047]` |
| `correlationId.ts` + `withRequestId.ts` cliente→edge→DB | V3 | P (V2 `logger.ts` gera id só local) `[≈ Cline 072]` |
| Edge `metrics` (Prometheus text v0.0.4) + edge `health` consolidada | V3 | A |
| Edge `db-health-monitor` (PG + Sentry), `status` mínimo | V3 | A |
| Tabelas `app_error_logs`, `analytics_events`, `security_audit_logs` | V3 | A (V2 tem `query_telemetry` + `AdminTelemetriaPage`) |
| `AdminRealtimeMonitorPage` + `useRealtimeMonitor` | V3/V1 | A |
| `AdminEvolutionApiLogsPage` + `evolution_health_logs` + `useEvolutionApiLogs` | V3/V1 | P (`connection_health_logs` + `EvolutionMonitoringDashboard`) |
| `AdminWebhookOverviewPage`, `AdminWebhookEventsPage`, `AdminWebhookSecretStatusPage`, edges `webhook-hmac-selftest`, `webhook-secret-status`, `recheck-webhook-signature` | V3/V1 | P (V2 tem `webhook-diagnostic` edge) |
| `AdminAlertHistoryPage`, `alertHistory.ts`, `webhookHealthAlerts.ts` | V3/V1 | A |
| `AdminSearchInsightsPage` + `search_insights` | V3/V1 | A |
| `src/lib/diagnostics.ts`, `selfHostedDiagnostics.ts`, `/admin/self-hosted-health` | V3 | P (`DiagnosticsView`) |
| Páginas de debug: `/debug/realtime-fanout`, `/debug/send-status-bus`, `/debug/backend` | V3/V1 | A |
| `flaky`, `devRealtimeLogger`, `consoleErrorFilter` | V3 lib | A |

### 3.5 Contratos de Edge Functions e abstração de provedor

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `_shared/contract-kit.ts` (`parseOrReject`, envelope 422 único, versionamento `x-contract-version`, sunset 410) | V3 | P (`_shared/contracts.ts` + `schemas.ts`, sem versionamento) `[≈ Cline 056/094]` |
| `contract-schemas*.ts`, `contract-versions.ts`, `edge-contract-schemas.ts`, `webhook-schemas.ts` | V3 | P |
| `src/lib/invokeEdge.ts` (wrapper único de `functions.invoke`) + `runtimeGuards.ts` | V3 | A |
| Gates `check-contract-sync.mjs`, `check-error-shapes.mjs`, `check-invoke-migration.mjs`, `audit-contract.mjs` | V3 | A |
| `providers/registry.ts` (`evolution` \| `cloud` \| `fake`, `PROVIDER_UNDER_TEST` só em `DENO_ENV=test`) | V3 | A (V2 usa `evolution-go-adapter.ts` fixo) |
| Edges `whatsapp-cloud-api`, `whatsapp-cloud-send`, `whatsapp-cloud-webhook(-verify)`, `whatsapp-cloud-secrets-status` | V3/V1 | A |
| `connection-test`, `provider-healthcheck` (switchover automático), `provider-router`, `channel_provider_routes` | V3/V1 | A |
| `ingest-port.ts` (porta de entrada canônica), `evolution-event-types.ts` | V3 | A |
| `_shared/rate-limiter.ts` (estado no banco), `_shared/vault.ts`, `_shared/auth.ts` (`requireUser`) | V3 | P |

### 3.6 Segurança e autenticação

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `invite-user` edge + `InviteUserDialog` + RPC `invite_user` (token TTL) | V3 | A (`create-user` cria direto) |
| `revoke-session` edge + `AdminUserSessionsDialog` + tabela `sessions` | V3 | A (`user_sessions` existe, sem revogação) |
| `request-password-reset` edge pública | V3 | P (V2 tem `approve-password-reset` + `password_reset_requests`) |
| `login-attempts` edge + `_shared/security-gate.ts` (blocked_ips + whitelist + geo no pré-voo do login) | V3 | P (V2 tem tabelas e painéis, enforcement só no front) |
| `route_permissions` + `/admin/route-permissions` + `useRoutePermissions` | V3/V1 | A |
| `/admin/security-logs`, `/admin/acl-alerts`, `security_acl_alerts`, `useACLAlerts` | V3 | A |
| `file-security-scanner` + `secure-upload` (VirusTotal) + `file_scan_logs` + `virustotal-test` | V3/V1 | A (V2 tem `quarantine` bucket/store) |
| `lgpd-scheduled-jobs` + `data_deletion_requests` + `consent_records` + `useLGPDAuditLogs` | V3 | P (`LGPDComplianceView` sem jobs) |
| `useLGPDWebhookSync` (opt-out WhatsApp ↔ CRM) | V1 | A |
| `AccessDenied` page + `OAuthConsent` | V3 | A |
| `src/lib/csp.ts`, `security.ts`, `globalErrorHandlers.ts` | V1 | P |

### 3.7 Inbox / chat

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `ChatScrollerV2` (`use-stick-to-bottom`), `useVirtualRows`, `useMessagesCursor` | V3 | P (V2 virtualiza com listas próprias) |
| `MessageStatusInline/Timestamps/ReadStatus`, `ConversationDeliverySummary` | V3 | P (`MessageStatus.tsx`) |
| `TicketActionsBar`, `useTicketStatus`, `ticketStore.ts` | V3 | P (`TicketTabs`) |
| `AutomationSuggestionsBar` + `automation-suggest-reply` | V3 | A |
| `inboxFilterPresets.ts`, `inboxFilterPersistence.ts`, `inboxPresetsSync.ts`, `useInboxStatusPref` | V3 | P (`useInboxFilters`, `saved_filters`) |
| `useInboxDeepLinks` (`?contact=`/`?message=`) | V3 | A |
| `useInboxHeartbeat` (presença 4 min) + `useAgentPresence` (V1) + `agent_presence` | V3/V1 | A |
| `agents-ops/AgentOpsTable`, `AgentRecentSendsPopover`, `useAgentRecentSends`, `QueueMetricsDashboard` | V3 | A |
| `useInboxShortcuts` (posse única de atalho), `react-hotkeys-hook` | V3 | P (`KeyboardShortcutsHelp`) |
| Tabelas `conversation_pins`, `favorite_messages`, `forwarded_messages`, `message_reports`, `useFavoriteMessage`, `usePinMessage`, `useReportMessage` | V3 | P (`pinned_conversations`, `ForwardMessageDialog` sem tabela) |
| `useSafeInteractiveMessage`, `MessageBubbleUnsupported` | V3 | P |
| Pipeline de stickers V1 (`stickerConverter`, `stickerValidator`, `useStickerPipeline`, `useStickerPagination`) | V1 | P (`StickerPicker`, `classify-sticker`) |
| `ChatMonitoringDialog`, `whisper` com anexo (spec `chatpanel-whisper-attachment-preserves-text`) | V3 | P (`WhisperMode`) |
| `HardResetButton`, `SwDebugWidget`, `ThemeDebugger`, `BuildValidationOverlay` | V3 `components/debug` | A |

### 3.8 Contatos, CRM, automações e filas

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `contacts-import` (CSV 50k, normalização, upsert por `remote_jid`) | V3/V1 | A (`useImportData` só front) |
| `contact-media` (galeria paginada por contato) + spec E2E | V3/V1 | P (`MediaGallery` front) |
| `fetch-whatsapp-avatar` + `useContactAvatarFetch` (salva no CRM externo) | V3/V1 | P (`batch-fetch-avatars` cron) |
| `contact_segments` + `useContactSegments`; `contact_intelligence` | V3 | A |
| `zapp-crm-sync` (provider plugável via `crm_sync_config`) | V3 | P (`bitrix-api`, `external-crm.service.ts` fixos) |
| `automation_rules` + `automation_executions` + `/admin/automations` + `/admin/automations/logs` + `useAutomationLogs` + `AutomationFailureAlertsMount` | V3/V1 | P (`automations` tabela + `AutomationsManager`, sem execuções/logs) |
| `followup-bridge` + `evolution_followup_rules` + `useFollowupPending` | V3 | P (`followup_sequences/steps/executions`) |
| `ticket-router` (sticky + round-robin + skills) + `sticky_assignments` + `queue_routing_rules` + `QueueRoutingRules` UI | V3 | P (`skill_based_assign`, `queue_skill_requirements`) |
| `queue-rebalance` edge (batch, respeita `sla_priority`/`routing_weight`) | V1 | P (`reassign_overloaded_agents` SQL) |
| `auto-escalate-sla` edge + `sla-alert-forward` + `sla-alert-log-failure` + `SLAAlertPreferences` + `SLAAlertHistory` | V1/V3 | P (`docs/SLA-ESCALATION-CRON.md`, `sla_alert_preferences` ausente) |
| `cron_schedules` + `cron_schedule_executions` + `/admin/automations/cron` + `useCronScheduler` | V3 | A |
| `csat-dispatch` (tick 1 min) + `csat-auto-send` v2, `nps-scheduler` | V3/V1 | P (`csat_auto_config`, sem dispatcher) |
| `useConversationHeatmap`, `useAbandonmentRateData`, `usePeriodComparison`, `useAgentPerformanceRanking` | V3 | P |

### 3.9 E-mail, notificações, dados e mídia

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `outlook-oauth` (Microsoft Graph) + `useOutlookEmail` + `docs/OUTLOOK_SETUP.md` | V1 | A |
| `email-track-pixel`, `email-track-link`, `useEmailTracking` | V3/V1 | A |
| `zapp-email-send` (Resend) + `zapp-email-inbound-webhook` + `_shared/resend.ts` | V3 | P (`send-email`) |
| `gmail-token-refresh`, `gmail-health` + `useGmailHealth`, `email_health_logs` | V3/V1 | P (`gmail-cron-sync`) |
| `email-imap-bridge` + `imap_smtp_accounts` + `useImapAccounts` | V3/V1 | A |
| `email_templates`, `email_signatures`, `EmailTemplatesManager`, `useEmailSignature` | V3/V1 | A |
| `zapp-notifications-dispatch` + `notification_channels_config` + `/admin/notification-channels` + `notification_delivery_log` | V3 | P (`notifications` + push desligado) |
| `evolution-notification-dispatcher` (outbox `evolution_notification_outbox`) | V3 | A |
| `zapp-auto-export` (CSV/JSON → bucket privado `zapp-exports`, signed URL) + `auto_export_jobs` + `/admin/auto-export` | V3 | P (`AutoExportManager` front) |
| `cleanup-storage-orphans` (varre subdiretórios) | V3/V1 | A |
| `download-wa-status-media`, `evolution-group-sync`, `evolution-templates` | V3 | P (grupos/templates só via `evolution-api`) |
| `speech-to-text`, `transcribe-audio-internal` v7 (magic bytes) | V3 | P (`ai-transcribe-audio`) |
| `ai-router` (12+ funções IA em 1 entrada) + `elevenlabs-voice` consolidada | V3 | P (V2: 9 `ai-*` + 10 `elevenlabs-*` separadas) |
| `evolution-consumer-stats` (HMAC) | V3 | A |

### 3.10 Deploy, infra e PWA

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `Dockerfile` (bun → nginx, manifesto N-1 de assets) + `docker-compose.yml` + `nginx-prod.conf` (HSTS, CSP, Permissions-Policy, `/healthz`, `/sentry-tunnel`) | V3 | A (V2: Vercel + `vercel.json` só com rewrite e `no-store` em `version.json`) |
| Headers de segurança na Vercel | — | A `[≈ Cline 060]` |
| `sw.js` + `ServiceWorkerUpdateBanner` + `sitemap.xml` | V3 | P (`SERVICE_WORKER_ENABLED = false`, `useServiceWorker` só remove SW legado) `[≈ Cline 091]` |
| `deploy-vps.yml`, `deploy-vps-selfhosted.yml`, `infra/stacks/*` | V3 | n/a (V2 fica na Vercel) — portar só o que é hosting-agnóstico |
| `edge-deploy.yml` disparado por merge em `supabase/functions/**` | V3 | P (V2 deploy manual `workflow_dispatch`) |
| `vite-plugin-compression2`, `rollup-plugin-visualizer`, `check-performance-budget.mjs` + `performance-baseline.json` | V3 | P (`performance-budget.json` existe sem script) `[≈ Cline 018/041]` |
| `buildVersion.ts`, `version:bump:*`, `deployment-update.ts` | V3 | P (V2 tem `version.json` + `useVersions`) |
| `@tailwindcss/container-queries` | V3 | A |

### 3.11 Ferramentas de desenvolvedor e arquitetura

| Capacidade | Origem | Estado V2 |
|---|---|---|
| `check-schema-usage.mjs` (schema correto no client), `lint-supabase-casts.mjs` | V3 | P (usage-guard cobre `.from/.rpc` vs catálogo) |
| `check-dead-code.mjs` + allowlist, `check-ts-nocheck.mjs`, `check-tsc-ratchet.mjs`, `check-cluster-typecheck.mjs` | V3 | A `[≈ Cline 031/032]` |
| `check-domain-boundaries.ts`, `validate-barrels.ts`, `check-data-layer.mjs` (ratchet de arquitetura) | V3/V1 | A `[≈ Cline 038/039]` |
| `check-design-system.ts` + `ds-config.ts` + `generate-component-registry.ts` (V1 gera `full_audit_report.txt`) | V3/V1 | A |
| `check-e2e-spec-coverage.mjs`, `check-fix-regression-test.mjs` | V3 | A |
| `check-types-freshness.mjs`, `check-types-schemas.mjs`, `repair-types-schemas.mjs` | V3 | P (`types-sync.yml`) |
| `query-fingerprint.mjs`, `simulate-schema-access.mjs`, `audit-rls-coverage.mjs`, `rls-role-matrix.test.ts` | V3 | P (`db-audit/*`) `[≈ Cline 063]` |
| `src/features/*` (feature-first) + `src/domain/messaging` + `src/shared/*Schemas.ts` | V3 | P (V2 por `components/*` + `hooks/*` por domínio) |
| `useAppBootstrap` (1 RPC `rpc_app_bootstrap` substitui 6+ queries) | V3 | A |
| `featureFlags.ts` + tabela `feature_flags` + `useFeatureFlags` (V1) | V3/V1 | A (grep `featureFlag` = 0) |
| `eventBus.ts`, `edgeEvents.ts`, `queryStaleTimes.ts` | V3 | P |
| `graphify-out/` (grafo de conhecimento, `GRAPH_REPORT.md`) | V3 | P (V2 `CLAUDE.md` cita graphify, sem `graphify-out/` versionado) |
| `mcp-server` (JSON-RPC 2.0, tools read-only com RLS) + `mcp-query` + `@lovable.dev/mcp-js` | V3 | A |
| `Storybook`, `PerfMonitor` (V1 `components/dev`) | V3/V1 | A |
| `AGENTS.md`/`HERMES.md` (regras multi-agente, worktrees) | V1/V3 | P (`CLAUDE.md`) |

---

## 4. O que **não** entra (equivalente já existe no V2 ou não se aplica)

| Item de V1/V3 | Motivo |
|---|---|
| `scripts/decouple/*`, `evo-ddl-gate`, `ownership-gate`, `measure-invariants`, `zapp-schema-drift-gate` | Específicos do desacoplamento `zapp`×`evo` self-hosted. V2 usa Evolution GO (Hostinger) com banco Supabase Cloud próprio; não há schema `evo` a proteger |
| `gen-types-zapp.mjs`, `check-schema-drift.sh`, `schema-snapshot.yml` | V2 já tem `types-sync.yml`, `db-live-guard.yml` e `check-catalog-fresh.mjs` com identidade do banco |
| `deploy-vps*.yml`, `infra/stacks`, `infra/runner`, `ops-runner-sparse-repair.yml` | Hosting do V2 é Vercel (decisão registrada em `CLAUDE.md` §3) |
| `lib/evolutionDirectClient.ts` (V1: chamada direta à Evolution com chave no `localStorage`) | Anti-padrão de segurança; contraria `CLAUDE.md` §2 (secrets só em edges) |
| `migrate-helper`, `seed-teams-users`, `apply-chatpanel-fixes.yml`, `scripts/migrate-chatpanel.mjs` | Temporários/one-off |
| Edge `mcp` auto-gerada pelo Lovable | Substituída pelo `mcp-server` real (etapa 099) |
| `evolution-credentials(-write)`, `evolution_instance_credentials` | V2 usa credenciais globais em secrets (`EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_TOKEN`); multi-credencial só faria sentido com multi-instância |
| `webhook_failures` vs `failed_messages` | Não renomear: etapa 021 estende a tabela existente |
| `notifications` vs `app_notifications`, `connection_health_logs` vs `evolution_health_logs` | Manter nomes do V2; etapas adicionam só as colunas/UI que faltam |
| `useServiceWorker` (V2 remove SW legado) | Etapa 093 decide religar; não substituir antes |

---

## 5. Plano de 100 etapas

### Convenções

- **Prioridade:** `P0` bloqueia segurança/integridade/operação · `P1` bug ou risco operacional · `P2` feature parcial/dívida · `P3` incremental.
- **Esforço:** `S` (≤ 1 sessão) · `M` (1–3 sessões) · `L` (> 3 sessões ou dependência externa).
- **Gates:** `[DB]` = DDL no banco `tnnnlkbymytvtqngbbqh` (fechamento triplo do `CLAUDE.md` §1: migration + ledger + catálogo + `known-violations.json`) · `[PROD]` = deploy de edge/secret/infra · `[DECISÃO]` = trade-off de negócio/custo que exige `APROVADO`.
- **Origem:** caminho no repo de origem que serve de referência de implementação. Portar = adaptar ao banco Cloud do V2, ao adapter Evolution GO (`_shared/evolution-go-adapter.ts`) e ao `ViewRouter`; nunca copiar cegamente.
- Ordem numérica = ordem recomendada dentro do bloco. Blocos 1–4 são pré-requisito dos demais.

### Resumo por bloco

| Bloco | Etapas | Tema | Resultado esperado |
|---|---|---|---|
| 1 | 001–010 | Governança de repo e CI base | Hooks de commit, templates, scanners e sentinelas ativos |
| 2 | 011–020 | Testes E2E, contrato e ratchets | Playwright + a11y + Deno contract tests rodando em PR |
| 3 | 021–030 | Resiliência de envio | DLQ operável, idempotência, fila offline, circuit breaker |
| 4 | 031–040 | Observabilidade | Sentry, vitals, correlation id, métricas, páginas admin de saúde |
| 5 | 041–050 | Contratos de edge e provedores | Envelope único, versionamento, registry evolution/cloud/fake |
| 6 | 051–060 | Segurança e auth | Convites, sessões, gate de login, permissões por rota, scan de arquivo, LGPD |
| 7 | 061–070 | Inbox e chat | Linha do tempo de envio, presets, deep links, presença, ops de agentes |
| 8 | 071–080 | Contatos, CRM, automações e filas | Import CSV, segmentos, automações com log, roteamento sticky, cron admin |
| 9 | 081–090 | E-mail, notificações, dados e mídia | Outlook, tracking, dispatcher de notificações, export, limpeza, IA consolidada |
| 10 | 091–100 | Deploy, PWA, arquitetura e MCP | Headers, SW, budgets, ratchets, bootstrap RPC, feature flags, MCP server |

---

### Bloco 1 — Governança de repositório e CI base (001–010)

#### 001 — Hooks de commit: husky + lint-staged + commitlint
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `.husky/pre-commit`, `.lintstagedrc`, `.commitlintrc.json`, `package.json` (`"prepare": "husky"`).
- **Estado no V2:** AUSENTE (grep `husky|commitlint` em `package.json`/`src` = 0).
- **Ação:**
  - Adicionar `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional` como devDependencies.
  - `.lintstagedrc`: `eslint --fix` + `prettier --write` em `src/**/*.{ts,tsx}`; manter regra V3 de não falhar o commit por lint (`exit 0`) e falhar por typecheck só no CI.
  - `.husky/pre-commit`: `bun run lint-staged` + `node scripts/db-audit/supabase-usage-guard.mjs` (equivalente do `check-schema-usage.mjs` do V3).
  - `.husky/commit-msg`: `commitlint --edit`. Tipos aceitos = lista do V3 (`feat fix docs style refactor perf test build ci chore security revert`), `subject-min-length 10`.
- **Aceite:** commit com mensagem fora do padrão é rejeitado localmente; `bun install` instala hooks; CI não depende dos hooks.

#### 002 — Prettier com plugin Tailwind e ESLint Tailwind
- **Prioridade:** P3 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `package.json` (`prettier`, `prettier-plugin-tailwindcss`, `eslint-plugin-tailwindcss`).
- **Estado no V2:** PARCIAL (`.prettierrc` existe, sem plugin; ESLint sem plugin Tailwind).
- **Ação:** instalar os dois plugins; ativar só regras `no-contradicting-classname` e `enforces-shorthand` (as demais em `warn` para não gerar churn); não rodar `--write` em massa — formatação só nos arquivos tocados via lint-staged (etapa 001).
- **Aceite:** `bun run lint` verde; nenhum arquivo reformatado fora dos tocados.

#### 003 — Issue templates YAML, PR template por área e actionlint
- **Prioridade:** P3 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`, `.github/actionlint.yaml`, `.github/PULL_REQUEST_TEMPLATE/chat-ui-100.md`.
- **Estado no V2:** PARCIAL (`ISSUE_TEMPLATE` markdown; sem actionlint).
- **Ação:** converter os templates para forms YAML (campos: repo afetado, banco, evidência ao vivo, migração envolvida); adicionar `actionlint.yaml` + step `actionlint` no `ci.yml` (job `lint-and-typecheck`), pinado por SHA conforme `scripts/ci/check-workflow-pins.mjs`.
- **Aceite:** `check-workflow-pins.mjs` continua verde; actionlint roda em todo PR que toca `.github/workflows/**`.

#### 004 — CODEOWNERS por área e `ownership-gate`
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `.github/CODEOWNERS`, `.github/workflows/ownership-gate.yml`, `scripts/decouple/ownership-gate.mjs` (só o conceito: PR que toca área X exige owner X).
- **Estado no V2:** PARCIAL (`CODEOWNERS` só com owner default).
- **Ação:** mapear `supabase/migrations/**`, `supabase/functions/**`, `scripts/db-audit/**`, `.github/workflows/**` para o owner técnico; criar `ownership-gate.yml` que falha se PR alterar `supabase/migrations/**` sem atualizar `supabase/schema-catalog.json` ou `scripts/db-audit/known-violations.json` (regra 3 do `CLAUDE.md` §1 vira gate).
- **Aceite:** PR que toca migration sem catálogo é bloqueado; PR de docs passa.

#### 005 — `security.yml`: audit de dependências, gitleaks e relatório RLS semanal
- **Prioridade:** P0 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `.github/workflows/security.yml`, `scripts/SECRET_SCAN.sh`; V1 `.github/workflows/security.yml` (`scripts/verify_rls_compliance.ts` → `rls-compliance-report.md` semanal).
- **Estado no V2:** AUSENTE (V2 depende de `.gitignore` com padrões de credencial e de Dependabot). `[≈ Cline 011/016/017]`
- **Ação:** workflow com 3 jobs: `bun audit --audit-level=high` (fail-closed), gitleaks (action pinada) e `node scripts/db-audit/check-webhook-failures-acl.sql`-style RLS report gerado de `supabase/schema-catalog.json` + `scripts/db-audit/catalog.sql`; publicar como artifact e comentário semanal (cron segunda 09:00 BRT = `0 12 * * 1` UTC).
- **Aceite:** run verde na `main`; secret plantado em branch de teste é detectado; relatório lista tabelas com RLS e policies.

#### 006 — CodeQL semanal
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V1/V3 `.github/workflows/codeql.yml` (cron `0 9 * * 1`, linguagem `javascript-typescript`).
- **Estado no V2:** AUSENTE.
- **Ação:** portar o workflow; `paths-ignore` para `supabase-export/**`, `docs/**`, `tmp/**`; permissões `security-events: write` só nesse workflow.
- **Aceite:** alertas aparecem na aba Security; nenhum falso positivo de `supabase-export` (dump SQL).

#### 007 — Branch Protection Sentinel (novos `console.log` e `any`)
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V1/V3 `.github/workflows/branch-protection-sentinel.yml` (steps "Check for console.log", "Check for any").
- **Estado no V2:** PARCIAL (`no-console` é `warn` no ESLint; `lint-ratchet.mjs` impede aumento do total mas não bloqueia `any` novo por arquivo).
- **Ação:** gate por diff (`git diff origin/main...HEAD -- src`) que falha se a contagem de `console.log`/`: any` nos arquivos tocados subir; reaproveitar `scripts/ci/lint-ratchet.mjs` como biblioteca em vez de duplicar.
- **Aceite:** PR que adiciona `any` em arquivo tocado falha; PR que só remove passa.

#### 008 — PR Size Gate + Notify CI Failure
- **Prioridade:** P3 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `pr-size-gate.yml`, `notify-ci-failure.yml` (webhook de falha de CI para o canal do time de TI).
- **Estado no V2:** AUSENTE.
- **Ação:** limite advisory de 800 linhas (label `size/XL`, sem bloquear); notificação de falha de `ci.yml`/`db-guard.yml` na `main` via Evolution GO (`/message/sendText` do `_shared/evolution-go-routes.ts`) para o grupo de TI — secret `CI_ALERT_WHATSAPP_JID`.
- **Aceite:** falha simulada na `main` gera mensagem no WhatsApp em < 2 min.

#### 009 — `ESTADO.md` + `FEATURE_REGISTRY.md` do V2
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `ESTADO.md` (edge por grupo A–F: quem chama), `FEATURE_REGISTRY.md` (Full/Partial/Suggested com evidência arquivo:linha + objeto DB).
- **Estado no V2:** AUSENTE (`docs/FUNCTIONALITIES_INVENTORY.md` é de 2025-01 e `docs/FORGOTTEN_FEATURES_REPORT.md` de 2026-03; sem classificação de "ligado").
- **Ação:** gerar `ESTADO.md` na raiz com as 61 edges classificadas por chamador real (`invoke('nome')` em `src`, outra edge, cron `pg_cron`, N8N, externo) — o `HANDOFF_2026-08-29` já identifica `analyze-external-db`/`evolution-health` como órfãs (GATE B); gerar `FEATURE_REGISTRY.md` cobrindo as 56 views do `ViewRouter` com evidência de hook + tabela + RPC.
- **Aceite:** cada edge tem grupo e chamador; cada view tem classificação e ≥ 1 evidência; docs antigos ganham banner "superado por".

#### 010 — `TESTING_CONVENTION.md` e limpeza de diretórios de teste
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `TESTING_CONVENTION.md` (co-located, `src/__tests__`, `e2e/`, quarentena documentada em `vitest.config.ts`).
- **Estado no V2:** PARCIAL (158 testes em `src`, 4 em `tests/contracts`, sem convenção escrita; `vitest.contracts.config.ts` separado).
- **Ação:** documentar a convenção; mover `tests/contracts/*` para `src/__tests__/contracts/` ou manter e declarar; adotar `happy-dom` + `pool: forks` + `retry: CI ? 2 : 0` no `vitest.config.ts` (medir tempo antes/depois).
- **Aceite:** `bun run test` e `bun run test:contracts` verdes; tempo de suíte registrado no doc.

---

### Bloco 2 — Testes E2E, contrato e ratchets (011–020)

#### 011 — Infraestrutura Playwright (3 configs + storageState)
- **Prioridade:** P0 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `playwright.config.ts` (chromium/firefox/webkit, `webServer` vite), `playwright.e2e.config.ts`, `playwright.a11y.config.ts`, `e2e/global.setup.ts` (`loginViaUI` → `e2e/.auth/user.json`), `e2e/fixtures/auth.ts`.
- **Estado no V2:** AUSENTE (grep `playwright` = 0). `[≈ Cline 029]`
- **Ação:** instalar `@playwright/test`, `playwright`, `wait-on`; criar as 3 configs com `baseURL` `http://localhost:8080` (porta do `vite.config.ts` do V2); `global.setup.ts` autentica com usuário de E2E (etapa 013); scripts `test:e2e`, `test:e2e:full`, `test:a11y`, `test:e2e:report`.
- **Aceite:** `bun run test:e2e` executa 1 spec de boot verde local e em CI (chromium apenas em PR; matriz completa no nightly da etapa 018).

#### 012 — Specs E2E dos fluxos críticos
- **Prioridade:** P0 · **Esforço:** L · **Gate:** —
- **Origem:** V3 `e2e/auth.spec.ts`, `auth-session-lifecycle.spec.ts`, `inbox-full-flow.spec.ts`, `send-message-cycle.spec.ts`, `critical-flows.spec.ts`, `navigation.spec.ts`, `contacts-crud.spec.ts`, `whatsapp-connection.spec.ts`, `chat-media.spec.ts`, `error-handling-standardized.spec.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** portar 10 specs adaptando seletores ao `ViewRouter` (navegação por `currentView`, não por URL) e aos componentes `RealtimeInboxView`/`ChatPanel`; usar `data-testid` já existentes ou adicionar só onde faltar (sem refatorar componente).
- **Aceite:** 10 specs verdes 3 vezes seguidas (sem flake) contra ambiente de E2E.

#### 013 — Fixtures determinísticas: `e2e-fixtures` + seed/cleanup por REST
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V1 `supabase/functions/e2e-fixtures` (seed + cleanup), `e2e-webhook-fixture` (webhook sintético); V3 `seed-e2e-user.yml`, `seed-e2e-contacts.yml`, `cleanup-e2e-data.yml`, `validate-e2e-user.yml`.
- **Estado no V2:** AUSENTE.
- **Ação:** edge `e2e-fixtures` com `verify_jwt=true` + header `X-E2E-Secret` (fail-closed sem secret, padrão `mcp-query` do V3); usuário `e2e@` com role `agent`, contatos com prefixo `E2E-`; workflow de cleanup diário; **nunca** apontar para instância `PRINCIPAL` de produção — usar instância `E2E` da Evolution GO ou provider `fake` (etapa 047). `[DECISÃO]`: criar instância `E2E` na Evolution GO (custo zero, mas ocupa slot) ou depender do `fake`.
- **Aceite:** seed + cleanup idempotentes; nenhum dado `E2E-` sobra após o job.

#### 014 — Acessibilidade automatizada com axe
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `@axe-core/playwright`, `e2e/a11y/`, `auth-accessibility.spec.ts`, `chat-accessibility.spec.ts`, `auth-keyboard-navigation.spec.ts`.
- **Estado no V2:** AUSENTE (V2 tem `src/components/a11y` e `src/lib/a11y.ts`, sem verificação automatizada). `[≈ Cline 030/049]`
- **Ação:** spec axe para `/auth`, inbox, settings e admin; falhar só em `critical`/`serious`; registrar `moderate` como artifact.
- **Aceite:** 0 violações critical/serious nas 4 telas.

#### 015 — Testes de contrato Deno das Edge Functions
- **Prioridade:** P0 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `.github/workflows/deno-contract-tests.yml`, `supabase/functions/_shared/*.test.ts`, `_shared/adversarial-matrix.ts`, `deno.json`.
- **Estado no V2:** PARCIAL (1 `*.test.ts` em `supabase/functions`; `tests/contracts` roda em vitest sem Deno). `[≈ Cline 027]`
- **Ação:** `deno.json` na raiz; migrar `tests/contracts/*.contract.test.ts` para rodar também com `deno test`; escrever testes para `_shared/hmac-validation.ts`, `evolution-go-adapter.ts`, `evolution-go-routes.ts`, `validation.ts`, `schemas.ts`; workflow em PR que toca `supabase/functions/**`.
- **Aceite:** ≥ 20 testes Deno verdes; `evolution-go-routes.ts` coberto para todos os verbos.

#### 016 — Coverage V8 + ratchet + baseline
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `scripts/check-coverage-ratchet.mjs`, `scripts/coverage-baseline.json`, `test:coverage:ratchet`.
- **Estado no V2:** AUSENTE (`test:coverage` existe, `@vitest/coverage-v8` não está instalado). `[≈ Cline 015/024/025]`
- **Ação:** instalar `@vitest/coverage-v8`; gerar baseline por diretório (`src/lib`, `src/hooks`, `src/services`, `supabase/functions/_shared`); ratchet falha se linhas/branches caírem > 0,5 pp abaixo do baseline; `ratchet-tighten.yml` semanal (V3) grava novo baseline quando sobe.
- **Aceite:** `ci.yml` publica coverage e falha em regressão; baseline commitado.

#### 017 — Flaky Test Detector + Regression Test Gate
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `flaky-test-detector.yml`, `regression-test-gate.yml` + `scripts/check-fix-regression-test.mjs` (E46: commit `fix:` exige teste novo/alterado), `docs/FLAKY_TESTS.md`.
- **Estado no V2:** AUSENTE.
- **Ação:** nightly roda a suíte 3× e abre issue com testes instáveis; gate de PR: título/commits `fix(`… exigem diff em `*.test.*`/`*.spec.*` (label `no-test-needed` como bypass auditável).
- **Aceite:** PR `fix:` sem teste é bloqueado; issue de flake criada automaticamente.

#### 018 — Nightly E2E completo e visual regression
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `e2e-nightly-full.yml`, `e2e/visual-regression.spec.ts`, `tests/visual-oled.spec.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** nightly com matriz chromium/firefox/webkit + screenshots de referência das 6 views principais (`inbox`, `dashboard`, `contacts`, `queues`, `settings`, `admin`) em light/dark; diff tolerância 0,2 %.
- **Aceite:** run nightly verde; mudança visual intencional exige atualizar snapshots no PR.

#### 019 — Fuzz e stress de edges
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `scripts/fuzz-edge-functions.ts` (`test:fuzz`), `scripts/stress-test.ts` (`test:stress`), tabelas `stress_test_runs`/`stress_test_metrics`, `fast-check`.
- **Estado no V2:** AUSENTE.
- **Ação:** fuzz de payload nas 6 edges com `verify_jwt=false` do `supabase/config.toml` (webhooks e públicas) usando `fast-check`; stress de `evolution-webhook` com 200 eventos/min contra ambiente de E2E; resultados em artifact (sem tabela no banco nesta etapa).
- **Aceite:** nenhum 500 sob fuzz; p95 do webhook < 800 ms no stress.

#### 020 — Linter estático de migrations + unicidade + smoke
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `scripts/lint-migrations.mjs` (E31), `migration-uniqueness.yml`, `migration-smoke-test.yml`, `scripts/validate-migration-syntax.py` (reescrever em Node: container não tem python3).
- **Estado no V2:** PARCIAL (`db-guard.yml` valida em PG17 e `check-migration-drift.mjs`; sem linter de conteúdo). `[≈ Cline 061]`
- **Ação:** regras: sem `CREATE INDEX CONCURRENTLY` (armadilha A6), sem `DROP` sem comentário `-- AUTORIZADO`, `search_path` fixo em `SECURITY DEFINER`, `ON CONFLICT DO NOTHING` proibido no INSERT do ledger (armadilha A8), prefixo de 14 dígitos único (`uniq -d`); integrar ao `db-guard.yml`.
- **Aceite:** as 328 migrations atuais passam (ou entram em allowlist datada); migration de teste com `CONCURRENTLY` falha.

---

### Bloco 3 — Resiliência de envio (021–030)

#### 021 — DLQ operável: `reprocess-failed-messages` + RPCs `rpc_dlq_*`
- **Prioridade:** P0 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 `supabase/functions/reprocess-failed-messages` (cron 15 min, auth service_role ou admin), RPCs `rpc_dlq_list_audit`, `rpc_dlq_retry_now`, `rpc_dlq_abandon`, tabela `dlq_audit_log`; V1 `_shared/enqueue-failed-message.ts`.
- **Estado no V2:** PARCIAL (tabela `webhook_failures` com ACL testada em `scripts/db-audit/check-webhook-failures-acl.sql`; sem reprocessamento nem auditoria).
- **Ação:** estender `webhook_failures` com `attempts`, `next_retry_at`, `last_error`, `status` (`pending|retrying|abandoned|done`); RPCs `rpc_dlq_*` com guard de role (`auth.role()`, padrão da migration `20260828000000_guard_secdef_batch`); edge `reprocess-failed-messages` que reexecuta o handler correspondente de `_shared/evolution-webhook-handlers.ts`; cron `pg_cron` 15 min. Atualizar `check-webhook-failures-acl.sql`.
- **Aceite:** falha injetada é reprocessada com sucesso; `abandon` registra em `dlq_audit_log`; ACL guard continua verde.

#### 022 — Página admin de mensagens falhas (DLQ)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `src/pages/AdminFailedMessagesPage.tsx`, `src/pages/failed-messages/*`, `features/admin/components/{FailedMessageKpiCard,FailedMessageTableRow,FailedMessageStatusBadge,BulkReprocessGuidedDialog}.tsx`, specs `admin-failed-messages-filters*.spec.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** nova view `failed-messages` no `VIEW_MAP` do `ViewRouter` (lazy em `lazyViews.ts`); KPIs, filtros por status/instância/motivo, retry individual e em lote guiado; consome as RPCs da etapa 021.
- **Aceite:** admin reprocessa e abandona pela UI; spec E2E de filtros portada.

#### 023 — Backoff determinístico compartilhado (`dlq-backoff.ts`)
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3/V1 `_shared/dlq-backoff.ts` (backoff exponencial com jitter opcional + idempotency key derivada de `(instance, path, payload)`), `_shared/retry-with-backoff.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** portar para `_shared/`; usar em `reprocess-failed-messages` (021), `evolution-send.ts` e `gmail-sync`; testes Deno (015).
- **Aceite:** sequência de retries reproduzível em teste; idempotency key estável para mesmo payload.

#### 024 — Idempotência de envio server-side
- **Prioridade:** P0 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 `_shared/send-idempotency.ts`, tabela `evolution_send_idempotency`, `src/lib/sendIdempotency.ts` (chave estável por mensagem), `src/lib/idempotency.ts`, `useAgentRecentSends` (join com a tabela).
- **Estado no V2:** PARCIAL (`ux_messages_dedup` no banco evita duplicata persistida; nada impede duplo envio à Evolution GO).
- **Ação:** tabela `send_idempotency (key pk, message_id, instance, created_at, response jsonb)` com TTL 24 h via cron; `evolution-api`/`evolution-send.ts` aceita header `Idempotency-Key` e devolve resposta cacheada; cliente gera a chave em `chat.service.ts`.
- **Aceite:** dois cliques no botão enviar = 1 mensagem no WhatsApp e 1 linha em `messages`.

#### 025 — Fila offline (IndexedDB) + reconciliação ao reconectar
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `src/lib/offlineQueue.ts` + `offlineQueue-listener.test.ts`; V1 `hooks/useOfflineQueue.ts`, `hooks/useMessageQueue.ts`.
- **Estado no V2:** AUSENTE (`useOfflineCache` só lê cache; `useNetworkStatus` existe e pode alimentar a fila).
- **Ação:** fila em IndexedDB com a chave da etapa 024; drenagem ao `online` respeitando ordem e `useSendThrottle` (026); indicador "N mensagens pendentes" no `ChatPanel`.
- **Aceite:** enviar 3 mensagens offline → ao reconectar chegam na ordem, sem duplicar.

#### 026 — Throttle de envio e dedupe entre abas
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `features/inbox/hooks/useSendThrottle.ts` (500 ms mínimo, burst 5/3 s), `src/lib/crossTabSendDedupe.ts`, `crossTabDedupe{Cache,Lock,Transport,Types}.ts`, `dedupeMetrics.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** portar libs; aplicar no `useChatInputLogic.ts`; métricas de dedupe expostas no `AdminTelemetriaPage`.
- **Aceite:** mesma ação em 2 abas dispara 1 request; burst de 10 envios é espaçado.

#### 027 — Circuit breaker por instância Evolution
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `src/lib/evolutionCircuitBreaker.ts` (+ teste), `evolutionSendRetry.ts`, `retryConfig.ts`, `retryAlerts.ts`, `features/admin/components/RetryConfigPanel.tsx` + `RetryConfigBackoffTable.tsx`, hook `useInstanceRetryConfig`.
- **Estado no V2:** PARCIAL (`src/lib/retry.ts` genérico, sem estado por instância).
- **Ação:** breaker com estados closed/open/half-open por `instanceName`; abrir após N falhas transitórias; UI de configuração no `SettingsView` (aba Mensagens); toast único de instabilidade (`instabilityToastDedupe.ts` do V1).
- **Aceite:** com Evolution GO fora, o front para de martelar em < 5 s e retoma sozinho quando volta.

#### 028 — Pausa de processamento por instância
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `instance-pause-control` (actions `list|pause|resume`), `_shared/instance-pause.ts` (`isInstancePaused`), tabela `instance_processing_pauses`, `AdminInstancePausesPage`, `features/admin/components/instance-pauses/*`.
- **Estado no V2:** AUSENTE.
- **Ação:** tabela + edge + verificação no início de `evolution-webhook`/`whatsapp-webhook` (evento entra na DLQ com motivo `paused` em vez de processar); view admin.
- **Aceite:** pausar `PRINCIPAL` faz webhooks irem à DLQ; `resume` + reprocessamento (021) recupera tudo.

#### 029 — Métricas de retry e tentativas por mensagem
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `evolution-retry-metrics` (admin-only: top ações/motivos), `_shared/log-retry-metric.ts`, `log-idempotency-miss.ts`, tabelas `evolution_retry_metrics`, `message_attempts`; hooks `useMessageAttempts`, `useFailureMetricsBatch`, `useMessageSendHistory`, `useFailureReason`, `src/lib/failureRootCause.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** tabela `message_attempts (message_id, attempt_no, status, error_code, provider_response, created_at)` gravada por `evolution-send.ts`; agregação em `retry_metrics` por dia/instância; hook em lote para o chat (etapa 061).
- **Aceite:** cada envio gera ≥ 1 tentativa registrada; edge de métricas responde em < 500 ms.

#### 030 — Concorrência otimista e coalescência de requests
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `src/lib/optimisticConcurrency.ts` (detecção de conflito em updates), `src/lib/requestDeduplicator.ts` (coalescing), `queryStaleTimes.ts` (TTL centralizado).
- **Estado no V2:** AUSENTE (V2 tem `entity_versions` no banco sem uso no front para conflito).
- **Ação:** usar `entity_versions`/`updated_at` como token de versão em `contact.service.ts` e `queue.service.ts`; deduplicar `GET`s idênticos em voo; centralizar `staleTime` dos hooks globais (`useGlobalSettings`, `useUserRole`, `usePermissions`).
- **Aceite:** edição concorrente do mesmo contato em 2 abas mostra conflito em vez de sobrescrever silenciosamente.

---

### Bloco 4 — Observabilidade (031–040)

#### 031 — Sentry no front + túnel + release tagging
- **Prioridade:** P0 · **Esforço:** M · **Gate:** `[PROD]` `[DECISÃO]` (custo do plano Sentry/GlitchTip)
- **Origem:** V3 `src/lib/sentry.ts` (+ teste), `@sentry/react`, `nginx-prod.conf` `location = /sentry-tunnel`, `Dockerfile` (`VITE_SENTRY_DSN`, `VITE_GIT_SHA`), `infra/stacks/glitchtip.yml`; V1 `docs/decisions/ADR-008-error-tracking-strategy.md`.
- **Estado no V2:** PARCIAL (`vite.config.ts` já gera `sourcemap: 'hidden'` "para o Sentry"; SDK ausente; `components/integrations/SentryIntegrationView.tsx` é só tela). `[≈ Cline 046/073]`
- **Ação:** instalar `@sentry/react`; init em `main.tsx` com `release = __ZAPP_BUILD_ID__` (já definido no `vite.config.ts`), `tunnel: '/api/sentry-tunnel'` via Vercel rewrite (equivalente do nginx do V3); upload de sourcemaps no `ci.yml` job `build`; `ErrorBoundaryWithRetry` reporta com `captureException`. `[DECISÃO]`: Sentry SaaS vs GlitchTip self-hosted na VPS AtomicaBR (V3 usa GlitchTip, stack em `infra/stacks/glitchtip.yml`).
- **Aceite:** erro lançado em produção aparece com stack trace desminificado e release.

#### 032 — Sentry nas Edge Functions + `zapp-sentry-sync`
- **Prioridade:** P1 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3 `_shared/sentry.ts` (SDK Deno), edge `zapp-sentry-sync` (contrato real, desligado por padrão), `db-health-monitor` (reporta ao Sentry).
- **Estado no V2:** AUSENTE.
- **Ação:** helper `_shared/sentry.ts` com `withSentry(handler)`; aplicar nas 6 edges `verify_jwt=false` primeiro (webhooks), depois nas demais; secret `SENTRY_DSN_EDGE` via Management API (armadilha A16).
- **Aceite:** exceção em `evolution-webhook` gera evento com `requestId` (etapa 034).

#### 033 — Web Vitals → edge `client-observability`
- **Prioridade:** P1 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3 `src/lib/webVitals.ts` (gate `VITE_ENABLE_CLIENT_OBSERVABILITY === 'true'`), edge `client-observability` (engole erros, responde 204), `Dockerfile` ARG.
- **Estado no V2:** PARCIAL (`src/lib/web-vitals.ts` calcula rating e loga; `web-vitals` lib não instalada — implementação manual). `[≈ Cline 047]`
- **Ação:** instalar `web-vitals`; substituir a coleta manual; edge que grava em `analytics_events (kind='web_vital', route, value, rating, build_id)` com amostragem 10 %; painel no `PerformanceMonitor` (`components/performance`).
- **Aceite:** LCP/INP/CLS por rota visíveis no painel após 24 h.

#### 034 — Correlation ID ponta a ponta (`withRequestId`)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `src/lib/correlationId.ts`, `withRequestId.ts`, `_shared/contract-kit.ts` (campo `requestId` no envelope), `src/lib/invokeEdge.ts`.
- **Estado no V2:** PARCIAL (`src/lib/logger.ts` gera `correlationId` local; não sai no header). `[≈ Cline 072]`
- **Ação:** header `x-request-id` em todo `functions.invoke` (via wrapper da etapa 043) e nos clientes `externalProxy.ts`/`external-crm.service.ts`; edges ecoam no envelope de erro e no log estruturado; `query_telemetry` ganha coluna `request_id`.
- **Aceite:** um erro no chat pode ser rastreado front → edge → `query_telemetry` pelo mesmo id.

#### 035 — Edges `health`, `status` e `metrics` (Prometheus)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3 edges `health` (DB + Realtime + Edge + Evolution, gatekeeper do Prometheus), `status` (mínimo), `metrics` (text exposition v0.0.4: contadores de webhooks/edges/realtime), `infra/observability/grafana/*`; V1 `proxy-health`, `proxy-metrics` (scrape do `external-db-proxy`).
- **Estado no V2:** PARCIAL (`connection-health-check` cobre só Evolution; `DiagnosticsView` consulta direto).
- **Ação:** `health` consolidada (DB via `SELECT 1`, Realtime via canal de ping, Evolution GO via `/instance/connectionState/PRINCIPAL`); `metrics` lendo `webhook_rate_limits`, `rate_limit_logs`, `query_telemetry` e (após 029) `retry_metrics`; incluir `external-db-proxy` no scrape como no V1. Prometheus/Grafana da VPS AtomicaBR passam a scrapear (fora do escopo deste repo, documentar em `docs/runbooks`).
- **Aceite:** `curl /functions/v1/metrics` devolve texto Prometheus válido; `health` responde 503 quando DB indisponível.

#### 036 — `db-health-monitor` + snapshots de tamanho
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `db-health-monitor`, tabelas `_db_size_snapshots`, `_system_health_history`, `fn_health_score_cache`, cron `disk-baseline-snapshot-daily`, `health-score-anti-drift.yml`.
- **Estado no V2:** PARCIAL (`performance_snapshots` existe e é populada por `AdminTelemetriaPage`; sem score consolidado).
- **Ação:** cron diário que grava `pg_database_size`, bloat top-10 (`db_table_bloat` do MCP já expõe) e conexões em `performance_snapshots.kind='db_health'`; score 0–100 exibido no `SecurityOverview`/`DiagnosticsView`.
- **Aceite:** 7 dias de snapshots; alerta (etapa 084) quando score < 70.

#### 037 — Monitor de Realtime + guard de canais mortos
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `AdminRealtimeMonitorPage` + `pages/admin-realtime-monitor/*`, `useRealtimeMonitor`, `RealtimeFanoutDebug`, `SendStatusBusDebug`, `scripts/check-realtime-dead-channels.sh` + `check-realtime-dead-channels.yml`, `docs/REALTIME-CHANNELS-INVENTORY.md`, `devRealtimeLogger.ts`.
- **Estado no V2:** AUSENTE (V2 tem `useSupabaseRealtime`, `realtime.service.ts`, `useMessageUpdateBatcher`; migration `20260828230000_realtime_replica_identity_full` mostra que o tema é sensível).
- **Ação:** inventário dos canais do V2 (`grep -r "postgres_changes"`) em `docs/REALTIME-CHANNELS-INVENTORY.md`; gate que cruza tabelas assinadas com `pg_publication_tables` do catálogo (`scripts/db-audit/catalog.sql` passa a exportar a publication); view admin `realtime-monitor` com eventos/s por canal e último evento.
- **Aceite:** subscription em tabela fora da publication falha no CI; monitor mostra os canais vivos.

#### 038 — Logs da API Evolution e histórico de alertas
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3/V1 `AdminEvolutionApiLogsPage` (+ `Parts`), `useEvolutionApiLogs`, `AdminAlertHistoryPage`, `src/lib/alertHistory.ts`, `webhookHealthAlerts.ts`, `useWebhookHealthAlerts`, `components/evoApiHealth/*` (`KpiCard`, `Stat`, `tabs`), rota `/admin/evo-api-health`.
- **Estado no V2:** PARCIAL (`connection_health_logs` + `MonitoringHealthLogs.tsx`; `EvolutionMonitoringDashboard` cobre parte).
- **Ação:** ampliar `connection_health_logs` com `latency_ms`, `status_code`, `route` (preenchido pelo `evolution-go-adapter.ts`); aba "API Evolution" no `EvolutionMonitoringDashboard` com KPIs (p95, erro %, por rota GO); tabela `alert_history` alimentada pelas regras de `webhookHealthAlerts` (taxa de 5xx, silêncio de webhook > N min).
- **Aceite:** admin vê latência por rota GO e histórico de alertas dos últimos 30 dias.

#### 039 — Páginas de webhook: overview, eventos, status de secret e self-test HMAC
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3/V1 `AdminWebhookOverviewPage`, `AdminWebhookEventsPage`, `AdminWebhookSecretStatusPage` (+ `pages/admin-webhook-*`), edges `webhook-hmac-selftest`, `webhook-secret-status` (comprimento + prefixo SHA-256, nunca o valor), `recheck-webhook-signature` (recomputa HMAC de um evento e diagnostica), tabela `hmac_selftest_audit`, `useHmacSelfTest`, `webhookEventsDeepLink.ts`, specs `admin-webhook-filters*.spec.ts`.
- **Estado no V2:** PARCIAL (`webhook-diagnostic` edge, `MonitoringWebhookPanel`, `docs/WEBHOOK_SECURITY.md`; `_shared/hmac-validation.ts` existe).
- **Ação:** 3 edges pequenas reutilizando `hmac-validation.ts`; view admin `webhooks` com abas (overview por instância, eventos com deep link `?event=`, status do secret + botão self-test); auditar em `hmac_selftest_audit`.
- **Aceite:** self-test passa em prod; secret ausente aparece como "não configurado" sem vazar valor.

#### 040 — `app_error_logs`, `analytics_events` e insights de busca
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 tabelas `app_error_logs`, `analytics_events`, `search_insights` + `search_history`; `AdminSearchInsightsPage` (+ `pages/admin-search-insights/*`), `useSearchInsights`, `useSearchInsightRows`; `src/lib/structuredErrorLogging.ts`, `consoleErrorFilter.ts`, `silentErrorPrevention.ts`; V1 `globalErrorHandlers.ts`.
- **Estado no V2:** PARCIAL (`useSearchHistory`, `GlobalSearch.tsx`; erros só no console).
- **Ação:** `app_error_logs` recebe `window.onerror`/`unhandledrejection` (amostrado, sem PII, com `build_id`); `analytics_events` recebe navegação do `ViewRouter` (`view_open`) e buscas; view `search-insights` com termos sem resultado.
- **Aceite:** erro não tratado em prod vira linha com stack; top-20 buscas sem resultado visíveis.

---

### Bloco 5 — Contratos de edge e abstração de provedores (041–050)

#### 041 — `contract-kit`: envelope 422 único e `parseOrReject`
- **Prioridade:** P0 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3 `_shared/contract-kit.ts` (formato `{error, code, message, contract, requestId?, details[]}`; códigos `invalid_json`, `contract_violation`, `unsupported_contract_version`, `contract_version_sunset`; regra "schemas de webhook externo são permissivos"), `_shared/contract-schemas*.ts`, `edge-contract-schemas.ts`, `webhook-schemas.ts`, `docs/EDGE_CONTRACT_VALIDATION.md`, `docs/EDGE_FUNCTION_ERROR_HANDLING.md`.
- **Estado no V2:** PARCIAL (`_shared/contracts.ts`, `schemas.ts`, `validation.ts` com Zod; `tests/contracts/error-format.contract.test.ts` já fixa um formato). `[≈ Cline 056]`
- **Ação:** unificar os três helpers em `contract-kit.ts` mantendo o formato que `error-format.contract.test.ts` exige; migrar as 61 edges em lotes de 10 (primeiro as internas; webhooks por último e com `.passthrough()`), registrando cada edge em `CONTRACT_SCHEMAS`.
- **Aceite:** todas as edges respondem 422 no mesmo formato; `test:contracts` e testes Deno (015) verdes.

#### 042 — Versionamento de contrato com sunset
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `_shared/contract-versions.ts` (header `x-contract-version`, `supported[]`, `sunset`, `x-contract-deprecated`, 410 pós-sunset apenas para versão explícita; auto-detecção nunca bloqueia — incidente 2026-07-03), `tests` correspondentes.
- **Estado no V2:** PARCIAL (`tests/contracts/webhooks-versioning.contract.test.ts` sugere intenção). `[≈ Cline 094]`
- **Ação:** portar a lógica; declarar v1 para todas; usar v2 no primeiro contrato que mudar (candidato: `evolution-api` action envelope).
- **Aceite:** teste de sunset expirado retorna 410 só com header explícito.

#### 043 — `invokeEdge` + `runtimeGuards` no front
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `src/lib/invokeEdge.ts` (wrapper único de `supabase.functions.invoke`, entende o envelope, propaga `requestId`), `runtimeGuards.ts` (narrowing de `unknown`), `queryErrors.ts`, `rlsError.ts`, `abortError.ts`, `queryTimeout.ts`; gates `scripts/check-invoke-migration.mjs` (etapa 88 do plano V3) e `check-error-shapes.mjs` (etapa 90).
- **Estado no V2:** AUSENTE (chamadas diretas a `supabase.functions.invoke` espalhadas; `evolution.service.ts` tem parte da lógica).
- **Ação:** criar wrapper; migrar chamadas por domínio (`services/*` primeiro, depois hooks); gate CI que proíbe `functions.invoke(` fora de `src/lib/invokeEdge.ts` (allowlist datada para o legado).
- **Aceite:** 0 chamadas diretas fora da allowlist; erros de edge chegam tipados nos hooks.

#### 044 — Gates de paridade front ↔ edge
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `scripts/check-edge-function-sync.sh` (toda edge invocada existe; toda edge tem chamador), `check-fe-be-sync.sh`, `check-contract-sync.mjs` (validadores espelhados), `audit-contract.mjs` (RPC/.from/invoke vs banco), `edge-schema-parity.yml`, `edge-parse-gate.yml` (toda edge parseia com `deno check`).
- **Estado no V2:** PARCIAL (`supabase-usage-guard.mjs` cobre `.from/.rpc` vs catálogo; `edge-deploy/generate-manifest.mjs --check` cobre manifesto).
- **Ação:** estender o usage-guard para `functions.invoke('x')` vs diretórios em `supabase/functions` (e vice-versa, usando `ESTADO.md` da etapa 009 como allowlist de edges sem chamador); `deno check` de todas as edges no `ci.yml`.
- **Aceite:** invocar edge inexistente falha no CI; edge órfã nova sem entrada no `ESTADO.md` falha.

#### 045 — `edge-env-completeness` + `edge-auth-smoke`
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `edge-env-completeness.yml` (toda `Deno.env.get('X')` tem X declarado em `docs/SECRETS_INVENTORY.md`/secrets do projeto), `edge-auth-smoke.yml` (edge `verify_jwt=true` responde 401 sem token), `scripts/check-deploy-secrets.mjs`.
- **Estado no V2:** PARCIAL (`deploy-functions.yml` faz smoke positivo/negativo; `docs/security/secret-surface-inventory.md` existe).
- **Ação:** script que extrai `Deno.env.get` de todas as edges e compara com `secret-surface-inventory.md`; smoke de 401 em PR (contra prod, só GET/OPTIONS, sem side effects) para as edges `verify_jwt=true`.
- **Aceite:** secret novo sem inventário falha o PR; edge que passou a aceitar anônimo por engano é pega.

#### 046 — Registry de provedores (`evolution` | `cloud` | `fake`)
- **Prioridade:** P1 · **Esforço:** L · **Gate:** —
- **Origem:** V3 `_shared/providers/registry.ts` (`PROVIDER_UNDER_TEST` só com `DENO_ENV=test`, fail-closed), `providers/evolution/{client,contract.zod,index}.ts` (12 verbos, 0 bypasses), `providers/fake/index.ts`, `providers/cloud/*`, `scripts/decouple/verb-contract-gate.mjs` (só o conceito de contrato de verbos), `docs/BOUNDARY-evolution.md`.
- **Estado no V2:** AUSENTE (`_shared/evolution-go-adapter.ts` + `evolution-go-routes.ts` + `evolution-api-proxy.ts` chamam direto).
- **Ação:** definir interface `WhatsAppProvider` com os verbos hoje usados (levantar em `evolution-go-routes.ts`); `evolution` = adapter GO atual; `fake` = memória (para 013/019); gate que impede `fetch(EVOLUTION` fora de `providers/evolution`.
- **Aceite:** todas as edges de envio passam pelo registry; `DENO_ENV=test PROVIDER_UNDER_TEST=fake` roda a suíte sem rede.

#### 047 — Provider `fake` nos testes E2E e de contrato
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `e2e/decouple-fake-provider.spec.ts`, `providers/fake/index.ts` (`assertTestEnv`).
- **Estado no V2:** AUSENTE (depende de 046).
- **Ação:** suíte E2E (012) usa `fake` por padrão; instância real só no nightly (018).
- **Aceite:** PR não toca Evolution GO; nightly valida contra instância `E2E` (013).

#### 048 — WhatsApp Cloud API (Meta) como segundo provedor
- **Prioridade:** P2 · **Esforço:** L · **Gate:** `[PROD]` `[DECISÃO]` (conta Meta Business, número, custo por conversa)
- **Origem:** V3/V1 edges `whatsapp-cloud-api` (espelha a superfície de `evolution-api`), `whatsapp-cloud-send`, `whatsapp-cloud-webhook` (handshake `hub.*`, `X-Hub-Signature-256`), `whatsapp-cloud-webhook-verify`, `whatsapp-cloud-secrets-status`, `_shared/whatsapp-cloud-normalizer.ts`, `providers/cloud/{client,media,templates}.ts`, tabelas `whatsapp_official_credentials`, `whatsapp_cloud_webhook_pings`, hook `useWhatsAppMode`/rota `/admin/whatsapp-mode`, `docs/RUNBOOK_WA_BUSINESS_ACTIVATION.md`.
- **Estado no V2:** AUSENTE.
- **Ação:** só após 046; implementar `providers/cloud`; webhook Meta com verificação de assinatura; seletor de modo por conexão (`whatsapp_connections.provider`).
- **Aceite:** conexão em modo oficial envia/recebe texto e mídia; modo GO continua intacto.

#### 049 — `connection-test`, `provider-healthcheck` e switchover
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3/V1 edges `connection-test` (testa credenciais por modo), `provider-healthcheck` (pinga provedores, atualiza `provider_configs.status`, dispara switchover em `channel_provider_routes`), `provider-router`, tabelas `provider_configs`, `channel_provider_routes`, `provider_session_logs`, hook `useProviderPanel`, rota `/admin/providers`.
- **Estado no V2:** PARCIAL (`connection-health-check`, `channel_routing_rules`, `useChannelRoutingRules` no V3 tem equivalente).
- **Ação:** depende de 046/048; `provider_configs` + cron 1 min; botão "testar conexão" no `ConnectionsView`.
- **Aceite:** provedor offline muda rota automaticamente e volta quando saudável.

#### 050 — Porta de entrada canônica e tipos de evento
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `_shared/ingest-port.ts`, `evolution-event-types.{ts,json}`, `evolution-response-normalizers.ts`, `evolution-profile-fallback.ts`, `evolution-fallback-telemetry.ts`, `domain/messaging.ts` + `src/domain/messaging/types.ts`, `src/shared/webhookEventSchemas.ts`, `criticalPayloadSchemas.ts`.
- **Estado no V2:** PARCIAL (`_shared/evolution-webhook-handlers.ts`, `evolution-webhook-msg-handlers.ts`, `evolution-webhook-messages.ts` fazem o roteamento por evento sem tipos compartilhados com o front).
- **Ação:** extrair enum de eventos GO ↔ v2 (já mapeados em `evolution-go-routes.ts`) para `evolution-event-types.json` consumido por edge e front; `ingest-port.ts` como única função que valida, deduplica (`ux_messages_dedup`) e despacha; `src/domain/messaging/types.ts` compartilhado.
- **Aceite:** evento desconhecido cai em DLQ (021) com motivo `unknown_event`, nunca 500.

---

### Bloco 6 — Segurança e autenticação (051–060)

#### 051 — Convite de usuário com token TTL (`invite-user`)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `invite-user@v1` (etapa 57 do plano V3), RPC `zapp.invite_user`, tabelas `invites`, `department_invitations`, `features/admin/components/InviteUserDialog.tsx`.
- **Estado no V2:** AUSENTE (`create-user` cria conta diretamente; `AdminUsersTable`).
- **Ação:** tabela `user_invites (token, email, role, department, expires_at, accepted_at, invited_by)`; edge que gera link e envia por `send-email`; aceite via `/auth?invite=`; `create-user` passa a exigir convite ou role admin.
- **Aceite:** convite expira em 72 h; aceitar cria perfil com a role prevista.

#### 052 — Revogação de sessão e diálogo de sessões por usuário
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3 edge `revoke-session@v1` (etapa 56), `AdminUserSessionsDialog.tsx`, `ForceLogoutButton.tsx` (V2 já tem), RPC `auth_list_sessions` do MCP.
- **Estado no V2:** PARCIAL (`user_sessions` tabela, `ForceLogoutButton` global, `useReauthentication`).
- **Ação:** edge admin que revoga sessão específica via Auth Admin API (`auth.admin.signOut(jti)`); diálogo por usuário na `AdminUsersTable` com dispositivo (`user_devices`), IP e última atividade.
- **Aceite:** revogar sessão derruba só aquele dispositivo em < 60 s.

#### 053 — Gate de login server-side (`login-attempts` + `security-gate`)
- **Prioridade:** P0 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `login-attempts` (`verify_jwt=false`, RPC atômica `fn_login_attempt_record_failed`), `_shared/security-gate.ts` (SEGURANCA-04/05: `blocked_ips`, `ip_whitelist`, geo-blocking no pré-voo), `src/lib/loginAttempts.ts` (V2 já tem versão front).
- **Estado no V2:** PARCIAL (`login_attempts`, `blocked_ips`, `ip_whitelist`, `geo_blocking_settings`, `clear_login_attempts` com guard; enforcement só no front, contornável).
- **Ação:** edge chamada antes de `signInWithPassword` (`check`) e depois de falha (`record_failed`); rate limit por IP+email usando `webhook_rate_limits`/`_shared/rate-limiter.ts` (056); bloqueio devolve 429 genérico.
- **Aceite:** IP bloqueado não consegue autenticar mesmo chamando a API direto.

#### 054 — Permissões por rota/view (`route_permissions`)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3/V1 tabela `route_permissions`, hook `useRoutePermissions`, rota `/admin/route-permissions`, `components/routing/{AppRoutes,AdminRoutes,DebugRoutes}.tsx`, página `AccessDenied`.
- **Estado no V2:** PARCIAL (`permissions`, `role_permissions`, `usePermissions`, `VisibilityGrantsManager`; `ViewRouter` não checa permissão por view).
- **Ação:** tabela `view_permissions (view_id, role, allowed)` seedada a partir do `VIEW_MAP`; `ViewRouter` consulta antes de renderizar e mostra `AccessDenied`; UI admin para editar; RLS: só admin escreve.
- **Aceite:** agente sem permissão em `security` recebe tela de acesso negado; admin edita sem deploy.

#### 055 — Logs de segurança e alertas de ACL
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 tabelas `security_audit_logs`, `security_events`, `security_acl_alerts`, `rls_denied_log`; hooks `useSecurityAuditLogs`, `useACLAlerts`, `useUserSecurityAlerts`; rotas `/admin/security-logs`, `/admin/acl-alerts`.
- **Estado no V2:** PARCIAL (`audit_logs`, `security_alerts`, `AuditLogDashboard`, `SecurityNotificationsPanel`).
- **Ação:** trigger genérico que grava em `security_audit_logs` mudanças em `user_roles`, `role_permissions`, `blocked_ips`, `ip_whitelist`, `view_permissions`; alerta quando `service_role` é usado fora das edges conhecidas (cruzar `scripts/db-audit/check-mcp-exec-acl.sql`).
- **Aceite:** alteração de role gera linha com `performed_by`; painel lista alertas ACL abertos.

#### 056 — Rate limiter compartilhado das edges (estado no banco)
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `_shared/rate-limiter.ts` (por instância e por evento, estado em tabela), `src/lib/clientRateLimiter.ts`, tabela `rpc_rate_limits`, `evolution_contact_rate_limits`.
- **Estado no V2:** PARCIAL (`webhook_rate_limits`, `rate_limit_configs`, `rate_limit_logs`, `cleanup-rate-limit-logs`, `send-rate-limit-alert`; lógica duplicada por edge). `[≈ Cline 055]`
- **Ação:** helper único `_shared/rate-limiter.ts` sobre `rate_limit_configs` + `rate_limit_logs`; aplicar em `public-api`, `ai-proxy`, `gmail-*`, `evolution-api`; `clientRateLimiter.ts` para ações sensíveis no front.
- **Aceite:** limites configuráveis em `RateLimitConfigPanel` valem para todas as edges.

#### 057 — Scanner de arquivos (VirusTotal) e upload seguro
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]` `[DECISÃO]` (chave VirusTotal: free tier 4 req/min)
- **Origem:** V3/V1 edges `file-security-scanner`, `secure-upload` (middleware: valida via VirusTotal quando configurado e persiste), `virustotal-test`, tabela `file_scan_logs`, `src/lib/scanResponse.ts`, `useScanResponseHandler`.
- **Estado no V2:** PARCIAL (bucket `quarantine`, `quarantineStore.ts`, `QuarantinePanel`, `QuarantineMonitorProvider` — quarentena manual sem scan).
- **Ação:** `secure-upload` recebe arquivo, grava em `quarantine`, scan assíncrono, move para bucket final ou mantém em quarentena com `file_scan_logs`; `FileUploader.tsx` passa a usar a edge; sem chave → modo "somente magic bytes + extensão" (`whatsappFileTypes.ts`).
- **Aceite:** EICAR enviado fica em quarentena; PDF limpo chega ao chat.

#### 058 — Jobs agendados LGPD + solicitações de exclusão + consentimento
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `lgpd-scheduled-jobs@v1` (purge de activity logs > 90 d, anonimização de contatos soft-deleted > 30 d), tabelas `data_deletion_requests`, `consent_records`, `lgpd_consent_audit`, `pii_access_log`; RPCs `grant_lgpd_consent`/`revoke_lgpd_consent`; `useLGPDAuditLogs`; V1 `useLGPDWebhookSync` (opt-out WhatsApp ↔ CRM).
- **Estado no V2:** PARCIAL (`LGPDComplianceView` exporta/exclui sob demanda; `docs/LGPD-RETENTION-POLICY.md` descreve retenção sem job). `[≈ Cline 069]`
- **Ação:** tabelas + edge cron diária implementando a política do doc; fila de solicitações com prazo de 15 dias e trilha; opt-out por palavra-chave (`SAIR`) no webhook grava consentimento e sincroniza com CRM externo via `external-crm.service.ts`.
- **Aceite:** solicitação de exclusão completa em ≤ 15 dias com log; retenção automática verificável no `db_count`.

#### 059 — `request-password-reset` pública + hook de e-mail de auth
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3 edge `request-password-reset` (pública, rate-limited), `useForgotPassword`; V1 edge `auth-email-hook` (Send Email Hook do GoTrue → template próprio via Resend).
- **Estado no V2:** PARCIAL (`ForgotPassword.tsx` chama Supabase direto; `approve-password-reset` + `password_reset_requests` cobrem fluxo com aprovação).
- **Ação:** edge única que aplica rate limit (056), registra em `password_reset_requests` e dispara e-mail com template do V2 (`send-email`); opcional: `auth-email-hook` para padronizar todos os e-mails do GoTrue. `[VERIFICAR AO VIVO]` se o projeto Cloud tem Send Email Hook habilitado.
- **Aceite:** 5 pedidos/min do mesmo IP → 429; e-mail sai com identidade visual do ZAPP.

#### 060 — CSP, utilitários de segurança e handlers globais de erro
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V1 `src/lib/csp.ts`, `security.ts`, `globalErrorHandlers.ts`; V3 `nginx-prod.conf` (CSP completa com `connect-src` para Supabase/Evolution/Sentry/Mapbox), `docs/csp.md`.
- **Estado no V2:** AUSENTE (`vercel.json` só tem rewrite). `[≈ Cline 060]`
- **Ação:** `vercel.json.headers` com HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e CSP em modo `Report-Only` primeiro (report para `app_error_logs`, etapa 040), depois enforce; `globalErrorHandlers.ts` registra `unhandledrejection`.
- **Aceite:** headers presentes em `curl -I` da produção; 0 violações CSP após 7 dias em report-only.

---

### Bloco 7 — Inbox e chat (061–070)

#### 061 — Linha do tempo de envio por mensagem
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `features/inbox/components/chat/{MessageAttemptsTimeline,MessageSendHistorySheet,MessageStatusTimeline,MessageStatusPanel,MessageStatusTimestamps,MessageStatusInline,MessageReadStatus,MessageDetailsDialog}.tsx`, `messageStatusLanguage.ts`, hooks `useMessageSendHistory`, `useMessageDetails`, `useMessageStatus`.
- **Estado no V2:** PARCIAL (`MessageStatus.tsx` mostra só o último estado).
- **Ação:** depende de 029; sheet "Histórico de envio" no `MessageContextMenu` com tentativas, motivo raiz (`failureRootCause.ts`) e botão "tentar agora" (021).
- **Aceite:** mensagem com 3 tentativas exibe as 3 com timestamps e erro do provedor.

#### 062 — Barra de falhas, banner de erro e progresso de fila no chat
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `FailureFilterBar.tsx`, `MessageStatusFilterBar.tsx`, `SendErrorBanner.tsx`, `ChatQueueProgress.tsx`, `ChatSendProgress.tsx`, `ChatInputQueueDisplay.tsx`, `ConversationDeliverySummary.tsx`, `useRetryFailedMessage`, `useFailureMetricsBatch`, `useMessageQueue`; specs `retry-counter-inline.spec.ts`, `evolution-retry-failure.spec.ts`.
- **Estado no V2:** AUSENTE.
- **Ação:** depende de 025/029; filtro "só falhas" na conversa; banner persistente quando a instância está em breaker aberto (027) ou pausada (028); resumo de entrega no cabeçalho.
- **Aceite:** com Evolution GO fora, o agente vê o estado e as mensagens enfileiradas, sem toasts repetidos.

#### 063 — Presets, persistência e sincronização de filtros da inbox
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `features/inbox/hooks/{inboxFilterPresets,inboxFilterPersistence,inboxPresetsSync,inboxFilterPipeline,inboxSourceConfig}.ts`, `useInboxStatusPref`, `useInboxSource`, `InboxScopeConfig.tsx` + `inbox_custom_scopes`; spec `inbox-scope.spec.ts`.
- **Estado no V2:** PARCIAL (`useInboxFilters`, `InboxFilters.tsx`, tabela `saved_filters`, `useUrlFilters`).
- **Ação:** presets nomeados por usuário em `saved_filters` (já existe) + presets de workspace definidos pelo admin (`InboxScopeConfig`); persistência em `user_settings`; sincronização entre abas via BroadcastChannel (026).
- **Aceite:** preset criado numa aba aparece na outra sem reload; escopo do admin restringe agente.

#### 064 — Deep links `?contact=` / `?message=`
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `useInboxDeepLinks.ts`, `src/lib/openContactInChat.ts`, `webhookEventsDeepLink.ts`; V1 idem.
- **Estado no V2:** PARCIAL (`chat-popup/:contactId` existe; `navigation.service.ts`; nada para a inbox principal).
- **Ação:** `ViewRouter` lê `?view=inbox&contact=<id>&message=<id>` e abre/rola; `openContactInChat()` usado por `CRM360ExplorerView`, notificações (`useRealtimeNotifications`) e futuras páginas admin (022/039).
- **Aceite:** link colado no WhatsApp interno abre a conversa e destaca a mensagem.

#### 065 — Presença de agentes (heartbeat) e tabela de operações
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 `useInboxHeartbeat.ts` (`online_status` + `last_seen` em `profiles`, throttle 4 min, reage a visibilidade/rede), `features/inbox/components/agents-ops/{AgentOpsTable,AgentRecentSendsPopover,AgentsConnectionsHeader}.tsx`, `useAgentPendingCounts`, `useAgentRecentSends`, `QueueMetricsDashboard.tsx`; V1 `useAgentPresence.ts` (online/busy/away), tabela `agent_presence`.
- **Estado no V2:** PARCIAL (o bug documentado no `HANDOFF_2026-08-29`: `reassign_absent_agents` referencia `profiles.last_seen_at` inexistente — esta etapa resolve a causa raiz).
- **Ação:** adicionar `profiles.last_seen_at` + `online_status` (migration com fechamento triplo); heartbeat no shell (`AppProviders`); tabela de ops no `AgentsView` com pendências, últimos envios e conexão; corrigir `reassign_absent_agents` para usar a coluna nova.
- **Aceite:** `reassign_absent_agents` executa sem erro; supervisor vê quem está online e sobrecarregado.

#### 066 — Atalhos com posse única e `react-hotkeys-hook`
- **Prioridade:** P3 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `useInboxShortcuts.ts` (Mod+E com dono único), `useKeyboardManagement`, `react-hotkeys-hook`; spec `chatpanel-archive-shortcut-single-fire.spec.ts`.
- **Estado no V2:** PARCIAL (`hooks/shortcuts`, `KeyboardShortcutsSettings`, `KeyboardShortcutsHelp`, listeners manuais).
- **Ação:** migrar para `react-hotkeys-hook` com escopos (`inbox`, `chat`, `global`); garantir disparo único quando sidebar e painel estão montados.
- **Aceite:** spec de disparo único portada e verde.

#### 067 — Pins, favoritos, encaminhadas e denúncias com persistência
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 tabelas `conversation_pins`, `pinned_messages`, `favorite_messages`, `forwarded_messages`, `message_reports`; hooks `usePinMessage`, `useFavoriteMessage`, `useReportMessage`; `MessageHoverToolbar.tsx`.
- **Estado no V2:** PARCIAL (`pinned_conversations`; `ForwardMessageDialog.tsx` encaminha sem registrar origem; sem favoritos/denúncia).
- **Ação:** 3 tabelas (`favorite_messages`, `forwarded_messages`, `message_reports`) com RLS por usuário; ações no `MessageContextMenu`; painel de denúncias no `SecurityView`.
- **Aceite:** encaminhada mostra "encaminhada de"; favoritos filtráveis; denúncia notifica admin (084).

#### 068 — Scroller v2 e cursor de mensagens
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `ChatScrollerV2.tsx` (`use-stick-to-bottom`), `scrollLoaderController.ts`, `loadOlderMetrics.ts`, `useVirtualRows`, `useMessagesCursor`, `useChatAutoScroll`; `chatOptimizations.ts`.
- **Estado no V2:** PARCIAL (`VirtualizedMessageList`, `VirtualMessageBubble`, `useInfiniteScroll` — sem "stick to bottom" nativo; `NewMessageIndicator` cobre parte).
- **Ação:** medir primeiro (etapa 094 fornece o budget); trocar só se INP/jank do chat estiver acima do budget; paginação por cursor (`created_at,id`) no `chat.service.ts`.
- **Aceite:** carregar 500 mensagens antigas sem salto de scroll; INP do chat dentro do budget.

#### 069 — Pipeline de stickers do V1
- **Prioridade:** P3 · **Esforço:** M · **Gate:** —
- **Origem:** V1 `src/lib/{stickerConverter,stickerValidator,stickerCategories,stickers}.ts`, `hooks/useStickerPipeline.ts` (validação → conversão WebP → upload → cache), `useStickerPagination.ts`, tabela `sticker_categories`, `sticker_favorites`; spec V3 `stickers.spec.ts`.
- **Estado no V2:** PARCIAL (`StickerPicker.tsx`, `classify-sticker` edge, tabela `stickers`, `hooks/sticker-picker`).
- **Ação:** conversão WebP client-side (evita rejeição da Evolution GO), categorias e favoritos; manter `classify-sticker` para tag automática.
- **Aceite:** PNG arrastado vira sticker válido enviado pela GO; favoritos persistem.

#### 070 — Monitoramento de conversa, sugestões de automação e mensagens interativas seguras
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `ChatMonitoringDialog.tsx`, `AutomationSuggestionsBar.tsx` + edge `automation-suggest-reply` (KB + tag recommender), `useSafeInteractiveMessage`, `MessageBubbleUnsupported.tsx`, `TicketActionsBar.tsx` + `ticketStore.ts`; V1 `useBackgroundClassifier`.
- **Estado no V2:** PARCIAL (`AISuggestions.tsx`, `NextBestActionEngine.tsx`, `InteractiveMessage.tsx`, `TicketTabs.tsx`, `KnowledgeBaseSearchPanel.tsx`).
- **Ação:** ligar `AISuggestions` à base de conhecimento existente (`knowledge_base_articles`) via edge dedicada; render seguro de tipos interativos desconhecidos; barra de ações de ticket (resolver/transferir/snooze) fixa no cabeçalho.
- **Aceite:** tipo de mensagem não suportado mostra placeholder em vez de quebrar; sugestão cita artigo da KB.

---

### Bloco 8 — Contatos, CRM, automações e filas (071–080)

#### 071 — Importação de contatos em massa (`contacts-import`)
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3/V1 edge `contacts-import` v1.1 (CSV 50k, normalização de telefone, upsert por `remote_jid`), `src/lib/csvUtils.ts`, `phoneUtils.ts`, `normalize.ts`, `ImportModal`, tabela `contact_export_log`.
- **Estado no V2:** PARCIAL (`useImportData` processa no navegador; `phoneNormalization.test.ts` existe).
- **Ação:** edge com streaming de CSV, relatório de linhas rejeitadas, dedupe contra `contact_identity_map` (migration 100001 do V2); UI com preview e mapeamento de colunas.
- **Aceite:** 20k linhas importadas em < 60 s com relatório de erros por linha.

#### 072 — Galeria de mídia por contato e avatar automático para o CRM
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3/V1 edge `contact-media` (paginada por tipo), `contact-media-gallery.spec.ts`, edge `fetch-whatsapp-avatar` + `useContactAvatarFetch` (salva foto no CRM externo `pgxfvjmuubtbowutlide`).
- **Estado no V2:** PARCIAL (`MediaGallery.tsx` filtra em memória; `batch-fetch-avatars` cron horário — `HANDOFF_2026-08-29` confirma ativo).
- **Ação:** edge paginada usando `storage_object_reference.ts`; ao abrir contato sem avatar, buscar e gravar no CRM via `sync_interaction_from_zapp` (respeitar GATE C do handoff sobre grants `anon`).
- **Aceite:** galeria de contato com 2k mídias abre em < 1 s; avatar aparece no CRM360.

#### 073 — Segmentos de contatos e inteligência
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 tabelas `contact_segments`, `contact_intelligence` (20k linhas em prod V3), `contact_phones`, `contact_assignments`; hooks `useContactSegments`, `useContactData`, `useCompanies`; `src/lib/contactHealth.ts`.
- **Estado no V2:** PARCIAL (`ContactTypeFilter`, `LeadRiskScorePanel`, `client_wallet_rules`, RPC `get_contact_intelligence_by_phone` no CRM externo).
- **Ação:** segmentos dinâmicos (regras JSON avaliadas em RPC) + estáticos; `contact_intelligence` local como cache do CRM externo com TTL; `contactHealth.ts` (última interação, taxa de resposta) alimentando `ClientWalletView`.
- **Aceite:** segmento "sem resposta há 30 dias" atualiza sozinho; campanha Talk X aceita segmento como origem.

#### 074 — CRM plugável (`zapp-crm-sync`)
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `zapp-crm-sync` (roteia por `crm_sync_config`), tabela `crm_sync_config`, `useCRMManagement`; stub `sync_to_crm`.
- **Estado no V2:** PARCIAL (`bitrix-api`, `external-crm.service.ts`, `CRMAutoSync.tsx` — Bitrix e CRM `pgxfvjmuubtbowutlide` fixos no código).
- **Ação:** `crm_sync_config (provider, enabled, mapping jsonb)`; provedores `bitrix`, `gestao_clientes`, `none`; `CRMAutoSync` lê a config; sem alterar o comportamento atual até a config existir.
- **Aceite:** desligar Bitrix por config sem deploy; mapping de campos editável.

#### 075 — Automações com execuções, logs e alerta de falha
- **Prioridade:** P1 · **Esforço:** L · **Gate:** `[DB]`
- **Origem:** V3/V1 tabelas `automation_rules`, `automation_executions`, `evolution_automation_logs`, `evolution_keyword_automations`; rotas `/admin/automations`, `/admin/automations/logs`; hooks `useAdminAutomations`, `useAutomationLogs`, `useAutomationManagement`, `useAutomations` (V1); `components/system/AutomationFailureAlertsMount.tsx`; spec `admin-automations.spec.ts`; `docs` TODO AUTOMACOES-12.
- **Estado no V2:** PARCIAL (`automations` tabela + `AutomationsManager` + `AutomationSettings`; sem histórico de execução).
- **Ação:** `automation_executions (rule_id, trigger_payload, status, error, started_at, finished_at)`; executor único (edge `automation-runner` chamada pelo webhook e por cron) com idempotência (024); logs na view `automations`; alerta global no shell quando taxa de falha > 20 % em 1 h.
- **Aceite:** toda execução tem linha; falha aparece no shell do admin.

#### 076 — Follow-up bridge e pendências
- **Prioridade:** P2 · **Esforço:** S · **Gate:** —
- **Origem:** V3 edge `followup-bridge` v2 (regra → follow-up quando `trigger_event` dispara), tabelas `evolution_followup_rules`, `evolution_followups`, hooks `useFollowupBridge`, `useFollowupPending`, `useFollowUpSequences`.
- **Estado no V2:** PARCIAL (`followup_sequences`, `followup_steps`, `followup_executions`, `FollowUpSequences.tsx`, `FollowUpExecutionsHistory.tsx`, `RemindersPanel`).
- **Ação:** eventos de gatilho padronizados (`conversation_closed`, `no_reply_24h`, `tag_added`) emitidos pelo executor da 075; painel "pendentes hoje" na inbox.
- **Aceite:** fechar conversa com tag X agenda follow-up sem intervenção.

#### 077 — Roteador de tickets sticky + round-robin + skills
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `ticket-router` (resolve agente por sticky + round-robin com skills; persiste `assigned_to` + `queue_id`), tabelas `sticky_assignments`, `queue_routing_rules`, `channel_queues`; `features/queues/components/QueueRoutingRules.tsx`, `useQueueRoutingRules`, `useSkillBasedRouting`.
- **Estado no V2:** PARCIAL (`skill_based_assign` SQL com guard, `queue_skill_requirements`, `SkillBasedRoutingSettings`, `auto_assign_to_queue_agent` corrigido no PR #116, `queue_positions`).
- **Ação:** sticky por contato (`sticky_assignments` com TTL); regras por fila (peso, prioridade SLA, horário via `business_hours`); UI de regras; manter `skill_based_assign` como estratégia dentro do roteador.
- **Aceite:** cliente recorrente cai com o mesmo agente quando online; fora do horário vai para fila geral (E23).

#### 078 — Rebalanceamento de filas e escalonamento de SLA
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V1 edges `queue-rebalance` (batch: tickets sem agente ou com SLA estourado, respeita `sla_priority`/`routing_weight`, reusa `fn_resolve_agent_for_routing`) e `auto-escalate-sla`; V3 RPC `rpc_queue_rebalance_candidates`, cron `escalate-critical-alerts`, `reassign_absent_agents`.
- **Estado no V2:** PARCIAL (`reassign_overloaded_agents`, `reassign_absent_agents` (quebrado até 065), `docs/SLA-ESCALATION-CRON.md`, `sla_rules`, `conversation_sla`).
- **Ação:** edge `queue-rebalance` com dry-run (retorna candidatos) e apply; cron 5 min; botão manual em `QueuesView`; escalonamento grava em `sla_history` (tabela nova, V3) e notifica (084).
- **Aceite:** ticket com SLA estourado é redistribuído em ≤ 5 min; dry-run não altera nada.

#### 079 — Agendador de cron administrável
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 tabelas `cron_schedules`, `cron_schedule_executions`, `cron_inventory`, `scheduled_job_log`; rota `/admin/automations/cron`, `useCronScheduler`; `scripts/extract_cron_schedules.py` (reescrever em Node).
- **Estado no V2:** AUSENTE (jobs `pg_cron` só visíveis via SQL; `docs/SLA-ESCALATION-CRON.md`).
- **Ação:** view somente-leitura de `cron.job` + `cron.job_run_details` via RPC `SECURITY DEFINER` com guard admin; inventário versionado `docs/CRON_INVENTORY.md` gerado por script; pausar/retomar job (UPDATE `cron.job.active`) com auditoria (055).
- **Aceite:** admin vê próximos disparos e últimas falhas sem acessar o banco.

#### 080 — Dispatcher de CSAT/NPS por cron
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edges `csat-dispatch` v1 (tick 1 min, "X minutos após resolução"), `csat-auto-send` v2, `nps-scheduler` (diário, conversa resolvida ≥ 3 d, sem convite em 30 d), tabelas `csat_responses`, `nps_invitations` (V1).
- **Estado no V2:** PARCIAL (`csat_surveys`, `csat_auto_config`, `CSATAutoConfig.tsx`, `nps_surveys`, `NPSDashboard` — envio depende do front).
- **Ação:** fila `csat_dispatch_queue` populada ao fechar conversa; edge cron que envia via provider (046) e registra; NPS com regra de 30 dias.
- **Aceite:** pesquisa sai X min após fechamento mesmo com agente offline; sem duplicata em 30 dias.

---

### Bloco 9 — E-mail, notificações, dados e mídia (081–090)

#### 081 — Outlook / Microsoft Graph
- **Prioridade:** P2 · **Esforço:** L · **Gate:** `[DB]` `[PROD]` `[DECISÃO]` (app registration no Azure AD da Promo Brindes)
- **Origem:** V1 edge `outlook-oauth`, `hooks/useOutlookEmail.ts`, `docs/OUTLOOK_SETUP.md`; V3 `docs/OUTLOOK_SETUP.md`.
- **Estado no V2:** AUSENTE (só Gmail: `gmail-oauth`, `gmail-sync`, `gmail-send`, `gmail-webhook`).
- **Ação:** reaproveitar a estrutura de `gmail_accounts`/`email_threads` com coluna `provider`; edge OAuth + sync via Graph; UI de conexão no `EmailChatInbox`. Pré-requisito: GATE A do handoff (chave de criptografia de tokens via Vault) resolvido.
- **Aceite:** caixa Outlook lista threads e envia resposta pelo mesmo `EmailChatInbox`.

#### 082 — Tracking de e-mail (pixel + link)
- **Prioridade:** P3 · **Esforço:** S · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3/V1 edges `email-track-pixel`, `email-track-link`, `useEmailTracking`, `useGmailMetrics` (V1), `email_watch_history`.
- **Estado no V2:** AUSENTE.
- **Ação:** duas edges públicas com rate limit (056) e sem PII na URL (token opaco → `email_messages.id`); colunas `opened_at`, `clicked_at`; indicador na thread.
- **Aceite:** abertura registrada uma vez por destinatário; link redireciona em < 100 ms.

#### 083 — Envio e recebimento de e-mail via Resend + IMAP bridge
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DB]` `[PROD]` `[DECISÃO]` (domínio verificado no Resend)
- **Origem:** V3 edges `zapp-email-send` (Resend), `zapp-email-inbound-webhook`, `_shared/resend.ts`; `email-imap-bridge` + `imap_smtp_accounts` + `useImapAccounts` (V3/V1); tabelas `email_templates`, `email_signatures`, `email_health_logs`, `EmailTemplatesManager.tsx`, `useEmailSignature`, `useEmailTemplates`, `useGmailHealth`, `gmail-token-refresh`.
- **Estado no V2:** PARCIAL (`send-email` genérico; `gmail-cron-sync`; sem templates/assinaturas/saúde).
- **Ação:** inbound webhook do Resend cria `email_threads` para domínios próprios sem OAuth; templates e assinaturas por usuário; `gmail-token-refresh` proativo (renova 10 min antes de expirar) + `email_health_logs` com estado por conta (cobre a "coluna watch" citada na TAREFA 1 do handoff).
- **Aceite:** e-mail para `atendimento@` aparece na inbox de e-mail; token Gmail nunca expira em uso; assinatura aplicada no envio.

#### 084 — Dispatcher de notificações com canais configuráveis
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `zapp-notifications-dispatch` (executor DASHBOARD-08: recebe eventos, resolve canais), `evolution-notification-dispatcher` (outbox `evolution_notification_outbox` em batch, ordem por id), tabelas `notification_channels_config`, `notification_delivery_log`, `notification_templates`, `alert_channels`, `alert_dispatch_state`; rota `/admin/notification-channels`, `useNotificationChannels`; edge `sla-alert-forward` (webhook externo: Slack/e-mail/push) + `sla-alert-log-failure`.
- **Estado no V2:** PARCIAL (`notifications`, `useNotifications`, `useRealtimeNotifications`, `send-rate-limit-alert`, `sentiment-alert`, `crisis_room_alerts`, `warroom_alerts` — cada alerta com seu canal fixo; push desligado).
- **Ação:** outbox `notification_outbox` + edge dispatcher (cron 1 min, batch 50, backoff da 023); canais: in-app (`notifications`), WhatsApp interno (Evolution GO), e-mail (083), webhook externo; config por tipo de evento e por role; todos os alertas existentes (`send-rate-limit-alert`, `sentiment-alert`, SLA, DLQ, automações, segurança) passam a enfileirar em vez de enviar direto.
- **Aceite:** um alerta chega por todos os canais configurados com log de entrega; falha de canal não bloqueia os demais.

#### 085 — Auto-export para bucket privado com signed URL
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `zapp-auto-export@v1` (CSV/JSON de tabelas → bucket privado `zapp-exports`, signed URL), tabela `auto_export_jobs`, rota `/admin/auto-export`, `useAutoExportJobs`; bucket `zapp-reports` com policy `reports_storage_admin_all`.
- **Estado no V2:** PARCIAL (`AutoExportManager.tsx` + `scheduled_report_configs` + `send-scheduled-report`; export gerado no cliente por `exportReport.ts`).
- **Ação:** bucket privado `zapp-exports` (50 MB, TTL 7 dias via `cleanup`), edge que gera o arquivo server-side com `db_export` do catálogo e registra em `auto_export_jobs`; `AutoExportManager` lista jobs e baixa por signed URL (1 h). Respeita a regra do V2 de não persistir URLs assinadas (validada no `db-migrate.yml`).
- **Aceite:** relatório de 100k linhas gerado sem travar o navegador; URL expira.

#### 086 — Limpeza de órfãos no Storage e mídia de status
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3/V1 edge `cleanup-storage-orphans` (fix E-45: varre subdiretórios, não só raiz), tabela `storage_cleanup_logs`; edge `download-wa-status-media` (baixa mídia de status antes da URL expirar), bucket `whatsapp-status-media`; `scripts/sql/media-bucket-verification.sql`.
- **Estado no V2:** PARCIAL (`migrate-media-storage`, `recover-corrupted-audios`, `MediaMigrationTool`, `storage_object_reference.ts`; sem limpeza).
- **Ação:** cron semanal em dry-run (lista órfãos: objeto sem referência em `messages`/`email_attachments`/`stickers`/`audio_memes`) → relatório em `storage_cleanup_logs`; apply só com `[AUTORIZAÇÃO LIMPEZA]`; status do WhatsApp: baixar e referenciar antes de expirar.
- **Aceite:** dry-run lista N órfãos com tamanho; nenhum objeto referenciado aparece.

#### 087 — Sincronização de grupos e templates via edges dedicadas
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3 edges `evolution-group-sync` (grupos → `evolution_groups`, `evolution_group_participants`, `evolution_group_rules`), `evolution-templates` (matriz de gates por ação: GET `requireUser`, POST admin), `evolution_message_templates`, `evolution_template_usage`.
- **Estado no V2:** PARCIAL (`whatsapp_groups`, `GroupsView`, `useEvolutionGroups`, `groupsAutoSync.test.ts`; `whatsapp_templates` + `WhatsAppTemplatesManager` via `evolution-api` genérica).
- **Ação:** mover as ações de grupo e template para edges próprias com contrato (041) e gates por ação; `template_usage` para métricas de uso; sync de participantes incremental.
- **Aceite:** `evolution-api` deixa de expor ações de grupo/template; métricas de uso de template no dashboard.

#### 088 — Transcrição v7 e speech-to-text unificados
- **Prioridade:** P2 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3 edges `transcribe-audio-internal` v7 (autodetecção MP3/OGG/WAV/FLAC por magic bytes), `speech-to-text` (contrato com `useAudioRecorder`), `src/lib/pttLimits.ts`, `useAudioPlayer.ts`.
- **Estado no V2:** PARCIAL (`ai-transcribe-audio`, `elevenlabs-scribe-token`, `RealtimeTranscription.tsx`, `TranscriptionsHistoryView`, `recover-corrupted-audios`).
- **Ação:** detecção por magic bytes antes de escolher o pipeline (evita os "áudios corrompidos" que motivaram `recover-corrupted-audios`); limites de PTT (duração/tamanho) no gravador; uma edge para STT ao vivo e uma para transcrição de arquivo.
- **Aceite:** OGG/Opus da Evolution GO transcreve sem conversão manual; áudio > limite é recusado no cliente.

#### 089 — `ai-router` e `elevenlabs-voice` consolidados
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[PROD]` `[DECISÃO]` (consolidar reduz cold starts, mas muda 19 chamadores)
- **Origem:** V3 edges `ai-router` (12+ funções em uma entrada com `action`), `elevenlabs-voice` (uma edge para TTS/STS/SFX/design), `ai_function_metrics`, `useAIProviderHealth`, `useAIProviders`, `AIProvidersManager` (V2 já tem).
- **Estado no V2:** PARCIAL (9 `ai-*` + `ai-proxy` + 10 `elevenlabs-*` separadas; `_shared/ai-providers.ts`, `ai-guards.ts`, `ai-usage.ts`).
- **Ação:** manter as edges atuais como fachadas finas que delegam a `_shared/ai-router.ts` (sem quebrar chamadores), depois migrar o front para `ai-router` pelo `invokeEdge` (043); métricas por ação em `ai_usage_logs`; secrets `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` conforme TAREFA 3 do handoff (Anthropic usa `x-api-key` e `max_tokens` obrigatório).
- **Aceite:** 0 regressão nas 19 chamadas; cold start médio das ações IA cai (medir via 035).

#### 090 — Estatísticas do consumidor com HMAC e outbox de eventos
- **Prioridade:** P3 · **Esforço:** S · **Gate:** `[DB]` `[PROD]`
- **Origem:** V3 edge `evolution-consumer-stats` (POST com `X-Stats-Signature` HMAC-SHA256, valida contrato + HMAC e persiste), tabelas `outbox_events`, `processed_requests`, `processed_webhook_events`, `webhook_idempotency`, `webhook_event_dedup`.
- **Estado no V2:** PARCIAL (N8N e Evolution GO enviam webhooks; dedupe via índice único; sem outbox genérica).
- **Ação:** endpoint genérico para estatísticas de integrações externas (N8N, Evolution GO, Cloudflare Workers de mídia) com HMAC; `outbox_events` como base para 084 e para integrações futuras (Bitrix, CRM).
- **Aceite:** payload sem assinatura válida → 401; estatísticas do N8N visíveis no `IntegrationsHub`.

---

### Bloco 10 — Deploy, PWA, arquitetura e MCP (091–100)

#### 091 — Headers de segurança e túnel na Vercel (paridade com o nginx do V3)
- **Prioridade:** P0 · **Esforço:** S · **Gate:** `[PROD]`
- **Origem:** V3 `nginx-prod.conf` (HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP, `Cache-Control` imutável para `/assets`, `/healthz`, `/sentry-tunnel`), `Dockerfile` (manifesto N-1 de assets).
- **Estado no V2:** AUSENTE (`vercel.json` só rewrite + `no-store` em `version.json`).
- **Ação:** `vercel.json.headers` completo (CSP em report-only conforme 060); rewrite `/api/sentry-tunnel` (031); `/healthz` estático; manter a regra de `version.json`.
- **Aceite:** Mozilla Observatory ≥ A-; `deployment-update.ts` continua detectando nova versão.

#### 092 — `bundle-secret-guard` pós-deploy
- **Prioridade:** P0 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `bundle-secret-guard.yml` (barra `service_role` no bundle **e** valida que a anon key é aceita pelo gateway — incidente 2026-08-20 registrado no `CLAUDE.md` do V3).
- **Estado no V2:** AUSENTE (`docs/security/secret-surface-inventory.md` lista superfícies, sem gate).
- **Ação:** job pós-build no `ci.yml` que faz grep de `eyJ`/`service_role`/`sbp_` no `dist/` e um `GET /rest/v1/` com a anon key embutida esperando 200/401-por-RLS (nunca 401 do Kong); diário contra a URL de produção.
- **Aceite:** build com service_role no bundle falha; anon key de outro projeto é detectada.

#### 093 — PWA: religar Service Worker com banner de atualização
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[DECISÃO]` (o V2 desligou o SW "para resolver problemas de preview")
- **Origem:** V3 `public/sw.js`, `components/system/ServiceWorkerUpdateBanner.tsx`, `components/debug/SwDebugWidget.tsx`, `HardResetButton.tsx`, `public/sitemap.xml`, `src/lib/buildVersion.ts`.
- **Estado no V2:** PARCIAL (`src/config/service_worker.ts` com `SERVICE_WORKER_ENABLED = false`; `useServiceWorker` só remove SW legado; `usePushNotifications` depende do SW; `manifest.json` presente). `[≈ Cline 091]`
- **Ação:** SW mínimo (precache do shell + `network-first` para `/assets`, nunca cachear `version.json`); banner "nova versão" ligado a `useVersions`; widget de debug só em `import.meta.env.DEV`; `HardResetButton` em Settings.
- **Aceite:** atualização de deploy é percebida em ≤ 60 s; push web volta a funcionar (`PUSH_NOTIFICATIONS_ENABLED`).

#### 094 — Budget de performance executável, visualizer e compressão
- **Prioridade:** P1 · **Esforço:** S · **Gate:** —
- **Origem:** V3 `scripts/check-performance-budget.mjs` + `performance-baseline.json` (`perf:budget`, `perf:budget:baseline`), `rollup-plugin-visualizer`, `vite-plugin-compression2` (br + gzip), `src/lib/lazyWithRetry.ts` (V2 já tem).
- **Estado no V2:** PARCIAL (`performance-budget.json` existe sem script que o valide; `manualChunks` no `vite.config.ts`). `[≈ Cline 018/041]`
- **Ação:** script que lê `dist/` e compara com `performance-budget.json` por chunk (falha em +10 %); visualizer gera `stats.html` como artifact; pré-compressão br para a Vercel servir.
- **Aceite:** PR que aumenta o chunk inicial acima do budget falha com diff de tamanho.

#### 095 — Ratchets de TypeScript, `@ts-nocheck` e código morto
- **Prioridade:** P1 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `scripts/check-tsc-ratchet.mjs` + `tsc-error-baseline.json`, `check-ts-nocheck.mjs` + `ts-nocheck-baseline.txt`, `check-cluster-typecheck.mjs`, `check-dead-code.mjs` + `dead-code-allowlist.txt`, `docs/STRICT_MODE_BACKLOG.md`, `docs/TS_NOCHECK_CLEANUP.md`.
- **Estado no V2:** PARCIAL (`lint-ratchet.mjs` só ESLint). `[≈ Cline 031/032/037]`
- **Ação:** três scripts em `scripts/ci/` no mesmo padrão do `lint-ratchet.mjs` (baseline JSON + unit test `.unit.mjs`); `ratchet-tighten.yml` semanal reduz baselines; dead code via `ts-prune`/`knip` com allowlist.
- **Aceite:** baseline commitado; PR que adiciona `@ts-nocheck` falha.

#### 096 — Fronteiras de domínio, barrels e auditoria de design system
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3/V1 `scripts/check-domain-boundaries.ts`, `validate-barrels.ts`, `check-data-layer.mjs` + `data-layer-baseline.json` (ratchet: hooks não chamam `supabase` direto, passam por `services/*`), `check-design-system.ts` + `ds-config.ts` (`ds:check --max=130`), `generate-component-registry.ts`, V1 `full_audit_report.txt` (saída do audit).
- **Estado no V2:** AUSENTE (V2 tem `services/*` e ADR-001 react-query, sem gate). `[≈ Cline 038/039]`
- **Ação:** regras: `components/*` não importa `integrations/supabase` direto; `hooks/*` só via `services/*` (baseline dos 341 hooks, ratchet); barrels `index.ts` sem ciclos; audit de DS com máximo tolerado igual ao atual (V1 encontrou `font-mono`, cores literais).
- **Aceite:** baseline registrado; violação nova falha.

#### 097 — Bootstrap único (`rpc_app_bootstrap`) e feature flags
- **Prioridade:** P1 · **Esforço:** M · **Gate:** `[DB]`
- **Origem:** V3 `hooks/useAppBootstrap.ts` (1 RPC substitui 6+ queries: profile, roles, permissions, settings, departments, unread count), RPC `rpc_app_bootstrap`, `rpc_dashboard_init`, `useDashboardDataBatch`; `src/lib/featureFlags.ts` + tabela `feature_flags` (17 flags com `percentage`), V1 `useFeatureFlags`, `v237Fallbacks.ts`.
- **Estado no V2:** AUSENTE (`AppProviders.tsx` dispara `useAuth`, `useUserRole`, `usePermissions`, `useGlobalSettings`, `useUserSettings`, `useNotifications` separadamente; sem flags — rollout é deploy).
- **Ação:** RPC `rpc_app_bootstrap` `SECURITY INVOKER` retornando JSON; hook único alimentando os hooks existentes via `queryClient.setQueryData` (sem mudar a API deles); tabela `feature_flags (key, enabled, percentage, roles[])` + hook; primeiras flags: `offline_queue` (025), `sw_enabled` (093), `ai_router` (089).
- **Aceite:** page load faz 1 request de bootstrap em vez de 6; flag desliga feature sem deploy.

#### 098 — Feature-first + `src/domain` + schemas compartilhados
- **Prioridade:** P3 · **Esforço:** L · **Gate:** —
- **Origem:** V3 `src/features/{inbox,admin,connections,contacts,queues,sla,email,auth,...}` (components + hooks + data-access + services por feature), `src/domain/messaging`, `src/shared/{validation,criticalPayloadSchemas,webhookEventSchemas}.ts`, `docs/SERVICE_LAYER_PATTERN.md`, `docs/GOD_FILE_DECOMPOSITION.md`.
- **Estado no V2:** PARCIAL (`components/<dominio>` + `hooks/<dominio>` + `services/*`; `zappSchemas.ts` em `lib`). `[≈ Cline 039]`
- **Ação:** **não** mover em massa; adotar o layout só para features novas deste plano (022, 039, 054, 079) em `src/features/<nome>/`; mover `zappSchemas.ts` para `src/shared/` e compartilhá-lo com as edges via cópia validada (gate 044 `check-contract-sync`).
- **Aceite:** ADR registrando a convenção; features novas seguem o layout; nenhum import quebrado.

#### 099 — MCP server real (JSON-RPC, read-only, RLS)
- **Prioridade:** P2 · **Esforço:** M · **Gate:** `[PROD]`
- **Origem:** V3 edge `mcp-server` (R2 2026-08-18: `initialize`, `tools/list`, `tools/call`; tools `whoami`, `list_whatsapp_connections`, `search_contacts`; `requireUser`; zero escrita, zero SQL público), `mcp-query` (secret só por env, fail-closed 503), `scripts/check-mcp-exec-acl.mjs`, `src/lib/whoami.ts`.
- **Estado no V2:** AUSENTE (V2 expõe `mcp_exec` no banco com ACL auditada por `check-mcp-exec-acl.sql`; sem MCP HTTP para agentes).
- **Ação:** edge `mcp-server` com as 3 tools iniciais + `list_queues`, `get_conversation_summary`; auth por JWT do app; registrar no MCP próprio do "Claude Cérebro" para consultas operacionais sem `service_role`.
- **Aceite:** `tools/list` responde; `search_contacts` respeita RLS do usuário autenticado; nenhuma tool escreve.

#### 100 — Grafo de conhecimento, docs canônicos e fechamento
- **Prioridade:** P2 · **Esforço:** M · **Gate:** —
- **Origem:** V3 `graphify-out/GRAPH_REPORT.md` (+ `manifest.json`, labels assinados), `docs/ARQUITETURA_CANONICA.md`, `docs/SECRETS_INVENTORY.md`, `docs/DICIONARIO-BANCO.md`, `docs/RUNBOOK_OBSERVABILITY.md`, `docs/DOCUMENTATION_CONVENTIONS.md`, `AGENTS.md`/`HERMES.md` (V1/V3), `docs/ci-workflow-inventory.md`.
- **Estado no V2:** PARCIAL (`CLAUDE.md` cita graphify e `graphify-out/GRAPH_REPORT.md`, mas o diretório não está versionado; docs de arquitetura de 2026-03/06 sem "superado por").
- **Ação:** rodar `graphify update . --force` no container `claude-code` e versionar `GRAPH_REPORT.md` + `manifest.json` (mesmo ignore do V3 para `graph.json`); `docs/ARQUITETURA_CANONICA.md` do V2 (Vercel + Cloud + Evolution GO Hostinger + CRM externo); `docs/ci-workflow-inventory.md` com os workflows criados neste plano; `AGENTS.md` com as armadilhas A1–A16 do handoff; banner "superado" nos docs de 2025/2026-03; atualizar `ESTADO.md`/`FEATURE_REGISTRY.md` (009) com o resultado das 99 etapas.
- **Aceite:** `git rev-parse --short HEAD` = commit do `GRAPH_REPORT.md`; nenhum doc de arquitetura sem data ou sem status.

---

## 6. Dependências e ordem de execução

| Onda | Etapas | Pré-requisitos | Entrega verificável |
|---|---|---|---|
| A — Fundação | 001–010, 091, 092 | nenhum | hooks, scanners, headers, guard de bundle, `ESTADO.md` |
| B — Testabilidade | 011–020, 046, 047 | A | Playwright + Deno tests + provider `fake` em PR |
| C — Contratos e observabilidade | 031–045 | B (015 para testar contratos) | envelope único, Sentry, vitals, métricas, monitor realtime |
| D — Resiliência | 021–030, 061, 062 | C (034 request id; 041 envelope) | DLQ operável, idempotência, fila offline, timeline no chat |
| E — Segurança | 051–060 | C (056 rate limiter) | convites, sessões, gate de login, permissões por view, scan, LGPD |
| F — Produto | 063–080 | D, E | filtros, presença, roteamento, automações com log, cron admin |
| G — Integrações | 048, 049, 081–090 | F (084 depende de 023/075) | Cloud API, Outlook, notificações, export, IA consolidada |
| H — Plataforma | 093–100 | todas | PWA, budgets, ratchets, bootstrap, flags, MCP, docs |

Regras:
- Etapas `[DB]` só com `max(version)` conferido e fechamento triplo (`CLAUDE.md` §1) — uma migration por PR.
- Etapas `[PROD]` deployam pelo `deploy-functions.yml` existente (manifesto + smoke) até a etapa 044/045 ampliarem os gates.
- Etapas `[DECISÃO]`: 013, 031, 048, 057, 081, 083, 089, 093 — precisam de `APROVADO` antes de começar.

## 7. O que não foi verificado nesta análise

- Estado vivo do banco `tnnnlkbymytvtqngbbqh` (tabelas, crons, flags): a comparação usou `supabase/schema-catalog.json` (125 tabelas) e as migrations. Onde o catálogo pode estar defasado, a etapa marca `[VERIFICAR AO VIVO]`.
- Se as edges do V3 listadas como origem estão **ligadas** em produção do V3 — o `ESTADO.md` do V3 aponta 21 de 107 sem chamador; este plano usa o V3 como referência de implementação, não como prova de valor em produção.
- Comportamento real dos hooks/componentes do V1 (repo Lovable com histórico de "Visual edit"): usados só como referência secundária quando o V3 não tem equivalente (Outlook, `queue-rebalance`, `auto-escalate-sla`, stickers, `e2e-fixtures`).
- Custos externos (Sentry, VirusTotal, Meta Cloud API, Resend, Azure AD) — marcados como `[DECISÃO]`.

## 8. PRs sugeridos (diff mínimo por PR)

| PR | Etapas | Toca banco? |
|---|---|---|
| `chore(repo): hooks, templates, actionlint, codeowners` | 001–004 | não |
| `ci(security): security.yml + codeql + sentinel + notify` | 005–008, 092 | não |
| `docs(estado): ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md` | 009, 010 | não |
| `test(e2e): playwright base + specs críticos + a11y` | 011, 012, 014 | não |
| `test(edge): deno contract tests + coverage ratchet` | 015, 016, 020 | não |
| `feat(edge): e2e-fixtures + seed/cleanup` | 013 | sim (dados E2E) |
| `feat(dlq): reprocess-failed-messages + rpc_dlq_* + admin` | 021, 022, 023 | sim |
| `feat(send): idempotência + fila offline + breaker + throttle` | 024–027 | sim (024) |
| `feat(ops): pausa por instância + tentativas + métricas` | 028, 029 | sim |
| `feat(obs): sentry front/edge + vitals + request id` | 031–034 | não |
| `feat(obs): health/metrics/realtime monitor/webhook pages` | 035–040 | sim (038, 040) |
| `refactor(edge): contract-kit + versões + invokeEdge + gates` | 041–045 | não |
| `feat(provider): registry evolution/fake` | 046, 047 | não |
| `feat(security): convites, sessões, login gate, view permissions` | 051–055 | sim |
| `feat(security): rate limiter, scan, LGPD jobs, headers` | 056–060, 091 | sim (057, 058) |
| `feat(chat): timeline, falhas, presets, deep links, presença` | 061–066 | sim (065) |
| `feat(chat): pins/favoritos, scroller, stickers, ticket bar` | 067–070 | sim (067) |
| `feat(contacts): import, mídia, segmentos, crm plugável` | 071–074 | sim |
| `feat(automations): execuções, follow-up, router, rebalance, cron, csat` | 075–080 | sim |
| `feat(integrations): cloud api, outlook, email, notificações` | 048, 049, 081–084 | sim |
| `feat(data): export, limpeza, grupos/templates, transcrição, ai-router` | 085–090 | sim (085, 090) |
| `feat(platform): pwa, budgets, ratchets, boundaries` | 093–096 | não |
| `feat(platform): bootstrap rpc, flags, features layout, mcp-server, docs` | 097–100 | sim (097) |
