# Caminhos ja incorporados a `main` (64)

A `main` ja faz o mesmo. Fechar a branch de origem nao perde nada.

Parte do laudo de adjudicacao de 17/11/2026 — indice e metodo em `docs/audits/ADJUDICACAO-233-CAMINHOS-2026-11-17.md`.

Cada item cita a evidencia lida no codigo (`arquivo:linha` ou saida de comando). Os vereditos vieram de sete adjudicadores (um por lote) e passaram por quatro refutadores, instruidos a DERRUBAR todo veredito que autorizasse apagar. Onde houve refutacao ou correcao, os dois textos ficam no item.

## front: campanhas e dashboard (1)

### `src/components/dashboard/SentinelAlertPanel.tsx`

- Branch de origem: `claude/ecstatic-bardeen-twiveb`
- Evidencia do adjudicador: A `main` tem o mesmo comportamento, no fluxo real do War Room: `src/components/dashboard/WarRoomDashboard.tsx:83-90` (remove otimista, chama `dismissAlert`, em erro reverte e `toast.error('Nao foi possivel dispensar o alerta. Tente de novo.')`), `:45` (vem de `useWarRoomAlerts`) e `src/components/dashboard/war-room/WarRoomAlertRow.tsx:35` (botao com o mesmo `aria-label` 'Dispensar alerta: {alert.title}'). Persistencia em `src/hooks/business/useWarRoomAlerts.ts` (tabela `warroom_alerts`); testes `src/hooks/__tests__/useWarRoomAlerts.test.tsx` e `src/components/dashboard/__tests__/WarRoomDashboard.estados.test.tsx`.

## front: inbox, copilot e chamadas (13)

### `src/components/calls/__tests__/VoIPPanel.test.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` tem a mesma suite sob o nome novo: `src/components/calls/__tests__/TelefoniaView.test.tsx` (existe; confirmado por `git cat-file -e`) e `TelefoniaView.painel.test.tsx`. Decisao ja registrada na `main`: `analise-prs/VEREDITOS-A2-CODIGO-261117.md:38` (tabela 'Mesma funcionalidade, outro nome') e `analise-prs/INVENTARIO-RESGATE-261116.md:72` ("VoIPPanel.test.tsx (virou TelefoniaView.painel.test.tsx)").

### `src/components/inbox/ConversationTimeline.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` tem a mesma leitura e os mesmos rotulos pt-BR em `src/components/contacts/ContactActivityTimeline.tsx:159` (`.from('conversation_events')`), com o catalogo de tipos em `:51-52` (`queue_transfer: 'Transferido para fila'`, `overload_reassign: 'Reatribuicao automatica'`) e `EVENT_CONFIG` em `:32`. Dentro do atendimento o mesmo conteudo vira a aba Jornada: `src/components/inbox/tabs/JourneyTab.tsx:13` consumindo `src/hooks/chat/useConversationHistoryTimeline.ts:410` (mesma tabela) com `TRANSFER_TYPES` em `:145`.

### `src/components/inbox/LeadRiskScorePanel.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Arquivo com o mesmo nome e papel na `main`, em outro caminho: `src/components/inbox/contact-details/LeadRiskScorePanel.tsx`, com teste proprio `src/components/inbox/contact-details/__tests__/LeadRiskScorePanel.test.tsx`, e ligado na UI em `src/components/inbox/contact-details/AtendimentoSection.tsx:53` (bloco "Score e LGPD"). A religacao esta documentada em `AtendimentoSection.tsx:4-10`.

### `src/components/inbox/contact-details/AssignmentSection.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Na `main` a mesma operacao vive no dialogo de transferencia e na barra de atribuicao: `src/components/inbox/TransferDialog.tsx:34` (`TransferTargetType = 'agent' | 'queue'`), `:54` (componente), `:59-60` (`useAgents()` + `useQueues()`, os mesmos hooks da versao da branch) e `src/components/inbox/chat/ChatAssignedBar.tsx:12`; reatribuicao em lote em `src/components/inbox/AgentReassignmentPanel.tsx:28` com `src/hooks/crm/useAgentReassignment.ts:6`. O hook `useContactAssignment` da branch nao existe na `main` (`git grep useContactAssignment origin/main` = zero): a mesma funcionalidade por outro caminho.

