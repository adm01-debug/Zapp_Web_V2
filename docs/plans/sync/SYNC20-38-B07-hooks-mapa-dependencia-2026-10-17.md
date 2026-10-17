# SYNC20-38 / B07-hooks-38 - mapa medido de dependencia e proposta de sub-lotes

Base dia/2026-10-17 @ d723a90107 x origin/main pinada @ a9b4d6c6fb; merge-base 7a15852791.
Fonte do lote: `docs/plans/sync/dados/lotes.json` (chave `B07-hooks-38`, 38 arquivos), matriz
aprovada 694e68327b. `origin/main` hoje aponta para fed4f57d74, mas entre os dois tips muda so
`src/hooks/dashboard/useDashboardStats.ts` (fora do lote) - por isso a medicao fica pinada em
a9b4d6c6fb, igual aos mapas F05.

Este documento NAO traz codigo de resgate: e o mapa medido e a proposta de re-corte para o cartao
do nivel complexo (SYNC20-45) executar. Nada foi escrito fora de `docs/`; a arvore do cartao ficou
igual a base dia.

Reproducao (do workdir do cartao):

    python3 docs/plans/sync/dados/b07_mapa_dependencia.py
    npx vitest run <14 testes do lote>      # base verde do lote
    npx vitest run src/hooks                # base verde da trilha inteira

Saidas do script: `b07_arquivos.csv` (status por arquivo), `b07_deps.csv` (imports da origin x
dia), `b07_deps_ausentes.csv` (imports que nao existem na dia), `b07_raio_impacto.csv` (quem
importa cada alvo na dia).

## 1. Escopo medido (38 arquivos)

Status blobo a blobo entre a dia e a origin (`b07_arquivos.csv`):

| status | arquivos |
|---|---|
| blob_diferente (conflito de conteudo) | 37 |
| apagado na origin | 1 (`src/hooks/inbox/useInboxFilterTags.ts`) |
| igual | 0 |

Diff total `dia -> origin` nos 38: **+1996 / -617**. Nenhum dos 38 ja esta resolvido: todo arquivo
do lote exige decisao manual.

Por subpasta: chat 5, communication 8, crm 1, dashboard 1, evolution 1, gamification 2, groups 1,
inbox 10, integrations 9. Testes dentro do lote: 14.

## 2. Base verde (por que qualquer vermelho e da origin)

Medido agora, arvore da dia intacta:

    npx vitest run <14 testes do lote>  ->  14 passed (14),  270 passed | 5 expected fail | 1 todo,  0 failed (26,37 s)
    npx vitest run src/hooks            ->  398 passed | 3 skipped (401),  3560 passed | 17 expected fail | 30 todo,  0 failed (152,25 s)

Ou seja: a trilha de hooks da dia esta 100% verde. Todo vermelho que aparece ao trazer o conteudo
da origin e causado pelo proprio conteudo, nao pela base.

## 3. Fecho de dependencia (o lote nao e auto-contido)

Medicao dos imports da versao da origin dos 38 (`b07_deps.csv`):

- **32 modulos fora do lote mudam** entre a dia e a origin e sao importados pelo lote. Fechar B07
  sem eles produz contrato velho importando consumidor novo. Por camada (medido):

  | camada | n | modulos |
  |---|---|---|
  | src/lib | 2 | emailThreadQuery.ts, localDay.ts |
  | src/types | 2 | chat.ts, contact.ts |
  | src/services | 2 | chat.service.ts, realtime.service.ts |
  | src/adapters | 1 | inboxAdapter.ts |
  | src/utils | 1 | notificationSounds.ts |
  | src/components | 6 | calls/IncomingCallAlert.tsx, inbox/{ContactTypeFilter,InboxFilters,AudioMessagePlayer,MediaPreview,VideoFullscreen}.tsx |
  | src/hooks (fora do lote) | 18 | realtime/{messageSender,realtimeUtils,useMessageUpdateBatcher,useRealtimeNotifications,useSupabaseRealtime}.ts, chat/useMessages.ts, auth/useAuth.tsx, crm/useAgentPresence.ts, evolution/{useEvolutionApiCore,useEvolutionMessaging}.ts, gamification/{types,useLeaderboard}.ts, gmail/gmailTypes.ts, integrations/{useMultiplixAudience,useTalkXTemplates}.ts, system/useUrlFilters.ts, team-chat/teamChatTypes.ts, ui/useActionFeedback.ts |

