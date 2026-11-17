# Vereditos dos 96 caminhos — lote 2 (16 caminhos)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.

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
- prova: comparação normalizada (sem comentários/espaços) do arquivo nas duas pontas é idêntica — as mesmas 16 policies `seller_id = auth.uid()` / `scored_by` / `tagged_by` / `submitted_by`; a main só mantém o cabeçalho explicativo (linhas 1-7).
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
- prova: src/hooks/tasks/workItemFormat.ts:62 da main mantém `"09 out."` de propósito, e o formato é contrato testado em src/hooks/tasks/__tests__/workItemFormat.test.ts:49-51 (inclusive virada de ano: `'05 jan.'`).
- uma frase: trocar para `dd/mm/aaaa` é preferência visual, não comportamento perdido — e contraria o formato que a main testa.

## supabase/functions/_shared/talkx-window.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: supabase/functions/_shared/talkx-window.ts:329 da main já tem `start === null || !Number.isInteger(start) || end === null || !Number.isInteger(end) || ...` — o mesmo `Number.isInteger` da branch, somado à checagem de null.
- uma frase: a janela de envio inválida já fecha na main, com a verificação da branch incluída.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida
