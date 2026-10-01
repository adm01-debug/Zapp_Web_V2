# Talk X · Campanhas — Plano V3: 100 etapas para finalizar a implantação

**Gerado:** 2026-09-29 · **Base:** `main` `a0002bb` · **Origem:** [`AUDITORIA_PLANO_TALKX_2026-09-29.md`](./AUDITORIA_PLANO_TALKX_2026-09-29.md)
**Substitui:** `PLANO_IMPLEMENTACAO_TALKX_100.md` (E01–E100) como plano de execução. O
`PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md` continua valendo como **critério de aceite** (DoD, gates, contrato de
evidência) — este plano diz *o que* falta; aquele diz *como provar* que ficou pronto.

---

## Regras (herdadas, não negociáveis)

1. **Carvão fica.** Só `--background`, `--card`, `--card-elevated`, `--border`, `--input`. Azul = acento.
2. **Zero número fabricado.** Métrica sem fonte → componente não renderiza. A auditoria achou 7 casos; V08 remove todos.
3. **Diff mínimo.** Estender com props; não renomear/mover o que funciona.
4. **Gate por etapa:** `tsc` 0 · `eslint` 0 no escopo · `vitest` verde · lint-ratchet 0 novas · testes Deno da edge tocada.
5. **Fluxo Git do `CLAUDE.md`/preferências:** branch `claude/<tipo>-talkx-v<NN>-<slug>-<AAMMDD-HHMM>` a partir de `main`, 1 etapa = 1 PR. DDL: arquivo → PR → merge → `register-migration.mjs` → apply via `db_query` + ledger na mesma transação → `supabase-usage-guard` `novas: 0`. Edge function só está em produção após `deploy-functions.yml` disparado **e** aprovado.
6. **Toda etapa nasce com "Hoje"** (o que a auditoria viu) **e "Aceite"** (o que prova que fechou). Sem os dois, não é etapa.
7. **Nada de ✅ herdado.** `PARIDADE.md` será regenerado a partir de evidência (V96), não editado à mão.
8. **Escrita no GitHub:** `GITHUB - MCP - FOREVER`. **Banco:** `SUPABASE - ZAPP WEB V2 - MCP` (`tnnnlkbymytvtqngbbqh`). Nunca os outros.

## Mapa de fases

| Fase | Etapas | Entrega | Bloqueia |
|---|---|---|---|
| 0 · Produção segura | V01–V10 | P0/P1 corrigidos, drifts reconciliados, E2E verde | tudo |
| 1 · Integridade do motor | V11–V20 | eventos do servidor, pausa/retomada/cancel corretos, entregues/lidas/respostas completas, retry | Fase 3 |
| 2 · Wizard e lançamento | V21–V30 | flags, filtros reais, editor único, mídia, recorrência | Fase 3, 7 |
| 3 · Ciclo de vida (telas 10–14) | V31–V40 | Agendada completa, Monitor real, **Pausada** e **Relatório** criados, export | gate visual G |
| 4 · Visão geral e design system | V41–V50 | KPIs por RPC, tabela/ações/grade completas, deep links, motion, estados | gate visual G |
| 5 · Segmentos (02/03) | V51–V60 | builder extraído, versões, sobreposição, prévia, tags | gate H |
| 6 · Templates (04/05) | V61–V70 | preview real, import/export, variáveis, versões, testes, A/B, benchmarks | gate H |
| 7 · Supressão (06) | V71–V80 | hook único, importar, motivos, opt-out configurável, trilha, funil | gate I |
| 8 · Links, insights, settings, CRM, importação (15) | V81–V90 | links com UI, conversões seguras, settings vivas, alertas, importação + CRM 360 | gate I |
| 9 · Ajuda, estados, QA, release (16/17) | V91–V100 | ajuda real, modais padronizados, a11y/perf, E2E completo, docs verdadeiras, release honesta | fim |

Sequência: numérica. Fases 4–6 podem correr em paralelo com 3 por sessões distintas **desde que** não toquem os
mesmos arquivos (`talkxShared.tsx` é o ponto de colisão — quem mexer nele abre PR pequeno e mergeia primeiro).

---

# FASE 0 — PRODUÇÃO SEGURA (V01–V10)

### V01 · Fechar o vazamento da view `talkx_campaign_metrics` (P0-1)
**Hoje:** view sem `security_invoker`, owner `postgres` (a migration `20260922130000` sobrescreveu o fix de `20260916170000`). Qualquer autenticado lê métricas e nomes de campanhas alheias.
**Fazer:** migration `ALTER VIEW public.talkx_campaign_metrics SET (security_invoker = true)`; teste SQL em `scripts/db-audit/talkx-metrics-view-invoker.test.sh` que falha se `reloptions` não contiver `security_invoker=true`; adicionar a verificação ao `db-live-guard` (paridade de grants já existe — estender).
**Aceite:** `pg_class.reloptions` ao vivo = `{security_invoker=true}`; `useTalkXInsights` (que lê a view) continua funcionando para o próprio usuário; guard verde.

### V02 · Eliminar a ambiguidade de `transition_talkx_campaign` (P1-1)
**Hoje:** 2 overloads ao vivo; `talkx-send` chama com 2 args em 5 pontos; testes mockam a RPC.
**Fazer:** migration `DROP FUNCTION public.transition_talkx_campaign(uuid, text)` (manter a de 3 args com default); teste Deno de integração **sem mock** contra PostgREST de staging/local (`supabase start`) cobrindo `start`, `pause`, `cancel`; conferir também se `status='scheduled'` está no CHECK de `talkx_campaigns` (o front grava esse valor e o CHECK ao vivo lista só 5 status) — se não estiver, incluir na mesma migration.
**Aceite:** `select count(*) from pg_proc where proname='transition_talkx_campaign'` = 1; chamada real via `/rest/v1/rpc/transition_talkx_campaign` com 2 args responde 200; campanha de teste interna passa `draft → sending → paused → sending → cancelled`.

### V03 · Scheduler só retoma pausas automáticas (P1-2)
**Hoje:** `talkx-scheduler/index.ts:43-58` retoma qualquer `paused` com janela, ignorando `pause_reason`; as auto-pausas do `talkx-send` (janela/horário) não gravam motivo.
**Fazer:** `talkx-send` grava `pause_reason in ('send_window','business_hours','connection_lost')` ao pausar sozinho (`index.ts:407-416,587-590,763`); scheduler filtra `.in('pause_reason', ['send_window','business_hours'])` e, para `connection_lost`, só retoma se `whatsapp_connections.status='connected'` (emite evento `resumed_auto` — depende de V11); pausa manual (`pause_reason` null ou texto do usuário) nunca é retomada.
**Aceite:** teste Deno do scheduler com 3 campanhas pausadas (manual, janela, conexão) → só as 2 automáticas elegíveis retomam; deploy aprovado.

### V04 · Corrigir FK `blocked_by`/`removed_by` e padronizar autoria (P1-4)
**Hoje:** `TalkXSuppression.tsx:101-103` grava `auth.uid()` em coluna que referencia `profiles(id)`; 0 dos 6 perfis tem `id = user_id`. Outros hooks usam `profile.id` (correto).
**Fazer:** usar `useAuth().profile.id` no insert; grep `supabase.auth.getUser()` em `src/components/talkx` e `src/hooks/integrations/useTalkX*` → 0 usos para autoria; teste unitário do mutation.
**Aceite:** inclusão manual funciona em produção (1 registro de teste interno criado e removido); grep = 0.

### V05 · Reconciliar os drifts de `talkx_blacklist`
**Hoje:** CHECK com `'auto_optout'` e índice `talkx_blacklist_phone_active_unique` existem só no banco (0 migrations, 0 ledger).
**Fazer:** `SELECT supabase_migrations.reserve_migration_version(...)`; migration com o SQL exato lido do banco (`pg_get_constraintdef`, `pg_indexes`) em forma idempotente (`DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT …`; `CREATE UNIQUE INDEX IF NOT EXISTS …`); registrar no ledger com `statements` reais via `register-migration.mjs --apply`; regenerar `schema-catalog.json`/manifesto; corrigir `PARIDADE.md:136,138,149` (V96 regenera, mas o drift some agora).
**Aceite:** `check-migration-drift.mjs` limpo; `db-live-guard` sem "migrations vs ledger" para talkx; `supabase-usage-guard` `novas: 0`.

