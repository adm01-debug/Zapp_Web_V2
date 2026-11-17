# Vereditos dos 96 caminhos — lotes 1 a 3 (17/11/2026)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.


## src/hooks/integrations/useTalkXSegments.ts
- branch: origin/fix/f1a-lote-b-talkxsegments
- veredito: OBSOLETO
- prova: as três únicas mudanças de comportamento do branch já estão na `main`: falha fechada para `real_sector`/`real_uf` em `src/hooks/integrations/useTalkXSegments.ts:291` (`throw new Error(\`Campo ${rule.field} requer pré-resolução via p_contact_ids\`)`, com flag `ponteOnly` em :80-81); `lead_origin` com `comingSoon: true` em :90; `supabase.rpc.bind(supabase)` em :318, :340, :449, :697. Testes da `main` em `src/hooks/integrations/__tests__/useTalkXSegments.test.ts:338-371` cobrem a falha fechada. Os outros ~290 linhas do diff do branch são só reformatação prettier.
- uma frase: nada se perde — a `main` tem a mesma guarda anti-ampliação de audiência, com nome diferente (`ponteOnly`) e com teste.

## src/components/ui/command-palette.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: toda a camada ARIA do branch existe na `main`, só com ids por `cmd.id` em vez de índice: `src/components/ui/command-palette.tsx:245` (`role="combobox"`), :248 (`aria-controls`), :249 (`aria-activedescendant`), :266 (`role="status" aria-live="polite"` com a contagem), :271 (`role="listbox"`), :296/:310/:338 (`role="option"` + `aria-selected`), e o scroll do item realçado em :232 (`scrollIntoView({ block: 'nearest' })`). Suíte dedicada em `src/components/ui/__tests__/command-palette.a11y.test.tsx:49-130`.
- uma frase: a paleta já é navegável e anunciada por leitor de tela na produção atual.

## supabase/functions/_shared/ai-response-contracts.ts
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: o `CopilotLiveOutputSchema`/`BrindeDeltaSchema` do branch foi reimplementado (com superset de campos) em outro módulo: `supabase/functions/_shared/copilot-tick.ts:59-79` — `CopilotTier1Schema` cobre `sale_stage` (enum `SALE_STAGES` em :49), `temperature`, `brinde` (budget/responsible/intention/quantity/deadline com o mesmo regex `^\d{4}-\d{2}-\d{2}$`/delivery), `comm_style`, `decision_role` (`DECISION_ROLES` em :54), `occasion`, `stakeholders`, `key_moments`, e ainda `brinde_evidence`, `risks`, `next_action`; `CopilotTier2Schema` (:84) valida as sugestões. Consumido por `supabase/functions/ai-jobs-worker/index.ts:261`. Os demais envelopes do arquivo (`ObjectionHandlerEnvelope`, `PriceAnchorEnvelope`, …) a `main` tem em `ai-response-contracts.ts:175-255` e o branch não.
- uma frase: o contrato do copiloto ao vivo está validado na `main`, em `copilot-tick.ts` — caso clássico de função extraída para outro módulo.

## src/lib/offlineQueue.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: o filtro `userId` do branch foi substituído na `main` por um filtro genérico mais forte: `src/lib/offlineQueue.ts:75` (`shouldDeliver?: (message) => boolean`), aplicado em :252 (`if (drainOptions.shouldDeliver && !drainOptions.shouldDeliver(message)) continue;`), com a contagem corrigida em :242 e propagação em :369/:375 e :399/:404. A `main` ainda ganhou a trava de `generation` contra ressurreição de item após `clear()` (logout), que o branch não tem.
- uma frase: a mensagem de um atendente continua não saindo pela sessão de outro na mesma máquina, e a `main` também protege o logout no meio da drenagem.

## e2e/quarantine.unit.mjs
- branch: origin/claude_pink/cool-dijkstra-xk9ek2
- veredito: OBSOLETO
- prova: a `main` reescreveu o teste num contrato bem mais estrito, importando a fonte canónica: `e2e/quarantine.unit.mjs:7-8` (`import { GROUPS, GROUP_SHARDS } from '../scripts/e2e-isolated/runtime-contract.mjs'`) e `validarMatriz` (:58+) valida 5 grupos, shards autenticados, seleção exata por grupo, timeout por grupo (75/45) e união de 15 projetos. A versão do branch ainda falava de 4 grupos e `matrix.timeout_minutes` — formato que a `main` não usa mais (`${{ matrix.timeout-minutes }}`).
- uma frase: versão antiga de um teste de CI que a `main` já endureceu — adotá-la enfraqueceria a verificação.

