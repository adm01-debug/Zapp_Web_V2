# Vereditos dos 96 caminhos — lote 1 (16 caminhos)

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
- prova: o `CopilotLiveOutputSchema`/`BrindeDeltaSchema` do branch foi reimplementado (com superset de campos) em outro módulo: `supabase/functions/_shared/copilot-tick.ts:59-79` — `CopilotTier1Schema` cobre `sale_stage` (enum `SALE_STAGES` em :49), `temperature`, `brinde` (budget/responsible/intention/quantity/deadline com o mesmo regex de data ISO/delivery), `comm_style`, `decision_role` (`DECISION_ROLES` em :54), `occasion`, `stakeholders`, `key_moments`, e ainda `brinde_evidence`, `risks`, `next_action`; `CopilotTier2Schema` (:84) valida as sugestões. Consumido por `supabase/functions/ai-jobs-worker/index.ts:261`. Os demais envelopes do arquivo (`ObjectionHandlerEnvelope`, `PriceAnchorEnvelope`, …) a `main` tem em `ai-response-contracts.ts:175-255` e o branch não.
- uma frase: o contrato do copiloto ao vivo está validado na `main`, em `copilot-tick.ts` — caso clássico de função extraída para outro módulo.

## src/lib/offlineQueue.ts
- branch: origin/claude/ecstatic-bardeen-twiveb
- veredito: OBSOLETO
- prova: o filtro `userId` do branch foi substituído na `main` por um filtro genérico mais forte: `src/lib/offlineQueue.ts:75` (`shouldDeliver?: (message) => boolean`), aplicado em :252 (`if (drainOptions.shouldDeliver && !drainOptions.shouldDeliver(message)) continue;`), com a contagem corrigida em :242 e propagação em :369/:375 e :399/:404. A `main` ainda ganhou a trava de `generation` contra ressurreição de item após `clear()` (logout), que o branch não tem.
- uma frase: a mensagem de um atendente continua não saindo pela sessão de outro na mesma máquina, e a `main` também protege o logout no meio da drenagem.

## e2e/quarantine.unit.mjs
- branch: origin/claude_pink/cool-dijkstra-xk9ek2
- veredito: OBSOLETO
- prova: a `main` reescreveu o teste num contrato bem mais estrito, importando a fonte canônica: `e2e/quarantine.unit.mjs:7-8` (`import { GROUPS, GROUP_SHARDS } from '../scripts/e2e-isolated/runtime-contract.mjs'`) e `validarMatriz` (:58+) valida 5 grupos, shards autenticados, seleção exata por grupo, timeout por grupo (75/45) e união de 15 projetos. A versão do branch ainda falava de 4 grupos e de `timeout_minutes` com sublinhado — formato que a `main` não usa mais.
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
- prova: o branch só torna `isSaving`/`onSave` opcionais (acomodação de teste, não comportamento); a `main` os mantém obrigatórios de propósito — `src/components/settings/AppearanceSettings.tsx:21-22` ("vêm do hook canônico (`useUserSettings`) … um só dono da escrita") e usa em :61/:159-160 — e ganhou depois o seletor de tamanho do texto do chat (`ChatTextSize`).
- uma frase: nenhum comportamento se perde; tornar as props opcionais só esconderia tela de Aparência sem dono da escrita.

## src/hooks/tasks/workItemAggregates.ts
- branch: origin/claude/fix-codex-findings-161016-1906
- veredito: OBSOLETO
- prova: em `src/hooks/tasks/workItemAggregates.ts:102` a `main` escreve o intervalo do regex de `normalizarBusca` como **escape Unicode de quatro digitos** (barra invertida + u0300 ate barra invertida + u036f), e o branch trocou esse escape pelos **caracteres combinantes literais**. Os dois casam o mesmo intervalo U+0300–U+036F, logo o comportamento é idêntico; a diferença é só de grafia do regex. (Correção de 17/11: a versão anterior desta prova dizia o inverso, atribuindo o literal à `main`. Apontado por Devin na revisão da PR #3210.)
- uma frase: a busca que ignora acento já funciona igual na `main`; a diferença é só de grafia do regex.

RESUMO: 16 obsoletos, 0 recuperar, 0 duvida
