# Dossiê — `claude/chore-pacote3-merge-261113-2325` (PR #3048)

**Veredito: INCORPORADA** · confiança alta · `apagar_branch_seguro = true`

## Propósito
Branch "pacote 3": junta #2981 (dossiês/relatório da triagem de PRs em `analise-prs/`), #3036 (conversas Evolution GO: recibos com aparelho/lid, editar, remover reação, envios sem cabeçalho; perf de metas/próxima ação, realtime compartilhado, não lida no Zapp) e resíduo de front da #3041, mais revisões Devin/Codex (`58a956d8b`). 24 commits, 67 arquivos, mb `f32855df6`, tip `36c9f9336`.

## Como entrou na main
- `git branch -r --contains 36c9f9336` → `pr/3063` (pacote 4). Pacote 4 foi squash-mergeado em `main` como `d084ca753 chore(pacote): pacote 4 — #3048, ... (#3063)`. O tip não é ancestral de `main` (squash), por isso a pré-classificação mecânica apontou MISTO_CONFLITO.
- 61/67 arquivos `IDENTICAL_TO_MAIN` (PRESENT_BYTE) — todo o código de src/, edges e `analise-prs/`.
- 4 arquivos `BOTH_CHANGED` com `PRESENT_REVERSE_APPLIES` (hunk da branch está na main; main só evoluiu depois): `src/components/inbox/chat/MessageHoverToolbar.tsx`, `src/hooks/__tests__/useWhatsAppStatus.test.ts`, `src/hooks/integrations/useWhatsAppStatus.ts`, `supabase/functions/evolution-api/index.ts` (main adiciona P1-GO-5 `resolveMessageAuthorAccess`, posterior à branch).

## Arquivos com lacuna (2) — ambos artefatos gerados

| Arquivo | Achado | Evidência |
|---|---|---|
| `ESTADO.md` (2 linhas) | **Já na main.** A branch só atualizou números de linha de chamadores (`AudioMessagePlayer.tsx:66→71`, `evolution-go-routes.ts:221→263`). A main tem exatamente esses valores; difere apenas porque também atualizou `evolution-webhook-messages.ts:1422→1457` (código da main evoluiu). | `git grep -n origin/main -- ESTADO.md` → L52 `AudioMessagePlayer.tsx:71`, L82 `evolution-go-routes.ts:263`; chamadores reais na main: `src/components/inbox/AudioMessagePlayer.tsx:71` e `supabase/functions/_shared/evolution-go-routes.ts:263`. Tabela é gerada "a partir do código e falha quando..." (cabeçalho do próprio arquivo). |
| `supabase/deployment-manifest.json` (15 linhas) | **Já na main / regenerado.** Gerado por `scripts/edge-deploy/generate-manifest.mjs` (bytes/sha256 das edges). Para `evolution-go-adapter.ts` e `evolution-go-routes.ts` a main tem os mesmos bytes/sha da branch (16100/`f179670c…`, 20390/`83942e52…`). `evolution-api/index.ts` e os `source_sha256` divergem porque a main alterou essas edges depois (104679 bytes na main, batendo com `wc -c` do arquivo atual). | `git show origin/main:supabase/deployment-manifest.json` L168-175, L643-645; `git log f32855d..origin/main -- supabase/deployment-manifest.json` → 7 regenerações posteriores (d084ca7, ab657aa, 33ed0ea, 4185331, f369f88, 2cf0153, dac285f). |

## Lacunas a recuperar
Nenhuma. Nada de código-fonte, teste, edge ou doc da branch está fora da main; as duas diferenças restantes são saídas de geradores que a main já regenerou contra código mais novo.

## Banco
Sem migration/SQL na branch (`counts.migrations = 0`) — nada a consultar.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** · `apagar_branch_seguro = true` (confirmado) · nada a recuperar.

6 linhas significativas, em 3 achados. Nos três casos o removedor é um commit de **revisão** da própria
branch, que substituiu a linha por uma versão mais forte — e essa versão mais forte **está na main**.