## src/hooks/gamification/useAgentCelebrations.ts
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: a janela de corrida (conquista gravada depois da montagem vira festa) está na `main` em `src/hooks/gamification/useAgentCelebrations.ts:174` (`const marcoMontagem = Date.now()`) e :190-191 (`if (Date.parse(String(linha.earned_at ?? '')) > marcoMontagem + TOLERANCIA_RELOGIO_MS) celebrarConquista(linha);`). A `main` é mais robusta: usa `Date.parse` (o branch comparava strings ISO) e tolera 2 s de desalinho de relógio cliente/banco.
- uma frase: o atendente continua vendo a comemoração da conquista que caiu no instante em que a tela abriu.

## src/components/talkx/kit/primitives.tsx
- branch: origin/claude/feat-talkx-x053-breadcrumb-261102-1130
- veredito: OBSOLETO
- prova: `ModuleBreadcrumb` com item clicável está na `main`: `src/components/talkx/kit/primitives.tsx:46` (prop `onItemClick`), :53 (`{onItemClick && i < items.length - 1 ? (`) e :56 (`onClick={() => onItemClick(i)}`), já com `aria-label` de "Voltar à …" e alvo de toque de 36 px (`h-9 px-2`) que o branch não tinha.
- uma frase: a trilha de navegação já é clicável, e na `main` com acessibilidade e área de clique melhores.

## src/components/connections/ConnectionCard.tsx
- branch: origin/codex/publish-followup-20261021
- veredito: OBSOLETO
- prova: o diálogo que só fecha quando a desconexão confirma sucesso está na `main`: `src/components/connections/ConnectionCard.tsx:71` (`disconnectError`), :89 (`if (disconnected === false)`) e :254 (`errorMessage={disconnectError ?? undefined}`). A `main` vai além: no `catch` mostra a mensagem real do erro, e restringe o QR Code a admin (:178, :211-213).
- uma frase: o card já não finge que a conexão caiu quando o provedor recusou a desconexão.

## src/hooks/integrations/useWhatsAppStatus.ts
- branch: origin/claude/fix-evolution-go-gaps-d6-261019-1548
- veredito: OBSOLETO
- prova: o branch APAGA a leitura de status/stories ("not supported by Evolution GO"); a `main` manteve a funcionalidade e tratou a indisponibilidade sem perdê-la — `src/hooks/integrations/useWhatsAppStatus.ts:246-253` (`const consultarStatus = !statusIndisponivelPorInstancia.has(resolvedInstance)` e fallback `Promise.resolve({ data: [], error: null })`) e :263-266 (falha vira lista vazia, sem erro na tela), com o lado servidor em `supabase/functions/evolution-api/index.ts:1378` (`if (isGoFlavor) return goHistoryNotSupported('find-status-messages', corsHeaders)`). A `main` também removeu o `send-chat-presence 'paused'` que o branch mantém — sinal de presença enviado ao cliente sem o atendente digitar.
- uma frase: recuperar o branch apagaria os stories do contato e voltaria a mandar sinal de "digitando" falso para o cliente.

## src/components/inbox/VoiceSelector.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: abort da geração em voo e cache de prévia por sessão estão na `main`: `src/components/inbox/VoiceSelector.tsx:72` (`geracaoRef`), :74-77 (`cancelarGeracao`), :101 (chamada antes de nova prévia), além de `lerPreviaDeVoz`/`guardarPreviaDeVoz`. A `main` ainda cancela também ao pedir OUTRA voz (não só ao fechar o menu) e o `aria-label` do botão alterna Ouvir/Parar.
- uma frase: a prévia de voz já não toca por cima da voz nova nem paga duas sínteses pela mesma amostra.

## src/components/admin/AdminView.tsx
- branch: origin/claude/fix-unit-tests-src-261024-1630
- veredito: OBSOLETO
- prova: a aba "Tarefas agendadas" existe na `main`: `src/components/admin/AdminView.tsx:27` (`import { CronJobsTab }`), :195 (entrada de aba só para admin) e :504 (render, agora dentro de `SectionErrorBoundary`); o recarregamento por aba está em :104 (`if (activeTab === 'users' || activeTab === 'audit') void fetchData();`), que cobre Auditoria também — o branch só cobria Usuários.
- uma frase: o admin já tem a aba de tarefas agendadas, e a `main` recarrega a Auditoria que o branch esquecia.

## src/components/talkx/help/TalkXHelpCenter.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: o primeiro Esc limpando a busca em vez de fechar a Ajuda está na `main`: `src/components/talkx/help/TalkXHelpCenter.tsx:94` (desestrutura `searchQuery`/`setSearchQuery`), :115-116 (`if (searchQuery) { setSearchQuery(''); …`) e deps corretas em :134 — e a `main` ainda devolve o foco ao campo e usa `useLayoutEffect` para ganhar do registry global de atalhos.
- uma frase: o Esc já tem o comportamento de dois estágios na Ajuda; a `main` também devolve o foco ao campo de busca.

## src/components/inbox/conversation-list/StatusChips.tsx
- branch: origin/claude_pink/nice-hypatia-iikl82
- veredito: OBSOLETO
- prova: a `main` aceita contadores prontos por prop — `src/components/inbox/conversation-list/StatusChips.tsx:17` (`| { counts: ChipCounts; conversations?: never }`) e :30 (`counts: providedCounts`) — com `ChipCounts` e os predicados extraídos para `src/hooks/inbox/chipCounts.ts:38` (e `countByChip` em :209). O branch, além disso, APAGAVA o cálculo interno e deixava uma prop morta `countOpts?: unknown`.
- uma frase: os chips já recebem contagem pré-calculada do dono do dado, sem quebrar as telas que ainda passam as conversas.

## src/components/inbox/chat/ChatMessagesArea.tsx
- branch: origin/claude/charming-mccarthy-jbxy56
- veredito: OBSOLETO
- prova: o branch REMOVE `virtualizerRef.current?.cancelScroll()`; a `main` o mantém e o refina com distinção de rolagem programática — `src/components/inbox/chat/ChatMessagesArea.tsx:122`, :125 (`isProgrammaticScrollRef`), :133 (`if (!nearBottom && !wasProgrammatic) virtualizerRef.current?.cancelScroll();`) e marcação em :302, :309, :319.
- uma frase: recuperar o branch tiraria a trava que impede a lista de pular enquanto o atendente lê o histórico.

## src/components/settings/AppearanceSettings.tsx
- branch: origin/claude/fix-logger-vitest-mock-261017-1000
- veredito: OBSOLETO
- prova: o branch só torna `isSaving`/`onSave` opcionais (acomodação de teste, não comportamento); a `main` os mantém obrigatórios de propósito — `src/components/settings/AppearanceSettings.tsx:21-22` ("vêm do hook canônico (`useUserSettings`) … um só dono da escrita") e usa em :61/:159-160 — e ganhou depois o seletor de tamanho do texto do chat (`ChatTextSize`).
- uma frase: nenhum comportamento se perde; tornar as props opcionais só esconderia tela de Aparência sem dono da escrita.

## src/hooks/tasks/workItemAggregates.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: o branch apenas troca o escape `̀-ͯ` por caracteres combinantes literais no regex — mesmo comportamento. A `main` tem a forma legível em `src/hooks/tasks/workItemAggregates.ts:102`: `return texto.normalize('NFD').replace(/[̀-ɯ]/g, '').toLowerCase();`
- uma frase: a busca que ignora acento já funciona igual na `main`; a diferença é só de grafia do regex.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida

## src/hooks/inbox/useInboxBulkActions.ts
- branch: origin/claude/feat-bulk-archive-two-step-undo-261101-0800
- veredito: OBSOLETO
- prova: src/hooks/inbox/useInboxBulkActions.ts:254-296 da main (`validFromArchived`, `directGroups`/`twoStepGroups`, helper `moveTo` com `from` esperado e `restore`) — a main já faz o desfazer em dois saltos (archived→open→status), e vai além: usa a RPC `moveConversationsStatus` (UPDATE direto é recusado no banco), restaura só quem AINDA está no estado esperado e conta por conversa.
- uma frase: a versão da branch faria UPDATE direto em `conversation_status`, que a produção hoje recusa — recuperá-la quebraria o desfazer em vez de melhorá-lo.