### V06 · Migrations replayáveis + policy de UPDATE em `talkx_settings` (P2-6, P1-6)
**Hoje:** `20260916230000:14` usa `CREATE POLICY IF NOT EXISTS` (inválido no Postgres); `20260927500001`/`570000` duplicam `ALTER PUBLICATION`; `talkx_settings` só tem SELECT → save não persiste.
**Fazer:** não editar migrations aplicadas (o guard rejeita); migration nova: `DO $$ … IF NOT EXISTS (select 1 from pg_policies …) THEN CREATE POLICY … END IF $$` para a policy existente + `CREATE POLICY talkx_settings_admin_write ON talkx_settings FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()))`; marcar as 2 migrations de publicação como `pinned-replay` documentado em `migration-evidence.json` **ou** substituir por `DO` idempotente em migration nova + `supabase db reset` local verde (`scripts/db-audit/*.test.sh` já sobem PG17 descartável — reaproveitar).
**Aceite:** `supabase db reset` local aplica as 45+ migrations sem erro; `useTalkXSettings` salva e relê valor alterado.
**✅ FEITO 2026-10-01:** `TalkXSettings` montado na aba "Configurações" (`TalkXView.tsx:270,307-309`) e salva/relê via `useTalkXSettings.ts:36-44` (policy `talkx_settings_admin_write` já no banco). **PENDENTE (bloqueado pela guarda):** o dedup do `ALTER PUBLICATION` exige editar `20260927570000`, que a guarda "Rejeitar edição de migration já existente" bloqueia (sem exceção para `safer-replay`); decisão registrada para o Joaquim.

### V07 · Unicidade parcial na supressão (P2-1)
**Hoje:** `UNIQUE(contact_id)` total; soft-delete impede re-supressão; opt-out repetido vira `console.warn`.
**Fazer:** migration: `DROP CONSTRAINT talkx_blacklist_contact_id_key`; `CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique ON talkx_blacklist(contact_id) WHERE contact_id IS NOT NULL AND removed_at IS NULL`; revisar `talkx_recipient_is_suppressed` (já filtra `removed_at`) e o webhook (`ON CONFLICT` → `on conflict (contact_id) where removed_at is null do nothing`); teste SQL: adicionar → remover → adicionar de novo = 2 linhas, 1 ativa.
**Aceite:** teste em `scripts/db-audit/talkx-blacklist-policy-forward-only.test.sh` estendido; catálogo atualizado.

### V08 · Remover todo número fabricado e confirmações que não bloqueiam (P1-5)
**Hoje:** delta `↑N%` (`TalkXOverview.tsx:123`); "3× conversão" (`:313`); "2,3× conversões" (`TalkXSegments.tsx:175-178`); "Conexão WA: Conectada" (`TalkXLiveMonitor.tsx:164`); "Desempenho" falso (`TalkXSegments.tsx:138`); "Mais convertidos" por uso (`TalkXTemplates.tsx:147`); "Conversão por segmento" = envio (`TalkXAnalytics.tsx:69-88`); `TalkXConfirmDialog` sem `disabled` real (`talkxShared.tsx:847`).
**Fazer:** remover/renomear cada um (delta some; TipCard vira texto sem número; "Sugestão de IA" sai; "Conectada" passa a ler `whatsapp_connections.status`; "Desempenho" some até V60; "Mais usados"; "Envios por segmento"); `TalkXPrimaryButton` ganha `disabled` e o dialog passa `disabled={!allChecked || loading}`; teste: com check pendente, `onConfirm` não é chamado.
**Aceite:** `talkx-analytics-contract.test.mjs` estendido com os 7 casos (falha se voltar); vitest verde.
**✅ FEITO 2026-10-01:** "Sugestão de IA" removida (`TalkXSegments.tsx`); `disabled={!allChecked || loading}` no dialog; teste de render `TalkXConfirmDialog.test.tsx` prova que `onConfirm` não dispara com check pendente (red-first).

### V09 · "Editar limites" via RPC (P1-3)
**Hoje:** modal em `TalkXCampaignRunning.tsx:721-774` chama `updateCampaign` → trigger nega em `sending/paused`.
**Fazer:** RPC `update_talkx_campaign_limits(p_campaign_id, p_expected_revision, p_limits jsonb)` `SECURITY DEFINER` com whitelist (`speed_profile`, `send_interval_min/max`, `typing_delay_min/max`, `send_window_start/end`, `business_hours_only`), validação `min<max`/janela, incrementa `revision`, grava evento `limits_updated` com diff (depende de V11), `REVOKE` de `anon`; front usa a RPC; `talkx-send` já relê a cada envio (`index.ts:402-408`).
**Aceite:** teste SQL de transição + teste Deno; salvar limites em campanha `sending` funciona e o próximo lote usa os novos valores (log).
**✅ FEITO 2026-10-01:** `randomBetween` exportada (`talkx-send/index.ts`) + teste Deno de limites em `talkx-send/index.test.ts` (31 testes verdes, red-first).

### V10 · E2E `talkx.spec.ts:160` verde e rodando em PR (P1-7)
**Hoje:** "wizard advances to step 2" falha nos 3 browsers (`locator.click` timeout na conexão/segmento); suíte só roda pós-merge.
**Fazer:** reproduzir com `bun run test:e2e -- talkx` contra staging; causa provável: fixture `E2E_TALKX_CONNECTION_LABEL`/`E2E_TALKX_SEGMENT_REGEX` não bate com o combobox/segmento real (checar seed `e2e0e2e0-…`, o segmento `621521f3-…` e `.nth(1)`); corrigir seletor ou seed; adicionar `paths` filter em `e2e-logado.yml` para `src/components/talkx/**`, `src/hooks/integrations/useTalkX*`, `supabase/functions/talkx-*` em `pull_request` (job separado, não required ainda).
**Aceite:** run verde nos 3 browsers na `main` e em PR de teste.
**✅ FEITO 2026-10-01:** e2e-logado verde nos 3 browsers (run `36860466950`, 6m30s, main); decisão de não rodar em PR já documentada no header do `e2e-logado.yml` (sem `pull_request` — secrets de QA só pós-merge, `check-pr-workflow-secrets.mjs`).

---

# FASE 1 — INTEGRIDADE DO MOTOR (V11–V20)

### V11 · Ampliar o contrato de eventos
**Hoje:** CHECK com 9 tipos; `campaign_id NOT NULL`; eventos gravados só pelo cliente.
**Fazer:** migration: novos tipos `scheduled_updated, limits_updated, connection_failed, resumed_auto, skipped_suppressed, suppression_add, suppression_remove, suppression_update, segments_reviewed, checklist`; `campaign_id` nullable + coluna `entity_type text`/`entity_id uuid` para eventos de supressão; índice `(campaign_id, created_at desc)` já existe (E86). Atualizar `useTalkXEvents.ts` e `RECIPIENT/CAMPAIGN_STATUS`.
**Aceite:** insert de cada tipo aceito; catálogo/types atualizados; `talkx-navigation-contract` verde.

### V12 · Servidor grava os eventos do ciclo de vida
**Hoje:** `talkx-send`/`scheduler` não gravam `started/paused/resumed/cancelled/completed`; timeline depende do cliente (Running e lista pausam sem evento).
**Fazer:** dentro de `transition_talkx_campaign` (RPC) inserir o evento com `actor_id` (perfil do JWT ou `null` para worker) e `message` (motivo); `complete_talkx_campaign_if_drained` grava `completed`; remover os inserts duplicados do cliente (`TalkXLiveMonitor.tsx:223-231`, `useCampaignEditor.ts:574-584`).
**Aceite:** teste SQL: sequência start→pause→resume→cancel gera 4 eventos com ator; Running/Monitor/lista mostram a mesma timeline.
**✅ FEITO 2026-10-01:** migration `20260930570000_talkx_v12_server_lifecycle_events.sql` (transition 4-arg com `p_actor_id`/`p_pause_reason` + eventos started/resumed/paused/cancelled/completed, DROP do overload 3-arg); `logEvent` do cliente removido (Monitor/Editor); harness `scripts/db-audit/talkx-v12-lifecycle-events.test.sh` verde (red-first, 4 eventos com ator).

### V13 · Pausa com motivo, retomada idempotente
**Hoje:** action `pause` não repassa `reason` (`talkx-send/index.ts:218-222`); `resume` em `sending` = 409; modal sem textarea.
**Fazer:** `pause` aceita `{reason}` → `p_pause_reason`; `resume` em `sending` retorna 200 `{noop:true}`; modais de pausa (Overview, Monitor, Running) com textarea opcional; `pause_reason`/`paused_at` na interface `TalkXCampaign`.
**Aceite:** teste Deno: pause com motivo grava `pause_reason`; resume duplo não erra; UI mostra "Pausada por <ator>: <motivo>".
**✅ FEITO 2026-10-01:** `pause` repassa `reason`→`p_pause_reason` (`talkx-send/index.ts`, `useTalkX.ts` `pauseCampaign(campaignId, reason?)`); `resume` em `sending` vira no-op **no RPC** (migration V12) — não na edge (teste Deno mocka 'sending' p/ dispatch); modais com textarea em `TalkXCampaignRunning.tsx`/`TalkXLiveMonitor.tsx`; harness V12 prova resume-em-sending=noop.

### V14 · Cancelar marca pendentes e estados terminais consistentes
**Hoje:** `cancel` não toca destinatários; status `cancelled` de recipient não existe.
**Fazer:** migration: `talkx_recipients.status` ganha `cancelled`; `transition_talkx_campaign('cancel')` faz `update talkx_recipients set status='cancelled' where status='pending'` na mesma transação; `RECIPIENT_STATUS` + pill; relatório (V37) mostra "Cancelados".
**Aceite:** teste SQL com 5 pendentes → 5 `cancelled`; `complete_talkx_campaign_if_drained` não vira `completed` uma campanha cancelada.
**✅ FEITO 2026-10-01:** migration V12 (seção V14) adiciona `cancelled` à CHECK de `talkx_recipients.status` + `update pending→cancelled` no `cancel` (mesma transação); `RECIPIENT_STATUS.cancelled` (tone muted) em `talkxShared.tsx`; harness V12 (seed 5 pendentes → 5 cancelled).

