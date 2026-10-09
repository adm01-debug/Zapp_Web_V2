# Módulo: Multiplix, Talk X, Configurações, Notificações e Segurança

> **Cartão:** Y23 · **Data:** 2026-10-07 · **Base:** `dia/2026-10-07` (workspace do cartão)
> **Escopo deste documento:** descrever o que existe HOJE no código, sem propor mudança.
> **Fontes lidas:** `src/components/talkx/**`, `src/components/multiplix/**`, `src/hooks/integrations/**`,
> `src/components/settings/**`, `src/components/notifications/**`, `src/components/security/**`,
> `src/components/compliance/LGPDComplianceView.tsx`, `src/hooks/system/**`, `src/hooks/ui/**`,
> `src/hooks/communication/**`, `src/lib/mediaVolumeStore.ts`, `src/lib/volumeLabels.ts`,
> `src/services/navigation.service.ts`, `supabase/functions/**` (Edge Functions citadas),
> `supabase/schema-catalog.json` (tabelas, colunas, RPCs, check constraints) e as migrations de `supabase/migrations/`
> nomeadas ao longo do texto.
> **Regra de leitura:** tudo que não pôde ser provado no código/repositório está marcado **NÃO VERIFICADO**.
> Nada aqui autoriza o acesso a produção: o catálogo e as migrations são a única fonte de banco usada.

---

## 1. O que é e para quem

Este documento cobre cinco superfícies que, juntas, formam a "operação em massa + preferências + proteção" da plataforma:

| Módulo | Id de navegação | Entrada na navegação | Para quem |
|---|---|---|---|
| **Talk X** (rótulo "Campanhas") | `talkx` | grupo *Automação & IA* | `admin` e `supervisor` (`STAFF_ROLES` em `src/services/navigation.service.ts`) |
| **Multiplix** | `multiplix` | navegação principal | quem tem a **permissão nomeada** `multiplix.dispatch.create` (papel não decide — ver §4) |
| **Configurações** | `settings` | grupo *Sistema* | sem `roles`: a própria tela filtra abas por `isStaff` (agente/special_agent veem as 4 abas pessoais) |
| **Notificações** | — (aba de Configurações + controles de volume no cabeçalho/sidebar) | — | todos os usuários autenticados |
| **Segurança** | `security` | grupo *Sistema* | `STAFF_ROLES`, com abas administrativas só para `admin`; **LGPD** é a view `privacy` (`LGPDComplianceView`) |

**Talk X** é o motor de campanhas em massa: segmentos de audiência, templates versionados, rascunho com passo salvo,
janela de envio e horário comercial, perfis de velocidade, lista de supressão (opt-out/LGPD), monitor ao vivo,
agendamento, retomada automática e analytics com links rastreáveis e conversões.

**Multiplix** é o envio em massa para **fornecedores, transportadoras e clientes** a partir da base de empresas do Singu:
busca filtrada (público/ramo/UF/nome), seleção de empresas, composição da mensagem e monitor do disparo. O público é
**re-resolvido no servidor** (a edge `multiplix-audience`), não no navegador.

**Configurações** reúne preferências pessoais (notificações, aparência, atalhos, sons) e configuração de operação
(horário, mensagens, automação, global, follow-up, mídia, NPS, tags IA, CSAT, chatbot L1, roteamento, gestão de IA).

**Notificações** cobre sons de alerta (WebAudio), volume de alertas e volume de mídia de conversa, "horário de
silêncio", notificações do navegador, push e as notificações internas gravadas na tabela `notifications`.

**Segurança** cobre a Central de Segurança (conta, 2FA, passkeys, dispositivos, alertas, IPs, geobloqueio, rate limit,
auditoria, quarentena), a **proteção de tela**, a **permissão de download** (`profiles.can_download`) e a tela de
**Privacidade & LGPD**.

### Regras permanentes do produto (valem para todos os itens acima)

- **Nenhuma informação sai do sistema.** A exportação de dados da tela de LGPD é **bloqueada por política**
  (`LGPDComplianceView.handleExportData` só emite erro). O download de arquivo tem **um único caminho**:
  `useDownloadPermission` → `profiles.can_download` (§4).
- **Sem selo de canal/origem** em arquivo ou mensagem. O que existe no Multiplix é rótulo de **destino**
  ("Contato", "Empresa · sem pessoa cadastrada", "Sem destino", "Sem WhatsApp"), que descreve se há telefone de
  destino — não identifica canal nem origem do arquivo.
- Só as cores/tokens do sistema são usadas; efeitos só com `motion-safe:`/`prefers-reduced-motion`
  (ex.: `motion-reduce:animate-none` no popover do controle de volume).

### Documentos que já existem (citados, não substituídos por este)

- **Módulo Talk X** — `docs/talkx/ARQUITETURA.md`, `docs/talkx/OPERACAO.md`, `docs/talkx/PARIDADE.md`,
  `docs/talkx/CONVERSOES.md`, `docs/talkx/CHANGELOG_TALKX.md`, `docs/talkx/README.md`,
  `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`, `docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`,
  `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md`, `docs/talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md`,
  `docs/talkx/AUDITORIA_PLANO_TALKX_2026-09-29.md`, `docs/talkx/HANDOFF_SESSAO_03.md` e as pastas `docs/talkx/v4/`,
  `docs/talkx/references/`, `docs/talkx/recovery/`, `docs/talkx/n8n/`.
  *(Existência dos arquivos conferida por listagem; **conteúdo não lido neste cartão** — o que este documento afirma
  sobre Talk X vem do código, não desses textos.)*
- **Módulo Multiplix** — `docs/multiplix/CANAL.md`, `docs/multiplix/PERMISSOES.md`, `docs/multiplix/PONTE_SINGU.md`,
  `docs/multiplix/DESIGN_TOKENS_MAP.md`, `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`,
  `docs/multiplix/AUDITORIA_IMPLEMENTACAO_MULTIPLIX_2026-09-29.md`.
- **Documentos de "Talk Me"** (funcionalidade **diferente** deste módulo, conforme o cabeçalho dos próprios arquivos:
  o TALK ME é o botão/tela de atendimentos não aceitos no **Inbox**) — `docs/design/PLANO_TALK_ME_100_ETAPAS_2026-09-30.md`,
  `docs/design/RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md`, `docs/design/PLANO_REFINAMENTO_TALK_ME_50_ETAPAS_2026-09-30.md`,
  `docs/design/RELATORIO_REFINAMENTO_TALK_ME_50_ETAPAS_2026-10-01.md`, `docs/reconciliation/reports/modules/TALK_ME.md`.
  **Atenção:** "Talk Me" ≠ Talk X. O módulo de campanhas em massa documentado aqui é o **Talk X** (`docs/talkx/**`).
- **Volume/áudio** — `docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md`,
  `docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md`, `docs/plans/PLANO_AUDIO_PLAY_NO_CARTAO_6_ETAPAS_2026-10-07.md`.
- **Segurança** — `docs/DB-SECURITY.md`, `docs/WEBHOOK_SECURITY.md`, `docs/LGPD-RETENTION-POLICY.md`, `docs/security/**`.

---

## 2. Telas e fluxos principais

### 2.1 Talk X (`src/components/talkx/TalkXView.tsx`)

`TalkXView` tem **cinco visões de topo** (`TalkXTopView`): `tabs`, `wizard`, `monitor`, `scheduled`, `running`.

**Abas** (`activeTab`, sincronizadas com a URL):