## src/hooks/chat/useTeamChatNotifications.ts
- branch: origin/claude/fix-unit-tests-src-261024-1630
- veredito: OBSOLETO
- prova: main tem tudo: refs de preferência em src/hooks/chat/useTeamChatNotifications.ts:147-148, tópico exclusivo por usuário em :161 (`uniqueRealtimeTopic`), `Notification` direta via `showBrowserNotification` com `onClick` em :240-244, e deps só `[profile]` em :254.
- uma frase: a main já entrega o mesmo canal estável e o aviso de desktop clicável, por um helper extraído.

## src/components/security/AuditLogDashboard.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: src/components/security/AuditLogDashboard.tsx:70 da main já consome `useAuditLogDashboard` (hook existe em src/hooks/security/useAuditLogDashboard.ts), com alerta de erro em :105, totais de servidor em :112-115 (`ultimas24h`, `sensiveis24h`, `usuariosUnicos7d`) e nome do autor em :78 e :214.
- uma frase: a melhoria (totais no servidor e nome do autor) já está na main; a branch só traz a mesma coisa com aspas duplas e sem acentos.

## supabase/migrations/20261107133000_fix_copilot_rls_open_policies.sql
- branch: origin/claude/fix-db-live-migrations-261107-1623
- veredito: OBSOLETO
- prova: comparação normalizada (sem comentários/espaços) do arquivo nas duas pontas é idéntica — as mesmas 16 policies `seller_id = auth.uid()` / `scored_by` / `tagged_by` / `submitted_by`; a main só mantém o cabeçalho explicativo (linhas 1-7).
- uma frase: a branch só apagou comentários e juntou linhas — zero diferença de RLS aplicada.

## src/hooks/business/useWarRoomAlerts.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: src/hooks/business/useWarRoomAlerts.ts:148-156 da main usa `showBrowserNotification` (API `Notification` direta, porque o push exige Service Worker desligado) sob `if (settings.browserNotifications)`, com deps `[queryClient, playAlertSound, settings.browserNotifications]` em :164.
- uma frase: mesma correção (abandonar o push quebrado e respeitar o liga/desliga do painel) já na main, com a chamada extraída para helper; o resto da branch é um byte trocado no base64 do som.

## src/components/catalog/WhatsAppTemplatesManager.tsx
- branch: origin/claude/fix-fila-offline-sem-dono-261025-2110
- veredito: OBSOLETO
- prova: src/components/catalog/WhatsAppTemplatesManager.tsx:39 da main usa `const { isSupervisor: canWrite } = useUserRole()` com aviso em :58 e gating em :63/:101 — e a RLS real é `is_admin_or_supervisor(auth.uid())` (supabase/migrations/20260315123034_fb4761eb-5659-4530-b537-8dae9420d1ef.sql:25 e 20260317222534_cc94813a-a022-44e5-846f-f4164d9a4308.sql:52).
- uma frase: a premissa da branch ("escrita é admin-only") está errada — recuperá-la esconderia os botões de supervisores que o banco autoriza.

## e2e/fixtures/mapa-mocks.ts
- branch: origin/claude/fix-e2e-mock-app-bootstrap-261024-1527
- veredito: OBSOLETO
- prova: e2e/fixtures/mapa-mocks.ts:110 da main já mocka `rpc/app_bootstrap`, e com um payload de verdade (`bootstrap`) em vez do `{}` da branch.
- uma frase: o bootstrap do shell nos testes E2E já está mockado na main, de forma mais completa.

## src/components/inbox/copilot/MissingQuestions.tsx
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: o arquivo existe na main (src/components/inbox/copilot/MissingQuestions.tsx) e é mais rico: importa `BRINDE_QUESTIONS`/`getMissingLetters`/`getBrindeQuestion` de `@/data/copilot/brinde-questions`, varia a pergunta por `stage` e cada sugestão é um botão que chama `onSelectQuestion`.
- uma frase: a main já tem o painel "O que falta perguntar" clicável e por estágio da venda; a branch tem a versão estática inicial.

## src/components/security/PasswordResetRequestsPanel.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: src/components/security/PasswordResetRequestsPanel.tsx:40-42 e :57-59 da main já trocam o erro cru por `ACCESS_DENIED_MESSAGE` quando `isAccessDeniedError(error)`, no `catch` (import em :13).
- uma frase: a mensagem de acesso negado sem vazar tabela/policy já está na main, só em outro ponto do try/catch.

## src/components/inbox/InboxEmptyChat.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: src/components/inbox/InboxEmptyChat.tsx:58-65 da main tem as mesmas props (`waitingCount`, `unreadCount`, `onNewConversation`), com o botão em :89-90 e os contadores em :95-102.
- uma frase: o vazio do inbox com "Nova conversa" e contadores reais já está na main.