### `src/components/inbox/contact-details/Contact360Helpers.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Cada bloco existe na `main` em outro arquivo: selo RFM em `src/components/crm360/DataExplorerTable.tsx:18-22`; cartao de empresa/perfil comercial em `src/components/contacts/CRMContactCard.tsx:19-73`; canais e redes sociais em `src/components/inbox/contact-details/sidebar/ProfessionalSection.tsx:41-107` e `sidebar/PersonalSection.tsx:58-69` (`personal?.social`); radar comportamental (DISC/VAK/Big Five) em `sidebar/SinguProfileSection.tsx:11-20`; interacoes e score em `src/components/inbox/contact-details/ContactIntelligencePanel.tsx:1-11`; os primitivos de titulo/linha em `sidebar/SidebarSection.tsx` e `sidebar/SidebarRow.tsx`.

### `src/components/inbox/contact-details/ContactInfoSection.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Na `main` a edicao desses campos vive em `src/components/inbox/contact-details/EditContactDialog.tsx` (com o contrato em `contact-details/editContactShape.ts` e testes `__tests__/EditContactDialog.test.tsx` e `__tests__/editContactShape.test.ts`), e a exibicao em `sidebar/ProfessionalSection.tsx:41-107` (e-mail, empresa, cargo) e `sidebar/PersonalSection.tsx:58`. O proprio defeito que a versao da branch carregava — gravar sem invalidar query — esta resolvido na `main` em `EditContactDialog.tsx:138` e `:140` (invalida `contact-enriched` e `contacts-search`).

### `src/components/inbox/contact-details/LastActivityWidget.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` entrega a mesma leitura, pelo MESMO hook, na aba Jornada do atendimento: `src/components/inbox/tabs/JourneyTab.tsx:13` importa `useConversationHistoryTimeline` (hook em `src/hooks/chat/useConversationHistoryTimeline.ts`), com `KIND_META` em `JourneyTab.tsx:24`; a versao de contatos e `src/components/contacts/ContactActivityTimeline.tsx:159`.

### `src/components/inbox/contact-details/SLAAndAITagsSection.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` registra a decisao no proprio arquivo que substituiu este: `src/components/inbox/contact-details/ContactFirstResponseSLA.tsx:4-7` — "Restaurado (2026-11-12) da parte 'SLA' do SLAAndAITagsSection... A outra metade daquele bloco ('Tags geradas por IA', tabela ai_conversation_tags) NAO volta: a funcao de tags foi removida por decisao do dono (12/10)". Ligado na UI em `AtendimentoSection.tsx:50` e testado em `__tests__/ContactFirstResponseSLA.test.tsx`.

### `src/components/inbox/contact-details/__tests__/ContactInfoSection.test.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Exatamente esse comportamento esta na `main` em `src/components/inbox/contact-details/EditContactDialog.tsx:138` (`invalidateQueries({ queryKey: ['contact-enriched'] })`) e `:140` (`['contacts-search']`), com suite propria em `src/components/inbox/contact-details/__tests__/EditContactDialog.test.tsx`. O componente testado pela branch (`ContactInfoSection`) nao existe mais na `main`.

### `src/components/inbox/contact-details/__tests__/StoryViewer.test.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: O componente existe e esta em uso na `main` (`src/components/inbox/contact-details/StoryViewer.tsx`, montado em `src/components/inbox/contact-details/WhatsAppStatusSection.tsx:136`), e e exercitado pela suite do pai: `src/components/inbox/contact-details/__tests__/WhatsAppStatusSection.test.tsx:139` (`story-viewer`), `:142` (midia sob demanda), `:158` (nao rebusca com funcao nova), `:176` (setas do teclado), `:191` (botoes anterior/proximo). O comportamento de erro tambem esta implementado: `StoryViewer.tsx:62,74,78` e `:100-102` (`data-testid="story-media-error"`), e a guarda contra midia velha em `:106,115,128`. Ressalva honesta: nenhum teste da `main` cobre esses DOIS casos (erro de midia e midia do status anterior) — a funcionalidade esta na `main`, a cobertura desses dois ramos nao.

### `src/components/mobile/InAppNotification.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` entrega o aviso interno pelo toaster do sonner, afinado justamente para a superficie movel: `src/components/ui/sonner.tsx:12-20` ("No celular (<=600px) o sonner alinha o aviso por `--mobile-offset-*` e o padrao dele deixava o aviso em cima da BottomNavigation e do MobileFAB"), com `duration={4000}` em `:24` e teste `src/components/ui/__tests__/sonner-offset-mobile.test.tsx`; montado em `src/App.tsx:63-64`. A lista de notificacoes do celular e `src/components/mobile/NotificationsPanel.tsx`, montada em `src/components/mobile/MobileShell.tsx:79`. A forma de banner com avatar nao voltou; a funcao (aviso interno transitorio) esta na `main`.

