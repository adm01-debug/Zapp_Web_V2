# claude__fix-ci-tests-batch2-2610-1830 — INCORPORADA (com commit destrutivo no tip)

- Ref: `origin/claude/fix-ci-tests-batch2-2610-1830` · tip `af0bb57e2` · merge_base `2d97c44c` (ambos 2026-10-24) · PR #2233
- 7 commits, todos "fix" de CI/bugs pequenos. Pré-classificação mecânica MISTO_CONFLITO vem de um fato único e decisivo (abaixo), não de trabalho perdido.

## Achado central: o último commit apagou 3 arquivos

`af0bb57e2` ("fix: corrige âncora ESTADO.md, fallback Notification e teste filesPeriod adversarial") traz
**2 inserções e 627 deleções** e, na prática, esvaziou os arquivos que a mensagem dizia corrigir:

| arquivo | linhas no merge_base | no tip `af0bb57e2` | na `origin/main` |
|---|---|---|---|
| `ESTADO.md` | 148 | **1** | 162 |
| `src/hooks/business/useWarRoomAlerts.ts` | 223 | **0** | 238 |
| `src/lib/__tests__/filesPeriod.adversarial.test.ts` | 257 | **0** | 257 |

Prova: `git show --stat af0bb57e2` e contagem por commit — em `26ca92bb7` (penúltimo) os três ainda tinham
148/223/257 linhas. Ou seja, os ~823 "linhas que a main tem e a branch não" são **destruição**, não trabalho:
nada a recuperar nesses três arquivos; a main tem as versões íntegras.

## Arquivo × achado × evidência

| arquivo | achado | evidência na `origin/main` |
|---|---|---|
| `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx` | INCORPORADA (byte-idêntico) | `IDENTICAL_TO_MAIN` / `PRESENT_BYTE`; aria-labels "Ouvir o resumo em voz alta" / "Ouvir os pontos-chave em voz alta" e matcher `toBeGreaterThanOrEqual` já na main |
| `src/hooks/auth/useAuth.tsx` (SL-070: limpar fila offline no logout) | INCORPORADA, versão melhor | `useAuth.tsx:12` importa `offlineSendQueue`; `:26` `async function esvaziarFilaDeEnvioOffline()` com try/catch + `log.error`; chamada nos **dois** caminhos: `:175` (`SIGNED_OUT`) e `:249` (`signOut`). A branch fazia `void offlineSendQueue.clear()` cru, sem tratamento de erro |
| `src/hooks/chat/useTeamChatNotifications.ts` (HZ5-09: canal único por instância) | INCORPORADA, versão melhor | `:161` `.channel(uniqueRealtimeTopic('team-chat-notifications'))` (helper `src/lib/realtimeTopic.ts:14`) em vez do `channelNameRef` com `crypto.randomUUID()` inline; `:254` comentário HZ5-09 e deps `[profile]` |
| idem — type guard `NOTIFICATION_CLICK` (`===` → `!== 'string'`) | INCORPORADA | `:272` `if (typeof mensagem.data.conversationId !== 'string') return;` |
| `src/lib/mediaVolumeStore.ts` (exportar `readAuthenticatedUserId`) | OBSOLETA — abordagem superada | main extraiu a função para módulo próprio: `mediaVolumeStore.ts:30` `import { isSupabaseSessionKey, readAuthenticatedUserId } from './authenticatedUserId';`. Exportar do store deixou de ser necessário |
| `src/services/outbound-message.service.ts` (carimbar userId na fila + filtrar na drenagem) | INCORPORADA, versão mais forte | `:13` importa de `@/lib/authenticatedUserId`; `:378-381` `pertenceAoUsuarioAtual()` (item sem dono **nunca** drena — a branch deixava passar); `:393/:399` `shouldDeliver: pertenceAoUsuarioAtual` na drenagem de abertura e no `online`; `:405-412` `enqueueOffline` exige sessão e grava `userId` |
| `ESTADO.md` (âncora `message-delivery` 456 → 457) | OBSOLETA + destruída no tip | main tem `ESTADO.md:96` com `outbound-message.service.ts:479` (tabela é regerada por automação/guard `scripts/ci/docs-estado-registry-convention.unit.mjs`); o número da branch está desatualizado |
| `src/hooks/business/useWarRoomAlerts.ts` | só destruição no tip | main tem 238 linhas íntegras; branch = 0 linhas |
| `src/lib/__tests__/filesPeriod.adversarial.test.ts` | só destruição no tip | main tem as 257 linhas idênticas ao merge_base (`MAIN_UNCHANGED_SINCE_BASE`); branch = 0 linhas |

Observação: as `missing_sample` com mojibake ("æNICO", "SÌ o", "fque significa", "💷 Teams") são lixo de
codificação dos commits da branch — a main tem o texto correto. Reforça que nada ali deve ser portado.

## Veredito