## src/components/inbox/RealtimeInboxView.tsx
- branch: origin/claude/confident-bardeen-ndq0ch
- veredito: OBSOLETO
- prova: `cachedConversations` nunca é undefined — src/hooks/system/useOfflineCache.ts:106 (`cachedData || conversations`) e :115 sempre devolvem array, e a main já usa `.find`/`.reduce` direto (src/hooks/inbox/useRealtimeInbox.ts:131, src/components/inbox/RealtimeInboxView.tsx:236).
- uma frase: os dois `?? []` da branch são defesa contra um caso que não existe — não mudam comportamento.

## src/components/inbox/contact-details/sidebar/sidebarSections.ts
- branch: origin/claude/fix-logger-vitest-mock-261017-1000
- veredito: OBSOLETO
- prova: src/components/inbox/contact-details/sidebar/sidebarSections.ts:26 da main já lista `'memoria'` (e também `'atendimento'`), com a mesma regra de chave de storage intacta documentada em :20-23.
- uma frase: a seção "Memória da conversa" já é valor conhecido na main.

## supabase/functions/_shared/evolution-webhook-msg-handlers.ts
- branch: origin/claude/feat-message-delivery-post-iniciado-261101-1937
- veredito: OBSOLETO
- prova: main já tem o guarda C110 e o fallback pré-DDL: supabase/functions/_shared/evolution-webhook-msg-handlers.ts:40, :50, :80, :89, :147, :155 (`42703`), :177, :182 — e ainda fecha o TOCTOU com `.is('manually_resolved_at', null)` no próprio UPDATE em :54 e :92.
- uma frase: a proteção "recibo tardio não sobrescreve decisão manual do operador" já está na main, inclusive em pontos que a branch deixou de fora.

## src/components/inbox/VirtualizedRealtimeList.tsx
- branch: origin/claude_pink/nice-hypatia-iikl82
- veredito: OBSOLETO
- prova: src/components/inbox/VirtualizedRealtimeList.tsx:84 e :317 da main declaram `onReopen`, e ele está ligado de ponta a ponta — :114, :260, :375, :413-429 e o `ConversationReopenDialog` em :779.
- uma frase: a branch só declarava a prop na interface; a main já tem o reabrir conversa funcionando com diálogo.

## src/hooks/tasks/workItemFormat.ts
- branch: origin/claude/magical-pasteur-iz2pgy
- veredito: OBSOLETO
- prova: src/hooks/tasks/workItemFormat.ts:62 da main mantém `"09 out."` de props�sito, e o formato é contrato testado em src/hooks/tasks/__tests__/workItemFormat.test.ts:49-51 (inclusive virada de ano: `'05 jan.'`).
- uma frase: trocar para `dd/mm/aaaa` é preferência visual, não comportamento perdido — e contraria o formato que a main testa.

## supabase/functions/_shared/talkx-window.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: supabase/functions/_shared/talkx-window.ts:329 da main já tem `start === null || !Number.isInteger(start) || end === null || !Number.isInteger(end) || ...` — o mesmo `Number.isInteger` da branch, somado à checagem de null.
- uma frase: a janela de envio inválida já fecha na main, com a verificação da branch incluída.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida


## supabase/functions/_shared/evolution-webhook-handlers.ts
- branch: origin/fix/ci-verde-261021
- veredito: OBSOLETO
- prova: `origin/main:supabase/functions/_shared/evolution-webhook-handlers.ts:271` (descarte de `@broadcast`), `:286` e `:304` (grupo sem autor com sufixo `@s.whatsapp.net`/`@lid` → `return`), `:273-308` (estados dos dois envelopes ChatPresence/Presence), `:322-327` (canal `private: true` + payload de grupo com `participant`/`typing`), `:334-348` (presence_status só no 1:1 e `last_seen_at` só na transição online→offline). A `main` ainda tem `try/finally` no `removeChannel` (`:323-330`), que a branch não tem.
- uma frase: a `main` já faz tudo que a branch fez no `handlePresenceUpdate`, com critério de autor de grupo mais estrito e liberação garantida do canal.