### `src/components/mobile/InAppNotificationProvider.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Era o unico destes arquivos de `components/mobile/` ligado na branch (`src/App.tsx:43-45` e `:80-83`). Na `main` o papel e do toaster global do sonner, cujo `toast()` e chamavel de qualquer lugar sem contexto: montado em `src/App.tsx:63-64` (`import('@/components/ui/sonner').then(m => m.Toaster)`) e configurado em `src/components/ui/sonner.tsx:12-24`. `git grep -ln InAppNotification origin/main -- src/` = zero (so uma mencao historica em `docs/design/MODULO_MULTIPLIX_TALKX_CONFIG_SEGURANCA.md:180`, inventario antigo).

### `src/components/mobile/MobileNavigation.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` tem a barra inferior em `src/components/ui/mobile-components.tsx:20` (`export function BottomNavigation`), montada em `src/components/mobile/MobileShell.tsx:108`, com guarda de superficie do modulo em `src/components/ui/__tests__/mobile-components.superficie.test.ts:17-22` (que prova quais nomes o modulo ainda expoe). A vibracao na interacao continua, inline: `navigator.vibrate` em `src/components/ui/mobile-components.tsx`, `MobileShell.tsx`, `MobileFAB.tsx` e `MobileDrawerMenu.tsx`. O nome `MobileTabBar` nao existe na `main`.

## front: hooks e lib (11)

### `src/assets/hero-worldmap.jpg`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo ativo na main convertido para WebP: `src/assets/hero-worldmap.webp`, importado em `src/pages/Auth.tsx:14` e verificado por `src/pages/__tests__/Auth.fundo-mapa.test.tsx:57`.

### `src/components/talkx/talkxTabRoute.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Realocado e ampliado em `src/components/talkx/talkxRoute.ts`: `goTab` na linha 124, `formatTalkXTabRoute` na 115, e `readTab`/`readSub` substituídos por `parseTalkXRoute` (linha 76), que ainda rejeita parâmetro duplicado. Testado em `src/components/talkx/__tests__/talkxRoute.test.ts`.

### `src/components/ui/AuroraBorealis.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Na main em `src/components/effects/AuroraBorealis.tsx`, usado em `src/components/admin/AdminView.tsx:4,216` e `src/components/agents/AgentsView.tsx:15`.

### `src/components/ui/FloatingParticles.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Na main em `src/components/dashboard/FloatingParticles.tsx`, usado em `src/components/admin/AdminView.tsx:3,217`; a duplicata é documentada em `src/components/__tests__/componentesDuplicados.test.ts:21`.

### `src/hooks/__tests__/useBulkActions.archive-fsm.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main grava exatamente isso em `src/hooks/inbox/conversationArchive.ts:151` (`update({ conversation_status: next, updated_at })`), com máquina de estados em `set_conversation_status` (comentário nas linhas 71-73) e testes próprios em `src/hooks/inbox/__tests__/conversationArchive.waiting.test.ts` e `conversationArchive.pgrst202.test.ts`. O hook que o teste importava foi removido (`src/hooks/__tests__/useBulkActions.removido.test.ts`).

### `src/hooks/admin/useMediaMigrationData.ts`

- Branch de origem: `claude_05/zen-feynman-29b7ix`
- Evidencia do adjudicador: Mesma funcionalidade na camada de serviços da main: `src/services/mediaMigration.service.ts:20` (`countPendingMedia`, prefixos `mmg.`/`pps.whatsapp.net` na linha 3) e `:33` (`fetchMigrationHistory`, `HISTORY_LIMIT = 10` na linha 5, ação `media_migration` na linha 4), consumida por `src/components/admin/MediaMigrationTool.tsx` com testes em `src/components/admin/__tests__/MediaMigrationTool.test.tsx`.

### `src/hooks/chat/useCopilotSession.ts`

- Branch de origem: `claude/feat-copilot-radar-20261108-1800`
- Evidencia do adjudicador: Realocado e ampliado na main: sessão em `src/hooks/copilot/useCopilotSession.ts:1-50` (mesma tabela `copilot_sessions` e colunas `brinde_*`, com nota de RLS), insights em `src/hooks/copilot/useLiveSuggestions.ts:98,121-124` (lê `copilot_insights` com canal realtime) e o tick virou servidor: `supabase/functions/_shared/copilot-tick.ts` chamado por `supabase/functions/ai-jobs-worker/index.ts` (migration `supabase/migrations/20261115010000_copilot_live_motor.sql`).

### `src/hooks/connections/useInstancePauses.ts`