### V15 · Contadores íntegros: `replied_count` protegido, `use_count` único (P2-7, P2-4)
**Fazer:** migration adiciona `replied_count` ao guard de `enforce_talkx_campaign_mutability`; remover chamadas de `increment_talkx_template_use` do front (`useCampaignEditor.ts:572`, `useTalkXTemplates.ts:151`) — o trigger E86 basta; `DROP FUNCTION increment_talkx_template_use` + `REVOKE`.
**Aceite:** update direto de `replied_count` como authenticated → erro; lançar campanha com template incrementa `use_count` exatamente 1.
**✅ FEITO 2026-10-01:** migration `20260930590000_talkx_v15_replied_count_guard_and_drop_increment.sql` (guard `replied_count` 42501 + DROP `increment_talkx_template_use`); front sem `registerUse` (`useCampaignEditor.ts`/`useTalkXTemplates.ts`); harness `scripts/db-audit/talkx-v15-replied-count-guard.test.sh` verde (red-first).

### V16 · Séries temporais contam `sent` + `delivered` (P2-5)
**Fazer:** `talkx_campaign_report` CTE `hourly` e `TalkXAnalytics.tsx:96` usam `status in ('sent','delivered')` (ou `sent_at is not null`); série diária fixa em 7 dias em `talkx_overview_stats`; `contacts_reached` = `count(distinct contact_id)`.
**Aceite:** teste SQL com 3 sent + 2 delivered → série = 5; contract test atualizado.
**✅ FEITO 2026-10-01:** migration `20260930600000_talkx_v16_time_series_sent_delivered.sql` (hourly `status in ('sent','delivered')` + `count(distinct contact_id)` + zero-fill diário); `TalkXAnalytics.tsx` trocou `.eq('status','sent')`→`.in('status',['sent','delivered'])` (2 pontos); harness `talkx-v16-time-series.test.sh` verde (3+2=5).

### V17 · Lidas reais (`read_at`) e KPI liberado
**Hoje:** `read_at` não existe; READ só atualiza `messages`; contract test força "Lidas" = `null`.
**Fazer:** migration `talkx_recipients add read_at timestamptz` + índice; `record_talkx_recipient_delivered` ganha `p_event ('delivered'|'read')`; webhook `READ/PLAYED` chama a RPC; `talkx_campaign_report` e Analytics expõem `read_count`; **inverter** o contract test (Lidas ≠ null quando há `read_at`).
**Aceite:** teste Deno com webhook sintético READ → `read_at` preenchido; KPI "Lidas" aparece com número real.
**✅ FEITO 2026-10-01:** migration `20260930610000_talkx_v17_read_at.sql` (`read_at`+índice, RPC `p_event ('delivered'|'read')`, `read_count` no report); webhook READ/PLAYED chama a RPC (`evolution-webhook-msg-handlers.ts`); contract test invertido (Lidas=`stats.read`, reported=true); harness `talkx-v17-read-at.test.sh` verde (read_at+read_count idempotente, red-first).

### V18 · Respostas: janela configurável, tempo médio, sem recálculo no cliente
**Hoje:** 72h fixo em `talkx-reply.ts:13`; Analytics recalcula com 24h/limite 5000.
**Fazer:** `attributeTalkXReply` lê `talkx_settings.reply_window_hours` (cache 5 min); RPC de relatório devolve `avg(replied_at - sent_at)`; Analytics/Monitor/Running usam `replied_count`/RPC.
**Aceite:** alterar setting para 48h muda a atribuição no teste Deno; Analytics sem `.from('talkx_recipients')` para respostas.
**✅ FEITO 2026-10-01:** `attributeTalkXReply` lê `talkx_settings.reply_window_hours` (cache 5 min, default 72h — `talkx-reply.ts`); report devolve `avg_reply_secs` (`avg(replied_at-sent_at)` na migration V16); Analytics usa `replied_count` (sem re-query de `talkx_recipients`/`messages`, sem janela 24h fixa); teste Deno `_shared/__tests__/talkx-reply-window.test.ts` (48h vs 72h) + contract test 8/8.

### V19 · Retry manual, política de `outcome_unknown` e eventos de conexão
**Hoje:** 5xx/timeout → `outcome_unknown` sem retry; sem action `retry`; sem `connection_failed`; Logger sem `recipient_id/attempt`.
**Fazer:** action `retry {recipientId}` (só `failed`/`outcome_unknown`, respeita `attempt_count` ≤ 3, revalida supressão, gera nova tentativa via `reschedule_talkx_recipient`); perda de conexão mid-loop grava `pause_reason='connection_lost'` + evento `connection_failed`; scheduler emite `resumed_auto` (V03); Logger com `campaign_id, recipient_id, attempt`; documentar em `OPERACAO.md` que `outcome_unknown` exige decisão humana (não reenvio cego).
**Aceite:** teste Deno 500→retry manual→200; timeline mostra "Falha de conexão".

### V20 · Limite diário por conexão e horário comercial configurável
**Hoje:** `daily_limit_per_connection` e `business_hours` semeados mas nunca lidos; 08–18 seg–sex fixo em `talkx-window.ts:82` e no front.
**Fazer:** `talkx-send` conta `sent_at::date = today` por `whatsapp_connection_id` e pausa com `pause_reason='daily_limit'` (scheduler retoma no dia seguinte — V03); `deliveryWindowStatus` lê `talkx_settings.business_hours`; front exibe o mesmo (via `useTalkXSettings`).
**Aceite:** teste Deno: limite 3 → 4º envio pausa; mudar `business_hours` muda `allowed`.

---

# FASE 2 — WIZARD E LANÇAMENTO (V21–V30)

### V21 · Flags de lançamento persistidas
**Fazer:** migration `talkx_campaigns add respect_suppression bool not null default true, confirm_consent bool not null default false, launched_by uuid references profiles(id), launched_at timestamptz`; `save_talkx_campaign_draft` aceita as flags; `launch()` grava `launched_by/at` via `transition_talkx_campaign`; checks do passo 3 gravam `respect_suppression`; `respect_suppression=false` só admin + confirmação; KPI "Campanhas protegidas" (V72) passa a ter fonte.
**Aceite:** hidratação restaura as flags; agente não consegue desmarcar.

### V22 · Botões "Editar" da revisão respeitam a rota
**Hoje:** `ed.setStep` (`TalkXWizardDelivery.tsx:154`) é revertido pelo efeito de rota (`TalkXCampaignWizard.tsx:74-79`).
**Fazer:** "Editar" chama o navegador de rota (`talkxWizardRoute`) com `step=N`; teste em `TalkXView.route.test.tsx`.
**Aceite:** clicar Editar na revisão abre o passo certo e a URL muda.

### V23 · Rascunho restaura tudo
**Hoje:** `audience_filters` volta a `'all'` (`useCampaignEditor.ts:222-227`); `respectSuppression` e o passo não são restaurados; `openEdit` força `step:1`.
**Fazer:** hidratar filtros, flags e `step` salvo (coluna `draft_step int` opcional via `save_talkx_campaign_draft`); indicador "Rascunho salvo há X"; teste de hidratação completa (`useCampaignEditor.test.tsx`).
**Aceite:** sair no passo 2 com filtros → reabrir → passo 2 e filtros iguais.

### V24 · Filtros de audiência reais e compartilhados com segmentos
**Hoje:** UI expõe Busca/Empresa/Tag; estados cidade/grupo/inativo/aniversário mortos e fora do SELECT; `audience_filters` é snapshot solto.
**Fazer:** passo 1 usa o mesmo `RULE_FIELDS`/`buildFilter` dos segmentos (campos validados no `schema-catalog.json`: `status`, `company`, `tags`, `city`, `state`, `assigned_to`, `pipeline_stage`); `audience_filters` guarda as regras (mesmo JSON do segmento); remover estados mortos; debounce + `signal` nas contagens; `TalkXContactSelector` virtualizado.
**Aceite:** 6 filtros funcionam com teste ligado à query; `useTalkXSegments.test.ts` cobre os novos campos.

### V25 · Passo 1: responsável, validação e segmentos ativos
**Fazer:** campo Responsável (`profiles`, default usuário; grava `created_by`/`owner`); nome ≥ 3; objetivo com ícone; só segmentos `status='active'`; conexão continua no passo 3 (E65) com estado `TalkXWhatsAppDisconnectedState` quando não há conexão `connected`.
**Aceite:** testes de validação; E2E V10 ajustado.

