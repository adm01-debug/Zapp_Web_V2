# Vereditos dos 96 caminhos — lote 5 (16 caminhos)

Base: `origin/main` @ `a56d9cb7`. Uma seção por caminho: a branch representativa, o veredito e a prova com `arquivo:linha` da `main`. Os 96 caminhos são os que, dos 135 que sobraram da triagem automática dos 408 pares, ainda não tinham veredito nominal nos documentos anteriores da série.


## src/components/admin/useAdminData.ts
- branch: origin/fix/f1a-lote-b-useadmindata-createuser-avatar
- veredito: OBSOLETO
- prova: os dois unicos comportamentos da branch ja estao na `main`: `src/components/admin/useAdminData.ts:141-150` (e-mail ja cadastrado -> "Este e-mail ja esta cadastrado."; `invalid enum value` -> `{ field: 'role' }`) e `src/components/admin/useAdminData.ts:232-258` (assina o avatar do bucket privado em paralelo, `createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS)`, com `avatar_url: avatarUrls[index]`). O resto do diff da branch (229/175 linhas) e reformatacao de `useCallback` e de `.select()`.
- uma frase: nada a recuperar — a branch e a mesma correcao em versao mais antiga, com churn de formatacao em volta.

## src/services/outbound-message.service.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: a `main` tem a mesma trava de dono da fila offline em forma melhor: `src/services/outbound-message.service.ts:372-381` (`pertenceAoUsuarioAtual`), `:389-393` e `:400-404` (`shouldDeliver`), `:393-396` (`enqueueOffline` recusa enfileirar sem sessao). O `readCurrentUserId` inline da branch foi extraido para `src/lib/authenticatedUserId.ts` (importado em `:13`) — a armadilha `mediaVolumeStore` -> `authenticatedUserId` confirmada.
- uma frase: a `main` ja impede que o texto de um atendente saia pela sessao de outro, com cobertura maior (item sem dono nunca drena).

## src/components/inbox/CRMAutoSync.tsx
- branch: origin/claude/fix-ci-tests-261019-1200
- veredito: OBSOLETO
- prova: a branch REVERTEU o arquivo para a versao antiga (perde `CRMSyncButton`, `useSyncToCRM`, estados `CRM nao configurado` e `contact_not_found`, e o `CRMAutoSync` invisivel). A `main` tem tudo: `src/components/inbox/CRMAutoSync.tsx:40` (`CRMAutoSync` invisivel, auto-sync no navegador removido de proposito), `:49` (`CRMSyncButton`), `:66-81` (wrapper focavel com `aria-label="CRM nao configurado"`), `:112` (`contact_not_found`).
- uma frase: aplicar a branch apagaria o botao manual de CRM e os dois estados desabilitados acessiveis que a `main` ja entrega.

## src/components/inbox/copilot/CopilotPanel.tsx
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: o painel B.R.I.N.D.E. da branch (medidor + etapa + perguntas que faltam) virou o painel RADAR na `main`, ligado ponta a ponta: `src/components/inbox/chat/ChatInputArea.tsx:37,245` (lazy `RadarLive`) -> `src/components/inbox/copilot/RadarLive.tsx:31-54` -> `src/components/inbox/copilot/RadarPanel.tsx:380-396` com `StageCard` (`RadarCards.tsx:53-70`, etapa + temperatura) e `BrindeCard` (`RadarCards.tsx:88-110`, letras B.R.I.N.D.E. preenchidas/faltantes). O caminho `CopilotPanel.tsx` da `main` e outro componente, usado por `src/components/inbox/tabs/AiTab.tsx:112`.
- uma frase: o conteudo do painel da branch ja chega ao atendente pelo RADAR, que alem disso nao exige clique em "Analisar" (a sessao nasce por gatilho no banco).

## src/hooks/team-chat/useTeamMessages.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: a `main` tem o `onEvent` tipado (`src/hooks/team-chat/useTeamMessages.ts:47-56` `TeamMessageEvent`), em ref para nao reinscrever o canal (`:60-62`), com DELETE lendo `payload.old` (`:132-134` — a branch lia `payload.new`, que vem vazio no DELETE) e `return { messages, isLoading, isError, refetch }` em `:196`.
- uma frase: a `main` cumpre a reconciliacao de edicao/exclusao e corrige o bug de DELETE que a versao da branch tinha.

## src/services/chat.service.ts
- branch: origin/claude_pink/nice-hypatia-iikl82
- veredito: OBSOLETO
- prova: `src/services/chat.service.ts:61-74` da `main` faz o mesmo (nome e `contentType` seguem o tipo real do blob) com mapa explicito `extByMime` (webm/ogg/m4a/mp3) e `contentType: mimeType`.
- uma frase: o audio gravado no Safari (mp4) ja sobe com o tipo correto na `main`.

## src/components/inbox/copilot/StageIndicator.tsx
- branch: origin/claude/feat-copilot-radar-20261108-1800
- veredito: OBSOLETO
- prova: `src/components/inbox/copilot/StageIndicator.tsx:15-50` na `main` e a versao mais rica do mesmo componente: rotulos vindos de `SALE_STAGE_META`/`isSaleStage` (`src/data/copilot/sale-stages.ts`), 10 barras com `aria-label="Temperatura de compra: N/100"` e `confidence` opcional.
- uma frase: a `main` tem o mesmo indicador com acessibilidade e etapas centralizadas.