## src/hooks/inbox/useInboxFilters.ts
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/inbox/useInboxFilters.ts:97` (`useSearchParams`), `:106` (`searchParams.get('type')` dentro de `basePrefs`), `:151-160` (`setSearchParams(..., { replace: true })` em vez de `window.history.replaceState`), `:166-180` (efeito que sincroniza o rascunho quando o `?type=` muda por back/forward — que a branch não tem).
- uma frase: o PK-14 (o `?type=` passar a viver no roteador) já está na `main`, com o extra de acompanhar voltar/avançar do navegador.

## src/components/talkx/TalkXCampaignWizard.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/components/talkx/TalkXCampaignWizard.tsx:21` (import de `useTalkXCampaignSummary`), `:744-782` (bloco X131 no `WizardRail`: `summaryEnabled`, `summary.isLoading` → `…`, `summary.isError` → `—`, `totalValue/eligibleValue/blockedValue` do servidor); teste de regressão em `origin/main:src/components/talkx/__tests__TalkXCampaignWizard.resumo-servidor.test.tsx`.
- uma frase: o rail de resumo da campanha já lê o público do servidor na `main`, por um hook dedicado em vez das variáveis `rail*` da branch.

## src/components/talkx/useCampaignEditor.ts
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: a query `talkx-wizard-rail-summary` da branch foi substituida na `main` pelo hook `useTalkXCampaignSummary` (`origin/main:src/hooks/integrations/useTalkXCampaignSummary.ts`), consumido em `origin/main:src/components/talkx/TalkXCampaignWizard.tsx:752`; o editor segue sem expor `railSummary` (`origin/main:src/components/talkx/useCampaignEditor.ts:1227`).
- uma frase: mesma contagem de público via RPC `talkx_resolve_audience`, só que extraída para hook próprio — o estado no editor virou código duplicado.

## src/hooks/delivery/useUnconfirmedMessages.ts
- branch: origin/claude/feat-message-delivery-post-iniciado-261101-1330
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/delivery/useUnconfirmedMessages.ts` é superconjunto da versão da branch — `:64` (`unconfirmedRefetchInterval`, recuo exponencial sob erro), `:102` (`.eq('status','sending')`, mais correto que o `not in (...)` da branch, que deixava `failed` resolvível), `:107-108` (suporte a conversa de grupo por `whatsapp_group_id`), `:117` (polling adaptativo).
- uma frase: o hook da branch nasceu na `main` com correção de status, suporte a grupo e recuo de polling por cima.

## src/components/ui/phone-input.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `origin/main:src/components/ui/phone-input.tsx:19` (`rest.length === 8 && !rest.startsWith('9')` cobre o mesmo reflow 5-4 vs 4-4 que a branch resolvia olhando o grupo digitado) e `:38-110` (`isExplicitInternationalRef`, `onPaste`/`onDrop`, `inputType` de deleção — cobre o "não prefixar 55 quando o número é E.164 declarado" da branch, incluindo colar e apagar).
- uma frase: as duas correções de máscara da branch (+DDI declarado e não reflowar ao apagar) estão na `main` por um caminho que também trata colar, arrastar e apagar.

## src/hooks/admin/useSearchInsights.ts
- branch: origin/claude_05/serene-feynman-3uuurw
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/admin/useSearchInsights.ts:100` (`supabase.rpc('search_insights', { p_days: days })`, mesma troca da RPC inexistente `get_search_insights`), `:66` (`parseSearchInsights(raw, days)`), `:46-64` (validação que lança `SearchInsightsError` em vez de zerar KPI silenciosamente).
- uma frase: a migração para a RPC canònica já está na `main`, com validação mais rígida da resposta.

## src/components/ui/card.tsx
- branch: origin/claude/feat-ui-visual-texto-longo-261101-1445
- veredito: OBSOLETO
- prova: `origin/main:src/components/ui/card.tsx:86` (`CardHeader`), `:97` (`CardTitle`), `:103` (`CardDescription`), `:109` (`CardContent`), `:115` (`CardFooter`) — a única diferença contra a branch são classes Tailwind (`min-w-0`, `break-words`, `leading-tight` vs `leading-none`); nenhuma lógica, prop ou estado muda.
- uma frase: diferença exclusivamente de classe CSS, que esta auditoria não trata como melhoria recuperável (observação: na `main` um título de card com palavra muito longa não quebra linha).