### V26 · Um editor de mensagem para template e wizard
**Hoje:** passo 2 é `Textarea` simples; template tem toolbar; sem highlight/validação de variável.
**Fazer:** extrair `TalkXMessageEditor` (toolbar `*_-`, emoji, link, inserir variável no cursor, contador por limite do provedor, highlight `{{var}}` por overlay, aviso de variável desconhecida) e usar nos dois; aceitar só-mídia; Sheet de templates em modo seleção grava `template_id` e **versão** (`template_version_id`).
**Aceite:** mesma saída de `personalizePreview` nos dois lugares (teste de paridade); dirty-check.

### V27 · Mídia: bucket privado, upload, URL assinada, snapshot
**Hoje:** nenhum bucket talkx; mídia = URL digitada; RPC exige `^https://`.
**Fazer:** migration/storage: bucket `talkx-media` privado (16 MB, `image/*, video/mp4, application/pdf, audio/*`) com policies por `created_by`; `useTalkXTemplates.uploadMedia` + `useCampaignEditor.uploadMedia` com progresso/cancelar/validação MIME; `media_url` guarda `path`; `talkx-send` gera URL assinada 7 dias no envio e salva em `media_url_snapshot`; remover a exigência `^https://` do editor/RPC para paths do bucket.
**Aceite:** upload de 4 tipos → preview → envio de teste interno recebe a mídia.

### V28 · Rail do wizard com `PhonePreview` e "Ver no celular"
**Fazer:** `PhonePreview` 320×640 (renomear `PhoneFrame` mantendo export), header com nome/número da conexão escolhida, contato de amostra = primeiro **elegível**, mídia por tipo (vídeo poster/documento chip/áudio barra), tela cheia; botão "Ver no celular" chama `talkx-send action=test` (V67 endurece); debounce 150 ms; skeleton.
**Aceite:** preview muda ao digitar; teste recebido no número interno.

### V29 · Layout do wizard: sticky, Sheet, breadcrumb, dirty real
**Fazer:** rodapé `sticky bottom-0` com "Salvar rascunho"/"Continuar"/"Lançar" no passo 4; rail `sticky top-4` (≥1280) e `Sheet` "Resumo" (<1280); breadcrumb "Nova campanha"/"Editar <nome>"; `beforeunload` só com `isDirty`.
**Aceite:** prints 1672/1280/390 em `docs/talkx/screens/08/`; teclado percorre os 4 passos.

### V30 · Recorrência e validação de agendamento
**Fazer:** migration `recurrence jsonb` (`{type:'none'|'daily'|'weekly'|'custom', days:[], until}`); UI Repetição + "Resumo da Programação" (timeline calculada); `nextOccurrence()` em `_shared/talkx-recurrence.ts` com testes (DST, `until`); scheduler clona a campanha concluída como `scheduled` na próxima ocorrência (nova `id`, mesmo `recurrence`, `parent_campaign_id`); validação `scheduled_at > now()+2min` no front **e** no trigger.
**Aceite:** campanha diária concluída gera a próxima; série editada não altera histórico.

---

# FASE 3 — CICLO DE VIDA: TELAS 10–14 (V31–V40)

### V31 · Roteamento por status completo
**Hoje:** `draft` via `onView` abre Monitor; sem `?campaign=`; `ErrorState` não usado; rótulo "Voltar à campanhas" com classes quebradas (`TalkXView.tsx:228`).
**Fazer:** tabela status→tela (`draft`→wizard, `scheduled`→Agendada, `sending`→Running, `paused`→Pausada (V36), `completed|cancelled`→Relatório (V37)); deep link `?view=talkx&campaign=<id>` em `talkxWizardRoute.ts`; id inexistente → `TalkXErrorState`; botão Voltar único (`TalkXBackButton`); testes por status em `TalkXView.route.test.tsx`; corrigir classes/texto.
**Aceite:** 5 testes de rota; URL copiada abre a tela certa.

### V32 · Tela Agendada completa (10)
**Fazer:** Repetição (V30), Throttle/velocidade editável, Confirmação e supressão (flags V21), coluna 3 com segmento + n, linha WhatsApp real (`whatsapp_connections` nome/número/status), duração estimada, responsável (avatar); "Editar" abre passo 3; evento `scheduled_updated` (V11) ao salvar via `save_talkx_campaign_draft`; `min` do input no fuso da campanha.
**Aceite:** salvar não perde `schedule_timezone`; prints vs mock 10.

### V33 · Monitor: KPIs completos, ETA, janela, previsto
**Hoje:** sem Respondidas/Opt-outs/ETA/60-30-15/Previsto; filtro da aba muda o gráfico (`TalkXLiveMonitor.tsx:94`).
**Fazer:** KPIs Respondidas (`replied_count`) e Opt-outs (`talkx_blacklist.campaign_id`); ETA = `remaining / taxa dos últimos 10 min corridos` (corrigir também o Running `:426-428`); select 60/30/15; série "Previsto" tracejada a partir de `speed_profile`; badge "Iniciada às"; desacoplar `useTalkXMonitor` do `statusFilter`.
**Aceite:** teste de `eta()`; gráfico estável ao filtrar destinatários.

### V34 · Saúde real e fila por status
**Fazer:** "Conexão" lê `whatsapp_connections.status` com realtime; "Taxa de envio" msg/min últimos 5 min; "Término estimado"; heurística `failed/(sent+failed) > 5%` → recomendação "Reduza a velocidade"; "Fila" por status (Enviados/Entregues/Lidos/Respondidos/Falhas/Pendentes) com barras; "Ver todos" → aba Destinatários.
**Aceite:** 4 linhas com fonte; heurística documentada em `ARQUITETURA.md`.

### V35 · Destinatários e timeline acionáveis
**Fazer:** ações "Abrir conversa" (`?view=chat&contact=`) e "Reenviar" (V19 `retry`); busca; inserção no topo com animação; Sheet "Ver todos" paginado; virtualização >200 (`@tanstack/react-virtual` já no `package.json`); timeline com eventos derivados (resposta, opt-out, falha de conexão) via união de `talkx_campaign_events` + `replied_at` + `talkx_blacklist.source_message_id`.
**Aceite:** 500 destinatários renderizam <16 ms/frame; reenviar funciona em `failed`.

### V36 · Tela Pausada (13) — `TalkXCampaignPaused.tsx`
**Hoje:** não existe; `paused` abre Running.
**Fazer:** header (tile âmbar, "pausada por <ator>: <motivo>" do evento V12, "Pausada em", tipo); KPIs Totais/Processados/Restantes; donut 3 tons; "Checklist para retomar" com fontes reais (conexão `connected`, janela válida, template `approved`, supressão revalidada; itens manuais persistidos como evento `checklist`); timeline; "Resumo de enviados" (LineChart 24h de `sent_at`/`delivered_at` com marcador da pausa); "Retomar" e "Encerrar" com modais (motivo/preset).
**Aceite:** retomar reaproveita progresso (teste SQL 5 destinatários pausar no 3º); prints vs mock 13.

### V37 · Relatório (14) — base: `TalkXCampaignReport.tsx` + `useTalkXReport`
**Hoje:** RPC `talkx_campaign_report` sem consumidor.
**Fazer:** hook chama a RPC (cache 5 min para `completed/cancelled`); ampliar a RPC: série diária **e** horária, `read_count`, `replied_count`, tempo médio, cliques/conversões (`talkx_link_clicks`/`talkx_conversions`), `by_variant`, heatmap `replied_at` dia×hora, `cancelled_count`; header (pill Concluída/Cancelada, período, Exportar, Compartilhar); sub-tabs Visão Geral · Mensagens · Links · Audiência · Conversões · Respostas · Logs (Segmentos só após V75 — não criar aba vazia); 6 KPIs só com fonte; LineChart diário/horário; rota `completed|cancelled` (V31).
**Aceite:** relatório abre para campanha interna concluída; nenhum KPI sem fonte renderiza; teste do hook.

### V38 · Relatório: funil e heatmap por campanha
**Fazer:** funil SVG com degraus reais (Enviados → Entregues → Lidos → Responderam → Clicaram → Converteram; degrau sem fonte omitido); heatmap de respostas (`replied_at`) e de envios (toggle) com tabela `sr-only`; tooltips.
**Aceite:** funil com 4 degraus quando não há links; a11y por teclado.

### V39 · Relatório: resumo, links, insights, "Ver campanha"
**Fazer:** migration `investment numeric` (editável no relatório); "Resumo" (objetivo, audiência, template com Visualizar + versão, duração, responsável, investimento, receita (V82), ROI); "Principais links clicados" (V81/V82); 4 insights por campanha (vs média — `talkx_benchmarks`, melhor horário do heatmap, variante vencedora descritiva, cliques sem conversão); "Ver campanha" abre wizard somente leitura.
**Aceite:** blocos dependentes ficam ocultos sem fonte; sem rótulo "IA".

### V40 · Exportar relatório e compartilhar
**Hoje:** CSV removido do sistema; sem print; sem compartilhar.
**Fazer:** **decisão registrada:** reintroduzir CSV apenas em `src/lib/talkxCsv.ts` (parser+serializer com escape de `,"\n` e neutralização de fórmulas `=+-@`), sem lib; export de destinatários (status/horários) respeitando filtro e RLS; PDF por `window.print()` com `@media print` (fundo branco, SVG preservado); "Compartilhar" copia deep link interno; `talkx-report` (e-mail) passa a ser chamável de campanhas `completed` (botão no relatório) e usa a RPC, não só contadores.
**Aceite:** CSV abre no Excel com acentos; teste unitário de escape; print de 2 páginas.

