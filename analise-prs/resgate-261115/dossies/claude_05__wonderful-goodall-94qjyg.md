# Dossiê — claude_05__wonderful-goodall-94qjyg (PR #2838)

- Ref: `origin/claude_05/wonderful-goodall-94qjyg` · tip `1defc1da9` · merge-base `51bd8cb87` (2026-11-13) · 29 commits (maioria merges de `main`).
- Propósito (commits `c6ec0cd8d`, `f87414acb`, `976a2f965`, `3ff958c5f`): mover `team-chat-db-validate.{mjs,unit.mjs}` para `scripts/team-chat/`, READMEs em `scripts/db/` e `scripts/team-chat/`, registrar suítes `.unit.mjs` no CI, e corrigir perda de dados por `EAGAIN` ao ler stdin em `scripts/inventario/gerar-repo.mjs`.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `.github/workflows/ci.yml` | PRESENT_REVERSE_APPLIES | Na main | `origin/main:.github/workflows/ci.yml:180` lista `scripts/team-chat/team-chat-db-validate.unit.mjs` |
| `TESTING_CONVENTION.md` | CONFLICT (1 linha) | Na main | Única mudança da branch: `scripts/team-chat-db-validate.unit.mjs` → `scripts/team-chat/team-chat-db-validate.unit.mjs`. `origin/main:TESTING_CONVENTION.md:53` já traz o caminho novo; o "conflito" é só porque a main acrescentou `scripts/eslint/no-secret-compare.unit.mjs` na mesma linha |
| `scripts/inventario/gerar-repo.mjs` | CONFLICT (25 linhas) | Na main, com outra implementação | Branch: `lerStdinSync()` síncrono com `readSync` + retry `Atomics.wait` em EAGAIN. Main (`origin/main:scripts/inventario/gerar-repo.mjs:89-98`): `async function lerStdin()` via `for await (const pedaco of process.stdin)` + top-level `await`, com comentário explicando exatamente o mesmo problema (EAGAIN em pipe não bloqueante). Introduzido em `ab657aa34` (2026-11-14, "pacote 5 — ... #2838 ... concluídas", `git log -S'lerStdin'`), ou seja, a #2838 foi incorporada de propósito com abordagem equivalente (stream resolve EAGAIN internamente e lê até EOF, sem descartar dados). Merge-base ainda tinha `readFileSync(0, 'utf8')` (linha 79) — a main de fato avançou |
| `scripts/db/README.md`, `scripts/team-chat/README.md`, `scripts/team-chat/team-chat-db-validate.mjs`, `scripts/team-chat/team-chat-db-validate.unit.mjs`, `tests/contracts/log-injection-sanitizacao.contract.test.ts` | IDENTICAL_TO_MAIN / PRESENT_BYTE | Na main | `git ls-tree origin/main scripts/team-chat/` lista os 3 arquivos; conteúdo byte-idêntico |

## Veredito

**INCORPORADA** (confiança alta). Nenhuma lacuna real: as 2 "lacunas" mecânicas são (1) uma linha de doc cujo conteúdo-alvo já está na main com um item a mais e (2) a mesma correção de EAGAIN implementada de outra forma (async stream) no commit que explicitamente fecha a #2838.

## Lacunas a recuperar

Nenhuma. `apagar_branch_seguro = true`.

## Reexame de commits intermediários

Parecer: **REFATORACAO_INTERNA** — `apagar_branch_seguro = true` mantido. Os 6 achados mecânicos (93 linhas) são
iteração interna da própria branch ou merge que adotou a versão da `main`; nenhuma proteção, correção ou
funcionalidade ficou de fora.

### 1. `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` — 85 linhas (`77fb7eb40`)
Commit `77fb7eb40` ("restaura suite de testes removida por engano na PR #2550") reescreveu o arquivo com mock de
`recharts` + fixtures `ROWS/CAMPAIGN/REPORT` + 3 testes. Quem removeu: o merge `da2c25377`
(`Merge origin/main`, pais `77fb7eb40` + `b548ca08c`), que resolveu o conflito **adotando o lado da main**:
`git diff da2c25377^2:<arq> da2c25377:<arq>` = vazio.
A premissa do commit já estava resolvida na main: `git show 51bd8cb87:<arq> | grep -cE '^\s*(describe|it)\('` = **16**
blocos na própria merge-base, isto é, a main já tinha suíte válida (não havia "No test suite found").
A main hoje (215 linhas, 13 `it`) cobre mais que a versão da branch: `talkxReportSeriesFromRows` (5 casos),
`talkxReportHeatmapFromTimestamps` (3 casos), a tela (4 casos) e ainda o caminho de falha do PDF
(`falha ao gerar o PDF avisa o usuário e libera o botão`). Mocka os filhos
(`../TalkXReportPerformance|Funnel|Heatmap`) em vez de `recharts`, por isso o mock de `recharts` ficou dispensável.
Única asserção da versão antiga sem equivalente na main: o rótulo "Responsável" resolvido pelo mapa `creators`
(prop opcional ainda existente — `origin/main:src/components/talkx/report/TalkXCampaignReport.tsx:327`). Valor baixo:
asserção de rótulo, não guarda; e não é reaproveitável como estava, porque na main os filhos estão mockados.