**INCORPORADA.** Todo o trabalho útil dos 7 commits está na main, em forma igual ou melhor (prova por
arquivo acima). O que a branch tem "a mais" é um commit que apagou 3 arquivos — valor zero, perigoso se
alguém tentar reaproveitar. Duas lacunas são OBSOLETAS por abordagem superada (export do `mediaVolumeStore`,
âncora numérica do `ESTADO.md`). Nada a recuperar.

`apagar_branch_seguro`: **true**. Confere com a triagem anterior (2026-11-08: PR #2233 = `JA_NA_MAIN`).

## Verificação adversarial

Tentei refutar o veredito INCORPORADA hunk por hunk do `git diff 2d97c44cf origin/claude/fix-ci-tests-batch2-2610-1830`. Não achei nenhum hunk de valor ausente da main. Confirmo INCORPORADA; apagar a branch é seguro.

### Separação feita
O tip (`af0bb57e2`) só destrói: `git show --stat af0bb57e2` = 2 inserções / 627 deleções — `ESTADO.md` -147, `src/hooks/business/useWarRoomAlerts.ts` -224, `src/lib/__tests__/filesPeriod.adversarial.test.ts` -258. A mensagem do commit diz o contrário do que o diff faz ("adiciona fallback new Notification()", "novo arquivo com testes adversariais"). Os três arquivos seguem íntegros na main (`git cat-file -s` = 12983 / 10460 / 11554 bytes) e `filesPeriod.adversarial.test.ts` na main é byte-idêntico ao merge_base (`git diff 2d97c44cf origin/main -- <arquivo>` vazio). Nada a recuperar desse commit.

O trabalho real da branch é `2d97c44cf..26ca92bb7` (6 arquivos, +100/-81). Checado item por item contra a main:

| Fix da branch | Onde está na main | Comparação |
|---|---|---|
| SL-070 limpar fila offline no logout | `src/hooks/auth/useAuth.tsx:12` (import), `:26-31` (`esvaziarFilaDeEnvioOffline` com try/catch + `log.error`), chamada em `:175` e `:249` | main **melhor**: branch fazia `void offlineSendQueue.clear()` cru, sem tratamento de erro |
| HZ5-09 canal único do chat interno | `src/hooks/chat/useTeamChatNotifications.ts:9` + `:161` `.channel(uniqueRealtimeTopic('team-chat-notifications'))`, helper em `src/lib/realtimeTopic.ts:14`; comentários em `:159-160` e `:254` | main **melhor**: helper reutilizável no lugar do `useRef(crypto.randomUUID())` inline |
| Type guard do clique da notificação | `src/hooks/chat/useTeamChatNotifications.ts:272` `if (typeof mensagem.data.conversationId !== 'string') return;` | **idêntico** ao fix de `26ca92bb7` |
| Isolamento da fila offline por atendente | `src/services/outbound-message.service.ts:378-380` `pertenceAoUsuarioAtual()`, `:391` e `:398` `shouldDeliver`, `:405-412` `enqueueOffline` exige sessão e grava `userId` | main **mais forte**: `if (!message.userId) return false` — item sem dono **nunca** drena. A branch (`:338-340` do diff) usava `if (message.userId && currentUserId && message.userId !== currentUserId) return`, que **entrega** item sem dono |
| Export de `readAuthenticatedUserId` | extraído para módulo próprio `src/lib/authenticatedUserId.ts`; `src/lib/mediaVolumeStore.ts:30` importa de lá; `outbound-message.service.ts:13` importa de `@/lib/authenticatedUserId` | abordagem da branch (exportar do store) **obsoleta** |
| aria-labels de TTS no teste a11y | `src/components/inbox/ai-tools/__tests__/a11y-ferramentas-ia.test.tsx:156-157` | `git diff origin/main 26ca92bb7 -- <arquivo>` **vazio** = byte-idêntico |
| Âncora `message-delivery` no ESTADO.md | `ESTADO.md:96` → `outbound-message.service.ts:479` | branch tinha `:457`, **desatualizado**; main foi regerada pela automação |

### Agravante encontrado (reforça apagar)
Além de não trazer valor, o diff da branch **corrompe texto** em `useTeamChatNotifications.ts` e `outbound-message.service.ts` (mojibake e erros introduzidos): `ÚNICO`→`æNICO` (:17), `SÓ`→`SÌ o` (:206), `(que significa`→`(fque significa` (:209), `💬 Teams:`→`💷 Teams:` (:233), `mantém`→`mantêm` (outbound :366), `` `key` nulo``→`` `key` null`` (:194), `descartava`→`descartaria` (:430), e um JSDoc quebrado com `++unmount` no meio (:44-45). Em `useAuth.tsx` as 15 linhas de `missing_in_main` são, na prática, as mesmas linhas da main sem acento (`sessao`/`nao` vs `sessão`/`não` em `origin/main:src/hooks/auth/useAuth.tsx:115`, `:150`, `:168`, `:243`) — não é conteúdo novo, é a mesma corrução. Rebasear ou reaproveitar essa branch reintroduziria todos esses defeitos.

Veredito final: **INCORPORADA** · `apagar_branch_seguro = true`.