---

# FASE 4 — VISÃO GERAL E DESIGN SYSTEM (V41–V50)

### V41 · KPIs por RPC (`useTalkXStats`)
**Fazer:** hook chama `talkx_overview_stats(p_from, p_to)` (V16 corrige `contacts_reached`/série); delta real vs período anterior (só quando há base); "Em andamento" = `sending|scheduled|paused`; `refetchInterval 30s` só com `sending`; testes com fixtures.
**Aceite:** `TalkXOverview` sem cálculo de KPI no cliente; 5 KPIs com fonte documentada.

### V42 · Tabela sobre `TalkXTable`: ordenação, massa, entregues, virtualização
**Fazer:** migrar a tabela à mão para `TalkXTable` com `rowActions` (usar `RowActionsMenu`), células padrão (entidade com thumb `media_url`, segmento, canal, progresso, resultados com `delivered_count`), ordenação por coluna com `aria-sort`, dot pulsante em `sending`, barra flutuante "N selecionadas: Pausar · Cancelar · Excluir", seleção limpa ao mudar página/filtro, virtualização >200, "Limpar" no vazio filtrado, filtro de canal (WhatsApp fixo, desabilitado).
**Aceite:** testes de ordenação/seleção; 1000 campanhas <16 ms/frame.

### V43 · Ações de linha: presets, persistência, optimistic
**Fazer:** 7 presets exportados de `TalkXConfirmDialog` (`excluirCampanha, duplicarCampanha, removerSupressao, cancelarCampanha, confirmarDisparo, pausarCampanha, retomarCampanha`); pausar/retomar com modal e motivo (V13); `duplicateCampaign` insere rascunho no banco (via `save_talkx_campaign_draft` + `replace_talkx_draft_recipients`) copiando só configuração; optimistic update + rollback; `onError` em todas as mutations; spinner por linha; excluir permitido para `draft|cancelled|completed` (RPC de delete com guard, hoje o trigger só permite `draft`).
**Aceite:** duplicar gera 2 registros distintos; testes por ação.

### V44 · Grade completa
**Fazer:** `CampaignGridCard` com `.talkx-card`, thumb 16:9, 3 números (enviados/entregues/falhas), ⋮ (mesmas ações), checkbox, skeleton, stagger, hover elevação; seleção compartilhada com a lista.
**Aceite:** trocar lista↔grade preserva seleção (teste).

### V45 · Deep link de aba, `ModuleTabs`, breadcrumb
**Fazer:** `?view=talkx&tab=<overview|segments|templates|suppression|analytics>` sincronizado (`useSearchParams`); `ModuleTabs` sobre Radix Tabs com chevron/Dropdown (Templates: Biblioteca/Criar; Analytics: Campanhas/Segmentos/Comparativo/Configurações — este último monta `TalkXSettings`, V84); breadcrumb `Talk X › Campanhas › <aba>`; fade nas bordas <1024.
**Aceite:** teste de rota por aba; teclado navega.

### V46 · Rail da Visão geral
**Fazer:** 4ª ação "Importar contatos" (V86); 5 recentes por `updated_at`; Accordion "Mais" <1280; skeleton; `TipCard` rotativo por dia a partir de `talkxConstants.TIPS[]` (texto sem número); `HeroCard` com 3 tiles flutuantes (`talkxFloat`).
**Aceite:** prints 1672/1280/768.

### V47 · FilterBarV2 completa e ⌘K que navega
**Fazer:** hint ⌘K, date range (Calendar+Popover), chips de filtro ativo, Sheet "Filtros" <768; `useTalkXCommandItems` abre o item (campanha→tela por status V31, segmento→detalhe, template→editor), limite 8 por tipo, label `sending`.
**Aceite:** teste do provider; E2E: ⌘K → campanha → tela certa.

### V48 · `talkxConstants.ts`, IconTile, TalkXKit
**Fazer:** mover constantes (`CAMPAIGN_STATUS`, `RECIPIENT_STATUS`, `OBJECTIVES`, `SPEED_PROFILES`, `SUPPRESSION_ORIGIN`, `TEMPLATE_CATEGORIES`, `VARIABLE_KEYS`, `TIPS`) para `talkxConstants.ts` e atualizar imports (remover `eslint-disable react-refresh`); `IconTile` `glow` default por contexto, `text-primary-foreground`, classes de cor via mapa estático (sem string dinâmica) ou `safelist`; `.talkx-tile` com `--tile-from/--tile-to`; `src/components/talkx/__dev__/TalkXKit.tsx` (`?view=talkx-kit`, só `import.meta.env.DEV`) com todos os primitivos, 6 estados e 7 modais; snapshot dos tiles.
**Aceite:** eslint sem disable de refresh; kit renderiza em DEV.

### V49 · Motion aplicado e `InsightCard` no carvão
**Fazer:** `KpiCard` (stagger 40 ms), grade, modais (`talkxScaleIn`), hero (`talkxFloat`) com `useReducedMotion`; `InsightCard` com tokens (`bg-card`, borda por tom), rótulo "Insights" (heurístico); botão `apply()` visível quando existir (V83).
**Aceite:** `prefers-reduced-motion` zera durações (teste); 0 `bg-*-50` em `talkx/`.

### V50 · Estados do sistema aplicados + QA visual da tela 01
**Fazer:** `TalkXNoPermissionState` (role fora de `admin|supervisor`), `TalkXWhatsAppDisconnectedState` (sem conexão `connected`), `TalkXDataUnavailableState` (CRM/RPC erro) e `TalkXErrorState` com "Ver detalhes" usados nas telas; `role=status`/`aria-live`; foco inicial nos modais; prints (vazia, 3 campanhas, filtro, grade) em `docs/talkx/screens/01/`; `PARIDADE.md` seção 01 gerada por evidência.
**Aceite:** 6 estados forçáveis via `?talkxState=` (DEV) com print cada.

---

# FASE 5 — SEGMENTOS (V51–V60)

### V51 · Extrair `TalkXSegmentBuilder.tsx` com reducer, undo/redo e validação
**Hoje:** builder inline (`TalkXSegments.tsx:232-`); condição vazia quebra estimativa e save (P2-3).
**Fazer:** `useReducer` (pilha undo/redo, "Limpar tudo"); regra incompleta → borda `warning`, bloqueia Publicar e é ignorada na estimativa (não lança); `save()` com `try/catch` + toast; testes do reducer.
**Aceite:** adicionar condição vazia não zera a estimativa; undo/redo em 10 passos.

### V52 · Semântica visual AND/OR fiel ao mock 03
**Fazer:** badge por `match` (E/OU) e não por índice; colchete vertical por grupo; divisor "OU" entre grupos; `+ Adicionar grupo` único (o match interno é escolhido no grupo); widgets por `kind` (date, boolean, enum, tags-multi, number range); documentar em `ARQUITETURA.md` que grupos se combinam por OU.
**Aceite:** expressão visual ≡ AST ≡ resultado (dataset com resultado conhecido em `useTalkXSegments.test.ts`).

### V53 · Catálogo de filtros e operadores
**Fazer:** categorias com contagem, busca, descrição/ícone, scroll com setas, aba CRM 360 desabilitada com motivo (até V89); `@hello-pangea/dnd` para drag; novos campos reais validados no catálogo (`state`, `city`, `assigned_to`, `pipeline_stage`, `status`); operadores `in`/`not_in`; `buildFilter` + testes; catálogo visível <xl (colapsável).
**Aceite:** todos os campos do catálogo existem em `contacts`; testes dos operadores.

### V54 · Resumo do segmento em tempo real
**Fazer:** debounce 400 ms + `keepPreviousData` + `signal`; "% da base"; delta vs `estimated_count` salvo; "Risco de entrega" calculado (% em supressão via RPC `talkx_audience_suppressed_count(rules)` — necessária porque a RLS da blacklist é admin-only; % sem telefone; % enviados <7 dias) → Baixo/Médio/Alto com as 3 linhas; `updated_at`; "Ver todos" → V58.
**Aceite:** teste da heurística; 0 queries por tecla.

### V55 · Tags, status, descrição, favorito otimista
**Fazer:** migration `talkx_segments add tags text[] not null default '{}'` + GIN; editor de tags no builder e no rail; filtro por tag e por proprietário na biblioteca; toggle `active|inactive` com confirmação se usado por campanha `scheduled`; descrição com contador 160; favorito com `setQueryData` + rollback.
**Aceite:** catálogo/types; testes de mutation.

### V56 · Autosave e versões do segmento
**Fazer:** tabela `talkx_segment_versions(id, segment_id, rules, estimated_count, created_by, created_at, note)` + RLS espelhada + trigger de limite 20; autosave 30 s com "Rascunho salvo há X"; Publicar grava versão + `active` + recalcula; sub-tab Histórico com diff textual e Restaurar (cria versão nova); token otimista `updated_at` com aviso de conflito.
**Aceite:** teste SQL do trigger; conflito detectado em 2 abas.

### V57 · Sobreposição entre segmentos
**Fazer:** RPC `talkx_segment_overlap(a_rules, b_rules)` `security invoker` com whitelist de campos/operadores (`format()` + `quote_literal`, mesma semântica de `buildFilter`, limite 5000 por lado); sub-tab com select de até 3 segmentos e Venn SVG; "% com outros segmentos" no rail; cache 5 min; testes SQL com fixture e teste de injeção.
**Aceite:** `select talkx_segment_overlap(...)` com dataset conhecido; tentativa de campo fora da whitelist → erro.

### V58 · Prévia e contatos do segmento
**Fazer:** sub-tab com `TalkXTable` paginada server-side (`range`) sobre `buildFilter`; colunas avatar/nome/telefone/empresa/tags/última interação/Elegível (fora da supressão + telefone); ordenação; export CSV (V40 lib); contagem = "Audiência estimada"; clique abre `?view=contacts&id=`.
**Aceite:** teste de paginação; contagem consistente.

### V59 · Painel de detalhes completo
**Fazer:** chips de todas as regras (campo + operador + valor legível); "Origem e sincronização" (ZAPP = tempo real; crm360 = `synced_at` V88); "Composição" só com campos reais (`status`, empresas); "Principais tags" via RPC `talkx_segment_tags` **corrigida para o público** (não destinatários enviados); remover descrição hardcoded; Esc/foco de volta/skeleton; `InsightCard` só com heurística real.
**Aceite:** painel sem texto fixo; a11y.

### V60 · KPIs e biblioteca honestos + QA telas 02/03
**Fazer:** "Ativos este mês" = `last_used_at ≥ now()-30d` (gravar `last_used_at` no launch); "Conversão média" via `talkx_benchmarks` (V69) ou oculto; coluna "Desempenho" = taxa de resposta da última campanha do segmento (via view) ou oculta; ⋮ com Duplicar/Ativar-Inativar/Usar em campanha; paginação 10/25/50 funcional (`onPageSize` real); "Último uso" com criador; prints em `docs/talkx/screens/02-03/`; `PARIDADE.md` 02/03 por evidência.
**Aceite:** 0 métrica sem fonte na tela; prints.

---

# FASE 6 — TEMPLATES (V61–V70)

### V61 · Galeria fiel ao mock 04
**Fazer:** card com `WhatsAppBubble` + `personalizePreview` (hora = `updated_at`), "N variáveis" via `extractVariables`, "Atualizado em", `StatusPill`, `N usos`, ⋮ (Editar/Duplicar/Testar/Arquivar/Excluir); lista via `TalkXTable`; ordenação (mais usados/recentes/nome); paginação 12/24 funcional; grid `xl:grid-cols-4`; status `archived` (migration se o CHECK não tiver).
**Aceite:** PARIDADE 04 refeita; testes de ordenação.

### V62 · Rail de templates honesto
**Fazer:** `HeroCard` "Biblioteca inteligente" (ilustração, texto sem "IA"); "Mais usados" por `use_count` até V69 liberar "Mais convertidos" por taxa de resposta; ações rápidas: Criar, Duplicar (pede origem e **duplica**), Importar (V64); "Sugestões" só com V83.
**Aceite:** rótulos batem com a fonte.

### V63 · Editor: sub-tabs, emoji/link, dropzone
**Fazer:** sub-tabs Conteúdo · Variações A/B · Histórico (acessíveis em qualquer viewport); botões emoji e link funcionais (remover imports mortos); dropzone de mídia (V27); ⌘S salva, ⌘Enter salva e fecha (listener no form, não só no textarea); usar `TalkXMessageEditor` (V26).
**Aceite:** dirty-check cobre mídia; teste de atalhos.

### V64 · Importar/exportar templates
**Fazer:** exportar seleção JSON/CSV (V40 lib); importar com dropzone, preview por linha (nome duplicado, >1024, variável desconhecida), conflitos pular/sobrescrever/cópia, `upsert` por `name`, limite 500, toast com contagem; `docs/talkx/IMPORT_TEMPLATES.md`; testes do parser.
**Aceite:** importar 3 templates com 1 conflito resolvido de cada forma.

### V65 · Variáveis completas com fallback e paridade
**Fazer:** `VARIABLE_KEYS` + `telefone`, `data_atual`, `vendedor` (`contacts.assigned_to → profiles.name`), `link` (V81); fallback `{{nome|cliente}}` em `personalizePreview` **e** em `talkx-send/personalize()` (regex `\{\{\s*([\w.]+)(?:\|([^}]*))?\s*\}\}`); highlight overlay; aviso de variável desconhecida; preview alterna 3 contatos reais; teste de paridade front/edge com o mesmo fixture (`scripts/db-audit/talkx-personalize-parity.test.mjs`).
**Aceite:** saída idêntica nos dois lados para 12 casos.

### V66 · Versões de template completas
**Fazer:** snapshot só quando `content`/`media`/`variables` mudam (na RPC `update_talkx_template_with_snapshot`); coluna `note`; limite 30 por trigger; diff (+/−) por linha; badge `vN` no header; restaurar cria versão nova; histórico visível <xl.
**Aceite:** teste SQL do trigger e da condição de snapshot.

### V67 · "Testar" com trilha, limite e conexão escolhida
**Hoje:** qualquer admin envia conteúdo arbitrário a qualquer número pela 1ª conexão, sem log.
**Fazer:** tabela `talkx_test_sends(id, template_id, campaign_id, to_phone, connection_id, status, error, created_by, created_at)` + RLS; `talkx-send action=test` exige `connectionId`, valida número E.164, aplica rate limit 5/10 min por usuário (conta na tabela), aplica `customVariables`, gera URL assinada para mídia (V27), grava log estruturado; modal com select de conexão, prefill `profiles.phone`, preview, resultado inline.
**Aceite:** 6º teste em 10 min → 429; registro na tabela.

### V68 · A/B robusto
**Fazer:** constraint (trigger) soma dos pesos = 100 por template; UI bloqueia salvar; preview lado a lado; remover a seção duplicada (`TalkXTemplateEditor.tsx:437-484` vs `:495-521`); testes de `pickVariant` (distribuição em 10k sorteios, determinismo por destinatário); relatório por variante (V37 `by_variant`).
**Aceite:** teste Deno do sorteio; constraint testada.

### V69 · Benchmarks liberados
**Fazer:** `useTalkXBenchmarks` consome `talkx_benchmarks()`; liberar "Taxa média de resposta" (KPI templates), "Mais convertidos" por taxa, "Conversão média" (segmentos), "vs. média" (Pausada/Relatório/Analytics) com delta em p.p.; `talkx_campaign_metrics` com `security_invoker` (V01) — revisar se o benchmark global precisa de `SECURITY DEFINER` agregando sem expor linhas.
**Aceite:** 5 métricas com fonte; prints 02/04/13.

### V70 · QA telas 04/05
**Fazer:** fluxo manual (template com variável+mídia → testar → usar em campanha); galeria com 200 templates <100 ms (virtualizar se preciso); prints; `PARIDADE.md` 04/05 por evidência.
**Aceite:** prints + paridade.

---

# FASE 7 — SUPRESSÃO (V71–V80)

### V71 · Um único hook de supressão
**Hoje:** `useTalkXSuppression.ts` morto (DELETE físico); queries inline na tela; `reason_code` nunca gravado.
**Fazer:** reescrever o hook (list com `removed_at is null`/`expires_at`, add com `reason_code` + `phone` avulso, remove soft, update motivo/expiração, history) e a tela consome só o hook; view `talkx_blacklist_active` (migration) usada por hook e por `resolveAudience` (V80); testes do hook.
**Aceite:** `TalkXSuppression.tsx` sem `fromTable(` direto; `reason_code` preenchido em 100% dos inserts novos.

### V72 · KPIs e tabela reais
**Fazer:** "Opt-outs 30 dias" = `reason_code='opt_out' and created_at ≥ now()-30d` (inclui `auto_optout`); "Campanhas protegidas" = `count(distinct id) where respect_suppression` (V21); telefone da linha = `coalesce(contacts.phone, phone)`; motivo como pill por `reason_code`; status `Suprimido|Expirado|Removido`; coluna "Expira em".
**Aceite:** contract test com fixture de 30 dias.

### V73 · Filtros, ações e seleção em massa
**Fazer:** 5 filtros com label (Origem, Motivo, Campanha, Data, Status) + busca por nome/telefone/e-mail; ⋮ (Remover, Editar motivo, Ver contato, Ver campanha); seleção em massa (remover/exportar); paginação 10/25/50 funcional; ordenação por data.
**Aceite:** testes de filtro combinado.