- Branch de origem: `claude/feat-completar-c121-261101-1330`
- Evidencia do adjudicador: Tudo na main, na camada de serviços: `src/services/instance-pauses.service.ts:227` (`pauseInstance` → `rpc('pause_instance')`), `:244` (`resumeInstance` → `rpc('resume_instance')`), `:171` (`fetchInstancePausesWindow`) e `:159` (`PAUSES_HISTORY_DAYS = 7`); hook em `src/components/monitoring/hooks/useInstancePauses.ts` e UI/testes em `src/components/connections/InstancePausesPanel.tsx` + `src/components/connections/__tests__/InstancePausesPanel.test.tsx:69,81`.

### `src/hooks/crm/useContactAssignment.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Na main: atendente por `src/services/contact-bulk.service.ts:41` (`applyContactFieldUpdate`), usado em `src/components/contacts/BulkActionsBar.tsx:123`, e reatribuição em lote com invalidação de cache em `src/hooks/crm/useAgentReassignment.ts:22-37`; fila por `src/components/settings/SkillBasedRoutingSettings.tsx:101,134,158`. O hook genérico (que engolia o erro em toast e não invalidava cache) não voltou.

### `src/hooks/inbox/__tests__/useInboxFilterTags.paginacao.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo contrato, com a mesma massa de prova, em `src/services/__tests__/inbox.service.test.ts:55-76`: etiqueta "Raro" só a partir do índice 1200 (além do teto de 1000 do PostgREST), dedup/ordem, e erro no meio da leitura subindo (`rejects.toThrow('permissão negada')`). Código em `src/services/inbox.service.ts:24-32` (`fetchAllRows` + `.range`).

### `src/hooks/inbox/useInboxFilterTags.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A lógica (paginação por `id` via `fetchAllRows`, dedup, cor do chip, erro que sobe) está na main em `src/services/inbox.service.ts:23-42`, com testes em `src/services/__tests__/inbox.service.test.ts:52`. Observação: a main referencia o caminho do hook em dois mocks (`src/components/inbox/__tests__/InboxFilters.todos-os-tipos.test.tsx:19` e `InboxSavedFiltersMenu.test.tsx:57`) sem o arquivo existir — o embrulho em si não tem consumidor de produção na main.

## banco: migrations e edge functions (15)

### `supabase/functions/ai-auto-tag/auth_test.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Mesma funcionalidade na main em supabase/functions/ai-auto-tag/auth.test.ts:46 ("ai-auto-tag rejects request without Authorization") e :61 ("ai-auto-tag rejects invalid bearer token"), com os mesmos nomes de teste. O cabecalho desse arquivo (auth.test.ts:4-8) registra a propria mudanca: o nome antigo era auth_test.ts, nao era coletado pelo CI e os dois casos ficavam `ignore: !BASE`; a versao da main sobe o handler real em 127.0.0.1 e roda sem URL externa.

### `supabase/migrations/20261016193000_copilot_sessions.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: A main cria a mesma tabela em supabase/migrations/20261030100000_copilot_sessions.sql:4 (CREATE TABLE IF NOT EXISTS public.copilot_sessions), com RLS (:40-45) e trigger trg_copilot_sessions_updated_at (:53). analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:63 confirma a tabela no banco oficial e :92 registra que o trigger existe em producao com o nome trg_copilot_sessions_updated_at em lugar da funcao touch_copilot_sessions_updated_at da branch. O schema de colunas difere (main usa conversation_id e colunas brinde_* separadas).

### `supabase/migrations/20261016193100_copilot_insights.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: A main cria a mesma tabela em supabase/migrations/20261030110000_copilot_insights.sql:4, com RLS (:33-37) e `ALTER PUBLICATION supabase_realtime ADD TABLE public.copilot_insights` (:40). analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:63 confirma a tabela no banco oficial.

### `supabase/migrations/20261016193300_copilot_tick_trigger.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: Os mesmos objetos, com os mesmos nomes, estao na main em supabase/migrations/20261115010000_copilot_live_motor.sql:48 (CREATE OR REPLACE FUNCTION public.enqueue_copilot_tick_on_contact_message()) e :122 (CREATE TRIGGER trg_copilot_tick_on_contact_message), com o INSERT em ai_jobs em :95 e REVOKE em :119. O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:51.

### `supabase/migrations/20261026120300_log_search_event_rpc.sql`

- Branch de origem: `claude/loving-lovelace-esc3l2`
- Evidencia do adjudicador: A main define a mesma RPC, com assinatura maior, em supabase/migrations/20261031130000_search_event_rpc.sql:35 (create or replace function public.log_search_event(text, integer, boolean, uuid, text)), com revoke/grant em :108-110 e comment em :113. O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:52.

### `supabase/migrations/20261101133000_outbound_post_started.sql`