## src/components/talkx/TalkXTemplates.tsx
- branch: origin/claude_juca/practical-rubin-8xnw0u
- veredito: OBSOLETO
- prova: a `main` tem o import/export de templates da branch inteiro e mais: `src/components/talkx/TalkXTemplates.tsx:137-152` (export CSV/JSON via `serializarTags`) e `:155-207` (importacao em que `overwrite` faz UPDATE pelo id com `expectedUpdatedAt` em vez de criar duplicata, com `desserializarTags`/`nomeDeCopia`).
- uma frase: aplicar a branch traria de volta o defeito de a sobrescrita criar um segundo template com o mesmo nome.

## src/components/connections/InstancePausesPanel.tsx
- branch: origin/claude/feat-completar-c121-261101-1330
- veredito: OBSOLETO
- prova: o arquivo existe na `main` praticamente igual, ligado em `src/components/connections/ConnectionsView.tsx:26,283`; as unicas diferencas sao melhorias da `main`: hook `useInstancePauseControls` (`InstancePausesPanel.tsx:89`), limites vindos do servico (`:23-24`, `PAUSE_MIN_MINUTES`/`PAUSE_MAX_MINUTES`) e o texto do dialogo atualizado (`:204`) porque campanhas e fila de entrega passaram a respeitar a pausa.
- uma frase: o painel de pausas de instancia esta na `main` e o texto da branch ainda diz que campanhas nao respeitam a pausa, o que deixou de ser verdade.

## src/components/settings/SettingsView.tsx
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: a branch so REMOVEU o botao global "Salvar Alteracoes" (e os imports `Save`/`Loader2`). A `main` manteve o salvamento, movido para dentro da aba: `src/components/settings/SettingsView.tsx:74` (`isSaving`, `saveAppearanceSettings`) e `:225` (`<AppearanceSettings ... isSaving={isSaving} onSave={saveAppearanceSettings} />`).
- uma frase: a branch tiraria o salvamento da tela de configuracoes; a `main` o manteve no lugar certo.

## src/hooks/calls/useCallRecording.ts
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: `src/hooks/calls/useCallRecording.ts:79-83` da `main` faz exatamente isso — `const bytes = await resposta.arrayBuffer(); const blob = new Blob([bytes], { type: resposta.headers.get('content-type') ?? '' })` — com o comentario explicando que o Blob precisa ser do contexto da pagina.
- uma frase: a gravacao da chamada ja e remontada como Blob da pagina na `main`.

## src/components/admin/AdminUsersTable.tsx
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: a branch mudou uma linha so de tipo (`as keyof typeof accessLevelConfig`), que nao e comportamento. A `main` reescreveu a regiao com funcionalidade: `src/components/admin/AdminUsersTable.tsx:34-37` + `:143-165` (confirmacao antes de desativar usuario, avisando que as sessoes serao revogadas) e `:100` (opcao `special_agent` no seletor de papel).
- uma frase: nada de comportamento na branch; a `main` ainda acrescentou a confirmacao de desativacao.

## src/hooks/communication/useSipClient.ts
- branch: origin/claude/fix-console-sip-gate-261112
- veredito: OBSOLETO
- prova: a `main` e superconjunto exato: `src/hooks/communication/useSipClient.ts:24` (`PEDIDO_EXPLICITO_JANELA_MS`), `:95-103` (`ignorarTrava`), `:108-112` (`reconectarLinha`), `:161` (exportado) — e ainda amarra a linha ao usuario logado (`:88-92`, `:127-135`, `:143-155`). Consumidor: `src/components/calls/NewCallPanel.tsx:44,229`.
- uma frase: o botao "Reconectar linha" com a trava de SIP ja esta na `main`, com o cuidado extra de nao registrar a linha na tela de login.

## src/lib/invokeEdge.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: a branch apenas removeu o `const log` do modulo e inlinou `createLogger('edge-invoke')`. A `main` tem o `log` de modulo (`src/lib/invokeEdge.ts:35`) e, no mesmo bloco, o comportamento que importa: `:256-262` converte o erro da Edge em `EdgeFunctionError` via `parseEdgeError`.
- uma frase: mudanca sem efeito para o usuario, e a regiao foi reescrita depois na `main` com tratamento de erro de verdade.

## src/components/dashboard/SentimentAlertsDashboard.tsx
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: a branch REMOVEU o aviso de leitura incompleta. A `main` o tem: `src/components/dashboard/SentimentAlertsDashboard.tsx:14` (consome `incomplete` de `useSentimentData`) e `:51-55` (`data-testid="sentiment-incomplete"`, "A leitura do periodo nao foi completa — os numeros podem estar abaixo do total.").
- uma frase: aplicar a branch esconderia do supervisor que os numeros de sentimento podem estar incompletos.

## src/hooks/chat/useScheduledReports.ts
- branch: origin/claude/fix-unit-tests-pre-existentes-261024-1700
- veredito: OBSOLETO
- prova: a branch so trocou o texto do toast por uma versao sem acento ("Erro ao atualizar o relatorio"). A `main` tem o texto correto e mais especifico em `src/hooks/chat/useScheduledReports.ts:144`: `toast.error('Erro ao ativar/desativar relatório')`.
- uma frase: mudanca de texto que piora a mensagem — nada a recuperar.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida
