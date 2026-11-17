# Vereditos dos 96 caminhos — lote 6 (16 caminhos)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.

## src/components/talkx/TalkXOverview.tsx
- branch: origin/claude/ga-ci-verde-261020
- veredito: OBSOLETO
- prova: `src/components/talkx/TalkXOverview.tsx:10-16` (import de `TalkXTable`, `EntityCell/ChannelCell/ProgressCell/ResultsCell/DateByCell`, `TalkXColumn/TalkXSort`), `:315-358` (colunas X079 do mock, com `sortKey` em 6 colunas contra 1 da branch), `:445-464` (`TalkXTable` + `onSortChange` que também reseta a página), `:464-476` (rascunhos abaixo da tabela, recolhidos, `aria-expanded`), `:513-522` (bloco Insights recolhível)
- uma frase: tudo que a branch fez (tabela do kit, ordenação, blocos N35/TL-115 recolhidos) já está na `main`, com ordenação em mais colunas e reset de página.

## src/components/settings/AvatarUpload.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: RECUPERADO (parcial) — PR #3212
- prova: o upload da `main` é superset: `src/components/settings/AvatarUpload.tsx:20-31` (`formatoAnterior`/`formatoDaUrl`, C-1), `:53-67` (nome estável `<id>/avatar.<ext>` + listagem da pasta antes do upload), `:92-106` (remoção do formato órfão + `invalidateQueries(['team-profiles-rpc'])` e `['user-profile']`). **Mas o `handleRemove` não era**: a `main` só chamava `refreshProfile()` (`:125-128`), que em `src/hooks/auth/useAuth.tsx:207-212` refaz apenas o perfil da sessão e **não toca no cache do react-query**; a lista de membros (`src/hooks/crm/useTeamProfiles.ts:9-22`, `queryKey: ['team-profiles-rpc']`, `staleTime: 30_000`) seguia servindo a foto apagada. A branch invalidava os dois alvos ali (`:113-114` dela). Recuperado na PR #3212, com teste que falha sem o fix.
- uma frase: único dos 96 em que havia melhoria perdida de verdade — remover a foto não avisava o resto da equipe; (Correção de 17/11: a primeira versão deste veredito chamou a diferença de "troca, não melhoria perdida". Estava errado. Apontado por Devin na revisão da PR #3210 e conferido no código.)

## src/hooks/analytics/useGoalsDashboard.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: `src/hooks/analytics/useGoalsDashboard.ts:122-134` (taxa de resolução vinda de `contacts.conversation_status='resolved'`, não mais de `conversation_analyses`), `:151-153` (`hasResolutionData`), `:180-186` (`overallProgress` ignora meta sem dado), `:190` (`isLoading` inclui `loadingProfile`)
- uma frase: a `main` já troca a fonte da taxa de resolução e exclui meta sem dado do progresso geral, e ainda espera o perfil carregar antes de mostrar 0%.

## e2e/fixtures/onboarding-isolated.ts
- branch: origin/claude/test-e2e-suite-completa-261104-1428
- veredito: OBSOLETO
- prova: `e2e/fixtures/onboarding-isolated.ts:18-45` (mesma fixture com `isolatedTarget(expected)` e `Object.is` nas comparações de chave), `:105-121` (`gotoOnboardingContacts` com `includeHidden` para o WelcomeModal e um retry idempotente do goto)
- uma frase: a fixture isolada de onboarding da branch está na `main` com as checagens mais estritas e a prontidão de tela corrigida.

## src/hooks/integrations/useKnowledgeBase.ts
- branch: origin/claude/fix-unit-tests-main-261019-1500
- veredito: OBSOLETO
- prova: `src/hooks/integrations/useKnowledgeBase.ts:58-62` (comentário t_1944d290 + `const [error, setError]`), `:66-78` (try/catch e `setError(articlesRes.error?.message ?? filesRes.error?.message ?? null)`), `:237` (`error` no retorno)
- uma frase: o estado de erro da base de conhecimento (falha de leitura não virar "base vazia") já existe na `main`, com try/catch que a branch não tinha.

## src/components/dashboard/useSentimentData.ts
- branch: origin/claude_05/zen-feynman-29b7ix
- veredito: OBSOLETO
- prova: `src/components/dashboard/useSentimentData.ts:92-99` (`fetchError`/`incomplete` e reset por tentativa), `:134-146` (falha só dos agentes marca `incomplete`; catch grava `fetchError`), `:234` (retorno com `error`, `isError`, `incomplete`)
- uma frase: a `main` já distingue "leitura falhou" de "período vazio" e, diferente da branch, de fato liga o sinal `incomplete` quando só a lista de agentes falha.

## src/components/inbox/collaboration/InternalNotesPanel.tsx
- branch: origin/claude_pink/nice-hypatia-iikl82
- veredito: OBSOLETO
- prova: `src/components/inbox/collaboration/InternalNotesPanel.tsx:18` (`useMentionableProfileNames`), `:22-24` (`escapeRegExp`), `:69-76` (padrão de menção com nomes reais ordenados por tamanho, agora com classes Unicode `\p{L}\p{N}` e flag `giu`), `:78-88` (destaque como badge)
- uma frase: o destaque de @menção pelos nomes reais da equipe já está na `main`, e lá funciona com nomes acentuados, que o `@\w+` da branch não pegava.

## src/components/inbox/copilot/InsightCard.tsx
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: `src/components/inbox/copilot/InsightCard.tsx:32` (mesma função, agora com `sources`/justificativa CV-040, `tier` e botão "Usar"); o tipo que a branch consome (`CopilotInsight` de `@/hooks/chat/useCopilotSession`) não existe mais — a `main` tem `src/hooks/copilot/useCopilotSupervisor.ts:9`; e o fluxo de insights ao vivo mora em `src/components/inbox/copilot/RadarPanel.tsx:360-441` + `LiveSuggestions.tsx`
- uma frase: a `main` reescreveu o mesmo arquivo com um cartão mais rico (justificativa, fonte clicável, "Usar") dentro do painel RADAR, que substituiu o CopilotPanel de sessão da branch.

## src/hooks/team-chat/useTeamReadState.ts
- branch: origin/claude/fix-logger-vitest-mock-261017-1000
- veredito: OBSOLETO
- prova: `src/hooks/team-chat/useTeamReadState.ts:77-83` — a `main` consulta `team_message_read_state` com o client tipado, sem `(supabase as any)` nem `eslint-disable`; e tem mais: `:61` `hasOwnMessages`, `:103` guarda do realtime, `:119` retorno com `isError`
- uma frase: a branch só adicionou um cast de tipo temporário até o types-sync; o tipo já entrou e a `main` ainda ganhou a guarda de realtime e o estado de erro.

## src/components/gamification/TrainingMiniGames.tsx
- branch: origin/claude/fix-logger-vitest-mock-261017-1000
- veredito: OBSOLETO
- prova: `src/components/gamification/TrainingMiniGames.tsx:12-17` (nota PB-18/D4: o cliente não credita XP; mini-games guardam só o recorde pessoal), `:26-43` (`lerRecordes` tolerante a localStorage inválido/bloqueado), `:68-79` (`partidaConcluida` por partida, pontuação saneada)
- uma frase: a branch removia o crédito de XP; a `main` já fez essa decisão e foi além, protegendo a leitura/escrita do `localStorage` e tratando a conclusão uma vez por partida.

## src/components/inbox/chat/UnconfirmedMessagesPanel.tsx
- branch: origin/claude/feat-message-delivery-post-iniciado-261101-1330
- veredito: OBSOLETO
- prova: `src/components/inbox/chat/UnconfirmedMessagesPanel.tsx:17-21` (mesmas props, mais `groupId`), `:38-40` (`useUnconfirmedMessages(contactId, groupId)`)
- uma frase: o painel C110 de entrega não confirmada criado na branch está na `main` idêntico, e lá também cobre grupos de WhatsApp.

## supabase/functions/_shared/evolution-webhook-messages.ts
- branch: origin/claude/feat-message-delivery-post-iniciado-261101-1937
- veredito: OBSOLETO
- prova: `supabase/functions/_shared/evolution-webhook-messages.ts:1003-1030` (mesma consulta de pendente com `manually_resolved_at`, fallback 42703 e update com predicado atômico `is('manually_resolved_at', null)`), e a `main` ainda filtra `eq('status','sending')` (`:1008`), adiciona `markWebhookPostStarted` (`:374-389`) e `maskJidForLog` (`:980`)
- uma frase: a proteção C110 (recibo tardio não sobrescreve a decisão manual do operador) já está na `main`, que também impede o recibo de roubar o `external_id` de linha falhada.

## src/components/talkx/segments/SegmentSideList.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: `src/components/talkx/segments/SegmentSideList.tsx:180`, `:201`, `:250` — a `main` já usa `text-[hsl(var(--primary-text))]` nos três lugares
- uma frase: só troca de classe CSS, já aplicada na `main`.

## src/pages/ViewRouter.tsx
- branch: origin/claude_juca/practical-rubin-8xnw0u
- veredito: OBSOLETO
- prova: `src/pages/ViewRouter.tsx:140-149` — a `main` já devolve `TalkXNoPermissionState` para a view `talkx`, e usa `onNavigateTo('team-chat')` (a prop real do router) em vez do `navigateToView` importado da branch
- uma frase: o estado próprio de "sem permissão" do Talk X já está na `main`, com a navegação ligada na prop do router.

## src/components/inbox/copilot/RadarLive.tsx
- branch: origin/claude/feat-radar-motor-telas-261101-1330
- veredito: OBSOLETO
- prova: `src/components/inbox/copilot/RadarLive.tsx:1-80` — a `main` tem o contêiner inteiro da branch mais o efeito de descoberta de sessão (`:24-27` prop `lastContactMessageId`, `:37-49` reconsulta quando chega mensagem nova sem sessão carregada)
- uma frase: o contêiner do RADAR ao vivo criado na branch está na `main` com a correção que faz o painel aparecer sem reabrir a conversa.

## e2e/fixtures/supabase-env.ts
- branch: origin/claude/test-e2e-suite-completa-261104-1428
- veredito: OBSOLETO
- prova: `e2e/fixtures/supabase-env.ts:45-62` (`isolatedConfiguration` com validação do JWT anon), `:67-75` (precedência isolado > override > arquivo e `SUPABASE_STORAGE_KEY`); única diferença é `!Object.is(key, appKey)` no lugar de `key !== appKey` (`:54`)
- uma frase: o modo isolado de E2E da branch está na `main` praticamente linha a linha, com a comparação de chave mais estrita.

RESUMO: 15 obsoletos, 1 recuperado (PR #3212), 0 duvida