- Branch de origem: `claude/feat-message-delivery-post-iniciado-261101-1330`
- Evidencia do adjudicador: Tudo esta na main em supabase/migrations/20261111160000_outbound_post_started.sql: coluna em :68-69, comentario em :71-72, guard em :79 (com delivery_post_started_at em :97 e :107), mark_outbound_post_started em :148 (revoke/grant :213-215), claim_outbound_message em :225 recusando por `delivery_post_started_at IS NULL` em :297; o arquivo da main vai alem e cria manually_resolved_at em :347-351. O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:49.

### `supabase/migrations/20261101223000_talkx_suppression_reasons.sql`

- Branch de origem: `claude/feat-talkx-x070-suppression-reasons-261101-2230`
- Evidencia do adjudicador: A main tem o mesmo arquivo renumerado e ampliado: supabase/migrations/20261108100000_talkx_suppression_reasons.sql:2 diz literalmente "Timestamp original 20261101223000 — renomeado para 20261108100000 (conflito com PR #2457)"; CREATE TABLE public.talkx_suppression_reasons em :163, guard em :180, policies em :241-248, talkx_blacklist_reason_active_guard em :368. A linha 1 e identica a da branch; o diff e so acrescimo. Endurecido depois em supabase/migrations/20261112172000_talkx_suppression_reasons_hardening.sql.

### `supabase/migrations/20261108180000_copilot_tick_trigger.sql`

- Branch de origem: `claude/feat-copilot-radar-20261108-1800`
- Evidencia do adjudicador: Os mesmos objetos estao na main em supabase/migrations/20261115010000_copilot_live_motor.sql:48 (funcao) e :122 (trigger, precedido de DROP TRIGGER IF EXISTS em :121), com INSERT em ai_jobs em :95. O par (20261016193300 e 20261108180000 -> 20261115010000) esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:51.

### `supabase/migrations/20261108180200_copilot_retention.sql`

- Branch de origem: `claude/feat-copilot-radar-20261108-1800`
- Evidencia do adjudicador: A main tem a mesma migration, estruturalmente identica, em supabase/migrations/20261115050000_copilot_retention_aggregates.sql: tabela :18, indices :32 e :36, RLS :39, policies own_retention/service_role_retention :43 e :47, funcao :51, agendamento com unschedule+schedule :110-115, comments :124-127 (os mesmos textos CV-143 da branch). O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:50.

### `supabase/migrations/20261111180000_resolve_unconfirmed_somente_sending.sql`

- Branch de origem: `claude/fix-pd79-compat-pre-migration-261111`
- Evidencia do adjudicador: A main tem a mesma correcao, mais completa, em supabase/migrations/20261112170000_resolve_unconfirmed_somente_sending.sql — diff contra a versao da branch mostra so o cabecalho reescrito ("refaz o item 5 da PR #2972 sobre a main atual"), a retirada do BEGIN/COMMIT e um endurecimento extra: a main tambem recusa p_outcome NULL (`IF p_outcome IS NULL OR p_outcome NOT IN ('sent','not_delivered')`), que na branch cairia no ELSE do CASE e gravaria 'failed'. O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:48.

### `supabase/migrations/20261113130200_conversation_status_regras_e_so_por_rpc.sql`

- Branch de origem: `claude/fix-conversas-p0-p1-backend-261113`
- Evidencia do adjudicador: A main tem o mesmo arquivo renumerado em supabase/migrations/20261113171300_conversation_status_regras_e_so_por_rpc.sql, cuja linha 2-3 diz "(Era 20261113130200 na PR #3037; nunca aplicada — renumerada acima do max do ledger e do pacote 170000..171200)". O diff e de 67 linhas e e so cabecalho/rollback. Prova do comportamento na main em supabase/tests/db-audit/conversas-p0-p1-20261113.test.sh; constraint chk_conversation_status_values confirmada em producao por analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:66.

### `supabase/migrations/20261113130400_varredura_mensagens_presas_em_enviando.sql`

- Branch de origem: `claude/fix-conversas-p0-p1-backend-261113`
- Evidencia do adjudicador: A main tem o arquivo byte a byte igual, renumerado: supabase/migrations/20261113171400_varredura_mensagens_presas_em_enviando.sql — o diff inteiro e UMA linha, a nota inserida na linha 2 ("Era 20261113130400 na PR #3037; nunca aplicada — renumerada..."). O job outbound-sending-sweeper esta confirmado em producao em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:69.

### `supabase/migrations/20261113130500_transfer_conversation_cas_sem_dono.sql`

- Branch de origem: `claude/fix-conversas-p0-p1-backend-261113`
- Evidencia do adjudicador: A main tem o arquivo byte a byte igual, renumerado: supabase/migrations/20261113171500_transfer_conversation_cas_sem_dono.sql — diff de UMA linha, a nota na linha 2 ("Era 20261113130500 na PR #3037; nunca aplicada — renumerada..."). Prova na main em supabase/tests/transfer_conversation_atomicidade.sql.

### `supabase/migrations/20261113130600_agendadas_conexao_do_contato_caida.sql`

- Branch de origem: `claude/fix-conversas-p0-p1-backend-261113`
- Evidencia do adjudicador: A main tem o arquivo byte a byte igual, renumerado: supabase/migrations/20261113171600_agendadas_conexao_do_contato_caida.sql — diff de UMA linha, a nota na linha 2 ("Era 20261113130600 na PR #3037; nunca aplicada — renumerada...").

### `supabase/migrations/20261113140000_remove_enum_special_agent.sql`

- Branch de origem: `claude/feat-remove-special-agent-261113`
- Evidencia do adjudicador: A main tem o mesmo arquivo renumerado em supabase/migrations/20261113172000_remove_enum_special_agent.sql (diff de 6 linhas): a linha 1 traz o novo numero e as linhas 348-352 corrigem a recriacao da policy "Only admins can view audit logs" para o predicado initplan da 20261113150000 (`USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))`) em vez do predicado antigo da branch, evitando desfazer aquela correcao. Prova na main em supabase/tests/db-audit/remove-enum-special-agent.test.sh. O par esta nomeado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:38.

## scripts e automacoes (11)

### `scripts/catalog/validate-plan.test.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo arquivo renomeado na main: `scripts/catalog/validate-plan.unit.mjs` — diff contra a versão da branch só acusa UM teste A MAIS na main (`scripts/catalog/validate-plan.unit.mjs:76`, arquivo inexistente → ERRO limpo). Main é superset.

### `scripts/ci/check-notifica-falha-names.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: `scripts/ci/workflow-contracts.unit.mjs:607` — teste `GA99: notifica monitora apenas workflows que existem`, que lê o bloco `workflows:` do `notifica-falha-main.yml` (`:610-616`) e compara com os `name:` declarados (`:617-625`). Mesma regra, já rodando no CI da main.

### `scripts/ci/claude-md-guard.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: `scripts/ci/check-claude-md-integrity.mjs` faz o mesmo e mais (alvo `AGENTS.md` + `docs/agentes/*.md` + os 2 skills, referência órfã, limiar por arquivo): `:32` `REQUIRED_SECTIONS`, `:43` `FILE_SHRINK_THRESHOLD`, `:143` checagem de encolhimento por arquivo. Também registrado na tabela "Já está na main (sob outro nome/arquivo) — nada a recuperar" de `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:34`.

### `scripts/db-audit/assert-runtime-proof.mjs`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: É extração VERBATIM (o próprio cabeçalho do arquivo diz isso) do que a main já executa embutido em `.github/workflows/db-migrate.yml:247` (passo "Provar estado runtime antes do push"), `:273` (`proof.server_major === 17`), `:871` ("Estado runtime inesperado; migration cancelada.") e nos passos `Validar runtime …` (`:986`, `:1029`, `:1067`, `:1328`, `:1363`, `:1414`, `:1441`). O comportamento está na main; o que se perde com a branch é a testabilidade (GA16 segue aberto em `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:144-158`).

### `scripts/db-audit/contracts/post-apply.sh`

- Branch de origem: `claude/fix-ga-resto-dbmigrate-20261021-0729`
- Evidencia do adjudicador: Extração VERBATIM (declarado no cabeçalho do arquivo) dos passos que a main já executa embutidos em `.github/workflows/db-migrate.yml`: `:927` "Validar registro no ledger", `:953` e `:967` (bundles), `:1080`, `:1103`, `:1132`, `:1168`, `:1207`, `:1292`, `:1318`, `:1352`, `:1404`, `:1430`. O comportamento está na main; só a extração/testabilidade (GA16) se perde — mesma leitura do dossiê da main para o irmão `validate-post-apply.mjs` (`analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:54`).

### `scripts/db-audit/validate-post-apply.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: O comportamento está na main, embutido em `.github/workflows/db-migrate.yml:927-1441` (passos `Validar registro no ledger`, `:953`, `:967`, `:1080`, `:1103`, `:1132`, `:1168`, `:1207`, `:1292`, `:1318`, `:1352`, `:1404`, `:1430`). Veredito registrado na main: `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:54` — "é refator dos 17 contratos pós-apply que a main já executa inline… O comportamento está na main; só a testabilidade se perde".