### 2. `scripts/inventario/gerar-repo.mjs` — 4 linhas (`f87414acb`)
`f87414acb` adicionou `try { entrada = readFileSync(0,'utf8') } catch { if (erro?.code !== 'EAGAIN') throw; entrada = '' }`
— ou seja, **engolia** os dados em EAGAIN. O commit seguinte da mesma branch, `976a2f965`
("corrige perda de dados em EAGAIN"), substituiu isso por `lerStdinSync()` com `readSync` + `Atomics.wait`.
Logo, as 4 linhas removidas eram o **defeito**, não a correção. Na main a mesma intenção está implementada como
stream assíncrono até o EOF (`origin/main:scripts/inventario/gerar-repo.mjs:89-98`, `async function lerStdin()`),
com comentário citando o mesmo EAGAIN em pipe não bloqueante.

### 3–6. Quatro `*.unit.mjs` — 1 linha cada (`c6ec0cd8d`)
Os quatro arquivos estão **byte-idênticos** entre a ponta da branch e `origin/main` (`git diff` vazio); quem "removeu"
foram os merges `70095b3ec` / `6af8ca2a8`, adotando a main. Cada linha evoluiu para versão igual ou melhor:
- `scripts/catalog/validate-plan.unit.mjs`: `import { mkdtempSync, rmSync, writeFileSync }` → main acrescenta `readFileSync` (superconjunto). Arquivo 171 → 259 linhas.
- `scripts/docs/verificar-docs-realtime.unit.mjs`: `assert.match(r.stdout, /\d+ canal/)` → main usa `/\d+ cana(?:l|is)\b/` (aceita plural; asserção mais robusta).
- `scripts/lib/seguranca-processo.unit.mjs`: a asserção de `fora.json` sobrevive na main com o 3º argumento `[RAIZ_REPO]` (assinatura evoluiu); arquivo 121 → 299 linhas, com casos de symlink que escapa da raiz.
- `scripts/tarefas/seed-local-imagens.unit.mjs`: `return spawnSync(...)` → `const r = spawnSync(...)` (refator de forma, mesmo comando). 73 → 75 linhas.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA** · `apagar_branch_seguro = true`. Tentei refutar e não achei nenhum hunk
útil fora da `main`.

Diff completo `51bd8cb87..1defc1da9` = **8 arquivos** (`git diff --stat`), nada além do que o JSON lista:

1. `.github/workflows/ci.yml` — única mudança é o caminho `scripts/team-chat-db-validate.unit.mjs` →
   `scripts/team-chat/team-chat-db-validate.unit.mjs`. Já na main: `origin/main:.github/workflows/ci.yml:180`.
2. `TESTING_CONVENTION.md` — mesma troca de caminho. `origin/main:TESTING_CONVENTION.md:53` já traz
   `scripts/team-chat/team-chat-db-validate.unit.mjs`; o "conflito" é só o item extra
   `scripts/eslint/no-secret-compare.unit.mjs` que a main acrescentou na mesma linha (main = superconjunto).
3. Cinco arquivos byte-idênticos confirmados por `git diff --quiet origin/main <ref> -- <arquivo>` (vazio para
   `scripts/db/README.md`, `scripts/team-chat/README.md`, `scripts/team-chat/team-chat-db-validate.mjs`,
   `scripts/team-chat/team-chat-db-validate.unit.mjs`,
   `tests/contracts/log-injection-sanitizacao.contract.test.ts`). O caminho antigo
   `scripts/team-chat-db-validate.{mjs,unit.mjs}` não existe mais na main (`git ls-tree` vazio) — a mudança de
   caminho foi concluída, não parcial.
4. `scripts/inventario/gerar-repo.mjs` — o único achado com conteúdo próprio. Examinei se o
   `lerStdin()` assíncrono da main (`origin/main:scripts/inventario/gerar-repo.mjs:89-98`) realmente cobre a
   necessidade do `lerStdinSync()` da branch. **Cobre, e com margem**: o stream resolve EAGAIN dentro do
   próprio Node e lê até o EOF, sem o teto de ~1s (`MAX_TENTATIVAS_SEM_DADOS = 50`) que a versão da branch
   tinha — num stdin grande e lento, a versão da branch é a que podia truncar. Além disso a main ganhou o
   **teste de regressão exato** desse bug, que a branch não tem:
   `origin/main:scripts/ci/inventario-repo.unit.mjs:155` — `test('stdin grande por pipe (spawnSync com input) é
   lido inteiro, sem EAGAIN')`, com ~320 KB (acima do buffer de 64 KB do pipe) e
   `assert.equal(uso.total, nomes.length)`. Roda no CI pelo glob `scripts/ci/*.unit.mjs`.
   Risco de pendura (stdin não-TTY que nunca fecha) checado nos dois chamadores reais e não existe:
   `.github/workflows/inventario-estado-semanal.yml:75` usa `< /dev/null` e o teste usa `input`/`stdio: ignore`.
   Introduzido em `ab657aa34` ("pacote 5 — … #2838 … concluídas", `git log -S'lerStdin' origin/main`), commit que
   fecha a própria #2838.

Nenhuma lacuna adicional. Nada aqui é DDL, segredo, custo externo ou contradição de regra — não é decisão do dono.