| Aba (`?tab=`) | Componente | Observação |
|---|---|---|
| `overview` (padrão) | `TalkXOverview` | lista de campanhas, ações e KPIs; recebe `isLoading`, `isError`, `error`, `onRetry` |
| `segments` | `TalkXSegments` | alcançada pelo menu *Analytics → Segmentos* |
| `templates` | `TalkXTemplates` | menu *Templates → Biblioteca*; "Novo template" abre o wizard |
| `suppression` | `TalkXSuppression` | "Lista de supressão" |
| `analytics` | `TalkXAnalytics` | menu *Analytics → Comparativo* |
| `analytics` + `?sub=configuracoes` | `TalkXSettings` | menu *Analytics → Configurações* |

**URL e histórico** (verificado em `talkxTabRoute.ts` e `talkxWizardRoute.ts`):
- abas: `?tab=<aba>` e `?sub=<sub-visão>`; `goTab()` faz `pushState` e dispara `popstate`, que o `TalkXView` escuta.
- wizard: `?view=talkx&wizard=<id|new>&step=1..4`. O parser rejeita parâmetro duplicado/malformado
  (`needsNormalization`) em vez de coagir o valor; `step` fora de 1–4 volta para 1.

**Wizard — 4 passos** (`useCampaignEditor.ts` → `WizardStep = 1|2|3|4`):
1. **Público** (`StepAudience`): origem do público `contacts` ("Contatos ZAPP"), `segment` ("Segmento salvo") ou
   `crm360` ("CRM 360°" — no código atual aparece **desabilitado** com o selo "Vinculação CRM 360° não configurada"),
   mais filtros de audiência e seleção de contatos.
2. **Mensagem** (`StepMessage`): texto, variáveis (`{{nome}}`, `{{nome_completo}}`, `{{apelido}}`, `{{empresa}}`,
   `{{saudacao}}` — `kit/constants.ts`), sugestões de templates aprovados e prévia com contato fictício.
3. **Entrega** (`TalkXWizardDelivery`): janela de envio/ horário comercial, perfil de velocidade, agenda e limites.
4. **Revisão Final** (`TalkXWizardReview`): confere tudo e lança.

Fluxos de ação (handlers em `TalkXView`): **nova campanha** (`openNew`, rota `wizard=new&step=1`), **editar**
(rascunhos e agendadas — reabre no passo salvo `draft_step`, V23), **duplicar** (RPC `duplicate_talkx_campaign`),
**monitorar** (`openMonitor`), **ver agendada** (`openScheduled`), **ver em execução** (`openRunning`),
**voltar à lista** (`backToList`). O roteamento por status (`onView`, comentado como E72) manda
`scheduled`→tela de agendada, `sending`/`paused`→tela de em execução, o resto→monitor.
Enquanto a campanha roteada resolve, a tela mostra esqueleto com `role="status"`, `aria-busy="true"` e
`data-talkx-query="loading"` (X047).

**Motor e acompanhamento** (RPCs/edge em §3): início assíncrono (`accepted: true`), pausa, cancelamento, retomada
automática fora da janela de envio (edge `talkx-scheduler`, via `pg_cron`), "outcome unknown" reconciliável,
relatório por e-mail (edge `talkx-report`), links rastreáveis e conversões (`talkx-link`).

### 2.2 Multiplix (`src/components/multiplix/`)

Fluxo do operador, em `MultiplixView`:
1. **Filtros** — Público (Cliente / Fornecedor / Transportadora / Todos), Ramo (carregado de `list_ramos`, com total),
   UF (de `list_ufs`, com total) e "Buscar por nome"; o botão *Buscar* zera a seleção, limpa as linhas e volta à página 0.
2. **Consulta** — `search` (páginas de `PAGE_SIZE = 50`) e `count` (contagem exata do filtro). "Carregar mais" só
   aparece com página cheia (`lastPageFull`) e continuidade conhecida; usa os filtros **travados no último Buscar**
   (`submittedFilters`) e só avança a página no `onSuccess`.
3. **Seleção** — checkbox por empresa e "selecionar todas as visíveis", ambas limitadas a **`MAX_SELECTABLE = 500`**
   (limite duro do backend: `ResolveParamsSchema.company_ids` rejeita arrays maiores que 500). Ao passar do teto, a UI
   avisa e seleciona as primeiras 500.