### `scripts/db-audit/verify-ledger-statements.unit.mjs`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: A main tem a mesma cobertura em dois lugares: `scripts/ci/verify-ledger-statements.unit.mjs:21` importa `avaliarStatementsDoLedger` e `:29`/`:35` cobrem NULL e vazio (e vai além, tokenizando o SQL do passo com o lexer do repo), e `scripts/db-audit/verify-ledger-statements.test.mjs` cobre a normalização com cabeçalho `-- `. É duplicata de local — o mesmo diz `analise-prs/resgate-261115/dossies/claude_pink__cool-dijkstra-xk9ek2.md:171`.

### `scripts/inventario/gerar-repo.unit.mjs`

- Branch de origem: `claude/fix-inventario-vault-cron-edges-261111-0315`
- Evidencia do adjudicador: Mesmo teste, movido e ampliado, em `scripts/ci/inventario-repo.unit.mjs:122` — `test('migrations: edge chamada só por cron+Vault conta; citada só em comentário SQL não conta'…)`, com a mesma fixture (`0001_vault_cron.sql`, `vault-edge`, `cron.schedule('vault-edge-1min'…)`) e os asserts `sem_chamador === false` (`:148`), `chamada_em.migrations === 1` (`:147`) e ausência em `sem_chamador_no_repo` (`:152`); o caso órfão é coberto por `comment-edge` (`:150-151`). O fix correspondente está em `scripts/inventario/gerar-repo.mjs:63-74`. Veredito INCORPORADA no dossiê da main `analise-prs/resgate-261115/dossies/claude__fix-inventario-vault-cron-edges-261111-0315.md:12,18`.

### `scripts/lib/seguranca-processo.test.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo arquivo renomeado na main: `scripts/lib/seguranca-processo.unit.mjs`. O diff contra a versão da branch só mostra a main MAIS rigorosa — assinatura com raízes explícitas (`:69`) e dois testes novos de symlink que escapa da raiz (`:85` e `:102`). Main é superset.

### `scripts/team-chat-db-validate.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo conteúdo em outro caminho na main: `scripts/team-chat/team-chat-db-validate.mjs`. O diff integral contra a versão da branch é UMA linha — o próprio caminho citado no bloco de uso (`node scripts/team-chat/team-chat-db-validate.mjs`). Chamado pela main em `.github/workflows/ci.yml`.

### `scripts/team-chat-db-validate.unit.mjs`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Mesmo arquivo em outro caminho na main: `scripts/team-chat/team-chat-db-validate.unit.mjs`, e a versão da main é superset — acrescenta execução real do validador em child process com `fetch` stubbado (função `executar`, logo após as importações de `node:fs`/`node:os` que a versão da branch não tem).

## CI, E2E e docs (13)

### `.github/workflows/contexto-ia.yml`

- Branch de origem: `claude/feat-contexto-ia-261103-0728`
- Evidencia do adjudicador: A main tem a mesma funcionalidade, evoluida, em outro caminho: origin/main:.github/workflows/contexto.yml:10 ('name: Contexto para agentes de IA (10 min)'), mesmo gerador em :158 (`node scripts/ai-context/gerar.mjs --out "$CONTEXTO_DIR/codigo"`), mesmo cron de 10 min e mesma estrategia de branch gerada, agora chamada `contexto` em vez de `contexto-ia` e com tres produtores (codigo/, supabase/, regras/) em vez de um (:15-18, :21). O inventario canonico de workflows da main lista `contexto` em origin/main:docs/agentes/github-ci.md:77.

### `analise/BACKLOG_TAREFAS.md`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: A main tem o mesmo documento em outro caminho e em estado mais avancado: origin/main:docs/_arquivo/analise/BACKLOG_TAREFAS.md (323 linhas). Comparado linha a linha, a versao da main e a posterior: os itens GF-001 a GF-009 estao fechados (`- [x]`) com nota de encaminhamento, enquanto na branch estao todos abertos (`- [ ]`); ex. origin/main:docs/_arquivo/analise/BACKLOG_TAREFAS.md:62 ('- [x] **GF-001** ... documentados em PENDENCIAS.md §1 e §5') contra a mesma linha 62 na branch ainda aberta. Nenhuma linha da branch falta na main em substancia.

### `docs/consolidacao/INVENTARIO.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em outro caminho e em revisao posterior: origin/main:docs/_arquivo/docs/consolidacao/INVENTARIO.md (91 linhas). A versao da main e a revalidacao de 29/10: :3 diz 'Levantamento iniciado em **28/10/2026** e revalidado parcialmente em **29/10/2026, 20:03 UTC** ... a main atual e a1340faa6daa...', onde a branch ainda para em 28/10 com a main `7cacbe2`; as tabelas da main (:11-12, :21-23) substituem as contagens antigas da branch por medicoes novas. Nada da branch falta.

