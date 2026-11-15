# claude__fix-eslint-no-secret-compare-261110-2350 — PR #2932

- `ref`: `origin/claude/fix-eslint-no-secret-compare-261110-2350` · tip `847ffd1c4` · merge_base `d8854eb31`
- Pré-classificação mecânica: `MISTO_CONFLITO` (2 arquivos com lacuna, 2111 linhas)
- **Veredito: INCORPORADA** · confiança alta · `apagar_branch_seguro = true`

## Propósito
A regra ESLint local `local/no-secret-compare` (que proíbe comparar credencial com `===`)
estava acusando falso positivo em modificadores de teclado do DOM (`e.key`, `ctrlKey`,
`shiftKey`, `altKey`, `metaKey`). A branch: (1) isentou esses casos na regra, (2) criou teste
unitário da regra, (3) registrou o teste na CI e no doc de convenção, (4) removeu os
`eslint-disable-line` que só existiam por causa do falso positivo, (5) regerou o baseline
de lint (803 → 544 ocorrências).

Commits: `37b41cfdf` (isenção), `d76f56215` (CI), `469f9797e` (refina para só `.key` de
evento do DOM) + 5 merges da main.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/eslint/no-secret-compare.js` | **na main, byte a byte** | blob `d210fb4aa` idêntico em `origin/main` e na branch; main:L15 `MODIFICADORES_DOM = new Set(['ctrlKey','shiftKey','altKey','metaKey'])`, main:L18 `NOME_DE_EVENTO`, main:L29 `.key` de evento |
| `scripts/eslint/no-secret-compare.unit.mjs` | **na main, byte a byte** | blob `5e9a06607` idêntico; `git ls-tree origin/main scripts/eslint/` lista o arquivo |
| `.github/workflows/ci.yml` | **na main** (arquivo evoluiu depois, a linha da branch está lá) | `origin/main:.github/workflows/ci.yml:170` = `scripts/eslint/no-secret-compare.unit.mjs` |
| `src/components/talkx/TalkXSegments.tsx` | **na main** (os 4 `eslint-disable-line` foram removidos) | `git show origin/main:src/components/talkx/TalkXSegments.tsx \| grep no-secret-compare` → 0 resultados; handlers preservados em main:L103, L264, L512, L536 |
| `src/features/talk-me/TalkMeView.tsx` | **na main, byte a byte** | blob `30e0b15f6` idêntico |
| `TESTING_CONVENTION.md` | **na main**; a única linha "faltando" é path obsoleto da branch | `origin/main:TESTING_CONVENTION.md:53` já cita `scripts/eslint/no-secret-compare.unit.mjs`. A diferença restante: branch tem `scripts/team-chat-db-validate.unit.mjs`, main tem `scripts/team-chat/team-chat-db-validate.unit.mjs` — a main **moveu** o arquivo para `scripts/team-chat/` (existe em `origin/main:scripts/team-chat/team-chat-db-validate.unit.mjs`, e `ci.yml:180` usa o mesmo path novo). Portar a linha da branch **regrediria** o doc. |
| `scripts/ci/eslint-baseline.json` | **na main, equivalente e mais novo** (artefato gerado) | ver abaixo |

## O baseline de lint (as 2105 linhas "removidas que a main ainda tem")

Ruído de artefato gerado — nenhum conteúdo perdido. Composição comparada por
`file:line:column:ruleId` e por credencial acusada:

| Versão | total de ocorrências | `local/no-secret-compare` | falso positivo `key` | linhas |
|---|---|---|---|---|
| merge_base `d8854eb31` | 803 | 454 | 389 | 12809 |
| branch (tip) | 544 | 196 | 134 | 8910 |
| `origin/main` hoje | **542** | **196** | **134** | 8874 |

- O histograma por credencial é **idêntico** entre branch e main (34 chaves, mesmas contagens):
  `key:134, cronSecret:8, password:7, token:6, serviceKey:5, vaultSecret:3, keywords:3, ...`
- As 31 entradas "só na branch" / 29 "só na main" são a **mesma** ocorrência com linha/coluna
  diferentes, porque o código da main andou (ex.: `SendErrorBanner.tsx:132` na branch vs `:140`
  na main; `TalkXCampaignRunning.tsx:633` vs `:681`; `OmnichannelManager.tsx:97` vs `:101`).
  A versão da main é a que casa com o código atual; a da branch está defasada.
- Mesmo se houvesse entrada velha sobrando, o gate não quebraria: `scripts/ci/lint-ratchet.mjs:631-637`
  só emite `AVISO: ... divida ja paga` para ocorrências removidas e `return 0`; falha apenas com
  `comparison.added.length > 0` (L644-L653).

## Lacunas a recuperar
Nenhuma. As duas "lacunas" mecânicas são ruído:
1. `scripts/ci/eslint-baseline.json` — artefato gerado; a main tem versão equivalente e mais nova.
2. `TESTING_CONVENTION.md` — a linha ausente na main contém path que a main deliberadamente renomeou.

## Nota sobre o comentário de fechamento
O comentário da #2932 ("incorporado pelo pacote #3035, squash `cb6576b2a`") confere com o estado
do código: os dois arquivos centrais estão byte a byte na main e os registros em CI/doc existem.
Verificado por leitura de blob, não pelo comentário.

## Verificação adversarial
Papel: refutar o veredito INCORPORADA. Resultado: **não refutado — concordo com INCORPORADA**.
`origin/main` em `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5`; branch tip `847ffd1c4`; merge-base `d8854eb31`.
`git diff MB..branch` tem 7 arquivos; conferi todos, um por um:

1. `scripts/eslint/no-secret-compare.js` — blob `d210fb4aa469243def3f629b584f13ebb009e245` idêntico em
   main e branch (`git rev-parse`). O conserto está na main: `MODIFICADORES_DOM` em
   `origin/main:scripts/eslint/no-secret-compare.js:15`, `NOME_DE_EVENTO` em :18, usados em :37 e :43.
2. `scripts/eslint/no-secret-compare.unit.mjs` — blob `5e9a06607eb382e3b4f2a992fb636b350e929cec` idêntico.
3. `src/features/talk-me/TalkMeView.tsx` — blob `30e0b15f653c4b13c43fcc39172bd36d5581b7f3` idêntico.
4. `.github/workflows/ci.yml` — `origin/main:.github/workflows/ci.yml:170` já traz
   `scripts/eslint/no-secret-compare.unit.mjs` no passo "Run Node CI scripts tests". Hunk presente.
5. `src/components/talkx/TalkXSegments.tsx` — `git grep no-secret-compare origin/main -- src/` não retorna
   nada em `src/components/talkx/`: os 4 `eslint-disable-line` saíram. Os handlers continuam vivos em
   `origin/main:src/components/talkx/TalkXSegments.tsx:103, 264, 512, 536` (não foi deleção de feature).
6. `TESTING_CONVENTION.md` — a "lacuna" de 1 linha é a versão ANTIGA do comando. `origin/main:TESTING_CONVENTION.md:53`
   já cita `scripts/eslint/no-secret-compare.unit.mjs` e usa `scripts/team-chat/team-chat-db-validate.unit.mjs`,
   caminho que existe de fato (`git ls-tree origin/main scripts/team-chat/` lista o arquivo) e que
   `ci.yml:182` usa. A linha da branch aponta para `scripts/team-chat-db-validate.unit.mjs`, que não existe
   mais na main. Portar regrediria o doc. Valor: negativo.
7. `scripts/ci/eslint-baseline.json` — artefato gerado. Comparei o conteúdo (não as linhas) com Node:
   totais `merge_base=803 / branch=544 / main=542`; `local/no-secret-compare` = 454 no merge-base e **196 na
   branch e 196 na main**, com histograma por credencial idêntico nas 33 chaves (`key`:134, `cronSecret`:8,
   `password`:7, `token`:6, `serviceKey`:5, `keywords`:3, `vaultSecret`:3, `resetKey`:2). As 2105 linhas
   "removidas que a main ainda tem" são deriva de linha/coluna. Agrupando por `file+ruleId+message`, só 2
   entradas existem na branch e não na main — e por melhora da main, não por perda:
   `src/pages/ForgotPassword.tsx` (`no-restricted-imports`: na main o arquivo já não importa
   `@/integrations/supabase/client`) e `src/components/theme/HighContrastToggle.tsx`
   (`react-refresh/only-export-components`, refatorado em `ab657aa34`). As outras 6 diferenças de cada lado
   são a mesma ocorrência em linha deslocada. Portar a baseline da branch reinscreveria dívida já paga.
   Confirmo também que entrada obsoleta de baseline só imprime `AVISO` e não muda o exit code
   (`origin/main:scripts/ci/lint-ratchet.mjs`, bloco `if (comparison.removed.length > 0)` ~L631).

Nenhum hunk de valor ≥ médio fora da main. Branch segura para apagar.