4. **Composer** (`MultiplixComposerDialog`) — nome do disparo, mensagem com chips `{{empresa}}`/`{{saudacao}}`,
   botões *Salvar rascunho* e *Salvar e iniciar agora*; iniciar agora abre confirmação explícita ("envia mensagens
   reais … sem volta"); se o servidor recusar por estar acima do teto de destinatários, aparece o diálogo
   "Disparo acima do teto de contatos" com o número real e o reenvio com `confirm_over_limit`.
5. **Monitor** (`MultiplixMonitor`, aberto também a partir da lista "Disparos recentes", que mostra os 8 últimos) —
   status do disparo, contadores, filtro por status de destinatário, contagem exata de `skipped` (empresa sem
   destino) e ações Iniciar/Pausar/Cancelar.

### 2.3 Configurações (`src/components/settings/SettingsView.tsx`)

Cabeçalho com o botão **"Salvar Alterações"** (`useUserSettings.saveSettings`). Abas (16), com o gate `isStaff = isAdmin || isSupervisor`:

- **Pessoais (todas):** *Notificações* (`NotificationSettingsPanel`), *Aparência* (`AppearanceSettings`, inclui reiniciar
  o tour de onboarding), *Atalhos* (`KeyboardShortcutsSettings`), *Sons* (`SoundCustomizationPanel` + `ElevenLabsDialogue`
  + `ElevenLabsVoiceDesign`).
- **Staff:** *Horário* (`ScheduleSettings`), *Mensagens* (`MessagesSettings` + `QuickRepliesManager`), *Automação*
  (`AutomationSettings`), *Global* (`GlobalSettingsSection` + `IntegrationKeysSection`), *Follow-up* (`FollowUpSequences`),
  *Mídia* (`MediaLibraryAdmin` + `StickerManager`), *NPS* (`NPSDashboard`), *Tags IA* (`AIAutoTagsConfig`),
  *CSAT* (`CSATAutoConfig`), *Chatbot L1* (`ChatbotL1Config`), *Roteamento* (`SkillBasedRoutingSettings`),
  *Gestão IA* (`AIProvidersManager`).
- Aba padrão: `schedule` para staff; `notifications` para não-staff. Enquanto carrega, a tela mostra esqueleto de abas + campos.

### 2.4 Notificações

- **Painel** (`NotificationSettingsPanel`): interruptor geral de sons; teste de som; **Volume (10–100, passo 5)**;
  tipos de alerta (`NotificationTypeSection`), alerta de sentimento (`SentimentAlertCard`), push (`PushNotificationCard`),
  horário de silêncio (`QuietHoursCard`), notificações do navegador (com botão de solicitar permissão) e
  **"Restaurar Configurações Padrão"** (`resetSettings`, que só anuncia sucesso se o banco confirmar).
- **Tipos de som** (`useNotificationSettings.ts` → `SoundTypeOption`): `beep | chime | bell | alert | soft`, com default
  por evento: mensagem `chime`, menção `bell`, SLA `alert`, meta `chime`, transcrição `soft`.
- **Controles rápidos no cabeçalho/sidebar** (`SoundVolumeControl`, `MediaVolumeControl`, `VolumeSliderPopoverContent`,
  `VolumeTriggerButton`, `useVolumeRocker`): clique = mudo/desmudo, **clique longo ou `Enter` = abre o slider**,
  **scroll e setas ↑/↓ = ±5**, tecla **`M`** alterna o mudo. Rótulos vêm de `src/lib/volumeLabels.ts`
  ("Volume dos alertas", "Volume dos áudios e vídeos").
- **Dois canais de volume, de propósito separados** (`src/lib/mediaVolumeStore.ts`): alertas = **WebAudio**
  (gravados em `user_settings.sound_volume`), mídia de conversa = **`HTMLMediaElement`** (estado por **dispositivo**
  em `localStorage`: `zapp.media.volume`/`zapp.media.muted`, sincronizado entre abas por `BroadcastChannel`
  `zapp-media-volume`, com fallback no evento `storage`; default 80, curva perceptual `(volume/100)²`).
  O próprio módulo documenta que **não se deve unificar** os dois.
- **Notificações internas** (`notifications`): `useNotifications` (canal `notifications-changes`), `NotificationsPopover`,
  `NotificationItem`, `ReminderNotification`, `notificationDedupe.claimNotificationEvent` (janela de 2 min),
  `useRealtimeNotifications`, e provedores por domínio: `SLANotificationProvider`, `GoalNotificationProvider`,
  `RealtimeSentimentAlertProvider`, `useTranscriptionNotifications`, `useTeamChatNotifications` +
  `TeamChatNotificationsListener`, `useWorkItemNotifications`, `QueuePositionNotifier`, `useMonitoringNotifications`,
  `InAppNotificationProvider`.

### 2.5 Segurança

- **Central de Segurança** (`SecurityView`, view `security`) — abas: *Visão Geral*, *Conta* (`SecuritySettingsPanel`),
  *Passkeys*, *Dispositivos*, *Alertas* (`SecurityNotificationsPanel`) e, **só para `admin`**: *IPs*
  (`BlockedIPsPanel` + `IPWhitelistPanel`), *Geo* (`GeoBlockingPanel`), *Rate Limit* (`RateLimitConfigPanel`),
  *Auditoria* (`AuditLogDashboard`), *Quarentena* (`QuarantinePanel`), *Admin* (pedidos de reset de senha e atalhos
  para `/admin/rate-limit` e `/admin/roles`). Para `admin`, a view também monta `RateLimitRealtimeAlerts` no topo.
- **Conta** (`SecuritySettingsPanel`): "Nível de Segurança" medido pela presença de fatores 2FA verificados
  (`useMfaFactors`: ativo→100%, sem 2FA→60%, erro de leitura→"Indisponível", nunca um número inventado);
  itens para 2FA (`MFASettings`), trocar senha, sessões ativas e alertas. Ações sensíveis passam por
  **reautenticação** (`useReauthentication` + `ReauthDialog`, rótulos `configure_mfa`/`change_password`).
- **Proteção de tela** (`useScreenProtection` + `ScreenProtectionToggle` no `Sidebar`; o hook é montado em `App.tsx`):
  ligada por padrão (`localStorage['screen-protection-enabled']`); bloqueia `PrintScreen`, `Cmd/Ctrl+Shift+S`,
  `Ctrl/Cmd+P`, `Ctrl/Cmd+S`, copiar/selecionar fora de campos de texto, `F12` e atalhos de devtools (fora de DEV),
  arrastar imagens e menu de contexto (fora de DEV), aplica `user-select: none` (com exceção para input/textarea/
  contenteditable/pre/code), esconde o corpo na impressão e mostra um **overlay "Conteúdo Protegido"** quando a janela
  perde o foco, além de um flash vermelho (`--destructive`) a cada tentativa.
- **Download de arquivo** (`useDownloadPermission` → `profiles.can_download`, `staleTime` 30 s): consumido pela prévia
  de imagem/arquivo do Inbox (`ImagePreview`, `MediaPreview`). Quem concede é o Admin (`AdminView` edita
  `can_download` por usuário).
- **Geobloqueio** (`GeoBlockingPanel` + `useGeoBlocking`): modo em `geo_blocking_settings.mode`
  (`disabled | whitelist | blacklist`), listas em `allowed_countries` / `blocked_countries`; a tela avisa quando a
  whitelist está ativa e vazia ("ninguém poderá acessar").
- **Alertas de segurança** (`useSecurityPushNotifications`): como `security_alerts` saiu da publicação realtime
  (migration de 2026-09-05, comentário E62 no arquivo), o front faz **polling de 20 s** por `user_id`, `is_resolved =
  false` e `created_at` maior que o último check, e entrega por push (`usePushNotifications`) ou, sem push, por toast
  (severidade `high`/`critical`→error, `medium`→warning, resto→info).
- **LGPD** (`LGPDComplianceView`): lista os direitos (acesso, portabilidade, retificação, eliminação), informa os tipos
  de dado tratados e a base legal, **bloqueia a exportação** e registra o pedido de exclusão via RPC
  `log_audit_event` (`gdpr_deletion_request`), conferindo o `error` do retorno antes de confirmar ao usuário.

---

## 3. Dados (tabelas, colunas, RPC e Edge Functions)

Colunas abaixo extraídas de `supabase/schema-catalog.json` (nomes exatos); as listas completas estão no catálogo.

### 3.1 Talk X

| Tabela | Colunas-chave verificadas |
|---|---|
| `talkx_campaigns` | `name`, `message_template`, `status`(draft/scheduled/sending/paused/completed/cancelled), `total_recipients`, `sent_count`, `failed_count`, `delivered_count`, `read_count`, `replied_count`, `skipped_count`, `outcome_unknown_count`, `scheduled_at`, `schedule_timezone`, `send_window_start/end`, `business_hours_only`, `speed_profile`(slow/moderate/fast), `audience_source`(contacts/segment/crm360), `audience_filters`, `segment_id`, `template_id`, `template_version_id`, `draft_step`(1–4), `revision`(>0), `draft_creation_key`, `owner`/`responsible_id`, `launched_by/launched_at`, `legal_basis`(consent/legitimate_interest/contract), `respect_suppression`, `confirm_consent`, `investment`, `max_per_minute`(1–60), `worker_id`/`worker_lease_expires_at`, `audience_snapshot_at` |
| `talkx_recipients` | `campaign_id`, `contact_id`, `status`(pending/sending/sent/delivered/failed/skipped/outcome_unknown/cancelled), `personalized_message`, `message_snapshot_at`, `media_url_snapshot`/`media_type_snapshot`, `variant_id_snapshot`, `external_id`, `delivery_claim_token`/`delivery_claimed_at`/`delivery_claim_expires_at`/`delivery_claimed_by`, `delivery_attempt_count`, `attempt_count`, `manual_retry_count`, `retry_after`, `sent_at`, `delivered_at`, `read_at`, `replied_at`, `clicked_at`/`click_count`, `segment_id` |
| `talkx_segments` | `name`, `origin`(zapp/crm360/custom), `status`(active/inactive), `rules`(jsonb), `estimated_count`, `is_favorite` |
| `talkx_templates` / `talkx_template_versions` / `talkx_template_variants` | templates com `status`(draft/review/approved) e `media_type`(image/video/document/audio); versões com `version_number`>0 e mesmo `status`; variantes A/B/C com `weight` (0–100] e `content` até 65 536 |
| `talkx_blacklist` | `contact_id`/`phone` (ao menos um — check `talkx_blacklist_phone_or_contact`), `reason`, `reason_code`(opt_out/invalid_number/manual/lgpd/no_commercial_permission/bounce), `origin`(manual/optout/system/lgpd/list/auto_optout), `campaign_id`, `expires_at`, `source_message_id`, `removed_by`/`removed_at` |
| `talkx_campaign_events` | `campaign_id` **ou** (`entity_type`+`entity_id`), `event_type` (28 valores: created, updated, scheduled, started, paused, resumed, cancelled, completed, note, limits_updated, suppression_*, link_*, investment_updated, report_exported, import_*…), `actor_id` |
| `talkx_settings` | `key` (PK), `value`(jsonb), `description`, `updated_at` |
| apoio | `talkx_campaign_segments` (`position` 1–10, status pending/sending/paused/done), `talkx_delivery_log` (stage claim/suppress_check/dispatch/complete/reconcile; outcome sent/failed/outcome_unknown/skipped/rescheduled/no_claim/stopped; `attempt`, `http_status` 100–599, `duration_ms`), `talkx_links` (`label` `^[a-z0-9][a-z0-9_-]{0,39}$`, `target_url` `^https://`), `talkx_link_clicks`, `talkx_conversions` (`source` whatsapp/manual/import/api/checkout, `value` ≥ 0), `talkx_optout_keywords` (`match_mode` exact/contains), `talkx_alerts` (`kind` stalled_campaign/stale_lease/outcome_unknown/high_failure_rate/cron_degraded), `talkx_test_send_claims` |

**RPCs usadas pelo front** (`src/hooks/integrations/useTalkX.ts`, via `supabase.rpc`):
`save_talkx_campaign_draft(p_campaign_id, p_expected_revision, p_creation_key, p_payload)` →
`{campaign_id, revision, creation_replayed}`; `update_talkx_campaign_limits(p_campaign_id, p_expected_revision, p_limits)`;
`delete_talkx_campaign(p_campaign_id)`; `duplicate_talkx_campaign(p_campaign_id)`;
`replace_talkx_draft_recipients(p_campaign_id, p_contact_ids)`; `snapshot_talkx_campaign_audience(p_campaign_id, p_expected_revision)`
→ `{eligible, suppressed, skipped_invalid}`.

**RPCs do motor/relatórios** (presentes no catálogo; a maior parte é chamada pelas edges e pelo `pg_cron`, não pelo
navegador): `transition_talkx_campaign`, `claim_talkx_campaign_worker`, `claim_talkx_recipient`,
`complete_talkx_recipient`, `reschedule_talkx_recipient`, `release_talkx_recipient_claim`,
`persist_talkx_recipient_message_snapshot`, `mark_talkx_recipient_dispatch_started`, `record_talkx_recipient_sent/delivered/receipt`,
`complete_talkx_campaign_if_drained`, `sweep_talkx_stuck_recipients`, `retry_talkx_recipient(s)`,
`resolve_talkx_outcome_unknown`, `talkx_next_recipients`, `talkx_resolve_audience`, `talkx_audience_query`,
`talkx_recipient_is_suppressed`, `talkx_suppress_contact`, `talkx_match_optout`/`talkx_normalize_optout_text`,
`talkx_resolve_speed_pace`, `talkx_overview_stats`, `talkx_campaign_report`, `talkx_campaign_logs`,
`talkx_campaign_pace`, `talkx_campaign_reply_stats`, `talkx_benchmarks`, `talkx_analytics_scope`,
`talkx_engine_window_open`, `talkx_engine_alerts`, `talkx_engine_cron_runs`, `talkx_connection_send_budget`,
`talkx_upsert_link`/`talkx_delete_link`, `record_talkx_link_click`, `record_talkx_conversion`,
`talkx_set_campaign_investment`, `log_talkx_campaign_checklist`, `purge_talkx_expired_data`, `kick_talkx_campaign`,
`trigger_talkx_engine_tick`, `get_talkx_cron_secret`, `get_talkx_send_url`, `is_valid_talkx_schedule_timezone`,
`update_talkx_template_with_snapshot`, `attribute_talkx_reply`.

**Edge Functions:** `talkx-send` (ações `start`/`pause`/`cancel`, além de `test` e `retry`; usa
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, e lê `TALKX_LINK_BASE_URL`,
`TALKX_BATCH_SIZE`, `TALKX_BATCH_BUDGET_MS`; dispara o lote por dentro de uma invocação e responde
`{accepted: true, status:'sending'}` no lançamento assíncrono); `talkx-scheduler` (chamado pelo `pg_cron` a cada
minuto; **exige `x-cron-secret` igual a `get_talkx_cron_secret()` ou a service key, senão 401**; AbortController de
10 s por chamada; tetos de 10 campanhas e 1 retomada por conexão por tick; exporta `handleTalkxScheduler` para teste);
`talkx-report` (relatório por e-mail com contagens exatas por status via `head/count`); `talkx-link`
(`GET /talkx-link?s=<slug>&r=<recipient_id>` registra clique e redireciona 302; `POST` registra conversão assinada por
HMAC-SHA256 — esquema `v1` sobre `"v1\n<timestamp_ms>\n<external_ref>\n<corpo>"`, janela ±5 min, corpo ≤ 4 KB,
aceitação do esquema legado até a data default `2026-10-20T23:59:59.999-03:00` ou o valor de
`TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL`).

**Realtime/polling:** canal `talkx:campaigns` (UPDATE com debounce de 500 ms acumulado **por campanha** e INSERT que
invalida a query; `isLive` reflete `SUBSCRIBED`) com **polling de 15 s** quando o canal não está conectado; publicação
realtime de `talkx_campaign_events` criada por migration (`20260927500001`/`20260927570000`); `talkx_recipients` com
PII removida da publicação (`20260927420000`).

### 3.2 Multiplix

| Tabela | Colunas-chave verificadas |
|---|---|
| `multiplix_dispatches` | `name`, `message_template`, `status`(`multiplix_dispatch_status`), `audience_filters`, `total_recipients`, `sent_count`, `failed_count`, `delivered_count`, `outcome_unknown_count`, `scheduled_at`, `started_at`, `paused_at`, `pause_reason`, `completed_at`, `created_by`, `client_request_id`, `dispatch_version`, `audience_version`, `origin`(manual/audience/crm360/contacts), janela de envio/`business_hours_only`/`speed_profile` |
| `multiplix_recipients` | `dispatch_id`, `company_id`, `company_name_snapshot`, `destino_e164`, `destino_origem`, `personalized_message`, `status`(`multiplix_recipient_status`), `eligibility`(`multiplix_eligibility`), `eligibility_reason`, `inclusion_reason`, `singu_contact_id`, `variables_snapshot`, `external_id` (1–512), claim/lease (`delivery_claim_*`, `delivery_attempt_count`), `attempt_count`, `retry_after`, `sent_at`/`delivered_at` |
| apoio | `multiplix_blocks` (`personalization_mode` null/`same_audio`/`personalized`; `block_order`), `multiplix_delivery_items` (`reply_attribution` null/`linked`/`inferred`), `multiplix_events` (`kind` com 29 valores — dispatch_created…connection_failure/note), `multiplix_audiences` (`kind` rule/static_list), `multiplix_audience_members`, `multiplix_voice_assets` (duração/caracteres ≥ 0), `multiplix_voice_grants` (ao menos `roles` ou `perfis`) |

**RPCs:** `multiplix_create_draft(p_name, p_template, p_recipients, p_client_request_id, p_created_by,
p_whatsapp_connection_id, p_scheduled_at, p_confirm_over_limit)` → `{dispatch_id, recipient_count, created, …}`
(idempotente por `client_request_id`); `multiplix_confirm_dispatch` (com `expected_version`, `correlation_id`);
`transition_multiplix_dispatch`; `claim_multiplix_recipient`/`claim_multiplix_item`, `complete_*`, `reschedule_*`,
`release_*`, `mark_*_dispatch_started`, `persist_*_message_snapshot`, `heartbeat_multiplix_item`,
`record_multiplix_*_sent/delivered`, `complete_multiplix_dispatch_if_(items_)drained`, `sweep_multiplix_stuck_*`,
`list_multiplix_claimable_items`, `list_multiplix_dead_letters`/`count_multiplix_dead_letters`,
`multiplix_dispatch_window_is_open`, `multiplix_connection_daily_usage`, `register_multiplix_connection_failure`,
`reorder_multiplix_blocks`, `trigger_pending_multiplix_dispatches`, `get_multiplix_cron_secret`,
`attribute_multiplix_item_reply`.

**Edge Functions:** `multiplix-audience` — `requireAuth` obrigatório, ações `list_ramos`, `list_ufs`, `search`,
`count`, `resolve`, `create_draft`; escopo resolvido no servidor a partir do JWT e assinado com
`MULTIPLIX_SCOPE_HMAC_SECRET`. `multiplix-dispatch` — API de domínio por `action`
(`draft.create|draft.get|draft.update|draft.discard` e demais ações do bloco), toda resposta com `meta.correlation_id`;
**o front lê lista, monitor, destinatários e contagem de `skipped` por esta edge**, não direto pelo PostgREST.
`multiplix-send` — motor claim/lease/backoff, ações `start`/`pause`/`cancel` (e recusa de `start` fora da janela
respondendo 200 com `{ok:false, reason}`); consulta a supressão em `talkx_recipient_is_suppressed` após o claim e
antes do POST. `multiplix-voices` — `voices.list` e `assets.sign` (bucket privado `multiplix-voice`), com revogação
cortando as duas pontas e aplicando a visibilidade explicitamente no service role.

**Limites de leitura no front** (`useMultiplixDispatches.ts`): lista de disparos `limit=50`; destinatários
`limit=500` por página com teto de **20 páginas (10 000 linhas)** e marca `truncated` (a tela rotula "amostra");
contagem por status `limit=1000` e erro explícito (`multiplix_recipients_list_sem_total`) quando o servidor devolve
página cheia sem `total`. Polling: lista de disparos 10 s; disparo e destinatários 5 s.

### 3.3 Configurações, Notificações e Segurança

| Tabela | Uso verificado |
|---|---|
| `user_settings` | preferências por usuário: horário/`work_days`, mensagens (welcome/away/closing), atribuição automática, `sound_enabled`, `sound_volume`, `browser_notifications_enabled`, `quiet_hours_*`, `theme`, `language`, `compact_mode`, `sentiment_alert_*`, `tts_voice_id`/`tts_speed`, `auto_transcription_enabled`, `transcription_notification_enabled`, `*_sound_type` |
| `notifications` | notificações internas (`type`, `is_read`, `read_at`, `dedupe_key`), lidas por `useNotifications` |
| `security_alerts` | `alert_type`, `severity`, `title`, `description`, `ip_address`, `is_resolved`, `resolved_by/at` (polling de 20 s) |
| `user_devices` | dispositivos por usuário (`device_fingerprint`, `browser`, `os`, `ip_address`, `city`, `country`, `is_trusted`, `first_seen_at`/`last_seen_at`) |
| `geo_blocking_settings` + `allowed_countries` / `blocked_countries` | modo de geobloqueio e listas |
| `profiles.can_download` (boolean, not null) | único gate de download de arquivo |
| `audit_logs` | destino da RPC `log_audit_event(p_action, p_entity_type, p_entity_id, p_details, p_user_agent)` usada pelo pedido de exclusão LGPD |
| `permissions` / `role_permissions` | catálogo de permissões nomeadas e atribuição por papel |

**RPC citada:** `log_audit_event` (SECURITY DEFINER, no catálogo com a assinatura acima); `user_has_permission`
(usada por `useUserRole`/`ProtectedRoute` conforme o comentário em `navigation.service.ts`).
**Seeds verificados em migrations:** `talkx_settings` nasce com `reply_window_hours=72`, `optout_autoreply="PARE para
sair"`, `ai_insights=false`, `daily_limit_per_connection=500`, `default_speed_profile="balanced"` (perfis citados:
`fast | balanced | slow` — o front usa `slow|moderate|fast`; ver risco §6) e `business_hours` com dias 1–5.

---

## 4. Permissões e regras de acesso

### 4.1 Navegação

- `talkx`: `roles: STAFF_ROLES` (admin/supervisor).
- `multiplix`: **`permission: 'multiplix.dispatch.create'`** — quando a permissão existe, ela é o gate e o papel não é
  consultado (comentário explícito em `navigation.service.ts`, F25). Coberto por
  `src/services/__tests__/navigation.service.test.ts` e `src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx`.
- `settings`: sem `roles` — a própria `SettingsView` filtra as abas de sistema por `isStaff`.
- `security` e `privacy` (LGPD): `STAFF_ROLES`; dentro da Central, as abas administrativas exigem `admin`
  (`useUserRole().hasRole('admin')`).

### 4.2 Banco (RLS e grants) — resumo do que as migrations fixam

- **`talkx_campaigns`**: leitura por `authenticated`; INSERT/UPDATE/DELETE exigem `is_admin_or_supervisor(auth.uid())`
  (migration `20261002381230_talkx_role_gates.sql`, que também aplica o mesmo gate às RPCs
  `save_talkx_campaign_draft`, `replace_talkx_draft_recipients` e `update_talkx_campaign_limits` — 42501 para quem não
  tem papel — e recusa `scheduled` vindo de quem não tem papel em `enforce_talkx_campaign_mutability`, preservando
  `service_role`/`pg_cron` e o GUC `app.talkx_worker_write`).
- **`talkx_settings`**: `REVOKE ALL … FROM anon` na mesma migration (era `GRANT ALL` para `anon` desde
  `20260930410000`); `authenticated` continua lendo.
- **`talkx_blacklist`**: SELECT e INSERT liberados para `authenticated` (`USING (true)` / `WITH CHECK (true)`); o UPDATE
  é restrito pela policy `talkx_blacklist_update` (criada de forma idempotente na X014).
- **`talkx_link_clicks`**: leitura própria + ramo `admin`/`supervisor`.
- **`multiplix_dispatches`**: `Users can view own dispatches` / `Admins can view all dispatches` /
  `Users can create dispatches` / `Users can update own dispatches` / `Users can delete own draft dispatches`;
  `multiplix_recipients` idem (visionar/inserir/atualizar; excluir só de rascunho próprio); `multiplix_blocks` só em
  rascunho próprio; `multiplix_events` por disparo acessível; `multiplix_audiences`/`_members` próprio ou compartilhado.
- **`multiplix_voice_assets`/`_grants`**: leitura por grant (papel ou perfil); admin lê todos os grants.
- Migrações de endurecimento relevantes: `20260927130001` (policies de `public`→`authenticated`),
  `20260927210000` (hardening realtime + PII), `20260929570000`/`20260929580000`/`20260929590000` (grants, políticas e
  guarda de mutabilidade), `20260929850000` (revoga escrita de destinatários), `20260930300000` (guardas *fail-closed*),
  `20260930620000` (matriz de permissões por papel do Multiplix),
  `20261002381230` (gates por papel do Talk X), `20260924100000` (revoga grants anônimos de RPCs do Talk X).

### 4.3 Permissões nomeadas do Multiplix (catálogo)

`multiplix.dispatch.create`, `multiplix.dispatch.manage_all` (atribuída a `admin` na própria migration
`20260929640000_multiplix_dispatch_manage_all_permission.sql`; dono do disparo sempre pode operar o seu) e as cinco de
audiência: `multiplix.audience.suppliers`, `multiplix.audience.carriers`, `multiplix.audience.customers.own`,
`multiplix.audience.customers.all`, `multiplix.audience.admin` — inseridas em `permissions` **sem nenhuma linha em
`role_permissions`** na migration `20260926150000` (o próprio cabeçalho explica: a atribuição fica para quando
existirem contas reais de Compras/Logística/Comercial; até lá, `user_has_permission` devolve vazio e o acesso segue por
`is_admin()`).
**NÃO VERIFICADO:** o estado real dessas tabelas no banco canônico (não houve consulta a produção — regra R1).

### 4.4 Regras de operação verificadas no front

- **Só rascunho e campanha agendada podem ser editados** no Talk X — fora disso, toast de erro e a rota é normalizada
  para fora do wizard ("Somente rascunhos ou campanhas agendadas podem ser editados." / "Campanha não encontrada ou
  sem acesso.").
- **Iniciar disparo no Multiplix exige confirmação explícita** ("envia mensagens reais … sem volta") e, acima do teto
  de destinatários, confirmação adicional com o número real devolvido pelo servidor.
- **Reautenticação** para ações sensíveis de conta (configurar 2FA, alterar senha).
- **Download** só pelo caminho `useDownloadPermission` (`profiles.can_download`); a exportação de dados da LGPD está
  bloqueada (regra do dono).
- **Sem selo de canal/origem**: nada no front marca a mensagem/arquivo com o canal de origem.

---

## 5. Estados de erro e vazio

- **Talk X** — o kit de estados (`src/components/talkx/kit/states.tsx`) expõe `StateShell`,
  `TalkXEmptyState`, `TalkXFilteredEmptyState`, `TalkXErrorState`, `TalkXDataUnavailableState`,
  `TalkXCrmUnavailableState`, `TalkXWhatsAppDisconnectedState`, `TalkXNoPermissionState`, `TalkXSkeletonRows`,
  `TalkXNoData` e `TalkXQueryBoundary` (fronteira de erro de consulta). O `TalkXView` mostra esqueleto com
  `aria-busy` enquanto a campanha roteada resolve e as abas recebem `isLoading`/`isError`/`onRetry`.
  **NÃO VERIFICADO:** o mapeamento estado-a-estado de cada tela interna (não foi lido cada componente até o fim).
- **Multiplix** — erro da edge é traduzido do corpo (`error.context`) para erro nomeado
  (`MultiplixDispatchEdgeError` com códigos `multiplix_list_shape`, `multiplix_dispatch_not_found`,
  `multiplix_recipients_list_sem_total`) ou `MultiplixOverLimitError` (`multiplix_over_recipient_limit`) quando estoura
  o teto; a mensagem crua "Edge Function returned a non-2xx status code" não é mostrada. Vazio: "Nenhuma empresa
  encontrada para este filtro."; sem telefone de destino, o selo é "Sem WhatsApp"; destinatários truncados mostram o
  aviso de amostra; erro de busca aparece em texto `destructive`.
- **Notificações** — falha ao salvar preferência faz *rollback* do otimista, invalida a query e mostra
  **um** toast por rajada (mínimo de 5 s entre avisos); falha ao restaurar padrão devolve `false` e a tela **não**
  anuncia sucesso. Push: "Notificações Push Indisponíveis" (flag/ambiente), "Não Suportadas" (navegador) e
  "Permissão Negada" (com instrução para liberar no navegador).
- **Segurança** — se a leitura dos fatores 2FA falha, o nível aparece como "Indisponível" (nunca "Médio" por omissão)
  e o texto diz que não foi possível medir; geobloqueio avisa whitelist vazia; o alerta de segurança cai para toast
  quando o push não está disponível.
- **LGPD** — exportação bloqueada com toast de erro dedicado; falha ao registrar o pedido de exclusão mostra
  "Erro ao registrar solicitação" (e não confirma sucesso).

---

## 6. Limites e riscos conhecidos

**Limites (verificados no código):**

| Item | Limite |
|---|---|
| Talk X — intervalo entre envios | 3 s a 600 s (`talkxLimits.ts`); teto de banco `send_interval_max <= 86 400 000 ms` |
| Talk X — perfis de velocidade | `slow` 15–30 s · `moderate` 8–20 s · `fast` 3–8 s |
| Talk X — passo do rascunho | 1 a 4 (`draft_step`), `revision > 0` (controle otimista) |
| Talk X — lotes/tetos do motor | `TALKX_BATCH_SIZE`/`TALKX_BATCH_BUDGET_MS` (default lido do ambiente); tetos do scheduler: 10 campanhas e 1 retomada por conexão por tick; `daily_limit_per_connection=500` no seed |
| Multiplix — seleção | 500 empresas por disparo (limite do backend) |
| Multiplix — páginas | 50 empresas por página na busca; lista de disparos 50; destinatários 500 × 20 páginas = 10 000 (amostra rotulada); contagem por status 1000 |
| Volume de alertas | 10–100, passo 5 (banco + slider) |
| Volume de mídia | 0–100 (local do dispositivo), passo 5, default 80 |
| Dedupe de notificação | 2 min (`claimNotificationEvent`) |
| Pollings | campanhas sem realtime 15 s; monitor de disparo 5 s; lista de disparos 10 s; alertas de segurança 20 s |
| Talk X — conversões/link | corpo ≤ 4 KB, assinatura HMAC `v1`, janela ±5 min, esquema legado aceito até `2026-10-20` (default) |

**Riscos e pontos de atenção (o que eu consegui provar no repositório):**

1. **A proteção de tela é só cliente.** Ela intercepta atalhos, cópia, arraste, menu de contexto e aplica overlay ao
   perder foco, mas **não impede** captura por sistema operacional, câmera externa ou extensão. O ganho real é
   dissuasão + limpeza do clipboard.
2. **A exportação LGPD está bloqueada**, o que atende a regra permanente do dono ("nenhuma informação sai do sistema")
   e, na prática, **não atende o direito de portabilidade** previsto na própria tela. É uma decisão explícita do
   produto, não um defeito.
3. **Dois canais de volume separados por decisão** (alertas no banco por usuário; mídia em `localStorage` por
   dispositivo). Consequência: o volume de mídia não acompanha o usuário entre máquinas, e unificar os dois canais é
   justamente o que `mediaVolumeStore.ts` documenta como proibido.
4. **`default_speed_profile` do seed é `"balanced"`**, valor que **não** está entre os perfis usados pelo front
   (`slow|moderate|fast`) nem no CHECK de `talkx_campaigns.speed_profile`. O seed é o valor default da configuração
   `talkx_settings`; uma leitura ingênua desse valor em `TalkXSettings` mostraria um perfil inexistente.
   **NÃO VERIFICADO:** o que acontece hoje em produção se esse valor for aplicado a uma campanha.
5. **Permissões de audiência do Multiplix sem atribuição de papel** (migration `20260926150000`): quem entra hoje é
   `is_admin()`; a matriz papel→permissão é trabalho pendente por falta de contas reais.
6. **Push depende de flag e de navegador** (`PUSH_NOTIFICATIONS_ENABLED`, service worker, `PushManager`); sem isso a
   queda é para toast. A chave VAPID pública vive no código — é pública por natureza, mas exige revisão sempre que
   rotacionada.
7. **`security_alerts` sem realtime** (polling de 20 s) — alerta crítico pode levar até 20 s para chegar.
8. **Talk X lê `talkx_campaigns.select('*')`** e mantém a lista atualizada por UPDATE realtime com debounce de 500 ms;
   campanhas com muita movimentação de contadores chegam em rajada, agregadas por id (não se perde UPDATE de campanha
   diferente, mas há atraso de até 500 ms).
9. **Multiplix lê e escreve sempre pela edge** (a escrita direta foi revogada por migration): qualquer indisponibilidade
   das edges `multiplix-*` derruba busca, criação e monitor — não há caminho alternativo pelo PostgREST.
10. **Edição do Talk X limitada a rascunho/agendada** — campanha em envio não é editável, só pausável/cancelável.
11. **Rótulos de destino do Multiplix falam de "WhatsApp" no rótulo "Sem WhatsApp"** — é indicação de
    disponibilidade de telefone de destino, **não** selo de canal/origem do arquivo ou da mensagem.
12. **Módulos vizinhos fora deste documento:** Telefonia e E-mail têm documentos próprios; Inbox/Chat/Teams (Y19),
    Contatos/CRM/SalesView (Y20), Tarefas/Quadro/Dashboard/Analytics (Y21) e Catálogo/Filas/SLA/War Room (Y22) são
    cartões irmãos deste mesmo plano.

---

## 7. Testes existentes (caminhos)

**Talk X — componentes/kit (Vitest):** `src/components/talkx/__tests__/` —
`TalkX.test.tsx`, `TalkXAnalytics.hooks.test.tsx`, `TalkXAnalytics.rotulos.test.tsx`, `TalkXAnalytics.states.test.tsx`,
`TalkXCampaignRunning.janela-historico.test.tsx`, `TalkXCampaignRunning.limits.test.tsx`,
`TalkXCampaignRunning.remote-completion.test.tsx`, `TalkXCampaignRunning.states.test.tsx`,
`TalkXCampaignScheduled.states.test.tsx`, `TalkXConfirmDialog.test.tsx`, `TalkXLiveMonitor.states.test.tsx`,
`TalkXMessageEditor.test.tsx`, `TalkXOverview.states.test.tsx`, `TalkXPeriodo.semConsumidor.test.tsx`,
`TalkXSegments.builder.test.tsx`, `TalkXSegments.detailFresh.test.tsx`, `TalkXSegments.states.test.tsx`,
`TalkXSettings.states.test.tsx`, `TalkXSuppression.authoring.test.tsx`, `TalkXSuppression.contactSearch.test.tsx`,
`TalkXSuppression.states.test.tsx`, `TalkXTemplateEditor.race.test.tsx`, `TalkXTemplates.duplicarAtalho.test.tsx`,
`TalkXTemplates.states.test.tsx`, `TalkXView.route.test.tsx`, `talkxCampaignDraft.test.ts`, `talkxLimits.test.ts`,
`talkxMessageSnapshot.test.ts`, `talkxRunningHistory.test.ts`, `talkxSharedPersonalizePreview.test.ts`,
`talkxWizardRoute.test.ts`, `useCampaignEditor.test.tsx`; e `src/components/talkx/kit/__tests__/`
(`KpiCard`, `TalkXFilterBar`, `TalkXTable`, `barrel`, `states`, `talkxStates.matrix`, `useFilterState`).

**Talk X — hooks:** `src/hooks/integrations/__tests__/` — `useTalkX.realtime-debounce.test.tsx`,
`useTalkXInsights.defeito-223.test.tsx`, `useTalkXInsights.engajamento.test.tsx`, `useTalkXInsights.test.ts`,
`useTalkXMonitor.test.ts`, `useTalkXSegments.dia-calendario.test.ts`, `useTalkXSegments.test.ts`.

**Multiplix:** `src/components/multiplix/__tests__/MultiplixMonitor.recipients.test.tsx`,
`src/hooks/integrations/__tests__/useMultiplixDispatches.criacao.test.tsx`,
`src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx`,
`src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx`; contratos
`tests/contracts/multiplix-audience.contract.test.ts`, `multiplix-dispatch-domain-api.contract.test.ts`,
`multiplix-dispatch-no-secret-leak.contract.test.ts`, `multiplix-dispatch-write-path.contract.test.ts`.

**Configurações:** `src/components/settings/__tests__/SettingsView.test.tsx`, `SoundCustomizationPanel.test.tsx`,
`KeyboardShortcutsSettings.test.tsx`, `GlobalSettingsSection.sem-consumidor.test.tsx`,
`IntegrationKeysSection.sem-consumidor.test.tsx`, `SLAConfigurationManager.test.tsx`, `SLARulesManager.test.tsx`,
`CSATAutoConfig.test.tsx`, `SkillBasedRoutingSettings.test.tsx`, `ThemeCustomizer.test.tsx`, `MediaLibraryAdmin*.test.tsx`,
`src/hooks/__tests__/useUserSettings.test.tsx`, `useGlobalSettings.test.tsx`, `useGlobalSettings.zero-linhas.test.tsx`.

**Notificações e volumes:** `src/components/notifications/__tests__/` (`NotificationItem`,
`NotificationSettingsPanel.restaurar`, `SoundVolumeControl`); `src/hooks/__tests__/` (`useNotificationSettings`,
`useNotifications`, `usePushNotifications`, `useRealtimeNotifications.behavior`, `useSLANotifications.behavior`,
`useGoalNotifications`, `useTranscriptionNotifications(.behavior)`, `useTeamChatNotifications.behavior`,
`useTeamChatNotifications.global`, `useVolumeRocker`); `src/lib/__tests__/` (`mediaVolumeStore`, `mediaVolumeElement`,
`notificationDedupe`); `src/utils/__tests__/notificationSounds.test.ts`, `securityAlertSound.asset.test.ts`;
`src/hooks/communication/__tests__/useAudioMemes.mediaVolumeBindings.test.tsx`,
`useTextToSpeech.mediaVolumeBindings.test.tsx`; `src/components/inbox/__tests__/MediaVolume.test.tsx`; contratos
`tests/contracts/media-volume-surfaces.contract.test.ts`, `notification-sound-persistence.contract.test.ts`,
`alert-sound-persistence.contract.test.ts`, `notification-events.contract.test.ts`,
`sentiment-alert-security.contract.test.ts`.

**Segurança / download / LGPD:** `src/hooks/__tests__/useScreenProtection.test.tsx`,
`src/hooks/__tests__/useDownloadPermission.test.ts`,
`src/components/inbox/__tests__/DocumentPreviewDownloadPermission.r2-inb-031.test.tsx`,
`src/components/inbox/__tests__/ImagePreviewDownload.test.tsx`, `src/components/inbox/__tests__/ImagePreviewSize.test.tsx`,
`src/components/admin/__tests__/adminDownloadPermission.test.ts`, `src/components/catalog/__tests__/CT39_downloadFotos.test.tsx`,
`src/components/compliance/__tests__/LGPDComplianceView.test.tsx`,
`src/components/security/__tests__/` (`SecurityOverview.medicao`, `SecuritySettingsPanel.medicao`,
`AuditLogDashboard(.hoje-local)`, `RateLimitConfigPanel`, `MfaAdminNudge`, `rate-limit-alert-sound`),
`src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts`, `src/__tests__/security-and-performance.test.ts`.

**E2E (Playwright, `e2e/`):** `talkx.spec.ts`, `talkx-launch.spec.ts`, `talkx-visual.spec.ts`, `talkx-demo.spec.ts`,
`media-volume.spec.ts`, `a11y-contraste.spec.ts`. **Contratos de acessibilidade/containers:**
`tests/contracts/axe-talkx.contract.test.ts`, `axe-configuracoes.contract.test.ts`.

---

## 8. Arquivos-chave com caminhos

**Talk X**
- Entrada/telas: `src/components/talkx/TalkXView.tsx`, `TalkXOverview.tsx`, `TalkXCampaignWizard.tsx`,
  `TalkXWizardDelivery.tsx`, `TalkXCampaignRunning.tsx`, `TalkXCampaignScheduled.tsx`, `TalkXLiveMonitor.tsx`,
  `TalkXSegments.tsx`, `TalkXTemplates.tsx`, `TalkXTemplateEditor.tsx`, `TalkXSuppression.tsx`, `TalkXAnalytics.tsx`,
  `TalkXSettings.tsx`, `TalkXContactSelector.tsx`, `TalkXMessageEditor.tsx`, `TalkXHelp.tsx`.
- Motor de UI/rotas: `useCampaignEditor.ts`, `talkxWizardRoute.ts`, `talkxTabRoute.ts`, `talkxCampaignDraft.ts`,
  `talkxMessageSnapshot.ts`, `talkxRunningHistory.ts`, `talkxLimits.ts`, `talkxShared.ts`, `kit/` (constantes, estados,
  tabela, filtros, períodos, KPI, prévia, rail, diálogos).
- Hooks: `src/hooks/integrations/useTalkX.ts`, `useTalkXSegments.ts`, `useTalkXTemplates.ts`, `useTalkXSettings.ts`,
  `useTalkXSuppression.ts`, `useTalkXInsights.ts`, `useTalkXMonitor.ts`, `useTalkXEvents.ts`,
  `useTalkXConnectionStatus.ts`, `useTalkXCommandItems.ts`.
- Edge: `supabase/functions/talkx-send/index.ts`, `talkx-scheduler/index.ts`, `talkx-report/index.ts`, `talkx-link/index.ts`.

**Multiplix**
- `src/components/multiplix/MultiplixView.tsx`, `MultiplixComposerDialog.tsx`, `MultiplixMonitor.tsx`;
  `src/hooks/integrations/useMultiplixAudience.ts`, `useMultiplixDispatches.ts`;
  `src/lib/multiplix-eligibility.ts` (reexporta o canônico `supabase/functions/_shared/multiplix-eligibility.ts`);
  `src/pages/ViewRouter.tsx` + `src/pages/lazyViews.ts` (gate e lazy load); `src/services/navigation.service.ts`.
- Edge: `supabase/functions/multiplix-audience/index.ts`, `multiplix-dispatch/index.ts` (+ `actions/`),
  `multiplix-send/index.ts`, `multiplix-voices/index.ts`.

**Configurações**
- `src/components/settings/SettingsView.tsx` e demais arquivos de `src/components/settings/**`
  (`ScheduleSettings`, `MessagesSettings`, `AutomationSettings`, `GlobalSettingsSection`, `IntegrationKeysSection`,
  `FollowUpSequences`, `MediaLibraryAdmin`, `AIAutoTagsConfig`, `CSATAutoConfig`, `ChatbotL1Config`,
  `SkillBasedRoutingSettings`, `AIProvidersManager`, `AppearanceSettings`, `KeyboardShortcutsSettings`,
  `SoundCustomizationPanel`, `ThemeCustomizer`, `sla/*`, `media-library/*`, `theme/*`);
  `src/hooks/system/useUserSettings.ts`, `useGlobalSettings.ts`.

**Notificações**
- `src/components/notifications/**` (`NotificationSettingsPanel`, `NotificationTypeCards`, `PushNotificationCard`,
  `PushNotificationToggle`, `NotificationsPopover`, `NotificationItem`, `ReminderNotification`, `SoundVolumeControl`,
  `ScreenProtectionToggle`, `SLANotificationProvider`, `GoalNotificationProvider`, `RealtimeSentimentAlertProvider`).
- `src/components/ui/VolumeSliderPopoverContent.tsx`, `VolumeTriggerButton.tsx`; `src/components/layout/MediaVolumeToggle.tsx`;
  `src/components/inbox/MediaVolumeControl.tsx`, `QueuePositionNotifier.tsx`; `src/components/mobile/`
  (`InAppNotification(Provider)`, `NotificationsPanel`); `src/components/team-chat/TeamChatNotificationsListener.tsx`.
- Hooks/módulos: `src/hooks/system/useNotificationSettings.ts`, `useNotifications.ts`, `usePushNotifications.ts`,
  `useSecurityPushNotifications.ts`; `src/hooks/realtime/useRealtimeNotifications.ts`;
  `src/hooks/communication/useMediaVolume.ts`, `useMediaElementVolume.ts`, `useTranscriptionNotifications.ts`;
  `src/hooks/ui/useVolumeRocker.ts`, `src/hooks/sla/useSLANotifications.ts`, `src/hooks/analytics/useGoalNotifications.ts`,
  `src/hooks/chat/useTeamChatNotifications.ts`, `src/hooks/tasks/useWorkItemNotifications.ts`,
  `src/lib/mediaVolumeStore.ts`, `src/lib/mediaVolumeElement.ts`, `src/lib/notificationDedupe.ts`, `src/lib/volumeLabels.ts`,
  `src/utils/notificationSounds.ts` (+ `soundConfigs`).

**Segurança**
- `src/components/security/**` (`SecurityView`, `SecuritySettingsPanel`, `SecurityOverview`, `DevicesPanel`,
  `PasskeysPanel`, `SecurityNotificationsPanel`, `BlockedIPsPanel`, `IPWhitelistPanel`, `GeoBlockingPanel`,
  `PasswordResetRequestsPanel`, `RateLimitRealtimeAlerts`, `RateLimitConfigPanel`, `AuditLogDashboard`, `QuarantinePanel`),
  `src/hooks/system/useGeoBlocking.ts`, `useDownloadPermission.ts`, `useUserRole.ts`,
  `src/hooks/ui/useScreenProtection.ts`, `src/components/auth/ProtectedRoute.tsx`, `ReauthDialog.tsx`,
  `src/components/compliance/LGPDComplianceView.tsx`, `src/components/mfa/MFASettings.tsx`, `src/App.tsx` (monta a
  proteção de tela), `src/components/layout/Sidebar.tsx` (toggle da proteção).

---

## 9. Planos relacionados (07/10 e base)

- `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md` — **este documento é o Y23** (§3.4);
  os mesmos 29 cartões incluem **Y15** (auditoria A11Y/celular de Telefonia, E-mail, Multiplix e Talk X),
  **Y18** (Configurações, Administração, Notificações e estrutura geral), **Y05** (testes de Talk X, Multiplix e banco
  externo), **Y06** (testes de diagnóstico, notificações de segurança e bloqueio geográfico) e **Y28** (segurança em
  leitura do front-end).
- `docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md` — controles de volume (alto-falante e fone) na
  sidebar, exatamente o `SoundVolumeControl`/`MediaVolumeControl` descritos em §2.4.
- `docs/plans/PLANO_AUDIO_PLAY_NO_CARTAO_6_ETAPAS_2026-10-07.md` — play/pause direto no cartão de áudio (aba Arquivos),
  que consome o mesmo volume de mídia (`useMediaVolume`).
- `docs/plans/PLANO_CONSISTENCIA_DESIGN_SISTEMA_2026-10-07.md` — consistência de cores/tokens e dicas de UI; decisão do
  dono de manter as cores atuais (mesma regra permanente aplicada aqui).
- Base anterior ainda vigente: `docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md`,
  `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md` e
  `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`.

---

**Fechamento:** tudo neste documento foi conferido no código do workspace do cartão (branch
`v2/y23-documentacao-multiplix-talkx-config--2610071705e051`, base `dia/2026-10-07`) e no catálogo
`supabase/schema-catalog.json`. O que não pôde ser provado está marcado **NÃO VERIFICADO** (§1, §2.1, §4.3, §6-4);
nenhuma consulta a banco de produção foi feita.