- **2 modulos que a origin importa nao existem na dia** (`b07_deps_ausentes.csv`) - resolucao
  falha direta ao adotar a origin:

  | arquivo do lote (origin) | import ausente |
  |---|---|
  | src/hooks/integrations/useMultiplixDispatches.ts | `@/lib/invokeEdge` (`src/lib/invokeEdge.ts`) |
  | src/hooks/chat/useTeamChatDraft.ts | `@/lib/teamChatDraftSession` (`src/lib/teamChatDraftSession.ts`) |

- Raio de impacto na dia (`b07_raio_impacto.csv`): 32 alvos com importador; **23 arquivos de teste**
  alcancados por import direto dentro de src/tests. O alvo de maior alcance e `src/lib/localDay.ts`
  (7 importadores, 4 deles de teste).

## 4. Por que B07 nao fecha verde hoje (registro da tentativa 1)

Da medicao da tentativa 1 deste cartao, nao remedida aqui:

- fusao mecanica 3-vias (`git merge-file`) em 20 arquivos -> +751/-215, mas sintaticamente
  quebrada: `useInboxFilters.ts` e `useGmail.ts` com `const`/`EMPTY_MESSAGES`/
  `DEFAULT_THREAD_LIST_QUERY` declarados duas vezes e `useRealtimeInbox.ts` com `await` fora de
  funcao async. Nao existe fusao automatica;
- adotar a origin byte a byte quebra **34 arquivos de teste** dentro de src/hooks, inclusive de
  hooks fora do lote (useAgents, useGmail*, useMultiplixDispatches/Replies/Audience,
  usePersonalStickers, useQuarantineMedia, useTalkXCampaignList, useContactsSearch,
  useConnectionsHealth, useExternalDB, useContactUnreadEmails, useEvolutionGroups, uploadTeamMedia);
- os 14 testes do lote so ficam verdes quando producao e teste do modulo permanecem na dia - o
  "lote fechado verde" hoje tem diff vazio.

Conclusao: o vermelho nao vem de um defeito pontual, vem do recorte. Cada hunk exige decisao manual
preservando o trabalho da release da dia.

## 5. Proposta de sub-lotes por fecho de dependencia

Regra: cada sub-lote leva **producao + testes do alvo juntos** e so abre quando as camadas que ele
importa ja estao na base. Ordem de aplicacao = ordem abaixo.

**S0 - fundacao (pre-requisito, fora de B07).** `src/lib/{invokeEdge,teamChatDraftSession,localDay,
emailThreadQuery}.ts`, `src/types/{chat,contact}.ts`, `src/services/{chat,realtime}.service.ts`,
`src/adapters/inboxAdapter.ts`, `src/utils/notificationSounds.ts`. Sem S0 nada do lote resolve
(`invokeEdge`/`teamChatDraftSession` falham na resolucao de import).

**S1 - chat e realtime.** hooks do lote: `chat/{useRealtimeMessages,useTeamChatDraft,
useTeamChatNotifications,useTypingPresence,useWhisperCount}.ts`. hooks fora do lote que entram
junto (fecho): `realtime/{messageSender,realtimeUtils,useMessageUpdateBatcher,useRealtimeNotifications,
useSupabaseRealtime}.ts`, `chat/useMessages.ts`, `system/useUrlFilters.ts`, `auth/useAuth.tsx`.
`useRealtimeMessages` e o maior acoplador do lote (8 deps externas).