| Achado (commit que adicionou) | Removedor | O que aconteceu | Prova na main |
|---|---|---|---|
| `c7cb4adc5` · `supabase/functions/_shared/evolution-go-routes.ts` (4 linhas: `address` por lat/long, `latitude: b.latitude`, `title/footer` do sendButtons) | `b0cb39245` "ajustes da revisão do #3036" | Linhas reescritas, não removidas: lat/long em string passam por `toCoord()` antes (a GO fazia bind em float64 e devolvia 400); `sendButtons` ganhou `description: goRequiredText(b.description)`. Intenção preservada e ampliada. | `origin/main:supabase/functions/_shared/evolution-go-routes.ts:121,128,129` (`toCoord`) e `:171` (`description: goRequiredText`) |
| `c7cb4adc5` · `supabase/functions/evolution-api/index.ts` (1 linha: `const editKey = …remoteJid: body.number…`) | `b0cb39245` | Mesma linha, com o `remoteJid` corrigido: número puro agora vira `<dígitos>@s.whatsapp.net` (`editJid`) antes de montar a key do edit-message. Correção, não reversão. | `origin/main:supabase/functions/evolution-api/index.ts:1366-1367` |
| `28e23f67e` · `src/hooks/analytics/useGoalNotifications.ts` (1 linha: `const measured = await Promise.all(`) | `58a956d8b` "revisões do Devin/Codex na #3048" | `Promise.all` → `Promise.allSettled` + `settled.map`: uma contagem `strict` que falha derruba só a própria meta em vez da rodada inteira. Endurecimento pedido na revisão. | `origin/main:src/hooks/analytics/useGoalNotifications.ts:250,253` |

Nenhum commit da branch tem título de segurança/correção acompanhado de remoção líquida de guarda,
validação ou teste: `b0cb39245` fecha com +35/−11 e **adiciona** 9 linhas de teste em
`supabase/functions/_shared/__tests__/evolution-go-conversas-fixes.test.ts`; `58a956d8b` fecha com +30/−1
e adiciona 14 linhas de teste em `src/adapters/__tests__/inboxAdapter.test.ts`.

Comandos usados (somente leitura): `git log --oneline --no-merges f32855df6..origin/claude/chore-pacote3-merge-261113-2325`,
`git show b0cb39245 -- <arquivo>`, `git show 58a956d8b -- <arquivo>`, `git show 28e23f67e -- <arquivo>`,
`git grep -n '<identificador>' origin/main -- <arquivo>`.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não consegui refutar — concordo com INCORPORADA.**
Git somente leitura (`log`, `diff`, `show`, `grep`, `merge-base --is-ancestor`), nenhum arquivo do repo editado.
`origin/main` em `dac285f62`.

### 1. Cobertura arquivo por arquivo (67 arquivos no diff `f32855df6..origin/claude/chore-pacote3-merge-261113-2325`)

Varredura de todos os 67, não só a amostra do JSON:
- **61 arquivos byte-idênticos à `origin/main`** (`git diff --quiet origin/main <ref> -- <arquivo>` passa).
- **0 arquivos ausentes na main** (`git cat-file -e origin/main:<arquivo>` em todos os 67).
- Restam 6 que ainda diferem: `ESTADO.md`, `supabase/deployment-manifest.json`,
  `src/components/inbox/chat/MessageHoverToolbar.tsx`, `src/hooks/__tests__/useWhatsAppStatus.test.ts`,
  `src/hooks/integrations/useWhatsAppStatus.ts`, `supabase/functions/evolution-api/index.ts`.

### 2. Os 4 arquivos de código: idênticos no squash do pacote 4 e depois SUPERADOS pela main

`git diff --stat d084ca753 origin/claude/chore-pacote3-merge-261113-2325 -- <cada um dos 4>` → **saída vazia**:
no commit do pacote 4 (`d084ca753`, PR #3063, ancestral de `origin/main` confirmado por
`git merge-base --is-ancestor d084ca753 origin/main`) os 4 arquivos são byte-idênticos à branch.
As diferenças de hoje são commits POSTERIORES da main, sempre no sentido main ⊃ branch:
- `MessageHoverToolbar.tsx`: a main acrescentou `evolutionDeletedOk` e o toast honesto
  ("removida apenas no Zapp — o contato pode continuar vendo…"); a branch tem o toast antigo de 1 linha.
- `useWhatsAppStatus.ts`: a main acrescentou `withoutTestFixtureConnections` + `order/limit(10)`; a branch
  tem o `.limit(1).maybeSingle()` antigo.
- `evolution-api/index.ts`: a main acrescentou `decideMessageAuthorAuthz` (autoria P1-GO-5),
  `stripInstanceToken` e o orçamento `ORPHAN_*`/`canSleepForQr`; a branch tem as formas antigas
  (`...data` cru, `within(8_000)`, `remaining() < 20_000`).
Adotar a branch hoje seria **regressão**, não resgate.

### 3. As 3 correções que a branch de fato trouxe estão na main, verbatim

| Correção da branch (diff merge-base→branch) | Prova na `origin/main` |
|---|---|
| `edit-message` monta `key`/`remoteJid` JID para `/chat/updateMessage` | `supabase/functions/evolution-api/index.ts:1366-1368` (`editJid`, `editKey`, `proxy(... 'PUT' ...)`) |
| `handleMarkUnread` usa estado do Zapp primeiro | `src/components/inbox/chat/MessageHoverToolbar.tsx:8` (import) e `:118` (`await markUnreadInZapp(message)`); serviço em `src/services/message-unread.service.ts:19` |
| Remoção do `send-chat-presence` 'paused' na abertura da aba | `src/hooks/integrations/useWhatsAppStatus.ts:242-244` — o comentário "Presença só sai do compositor" está lá e **não há** nenhuma chamada `send-chat-presence` no arquivo |

### 4. As 2 "lacunas" são artefatos gerados, e a versão da main é a correta

- `ESTADO.md`: as 2 linhas divergentes são apenas **números de linha** da tabela gerada de chamadores de edge
  (o próprio arquivo diz, em `ESTADO.md:11-12`, que `scripts/ci/docs-estado-registry-convention.unit.mjs`
  recalcula a tabela a partir do código). Checagem da âncora: a main aponta
  `evolution-webhook-messages.ts:1457` e a linha 1457 na main é
  `const response = await fetch(\`${supabaseUrl}/functions/v1/ai-transcribe-audio\`, {`; a branch aponta `:1422`,
  que é essa mesma linha **no arquivo antigo da branch**. A main está certa para o código da main;
  importar a linha da branch quebraria a guarda.
- `supabase/deployment-manifest.json`: as diferenças restantes contra `d084ca753` são 4 linhas —
  `bytes`/`sha256`/`source_sha256` de `talkx-scheduler/index.ts` e o `manifest_sha256`. O manifesto da main é
  internamente consistente com o código da main: `git show origin/main:supabase/functions/talkx-scheduler/index.ts | sha256sum`
  = `9aee41e2338cec1de582ef85cc1b239e1c2d1ac2899ef2d7981f6f4f9415cb1b`, exatamente o `sha256` registrado
  em `origin/main:supabase/deployment-manifest.json` para esse caminho. Os hashes da branch
  (`49951e8f…`, `fce949b9…`, `1baaa709…`) são de um `talkx-scheduler` mais antigo (19.935 bytes contra 21.614 na main).

### 5. Conclusão

Nenhum hunk de valor ≥ médio fora da main. Branch segura para apagar: o tip `36c9f9336` não é ancestral de
`origin/main` (foi squash, esperado), mas o conteúdo entrou por `d084ca753` e já foi evoluído por cima.
Veredito mantido: **INCORPORADA**.
