# Dossiê — claude_04/trusting-newton-duiglt (PR #2540)

- Ref: `origin/claude_04/trusting-newton-duiglt` tip `fddda42f` · merge-base `2d97c44c` (2026-10-24) · 6 commits (26/10–01/11)
- PR #2540 "fix(tests): corrigir falhas unitárias em 5 suítes" — CLOSED sem merge em 01/11 (congelamento #2545). Triagem 2804: JA_NA_MAIN.
- Main avaliada: `dac285f6` (CI verde: Unit Tests 1/3, 2/3, 3/3 = SUCCESS, via GraphQL statusCheckRollup).

## Propósito
Dois temas: (a) retry em HTTP 5xx/erros de rede no `gh pr list` da fila de merge (`scripts/ci/fila-merge.mjs`); (b) consertar 8 suítes vitest que falhavam (mocks de supabase, `clientHeight` no `medirLayout`, `unmount`, aria-labels) e trocar o `uploadAudio` para usar o MIME real do blob.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/ci/fila-merge.mjs` (+execComRetry) | **OBSOLETA** — arquivo apagado da main junto com `fila-merge.unit.mjs` e `.github/workflows/auto-update-pr-branch.yml` (único workflow que o chamava no merge-base) | `git log --diff-filter=D origin/main -- scripts/ci/fila-merge.mjs` → `41853318c chore(pacote): pacote 6 (#3113)`; `git ls-tree origin/main scripts/ci/fila-merge.mjs` vazio; `git grep -l execComRetry origin/main` vazio; refs restantes só em `docs/_arquivo/` e `analise-prs/prs.csv` |
| `src/services/chat.service.ts` uploadAudio | **INCORPORADA** (outro texto) — MIME real do blob + extensão por mapa + `contentType: mimeType` | `origin/main:src/services/chat.service.ts:60-74` (`mimeType`, `extByMime`, `contentType: mimeType`); commit `e1f2ee4dd fix(test): destrava o CI Gate da main`. Resíduo: main não mapeia `audio/wav` e usa fallback fixo `'webm'` em vez de `mimeType.split('/')[1]` — valor baixo (MediaRecorder não gera wav) |
| `ChatPopup.messageBalloon.test.tsx` | **INCORPORADA** (clientHeight em `medirLayout`, mock em beforeEach/afterEach) + resto **OBSOLETO** (mocks `maybeSingle`/`auth`/`channel.mockReturnThis`, `beforeAll import ChatPanel` não são necessários: suíte passa na main) | `origin/main:...messageBalloon.test.tsx:260-274` (clientHeight), `:281-290` (medir/mockRestore); commit `e1f2ee4dd`; CI Unit Tests verde em `dac285f6` |
| `ChatPopup.pagination.test.tsx` | **INCORPORADA** (clientHeight `:41-55`; `medirLayout` chamado dentro do teste `:338` com try/mockRestore) + mocks extras **OBSOLETOS** (suíte verde na main) | idem, `e1f2ee4dd`; CI verde |
| `AgentsView.pendencias.test.tsx` | **INCORPORADA** (`channel`/`removeChannel` no mock, outro texto `:151-152`); `functions.invoke` não é necessário (suíte verde) | `origin/main:...AgentsView.pendencias.test.tsx:147-154`; CI verde |
| `useTeamMessages.canal-e-reconexao.test.tsx` (`unmount()`) | **OBSOLETA** — teste reescrito na main (filtra `h.subs` por callbacks reais `:91-97`) e passa sem o `unmount` | `origin/main:...canal-e-reconexao.test.tsx:87-103`; CI verde |
| `AdminView.limiteChats.test.tsx` / `AdminView.ramalAdmin.test.tsx` | **INCORPORADA** (`AUDIT_PAGE_SIZE`, `MIN_PASSWORD_LENGTH` no mock) | `origin/main:...limiteChats.test.tsx:56-57`, `...ramalAdmin.test.tsx:61-62` |
| `a11y-ferramentas-ia.test.tsx` | **INCORPORADA** byte a byte | status IDENTICAL_TO_MAIN / PRESENT_BYTE |

Não foi possível rodar vitest localmente (`node_modules` ausente no clone; `npx` falha com EOVERRIDE postcss). A prova de que as suítes passam na main é o CI de `dac285f6` (3 shards de Unit Tests SUCCESS).

## Veredito
**OBSOLETA** (parte incorporada em `e1f2ee4dd`, parte sem alvo: fila de merge removida no pacote 6 e testes já verdes sem os mocks extras). Nada útil perdido. `apagar_branch_seguro = true`.

## Resíduo opcional (valor baixo) — hunk portável
`src/services/chat.service.ts` ~L65-71: acrescentar `'audio/wav': 'wav'` ao `extByMime` e trocar `?? 'webm'` por `?? mimeType.split('/')[1] ?? 'webm'`. Só se algum gravador real passar a emitir wav; hoje não há evidência disso.

## Reexame de commits intermediários

Varredura mecânica apontou 3 linhas significativas adicionadas por `27b171e16` em
`scripts/ci/fila-merge.mjs` e removidas por commit posterior da mesma branch, ausentes na main.

**Parecer: REFATORACAO_INTERNA.** As 3 linhas não foram desfeitas — foram **substituídas por versões
estritamente melhores** na própria branch, e todas sobrevivem na ponta `fddda42f3`.

| Linha de `27b171e16` | Quem "removeu" | O que virou | Intenção sobrevive? |
|---|---|---|---|
| `async function execComRetry(cmd, args, opts, maxTentativas = 3)` | `bcbd21d2f` | `maxTentativas = 4` (3 tentativas efetivas → 4; motivo: com 3, `esperas[2]`=20s nunca era usado) | Sim, ampliada |
| `/HTTP 5\d\d\|ECONNRESET\|ETIMEDOUT\|unexpected end of JSON/` | `a7795632f` | mesma regex **+ `EHOSTUNREACH\|ENOTFOUND`** | Sim, ampliada |
| `setTimeout(r, esperas[i])` | `bcbd21d2f` | `setTimeout(r, esperas[Math.min(i, esperas.length - 1)])` (clamp defensivo p/ `maxTentativas` > `esperas.length`) | Sim, endurecida |

Evidências:
- `git log --oneline 2d97c44c..origin/claude_04/trusting-newton-duiglt -- scripts/ci/fila-merge.mjs` →
  `bcbd21d2f`, `a7795632f`, `27b171e16` (só esses 3 tocam o arquivo; nenhum outro).
- `git show a7795632f -- scripts/ci/fila-merge.mjs` → diff de 1 linha, **só adiciona** os 2 códigos de erro.
- `git show bcbd21d2f -- scripts/ci/fila-merge.mjs` → diff de 2 linhas: `3→4` e o `Math.min`.
- `git show origin/claude_04/trusting-newton-duiglt:scripts/ci/fila-merge.mjs` (L29-41) → `execComRetry`
  íntegro na ponta, com regex completa e clamp.
- Nenhum commit com título de segurança/correção que remova guarda: os 3 títulos descrevem exatamente o
  que o diff faz.

Nada a recuperar **também** porque o alvo não existe mais na main: `scripts/ci/fila-merge.mjs` foi apagado
por `41853318c chore(pacote): pacote 6 (#3113)` (`git log --diff-filter=D -1 origin/main -- scripts/ci/fila-merge.mjs`);
`git ls-tree origin/main scripts/ci/fila-merge.mjs` vazio; `git grep -ln execComRetry origin/main` só acha
`docs/_arquivo/PENDENCIAS.md` e `docs/_arquivo/analise-prs/dossies/PR-2273.md` (documentação arquivada, não código).

**Veredito mantido: OBSOLETA · `apagar_branch_seguro = true`.**

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** · `apagar_branch_seguro = true`. Refutação tentada nos 9 arquivos do
`git diff 2d97c44c origin/claude_04/trusting-newton-duiglt` (85 inserções / 26 remoções); nenhum hunk de
valor ≥ médio sobrou fora da main (`origin/main` = `dac285f62`).

Checagens feitas por mim (não copiadas da triagem):

1. `scripts/ci/fila-merge.mjs` — alvo inexistente. `git ls-tree origin/main scripts/ci/ | grep fila` vazio;
   apagado por `41853318c chore(pacote): pacote 6 (#3113)`; `git grep -ln execComRetry origin/main` só
   `docs/_arquivo/PENDENCIAS.md` e `docs/_arquivo/analise-prs/dossies/PR-2273.md` (doc arquivada).
   O único chamador no merge-base (`.github/workflows/auto-update-pr-branch.yml`) também não existe na main
   (`git ls-tree origin/main .github/workflows/ | grep auto-update` vazio).
   **Tentativa de salvar o retry:** o `gh pr list` que ainda roda na main está em
   `origin/main:.github/workflows/branch-hygiene-audit.yml:134` e `:152` — auditoria **semanal, somente
   leitura**, e a linha 152 já degrada sozinha (`if ! gh pr list … > "$PRS"; then echo '{"erro":…}'`),
   com `scripts/ci/branch-podaveis.mjs:159-180` devolvendo `relatorioIndisponivel`. Portar o retry para lá
   seria trabalho novo em outro arquivo, não resgate — e o valor é baixo (job semanal que já tolera falha).

2. `src/services/chat.service.ts` — incorporado com texto melhor. `origin/main:…:59-72`: `blob.type.split(';')[0].trim()`
   (a branch não tinha `.trim()`), `extByMime` com webm/ogg/mp4/mpeg e `upload(…, { contentType: mimeType })`.
   Resíduo real, **valor baixo**: main não mapeia `'audio/wav'` e usa `?? 'webm'` no lugar de
   `?? mimeType.split('/')[1]`. Efeito máximo: extensão do arquivo no Storage desalinhada se algum gravador
   emitir MIME fora do mapa — o `contentType` continua correto nos dois casos. MediaRecorder não emite wav.

3. Suítes vitest — equivalentes semânticos na main, e verdes.
   - `ChatPopup.messageBalloon.test.tsx:261-277` e `ChatPopup.pagination.test.tsx:42-58`: `clientHeight` em
     `medirLayout` com restauração própria (`originalClient`), mais `medir = medirLayout()` em `beforeEach` /
     `medir.mockRestore()` em `afterEach` (`messageBalloon:281-290`) e `medirLayout()` dentro do teste com
     try/finally em `pagination:338`.
   - `AgentsView.pendencias.test.tsx:151-152` (main): `channel`/`removeChannel` presentes.
   - `AdminView.limiteChats.test.tsx:58-59` e `AdminView.ramalAdmin.test.tsx:63-64`: `MIN_PASSWORD_LENGTH`
     e `AUDIT_PAGE_SIZE` presentes (ordem invertida em relação à branch, conteúdo igual).
   - `useTeamMessages.canal-e-reconexao.test.tsx:87-105` (main): teste reescrito filtrando `h.subs` por
     callbacks reais; o `unmount()` da branch é higiene de teste sem efeito no resultado.
   - `a11y-ferramentas-ia.test.tsx`: `diff` entre main e branch → **vazio** (byte a byte).
   - Mocks extras da branch (`functions.invoke`, `maybeSingle`, `auth`, `beforeAll import ChatPanel`) não são
     necessários: rollup de `dac285f62` verificado por mim via GraphQL → `state: SUCCESS`, com
     `🧪 Unit Tests (1/3)`, `(2/3)`, `(3/3)` = SUCCESS e `✅ CI Gate (required check)` = SUCCESS.

Divergência da triagem: nenhuma. Única ressalva registrada é a lacuna já declarada por ela
(`audio/wav` + fallback dinâmico), confirmada como **valor baixo** e não bloqueante.