### V74 · Rail "Centro de proteção" real
**Fazer:** `ProtectionGauge` (anel SVG) = campanhas protegidas / total; 4 mini-números; "Ações da lista" (Importar V75, Exportar, Adicionar V76, Gerenciar motivos V77); "Atividade recente" = eventos `suppression_*` (V11) + "Ver todas"; "Saiba mais" abre Ajuda no tópico LGPD (V91).
**Aceite:** 0 número fixo; link real.

### V75 · Importar contatos para a supressão
**Fazer:** `src/lib/talkxCsv.ts` (V40) + mapeamento de colunas, E.164 (`+55DDDN…`), match `contacts.phone` → `contact_id` senão `phone` avulso, preview válidos/inválidos/já suprimidos, lotes de 500 `on conflict do nothing`, 1 evento `suppression_add` por lote, limite 50k; XLSX documentado como "converta para CSV".
**Aceite:** testes do parser/normalizador; importar 3 telefones → aparecem.

### V76 · Adicionar e editar com expiração
**Fazer:** modal Adicionar (busca `cmdk` ou telefone avulso, `reason_code`, observação, expiração nunca/30d/90d/data); modal Editar motivo/expiração; validação E.164; eventos; toasts; `docs/talkx/SUPRESSAO.md`.
**Aceite:** 2 modais com teste; doc.

### V77 · Motivos personalizados
**Fazer:** tabela `talkx_suppression_reasons(code pk, label, tone, is_system, active)` semeada com os 6 códigos; `reason_code` vira FK (converter o enum em text com CHECK via FK — migration em 2 passos compatível); modal "Gerenciar motivos" (admin); pills lêem `tone`.
**Aceite:** criar motivo custom e usá-lo; sistema não apaga.

### V78 · Opt-out automático configurável e idempotente
**Fazer:** tabela `talkx_optout_keywords(keyword pk, active)` semeada (`sair, parar, stop, cancelar, remover, descadastrar`) lida pelo webhook (cache 5 min); normalização sem acento/lower/trim; autoresposta lê `talkx_settings.optout_autoreply` (corrigir seed: texto de confirmação, sem "Janeña"); `on conflict … where removed_at is null do nothing` (V07); evento `suppression_add` com `actor_id null`; testes Deno do normalizador e da regra dos 30 dias; teste real com "SAIR" de número interno.
**Aceite:** lista na UI mostra a keyword usada; teste real.

### V79 · Remover com trilha, desfazer e bloqueio 24h
**Fazer:** preset `removerSupressao`; "Desfazer" 10 s no toast (volta `removed_at` a null); opt-out com <24h não removível (aviso); evento `suppression_remove`; `onError` em todas as mutations; filtro "Expirado/Removido".
**Aceite:** testes; desfazer funciona.

### V80 · Supressão em todo o funil + QA tela 06
**Fazer:** `resolveAudience`/`countAudience` excluem suprimidos por padrão (via view V71); wizard mostra "Bloqueados por supressão: N (x%)" via RPC `talkx_audience_suppressed_count` (funciona para agentes); `respect_suppression=false` só admin (V21); `talkx-send` grava evento `skipped_suppressed` agregado; teste negativo (contato suprimido nunca recebe); prints 06; `PARIDADE.md` 06 por evidência.
**Aceite:** teste Deno negativo; prints.

---

# FASE 8 — LINKS, INSIGHTS, SETTINGS, CRM, IMPORTAÇÃO (V81–V90)

### V81 · UI de links rastreáveis
**Hoje:** `talkx_links` só via INSERT manual (RLS `service_role`); `{{link}}` sem editor.
**Fazer:** RLS admin/supervisor (SELECT/INSERT/UPDATE) em `talkx_links`; UI "Links" no passo 2 e no editor de template (label, URL de destino validada `https://`, slug gerado); variável `{{link}}` no catálogo (V65); `VITE_TALKX_LINK_BASE` usado para montar a URL curta.
**Aceite:** criar link → enviar teste → clicar no celular → `talkx_link_clicks` + `clicked_at`.

### V82 · Conversão autenticada e relatório de links (P2-8)
**Fazer:** POST `convert` exige `Authorization: Bearer <TALKX_CONVERT_SECRET>` (secret em Edge Functions) ou assinatura HMAC; rate limit; relatório mostra "Principais links clicados" (cliques, únicos, taxa), KPIs Cliques/Conversões, receita/ROI (V39).
**Aceite:** POST sem segredo → 401; teste Deno de `talkx-link` (GET redirect, POST convert, IDOR).

### V83 · Insights com ação e sem regra morta
**Hoje:** nenhum `apply()`; regra links usa `status='finished'`; 2 telas de 5.
**Fazer:** corrigir para `completed`; heurística "segmentos >1000 contatos vs menores" via benchmarks; `apply()` real (pré-preencher janela no wizard, abrir template, abrir segmento); cards nas telas 02/07/09/11/14 com rótulo "Insights"; flag `talkx_settings.ai_insights` → texto redigido via `ai-proxy` (sem a flag, template); testes das heurísticas com fixtures; regras em `ARQUITETURA.md`.
**Aceite:** 5 telas; teste de cada regra.

### V84 · Configurações vivas
**Hoje:** `TalkXSettings` órfão; sem policy UPDATE (V06 cria); backend não lê chaves.
**Fazer:** montar em Analytics ▾ Configurações (V45); validação por chave (número, JSON `business_hours`, texto); backend lê `reply_window_hours` (V18), `business_hours` (V20), `daily_limit_per_connection` (V20), `optout_autoreply` (V78), `default_speed_profile` (default do wizard), `ai_insights` (V83); auditoria RLS das 12 tabelas + views + RPCs em `scripts/db-audit/talkx-rls-audit.sql` (verbos, `anon` sem grants, `SECURITY DEFINER` justificado).
**Aceite:** alterar cada chave muda o comportamento correspondente (teste por chave); auditoria RLS no `db-live-guard`.

### V85 · Alertas e observabilidade
**Fazer:** workflow N8N `talkx-alerts` (falhas >10% em 15 min; conexão caiu; campanha `sending` sem `sent_at` há >30 min; `outcome_unknown` >0) → WhatsApp `wpp2`; `Sentry.setTag('module','talkx')` no front e nas 4 edges; `OPERACAO.md` seção "Alertas e o que fazer".
**Aceite:** alerta disparado por fixture chega no WhatsApp; tag visível no Sentry.

### V86 · Importação de contatos: upload seguro e preview (15)
**Hoje:** nada (dialog antigo apagado).
**Fazer:** tabelas `talkx_imports(id, file_name, total, imported, linked, pending, conflicts, status, created_by, created_at)` e `talkx_import_rows(import_id, row_no, row jsonb, status, contact_id, suggestion jsonb, confidence)` + RLS; `TalkXImport.tsx` (sub-tabs Importar CSV · CRM 360 · Resolver conflitos) com dropzone `.csv` 10 MB, mapeamento, preview como amostra, contagens do arquivo inteiro, limites (linhas/colunas/célula), neutralização de fórmulas; `useTalkXImport`.
**Aceite:** CSV com aspas/quebras/BOM importa; fórmula neutralizada.

### V87 · Matcher e criação em lote
**Fazer:** RPC `talkx_import_match(import_id)`: e-mail exato → telefone E.164 → documento (se `contacts.document` existir) → nome+empresa `pg_trgm` (extensão: confirmar disponível); `confidence` 0–100; ≥90 vincula, 60–89 pendente, <60 novo; insert em `contacts` em lotes com fingerprint (job retomável); relatório final por categoria; testes SQL do matcher com fixture.
**Aceite:** dataset de 50 linhas com resultado esperado calculado à parte.

### V88 · CRM 360 (Bitrix24): vínculos e pendentes
**Fazer:** tabela `talkx_crm_links(contact_id pk, crm, crm_entity, crm_id, synced_at, confidence)`; sugestões via `bitrix-api` (`crm.contact.list` por telefone/e-mail, cache 24 h, timeout, health check); tabela de pendentes com Vincular/Criar/Ignorar (idempotentes, com trilha); estado "CRM 360 indisponível" (`TalkXDataUnavailableState`); `docs/talkx/CRM360.md`.
**Aceite:** vincular 1 contato real interno; CRM fora do ar → estado honesto.

### V89 · CRM 360 no wizard e nos segmentos
**Fazer:** card "CRM 360°" do passo 1 habilitado quando há `talkx_crm_links` e o health check passa; filtros CRM (estágio, responsável, valor) na aba do catálogo (V53) lendo projeção local (`talkx_crm_links` + cache) — nunca chamada síncrona ao Bitrix por tecla; origem `crm360` real nos segmentos com `synced_at`.
**Aceite:** segmento CRM com contagem; card desabilitado com motivo quando indisponível.

### V90 · Conversões pelo CRM + QA tela 15
**Fazer:** webhook Bitrix `ONCRMDEALUPDATE` (negócio ganho) → edge `talkx-link` POST convert autenticado (V82) para o destinatário vinculado (janela de atribuição configurável); `talkx_conversions.value/source`; reconciliação com dataset dourado (importar → vincular → segmentar → enviar interno → evento → venda); prints 15; `PARIDADE.md` 15.
**Aceite:** cadeia ponta a ponta com 1 negócio de teste.