**S2 - inbox (componentes antes dos hooks).** componentes fora do lote que o lote importa:
`components/inbox/{InboxFilters,ContactTypeFilter,AudioMessagePlayer,MediaPreview,VideoFullscreen}.tsx`,
`components/calls/IncomingCallAlert.tsx`. Hooks do lote: `inbox/{useInboxFilters,useRealtimeInbox,
chipCounts,useInboxBulkActions}.ts` + `inbox/useSentimentAlerts.ts` e os 4 testes de inbox do lote.

**S3 - integrations, gmail, multiplix, evolution.** hooks do lote: `integrations/{useGmail,
useCatalogSendHistory,useCustomEmojis,useMultiplixDispatches,useMultiplixReplies}.ts` + os 4 testes
de integrations e `evolution/__tests__/useEvolutionMessaging.test.ts`. Fecho: `gmail/gmailTypes.ts`, `integrations/{useTalkXTemplates,useMultiplixAudience}.ts`,
`evolution/{useEvolutionApiCore,useEvolutionMessaging}.ts`.

**S4 - communication (audio/voz).** hooks do lote: `communication/{useAudioMemes,useAudioRecorder,
useTextToSpeech,useTranscriptionNotifications}.ts` + os 4 testes de communication. E o sub-lote de
menor acoplamento externo: 6 dos 8 arquivos nao tem dep externa que muda; os outros dois sao
`__tests__/mediaVolume.players.test.tsx` (5 alvos: componentes de calls/inbox e teamChatTypes) e
`useTranscriptionNotifications.ts` (notificationSounds, useAuth).

**S5 - baixo acoplamento.** hooks do lote: `gamification/useAgentGamification.ts`, `crm/useAgents.ts`,
`groups/actions.ts`, `dashboard/useDashboardKpi.ts` + `gamification/__tests__/useLeaderboard.test.tsx`.
Fecho: `gamification/{types,useLeaderboard}.ts`, `crm/useAgentPresence.ts`, `ui/useActionFeedback.ts`.

**S6 - remocao (junto da implementacao nova).** `src/hooks/inbox/useInboxFilterTags.ts` esta apagado
na origin, alterado na dia e **ainda consumido na dia**: `src/components/inbox/InboxFilters.tsx`,
`src/components/inbox/__tests__/InboxFilters.nomes-seletores.test.tsx`,
`src/hooks/inbox/__tests__/useInboxFilterTags.{camada-servico,paginacao}.test.tsx`,
`src/services/inbox.service.ts`, `src/services/__tests__/inbox.service.test.ts`. Remover exige a
trilha de inbox (S2) aplicada primeiro, senao ficam orfaos. Decisao do coordenador: **mantido na
dia** por enquanto (apagado na origin, consumido na dia) - registrado, nao removido neste cartao.

Prova de fecho de cada sub-lote: `npx vitest run <arquivos do sub-lote>` e, no fim da trilha,
`npx vitest run src/hooks` (hoje 3560 testes, 152 s, 0 falhas) como rede de seguranca.

## 6. Consequencias para o cartao do complexo (SYNC20-45)

1. Nao existe "merge de B07" como operacao unica: o lote precisa ser re-cortado em S0..S5.
2. S0 (`src/lib`, `types`, `services`, `adapters`, `utils`) e trilha de camada - nao de hooks - e
   deve entrar antes de qualquer sub-lote.
3. Cada sub-lote aplica producao e teste do mesmo modulo no mesmo passo (regra do plano-sync F04).
4. `useInboxFilterTags.ts`: manter na dia ate S2 fechar (decisao registrada do coordenador).

## 7. Limites deste cartao

- Nenhum arquivo de codigo do lote foi tocado: so `docs/plans/sync/**` (este mapa, o script e os
  CSVs). Arvore igual a base dia fora de `docs/`.
- Sem push, sem merge, sem PR, sem deploy (Etapa 046).
- Sem E2E autenticado, sem `.auth/*`, sem banco de producao (R1). Nada aqui toca banco.