### `docs/consolidacao/PLANO.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/PLANO.md (48 linhas), na versao posterior: :3 'Plano iniciado em 28/10/2026; estado revalidado em 29/10/2026, 20:03 UTC ... as PRs #2339, #2340, #2341, #2342, #2344, #2345 e #2348 foram integradas conforme checks verdes' contra a linha 3 da branch, que ainda descreve o estado de 28/10; e :22 marca o item 6 (periodo de calendario de Contatos) como 'ja integrado' pela PR #2310, enquanto a branch o mantem pendente. So 4 linhas diferem, todas a favor da main.

### `docs/consolidacao/_levantamento/A.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_levantamento/A.md (26 linhas): mesmo texto, mais o paragrafo de atualizacao em :3-4 ('**Atualizacao read-only de 29/10/2026:** a branch segue em dia/2026-10-23, HEAD 3024ca92c706 ... a correcao de periodo entrou pela #2310'). A unica diferenca no diff e esse acrescimo da main; zero linhas da branch ausentes.

### `docs/consolidacao/_levantamento/B.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_levantamento/B.md (100 linhas): o diff contra a branch mostra apenas 2 linhas, ambas acrescentadas pela main (nota de atualizacao de 29/10, no mesmo formato de A.md:3-4). Nenhuma linha da branch falta.

### `docs/consolidacao/_levantamento/C.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_levantamento/C.md (88 linhas): diff de apenas 2 linhas, ambas adicionadas pela main (nota de atualizacao de 29/10). Nenhuma linha da branch falta.

### `docs/consolidacao/_levantamento/DE.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_levantamento/DE.md (81 linhas): diff de apenas 2 linhas, ambas adicionadas pela main (nota de atualizacao de 29/10). Nenhuma linha da branch falta.

### `docs/consolidacao/_plano/A-grupos.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_plano/A-grupos.md (20 linhas), versao posterior. A pasta inteira esta na main (`git ls-tree -r origin/main --name-only | grep consolidacao/_plano` lista A-grupos.md, B-grupos.md, B-grupos-indice.tsv, CDE-grupos.md, FEATURES-validacao.tsv, GITHUB-limpeza.md — dois arquivos a mais que a branch). Diff de 8 linhas, com a main acrescentando estado de integracao.

### `docs/consolidacao/_plano/B-grupos.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_plano/B-grupos.md, versao resolvida: onde a branch escreve 'Triagem pendente' nos grupos 8 a 16 (linhas 27-35), a main ja traz o veredito e a PR — ex. grupo 10 'LACUNA CONFIRMADA ... Integrado pela PR #2339' e grupo 15 'PR #2348 merged em a1340faa em 29/10/2026' (mesmas linhas 27-35 do arquivo da main). Todas as 18 linhas do diff sao a main a frente.

### `docs/consolidacao/_plano/CDE-grupos.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_plano/CDE-grupos.md (53 linhas), com 4 linhas de diferenca, todas acrescimo/atualizacao da main (mesmo padrao de revalidacao de 29/10 dos demais arquivos da pasta). Nenhuma linha da branch falta.

### `docs/consolidacao/_plano/GITHUB-limpeza.md`

- Branch de origem: `claude_04/nice-cori-7snz6b`
- Evidencia do adjudicador: Na main em origin/main:docs/_arquivo/docs/consolidacao/_plano/GITHUB-limpeza.md (92 linhas), 3 linhas a mais e 9 linhas de diff, todas na direcao da main (revalidacao de 29/10 com PRs ja integradas, como em PLANO.md:3 da mesma pasta). Nenhuma linha da branch falta.

### `e2e/quarantine.json`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main tem a mesma funcionalidade, no mesmo diretorio, em formato de modulo em vez de JSON: origin/main:e2e/quarantine.js:1-19 repete o mesmo cabecalho de contrato (motivo, issue, prazo; 'Uma quarentena sem prazo e um skip com outro nome') e :22 expoe `export const quarentena = []` — a mesma lista vazia. Consumidores vivos na main: origin/main:playwright.config.ts:10 (`import { quarentena } from './e2e/quarantine.js'`) e :4-5 apontando o schema para e2e/quarantine.js e a cobranca de prazo para origin/main:scripts/ci/check-quarantine.mjs; mais os guardas origin/main:scripts/ci/e2e-quarantine-contract.unit.mjs e origin/main:e2e/quarantine.unit.mjs.
