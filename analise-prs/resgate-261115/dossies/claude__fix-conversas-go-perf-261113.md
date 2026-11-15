# Dossiê — claude__fix-conversas-go-perf-261113 (PR #3036)

**Ref:** `origin/claude/fix-conversas-go-perf-261113` · tip `bb3a0087` · merge-base `a49ef4ad` · 5 commits (2 de conteúdo + 1 ajuste de revisão + 2 merges de main).
**Propósito:** (1) Evolution GO: recibos com aparelho/lid, editar mensagem, remover reação, envios sem cabeçalho; (2) desempenho: metas (`useGoalNotifications`) e próxima ação (`useNextBestAction`) em paralelo/cache, canal realtime compartilhado, "marcar não lida" no Zapp; (3) artefatos gerados (`ESTADO.md`, `supabase/deployment-manifest.json`).
**Alegação de fechamento:** entrou pelo pacote 4 (#3063, squash `d084ca753` em main). Confirmado abaixo arquivo a arquivo (squash explica por que o tip não é ancestral de main).

## Veredito: INCORPORADA — apagar branch é seguro

| Arquivo | Achado | Evidência |
|---|---|---|
| 19 arquivos `IDENTICAL_TO_MAIN` (adapter GO, routes GO, teste `evolution-go-conversas-fixes`, AudioMessagePlayer, useInboxUnreadTotal, message-unread.service, globalChannels, testes…) | Byte a byte iguais à main | `hunk: PRESENT_BYTE` no JSON |
| `src/components/inbox/chat/MessageHoverToolbar.tsx` | Main tem o conteúdo e evoluiu depois | `git show origin/main:<arquivo>` contém `import { markUnreadInZapp } from '@/services/message-unread.service'` e o comentário `mark-unread`/`notSupported` (spot-check 6/6 linhas OK) |
| `src/hooks/integrations/useWhatsAppStatus.ts` + teste | Idem (remoção do `send-chat-presence` ao abrir aba) | spot-check 4/4 e 6/6 linhas presentes em main |
| `supabase/functions/evolution-api/index.ts` | Idem (`edit-message`, montagem de `key`/JID) | spot-check 6/6 linhas presentes em main; main cresceu +359 linhas depois (outras PRs) |
| `src/hooks/analytics/useGoalNotifications.ts` | **Incorporada e melhorada**: `GOAL_CHECK_INTERVAL_MS` (main:37), `Promise.all` goals+stats (main:118), `countCache/countOnce` (main:140-151), `visibilitychange` (main:345-355). Única linha "faltante" (`const measured = await Promise.all(`) foi trocada de propósito por `Promise.allSettled` (main:250-258) para uma meta com erro não derrubar as demais | `git grep -n` em `origin/main`; `git diff <tip> origin/main -- <arquivo>` = só esse hunk. `removed_still_in_main=113` é falso positivo: código movido para dentro de `countOnce`/`measure` |
| `src/hooks/chat/useNextBestAction.ts` | **Incorporada e melhorada**: `useQuery` (main:2,207), `fetchNextBestActionSources` (main:55), `buildNextBestActions` (main:105), `staleTime: 30_000` (main:213) + `refetchOnMount: true` adicionado em main (hunk único no diff tip→main). `missing_in_main=0`; `removed_still_in_main=86` é falso positivo (código movido para `buildNextBestActions`) | `git grep -n` em `origin/main` |
| `ESTADO.md` | Artefato gerado (tabela de chamadores com número de linha). Main já tem `AudioMessagePlayer.tsx:71` e `evolution-go-routes.ts:263`; os outros números (`:1457` etc.) foram regerados por commits posteriores | `git diff <tip> origin/main -- ESTADO.md` só muda números de linha |
| `supabase/deployment-manifest.json` | Artefato gerado. Hashes do manifest em main batem com os fontes de main: `evolution-go-adapter.ts` f179670c…, `evolution-go-routes.ts` 83942e52…, `evolution-api/index.ts` e841c2f3… (os dois primeiros são exatamente os hashes que a branch gravou) | sha256sum de `origin/main:<arquivo>` × campo `sha256` do manifest em main — 3/3 OK |

## Lacunas a recuperar
Nenhuma. As 2 linhas "faltantes" de `ESTADO.md` e as 15 de `deployment-manifest.json` são hashes/números de linha de artefatos regerados (valor: nenhum). A linha de `useGoalNotifications.ts` foi substituída por versão mais robusta em main (valor: nenhum).

## Banco / edges / workflows
Sem migration, sem workflow. Edges (adapter/routes GO, evolution-api) idênticas ou contidas em main.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA — apagar a branch continua seguro.** As 5 linhas em jogo foram adicionadas por `c7cb4adc5` e substituídas por `b0cb39245` ("ajustes da revisão do #3036"), que é um commit **estritamente mais forte**: nada de proteção, validação ou funcionalidade se perdeu, e o resultado final está byte a byte na main.

Commits de conteúdo: `c7cb4adc5` → `28e23f67e` → `b0cb39245` (ponta `bb3a0087`).

### Achado 1 — `supabase/functions/_shared/evolution-go-routes.ts` (4 linhas, `c7cb4adc5`)
Duas substituições feitas por `b0cb39245`:

1. **`/send/location`** — `c7cb4adc5` montava `address` e enviava `latitude: b.latitude, longitude: b.longitude` crus. `b0cb39245` inseriu `toCoord()` (string `"-23.5"` → número, porque a GO faz bind em `float64` e devolvia 400) e passou a usar as variáveis coagidas `latitude`/`longitude` tanto no fallback de `address` quanto no corpo. A guarda `typeof … === 'number'` continua existindo — só passou a olhar o valor já convertido. Ganho, não perda.
2. **`/send/button`** — `...b, title: goRequiredText(b.title), footer: b.footer || ' '` virou a mesma linha **mais** `description: goRequiredText(b.description)` ("description também é obrigatório no send_handler da GO"). O `title: goRequiredText(...)` do commit intermediário sobrevive intacto.

Prova de que o estado final está na main: `git diff origin/claude/fix-conversas-go-perf-261113 origin/main -- supabase/functions/_shared/evolution-go-routes.ts` → **vazio** (idêntico). Na main: `goRequiredText` em `:47`; bloco `sendLocation` com `toCoord` em `:117-137`; `description: goRequiredText(b.description)` em `:171`; `reaction … : 'remove'` em `:185`.

### Achado 2 — `supabase/functions/evolution-api/index.ts` (1 linha, `c7cb4adc5`)
A linha `const editKey = body.key ?? (body.messageId ? { remoteJid: body.number, … } : undefined)` foi trocada por `b0cb39245` para normalizar o JID antes de montar a key (`editNumber`/`editJid`: número puro → `<dígitos>@s.whatsapp.net`), porque `remoteJid` da v2 exige JID. A montagem da key e o `proxy(... { ...body, ...(editKey ? { key: editKey } : {}) })` continuam idênticos.

Prova na main: `git show origin/main:supabase/functions/evolution-api/index.ts` → bloco `action === 'edit-message'` em `:1361-1369`, com `editNumber`, `editJid` e `editKey` exatamente na forma final da branch.

### Verificação adicional das outras remoções de `b0cb39245`
- `docs/REALTIME-CHANNELS-INVENTORY.md` (−1 linha): removeu a linha do canal `transcription-{messageId}`, que havia sido de fato eliminado do código. Arquivo idêntico à main.
- `src/components/inbox/chat/MessageHoverToolbar.tsx`: só reescreveu um comentário (de "a GO não tem essa ação" para a descrição da rota `mark-unread` real). Nenhuma lógica.
- `.../__tests__/evolution-go-conversas-fixes.test.ts`: só **acrescentou** 2 asserções (`description` default e coordenadas em string). Arquivo idêntico à main.

**Nada a recuperar.** Nenhum sinal do padrão da PR #2879 (commit "de segurança" que remove a validação anterior): aqui o último commit só endureceu o tradutor GO, e tudo está na main.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA — apagar a branch é seguro.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Prova central (medida agora, não copiada da triagem): dos 27 arquivos tocados pela branch (`git diff --name-status a49ef4ad origin/claude/fix-conversas-go-perf-261113`), `git diff --stat origin/claude/fix-conversas-go-perf-261113 origin/main -- <os 27>` lista só **8** com diferença; os outros **19 são byte a byte iguais à main** (inclui os 4 arquivos novos — `message-unread.service.ts`, `globalChannels.ts`, `MessageHoverToolbar.nao-lida.test.tsx`, `evolution-go-conversas-fixes.test.ts`, todos existentes em `origin/main` via `git cat-file -e`).

Dos 8 que diferem, examinei as linhas `-` (conteúdo da branch ausente na main) uma a uma:

| Arquivo | Linhas da branch fora da main | Veredito |
|---|---|---|
| `src/components/inbox/chat/MessageHoverToolbar.tsx` | **nenhuma** (diff só tem `+` da main: `evolutionDeletedOk` e o toast de aviso) | main só evoluiu |
| `src/hooks/chat/useNextBestAction.ts` | **nenhuma** (diff só tem `+`: `refetchOnMount: true`) | main só evoluiu |
| `src/hooks/analytics/useGoalNotifications.ts` | 1: `const measured = await Promise.all(` | substituída por `Promise.allSettled` + `settled.map` na main (origin/main:245-257) — mais robusta, nada perdido |
| `src/hooks/integrations/useWhatsAppStatus.ts` (+ teste) | 5 + 1 (`.select('id')`, `.limit(1).maybeSingle()` e o mock correspondente) | substituídas na main pela consulta com `withoutTestFixtureConnections` (P0-1, não cair na conexão de teste do E2E) — estritamente melhor |
| `supabase/functions/evolution-api/index.ts` | as linhas `-` do diff tip→main são código **do merge-base** que outras PRs reescreveram (self-healing de QR/conexão GO), não trabalho desta branch. A única adição da branch neste arquivo (`git diff a49ef4ad <tip> -- …`) é o bloco `action === 'edit-message'` com `editNumber`/`editJid`/`editKey` — presente idêntico em **origin/main:1361-1369** | incorporada |
| `ESTADO.md` | 13 linhas de tabela gerada; conferi 2: `ai-transcribe-audio` existe em origin/main:52 e `evolution-webhook` em origin/main:82, só com números de linha regerados (`…messages.ts:1420`→`:1457`, `evolution-api/index.ts:529/595/756`→`:635/764`) | artefato gerado, valor nenhum |
| `supabase/deployment-manifest.json` | hashes/bytes de artefato gerado. Comparei as chaves em Python: `functions` e `source_files` da branch **não têm nenhuma entrada ausente na main** (0 a mais de cada lado) — só hashes mais antigos | artefato gerado, valor nenhum |

Checagens extras: `markUnreadInZapp` está em `origin/main:src/components/inbox/chat/MessageHoverToolbar.tsx` e em `origin/main:src/services/message-unread.service.ts`; `supabase/functions/_shared/evolution-go-routes.ts` e `evolution-go-adapter.ts` (o núcleo do fix GO: `toCoord`, `goRequiredText`, `description` obrigatório, `reaction … 'remove'`) estão entre os 19 idênticos à main, o que confirma independentemente o fechamento pelo pacote 4 (`d084ca753`).

Nenhuma lacuna. Nenhum sinal de remoção proposital de proteção na main (as duas substituições — `allSettled` e filtro de fixture — endurecem, não enfraquecem).
