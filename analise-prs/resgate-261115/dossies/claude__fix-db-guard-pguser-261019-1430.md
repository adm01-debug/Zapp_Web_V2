# Dossiê — `claude/fix-db-guard-pguser-261019-1430` (PR #2104)

- tip `054d4d89d` · merge-base `ee294749175799481deb9fc69e1d31fac6675f3e` (2026-10-18) · 3 commits · 7 arquivos (+93/-65)
- Propósito (commits `ed9d10e93`, `9fa1a6a1a`, `054d4d89d`): (a) `PGUSER=postgres` no step "Testar comparadores" do db-guard; (b) GA75: endpoint `/actions/permissions/selected-actions` no settings-guard; (c) GA77: remover `restaurar()` (auto-restore) do settings-guard + testes + CLAUDE.md; (d) novo `settings-guard.yml`; (e) `security-workflow.unit.mjs` ignora `secrets.X` em comentários; (f) cast TS2322 em `useTalkXSuppression.ts`.
- Triagem anterior (2026-11-08): `JA_NA_MAIN` — **parcialmente errada**: GA77 nunca entrou.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/db-guard.yml` (`PGUSER: postgres` no step) | **OBSOLETA** — step reescrito na main (loop de testes, `81955ecda`) sem `PGUSER`; os testes definem o próprio env do fixture (`check-runtime-config.test.mjs:76-78`, `check-triple-parity.test.mjs:242`); db-guard verde na main hoje | `git grep PGUSER origin/main -- .github/workflows/db-guard.yml` = vazio; `origin/main:.github/workflows/db-guard.yml:219-226`; `gh run list --workflow db-guard.yml --branch main --limit 5` = 5× `success` (2026-11-15) |
| `.github/workflows/settings-guard.yml` (novo, 64 linhas) | **OBSOLETA** — main tem versão própria e mais nova: cron `15 7 * * *` (Z030 reduziu de */6h para 1x/dia, deliberado), `ADMIN_READ_TOKEN` com fallback `github.token`, snapshot W17 em artifact. Branch usava `setup-bun` para rodar `node` e `SETTINGS_GUARD_TOKEN` direto. Único extra da branch: gatilho `push` em `paths` do guard/baseline (valor nenhum/baixo) | `origin/main:.github/workflows/settings-guard.yml:9-11,45-66`; `git log -- settings-guard.yml`: `07b137c3d` (Z030), `c98f464f5` (restaurado após #1973) |
| `CLAUDE.md` (frase "é ela que o settings-guard restaura") | **OBSOLETA** — `CLAUDE.md` na main é só `@AGENTS.md`; a frase não existe mais em nenhum doc (`docs/agentes/github-ci.md` descreve só "compara/divergência é regressão") | `git show origin/main:CLAUDE.md` = `@AGENTS.md`; `git grep -i restaur origin/main -- docs/agentes AGENTS.md` = vazio |
| `scripts/ci/github-settings-guard.mjs` — GA75 endpoint | **INCORPORADA** | `origin/main:scripts/ci/github-settings-guard.mjs:271` = `/actions/permissions/selected-actions` (commit `b94be0a2c`, PR #2100) |
| `scripts/ci/github-settings-guard.mjs` — GA77 remover `restaurar()` | **PERDIDA** (valor baixo) — main ainda tem `restaurar()` e o laço de restauração; plano GA77 segue `[ ]` | `origin/main:scripts/ci/github-settings-guard.mjs:4,152,176,223,348-365,530-543,599`; `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:328` |
| `scripts/ci/github-settings-guard.unit.mjs` — stub do endpoint | **INCORPORADA** | `origin/main:...unit.mjs:127` (`p.endsWith('/actions/permissions/selected-actions')`) |
| `...unit.mjs` — `SELECTED_PATTERNS` sem `harden-runner` e lista de 6 environments | **OBSOLETA** — main tem lista alinhada ao baseline atual (codeql `init`/`analyze`, 9 environments incl. `copilot`, `Preview`, `Production`); a lista da branch (6 envs) hoje falharia contra o baseline | `...unit.mjs:24,91,417-418`; `scripts/ci/github-settings-baseline.json` (`environments` com 9 itens, `environments_para_apagar.lista: []`) |
| `...unit.mjs` — testes W05 reescritos para "sem restauração" | **PERDIDA**, acoplada à GA77 (sem a remoção, os testes atuais da main `:204,:315-333` exigem `Restaurado`) | `origin/main:...unit.mjs:204,216,315-333` |
| `scripts/ci/security-workflow.unit.mjs` | **INCORPORADA por outra via** — main casa só expressões `${{ secrets.X }}` (ignora comentários), mesmo efeito do strip de `#` | `origin/main:scripts/ci/security-workflow.unit.mjs:36` = `/\$\{\{\s*secrets\.(\w+)/gu` (commit `c543c6ade`, #2054) |
| `src/hooks/integrations/useTalkXSuppression.ts` (cast TS2322) | **OBSOLETA** — a mutation `addEntry`/`insert` com `reason_code ?? 'manual'` foi removida (`e1f2ee4dd`) e o hook reescrito (`662083c5f`, #2071); não há `reason_code:` nem `'manual'` no hook da main | `git grep -E "reason_code:|'manual'" origin/main -- src/hooks/integrations/useTalkXSuppression.ts` = vazio; `git log -S"reason_code ?? 'manual'"` → `e1f2ee4dd` |

## Veredito

**PERDIDA_PARCIAL** — 6 de 7 arquivos incorporados/obsoletos com prova; sobra só **GA77** (remover a restauração automática morta do settings-guard + ajustar testes e comentário do workflow). Valor **baixo**: `GITHUB_TOKEN` do job tem `contents: read, issues: write`, o PATCH devolve 403 e o único efeito hoje é a linha "⚠️ falhou ao restaurar …" no corpo da issue (dedupe não é forçado porque `restauracoesEfetivas` fica vazio). `apagar_branch_seguro = false` só por causa dessa lacuna; com este dossiê o conteúdo está preservado.

## Lacuna a recuperar — GA77 (portar sobre a main atual, não sobre a branch)

Arquivos na main a tocar (uma PR `chore(ci)`; toca workflow → **deixar aberta e chamar o dono**):

1. `scripts/ci/github-settings-guard.mjs`
   - `:4` → `(\`github-settings-baseline.json\`) e reporta divergencias via issue.`
   - `:152` → `// \`restauravel\` mantido por compatibilidade; sempre false (GA77: restauração removida).`
   - `:176` `restauravel: !checksDesligados,` → `restauravel: false,` (apagar o comentário da linha anterior "Sem o bloco de checks o PATCH…")
   - `:223` `restauravel: campo === 'allow_auto_merge'` → `restauravel: false`
   - `:346-365` apagar bloco `// ---- restauração` + `async function restaurar(campo) {...}`
   - `:530-543` apagar o laço `const restaurados = []; const restauracoesEfetivas = []; for (const d of divergencias.filter((x) => x.restauravel)) {...}`
   - bloco `if (restaurados.length > 0) { linhas.push('### Restaurações aplicadas', ...) }` → apagar
   - `:599` `forcar: restauracoesEfetivas.length > 0,` → apagar (a função `abrirOuAtualizarIssue` pode manter o parâmetro `forcar = false`)
   - Verificar que `gh` (token de escrita) continua usado só para issue/labels; se `gh('PATCH'…)` sumir de vez, nada mais precisa de PATCH.
2. `scripts/ci/github-settings-guard.unit.mjs` (versão da main)
   - `:204` `assert.ok(r.out.includes('Restaurado'), …)` → `assert.ok(!r.out.includes('Restaurado'), \`guard nao deveria tentar restaurar (GA77):\n${r.out}\`)`
   - `:216` já espera `!includes('Restaurado')` — manter.
   - `:315-320` teste "divergencia real com restauracao EFETIVA sempre comenta" → substituir por:
     ```js
     it('W05: divergencia real dentro da janela e suprimida pelo dedupe (sem restauracao)', () => {
       // GA77: guard nao restaura mais. Divergencia dentro de 6 h aplica dedupe normal.
       const r = rodarGuard('regressao', { issue: true, ultimoMarcador: MARCADOR_REGRESSAO, idadeMs: 60_000 });
       assert.equal(r.code, 1, r.out);
       assert.ok(!r.out.includes('Restaurado'), `guard nao deveria tentar restaurar (GA77):\n${r.out}`);
       assert.ok(r.out.includes('Dedupe:'), `dedupe nao foi aplicado dentro da janela:\n${r.out}`);
       assert.ok(!r.out.includes('Issue #42 atualizada'), `comentou mesmo dentro da janela:\n${r.out}`);
     });
     ```
   - `:322-333` teste "restauracao que FALHOU nao forca comentario" → substituir por:
     ```js
     it('W05: mesma causa divergente fora da janela (> 6 h) comenta de novo', () => {
       // Apos 6 h o guard deve renovar o comentario — sem restaurar, so registrar.
       const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;
       const r = rodarGuard('regressao', { issue: true, ultimoMarcador: MARCADOR_REGRESSAO, idadeMs: SEIS_HORAS_MS + 1000 });
       assert.equal(r.code, 1, r.out);
       assert.ok(!r.out.includes('Restaurado'), `guard nao deveria tentar restaurar (GA77):\n${r.out}`);
       assert.ok(r.out.includes('Issue #42 atualizada com novo comentario'), `fora da janela e nao comentou:\n${r.out}`);
       assert.ok(!r.out.includes('Dedupe'), `dentro da janela indevidamente:\n${r.out}`);
     });
     ```
   - Remover a opção `patchStatus` do stub se ficar sem uso.
3. `.github/workflows/settings-guard.yml:45-48` — nome do step "🛡️ Verificar e restaurar configurações" e comentário "Se houver regressão: restaura via PATCH" → "Verificar configurações" / "abre/atualiza issue"; manter o restante (Z030, W17, ADMIN_READ_TOKEN).
4. `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:328` — marcar GA77 `[x]`.
5. Validar: `node --test scripts/ci/github-settings-guard.unit.mjs`.

Não portar: `PGUSER` (CI verde sem ele), `settings-guard.yml` da branch (versão da main é mais nova), `SELECTED_PATTERNS`/lista de 6 environments (desalinhadas do baseline atual), cast em `useTalkXSuppression.ts` (código removido), `CLAUDE.md` (arquivo virou `@AGENTS.md`).

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL` (verificado em `origin/main` = `dac285f62`, merge-base `ee2947491` confirmado por `git merge-base`).

Tentei refutar a lacuna GA77 e falhei — ela é real, não foi removida de propósito e ainda encaixa na main:
- `restaurar()` segue na main: `origin/main:scripts/ci/github-settings-guard.mjs:346-364` (bloco `// ---- restauração` + `async function restaurar`), laço `:530-543` (`restaurados`/`restauracoesEfetivas`/`console.log('Restaurado: …')`), bloco `### Restaurações aplicadas` `:587-588`, `forcar: restauracoesEfetivas.length > 0` `:599`; `restauravel` ainda verdadeiro em `:176` (`!checksDesligados`) e `:223` (`campo === 'allow_auto_merge'`).
- Não houve remoção/reversão deliberada: `git log -S"async function restaurar" --oneline origin/main -- scripts/ci/github-settings-guard.mjs` → só `b4de9cd78` (a introdução); nenhum commit do arquivo (`090f5f890`, `b94be0a2c`, `f9818f1b8`, …) menciona remover/reverter a restauração. A outra PR que carregava GA77 (#2103) foi fechada sem merge (`docs/_arquivo/analise-prs/prs.csv:75` = `DRAFT_SKIP`). Plano segue `[ ]`: `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:328`.
- Código morto confirmado na fonte, não só por inferência: `origin/main:.github/workflows/settings-guard.yml` job `guard` tem `permissions: contents: read / issues: write` — qualquer `PATCH /repos/…` ou `…/protection/required_status_checks` do `GITHUB_TOKEN` volta 403. Valor **baixo** (uma linha "⚠️ falhou ao restaurar" no corpo da issue), como a triagem disse.
- Acoplamento confirmado: `origin/main:scripts/ci/github-settings-guard.unit.mjs:204` e `:318` exigem `Restaurado`; suíte da main hoje verde (`node --test scripts/ci/github-settings-guard.unit.mjs` = 24/24 pass, 2026-11-15). Logo mexer só no `.mjs` quebra o CI — a PR tem de levar `.mjs` + `unit.mjs` juntos.

Refutei os outros 6 itens e a triagem se sustenta em todos:
- `db-guard.yml`/PGUSER: `git grep PGUSER origin/main -- .github/workflows/db-guard.yml` vazio; step reescrito em `origin/main:.github/workflows/db-guard.yml:219-226`; os testes que dependem de `PGUSER` o definem no próprio fixture (`scripts/db-audit/check-runtime-config.test.mjs:78`, `check-triple-parity.test.mjs:242`); `gh run list --workflow db-guard.yml --branch main --limit 5` = 5× `success` (último em `dac285f62`, 2026-11-15). OBSOLETA.
- `security-workflow.unit.mjs`: rodei a suíte da main — 3/3 pass. A regex `/\$\{\{\s*secrets\.(\w+)/gu` (`:36`) é equivalente na prática: `ci.yml` da main só tem `secrets.` em `:255-256` (expressões reais) e nenhuma linha comentada com `${{ secrets.` (único caso em que o strip de `#` da branch divergiria). INCORPORADA por outra via.
- `useTalkXSuppression.ts`: o `insert` com `reason_code ?? 'manual'` não existe mais na main (grep só acha `reason_code='opt_out'` em comentário `:255` e a chave `manual:` de um tipo de estatística `:263`). OBSOLETA.
- `CLAUDE.md`: `git show origin/main:CLAUDE.md` = `@AGENTS.md`. OBSOLETA.
- GA75 endpoint e stub do unit: já na main. INCORPORADA.
- Listas do unit da branch estão de fato desalinhadas: baseline da main tem 9 environments (`banco-leitura, copilot, db-ledger-evidence, legacy-import-destrutivo, perimetro-leitura, Preview, producao-ddl, producao-edge-functions, Production`), a branch testa 6 (`…unit.mjs:86,364-365`); a main já cobre os 9 (`:91,417-418`). OBSOLETA — não portar.

Observações para quem for portar (não alteram o veredito):
- Não copiar o diff da branch cru: ele também muda o modo do arquivo (`100755` → `100644`, `git diff ee2947491 origin/claude/…` cabeçalho de `github-settings-guard.mjs`) e insere uma linha em branco espúria dentro de `abrirOuAtualizarIssue` (`+` depois de `return existing.number;`). Portar só as remoções lógicas.
- Lacuna adicional de valor **baixo/nenhum**: a branch tinha gatilho `push` em `paths: [scripts/ci/github-settings-guard.mjs, scripts/ci/github-settings-baseline.json]` (`settings-guard.yml:22-26` da branch); a main só tem `schedule`+`dispatch`. Opcional, não justifica PR própria.