---

# FASE 9 — AJUDA, ESTADOS, QA, RELEASE (V91–V100)

### V91 · Ajuda real (16)
**Fazer:** `docs/talkx/help/*.md` (8 artigos PT-BR, 300–500 palavras, frontmatter: título/tópico/nível/minutos: primeira campanha, segmentação, templates, supressão/LGPD, agendamento, métricas, erros e `outcome_unknown`, limites do provedor); `TalkXHelp` vira tela (não Dialog) com busca client-side, tópicos com contagem real, guias, "Checklist antes de enviar", "Contato com especialista" (`talkx_settings.support_phone`), sem bloco de vídeos (não há vídeo); deep link `?tab=help&topic=lgpd` a partir do alerta da supressão; `import.meta.glob`.
**Aceite:** cada artigo seguido em staging por quem não conhece o código; teste de busca.

### V92 · Modais e estados padronizados (17)
**Fazer:** substituir os 11 `<AlertDialog>` diretos pelos presets (V43); foco inicial/retorno; `Esc`/`Enter` (só sem checks pendentes); loading nos botões; `docs/talkx/ESTADOS.md` (matriz tela × estado); `?talkxState=<empty|error|loading|crm|wa|perm>` em DEV; prancha no `TalkXKit`; testes de cada preset.
**Aceite:** `grep -c "<AlertDialog" src/components/talkx/*.tsx` (fora do shared) = 0.

### V93 · Acessibilidade e mobile
**Fazer:** `@axe-core/playwright` nas 10 telas principais (0 violações sérias); contraste de pills/tiles ≥4.5:1 (script que lê `tokens.css`); teclado completo (wizard, tabelas, builder, modais); `aria-live` nos KPIs do monitor; 390 px usável (rail em Sheet, tabelas com scroll + coluna fixa); zoom 200%.
**Aceite:** matriz viewport × tela × estado; axe verde no CI.

### V94 · Performance e bundle
**Fazer:** `React.lazy` para `TalkXCampaignReport`, `TalkXSegmentBuilder`, `TalkXImport`, `TalkXHelp`; chunk talkx <250 kB gz (`vite-bundle-visualizer`); virtualização (V35/V42); `db_slow_queries` 0 acima de 300 ms com `EXPLAIN` das RPCs sobre 50k destinatários sintéticos (schema `talkx_test`, apagado depois); Lighthouse ≥90 na Visão geral.
**Aceite:** números antes/depois em `docs/talkx/PERFORMANCE.md`.

### V95 · E2E completo e regressão visual
**Fazer:** specs: criar segmento → publicar; template → testar; wizard completo → lançar (stub Evolution via MSW/route mock) → monitor; pausar/retomar; supressão bloqueia; importar CSV; relatório abre e exporta; `toHaveScreenshot` nas 17 telas (1672×941, tolerância 0,5%, baseline aprovada — nunca atualizada automaticamente); `paths` filter (V10) e job required após 2 semanas verde; Deno tests de `talkx-link`, `talkx-scheduler`, `talkx-reply`, webhook opt-out; cobertura `talkx/` ≥75% (`vitest --coverage` com include do módulo); `docs/talkx/TESTES.md`.
**Aceite:** <8 min; 17 screenshots; cobertura no CI.

### V96 · Documentação verdadeira
**Fazer:** `ARQUITETURA.md` (arquivos reais, RPCs, eventos, máquina de estados com `scheduled→draft`, heurísticas, escala de espaçamento); `CHANGELOG_TALKX.md` (fase por fase, V01–V100, sem "E11–E85 mergeadas"); `OPERACAO.md` (agendar, pausar, conexão caiu, limites, alertas, `outcome_unknown`, 7 testes); `PARIDADE.md` **regenerado** a partir de `docs/talkx/screens/*` + testes (script `scripts/db-audit/talkx-paridade.mjs` que gera a tabela); `README.md`; corrigir comentários de etapa no código; `talkx-analytics-contract.test.mjs` protege métricas reais em vez de congelar `null`.
**Aceite:** nenhuma afirmação do §6 da auditoria permanece.

### V97 · Aceite visual 17/17 autenticado
**Fazer:** prints lado a lado (mock × app) em `docs/talkx/screens/final/` nas 3 resoluções, estados vazio/cheio/erro/modal; lista de divergências aprovadas com motivo (canal e-mail, "+32%", RFM, gênero — sem fonte); aprovação registrada por tela.
**Aceite:** 17 decisões nominais.

### V98 · Banco: ledger, catálogo e replay limpos
**Fazer:** `supabase db reset` local com todas as migrations (V06); `check-migration-drift.mjs` limpo; `schema-manifest.json`/`schema-catalog.json`/`types.ts` sincronizados (types-sync verde); `db-live-guard` verde 2 semanas seguidas; 0 `pinned-replay` novas; `migration-evidence.json` sem exceções talkx.
**Aceite:** run agendado do `db-live-guard` verde.

### V99 · Smoke em produção e observação
**Fazer:** campanha real de 5 contatos internos (allowlist) por todo o ciclo: agendar (+2 min) → cron inicia → monitor → pausar com motivo → retomar → concluir → ACK/READ/resposta reais → relatório → export; verificar `talkx_campaign_events`, `talkx_recipients` (external_id, delivered_at, read_at, replied_at), Sentry sem evento novo, alertas N8N silenciosos; observar 24 h; registrar em `docs/talkx/recovery/evidence/V99/`.
**Aceite:** relatório pós-release sem incidente bloqueante.

### V100 · Release honesta e encerramento
**Fazer:** tag `talkx-v1.1.0` (mensagem = fases 0–9 concluídas) — não reutilizar `talkx-v1.0.0`; GitHub Release com prints; `docs/talkx/BACKLOG.md` (canal e-mail/SMS, IA generativa de templates, XLSX nativo, link público de relatório, multi-tenant, multi-segmento `talkx_campaign_segments` se ainda não entrou); `graphify update . --force` + commit do `GRAPH_REPORT.md`; `CLAUDE.md` seção Talk X atualizada; saldo final publicado como `X/100 VERIFIED · Y BLOCKED` (nunca "10/10" com pendência escondida).
**Aceite:** todos os gates 0–9 aceitos; `BLOCKED` listados com responsável.

---

## Apêndice A — Mapa etapa antiga → etapa V3

| Antiga (E) | V3 |
|---|---|
| E11–E20 | V48, V49, V50, V42, V47, V46, V43 |
| E21–E30 | V41, V42, V43, V44, V45, V46, V47, V40 |
| E31–E40 | V51–V60 |
| E41–E50 | V61–V70, V27, V26 |
| E51–E60 | V71–V80, V04, V05, V07 |
| E61–E70 | V21–V30, V22 |
| E71–E85 | V31–V40, V09, V13, V14 |
| E86–E93 | V01, V02, V03, V06, V15–V20, V69, V81–V85 |
| E94–E100 | V86–V100, V10, V92 |

## Apêndice B — Métrica → fonte → etapa que libera (estado real)

| Métrica | Fonte | Hoje | Libera |
|---|---|---|---|
| Enviadas / Falhas / Progresso | `talkx_recipients.status`, contadores | ✅ | — |
| Entregues | `delivered_at` via ACK | ✅ backend | UI V33/V37 |
| Lidas | `read_at` | ❌ coluna não existe | V17 |
| Respondidas / taxa / tempo médio | `replied_at`, `replied_count` | 🟡 (janela fixa, cliente recalcula) | V18 |
| Cliques / Conversões / Receita / ROI | `talkx_links`, `talkx_link_clicks`, `talkx_conversions` | 🟡 (sem UI, convert sem auth) | V81, V82, V90 |
| Opt-outs 30d / Suprimidos / Manuais / LGPD | `talkx_blacklist` | 🟡 (contagem errada) | V72 |
| Campanhas protegidas | `respect_suppression` | ❌ coluna não existe | V21, V72 |
| Contatos alcançados | distinct `contact_id` | 🟡 (soma) | V16, V41 |
| vs. média / Conversão média / Mais convertidos | `talkx_campaign_metrics` + `talkx_benchmarks` | 🟡 (sem consumidor; view sem invoker) | V01, V69 |
| Fila por segmento | `talkx_campaign_segments` | ❌ | backlog (V100) |
| Insights | heurísticas | 🟡 (regra morta, sem apply) | V83 |
| Gênero, RFM, "+32%", "8.1k" | **não existe fonte** | — | não implementar |

## Apêndice C — Comando de validação por etapa

```sh
cd /workspace/repos/Zapp_Web_V2 \
 && npx tsc --noEmit -p tsconfig.app.json \
 && npx eslint src/components/talkx src/hooks/integrations/useTalkX*.ts \
 && npx vitest run src/components/talkx src/hooks/integrations/__tests__/useTalkX \
 && node scripts/ci/lint-ratchet.mjs \
 && node scripts/db-audit/talkx-analytics-contract.test.mjs \
 && node scripts/db-audit/talkx-navigation-contract.test.mjs \
 && (cd supabase/functions/talkx-send && deno test -A) \
 && npm run build
```