## src/components/admin/SearchInsightsView.tsx
- branch: origin/codex/publish-followup-20261021
- veredito: OBSOLETO
- prova: `origin/main:src/components/admin/SearchInsightsView.tsx:113` (skeleton `sm:grid-cols-3` com 3 placeholders) e `:128-160` (4 cards de KPI reais) — o único resto da branch é a contagem do skeleton (4 em `xl:grid-cols-4`); tudo o mais é comentário/formatação, e a `main` ainda formata o tamanho médio com `toLocaleString('pt-BR', { maximumFractionDigits: 1 })` (`:142` e `:217`), que a branch não tem.
- uma frase: só sobra um descompasso cosmético de skeleton durante o carregamento; o conteúdo e a formatação da `main` são mais recentes.

## src/components/dashboard/ProgressiveDisclosureDashboard.tsx
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/ProgressiveDisclosureDashboard.tsx:37` (`const queryClient = useQueryClient();`), `:49-57` (assinatura do cache sem guarda de null) e `:60` (`handleRefresh` padrão com `refetchQueries`) — mesmo efeito do `useContext(QueryClientContext)` + guardas da branch.
- uma frase: o carimbo de "última atualização" e o botão Atualizar continuam funcionando na `main`; a branch só trocava a forma de obter o QueryClient.

## src/services/contact.service.ts
- branch: origin/claude/keen-galileo-dxai3p
- veredito: OBSOLETO
- prova: `origin/main:src/services/contact.service.ts:185` (`...(options?.isPinned === true ? { is_pinned: true } : {})` sem `any`) e `:205` (`update(updates)` sem cast) — a branch só inseria `eslint-disable` + `any` como ponte pré-`types.ts`; a coluna já existe (migration 20261026200000) e a `main` ainda adicionou `getByIds` (`:62-71`).
- uma frase: a branch só tinha casts de tipo para compilar antes da migration, que já está aplicada.

## src/components/knowledge/KnowledgeBaseView.tsx
- branch: origin/claude/kind-gates-87mwoe
- veredito: OBSOLETO
- prova: `origin/main:src/components/knowledge/KnowledgeBaseView.tsx:117-131` (`kbErrorBlock` com `role="alert"`, `data-testid="kb-error"` e botão "Tentar novamente") e `:143-144` (`{error ? ... }` substituindo contadores e abas) — mesmo efeito do early-return da branch; a `main` ainda acrescenta diálogo de confirmação para excluir artigo (`:277-300`).
- uma frase: a tela já avisa quando a leitura da base falha, em vez de mostrar zero como se fosse contagem real.

## src/components/mfa/MFAVerify.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: `origin/main:src/components/mfa/MFAVerify.tsx:58-66` (`let disponiveis = factors; if (disponiveis.length === 0) { disponiveis = await fetchFactors(); }`), `:69-75` (limpa o campo quando não há fator) e `:29-36` (`fetchFactors().catch`) — cobre a corrida que a branch tratava com `factors.length > 0` + dep `factors`.
- uma frase: o código de 6 dígitos digitado antes dos fatores carregarem continua sendo verificado na `main`, resolvendo a lista na hora em vez de só esperar.

## src/components/dashboard/ScheduledReportsManager.tsx
- branch: origin/claude/charming-mccarthy-jbxy56
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/ScheduledReportsManager.tsx:135-136`, `:229` e `:232` já usam `text-[hsl(var(--primary-text))]` (a `main` aplicou o token até no subtítulo, onde a branch deixou `text-primary/80`); a `main` ainda troca a exclusão direta por `AlertDialog` de confirmação (`:167-184`).
- uma frase: a troca de token de cor da branch já está na `main`, mais completa.

## src/components/dashboard/overview/GamificationSection.tsx
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: `origin/main:src/components/dashboard/overview/GamificationSection.tsx:28-29` (`const { visibleWidgets: configuradosPeloHook } = useDashboardWidgets(); const configurados = visibleWidgets ?? configuradosPeloHook;`) — a branch removia o fallback, deixando `?? []`.
- uma frase: a versão da branch é a mais pobre: sem a prop, a seção de gamificação ficaria vazia.

## src/hooks/analytics/useGoalNotifications.ts
- branch: origin/claude/fix-conversas-go-perf-261113
- veredito: OBSOLETO
- prova: `origin/main:src/hooks/analytics/useGoalNotifications.ts:250-257` (`Promise.allSettled` + `log.error('Erro ao medir meta; as demais seguem', ...)`) — a branch ficou no `Promise.all`, em que uma contagem com erro derrubava o anúncio de todas as metas.
- uma frase: a `main` é a versão posterior e mais resistente do mesmo laço de medição de metas.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida

