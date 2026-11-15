# claude__feat-e75-toolchain-env-281028-0600 — E75: versões de toolchain por `${{ env.* }}`

- Ref: `origin/claude/feat-e75-toolchain-env-281028-0600` · tip `307023ef8` · merge_base `ab234da8f` (2026-10-28)
- PR: #2298 (fechada) · triagem 2026-11-08: OBSOLETA
- Veredito desta triagem: **OBSOLETA** (confiança alta) · `apagar_branch_seguro = true`

## Propósito da branch (7 commits)
`a3806b4a1 feat(e75): centraliza versões de toolchain em toolchain.json em todos os workflows` + 6 fixes.
Troca cada versão literal nos 11 workflows por `${{ env.NODE }}` / `env.BUN` / `env.DENO` / `env.POSTGRES_IMAGE`,
adicionando em cada job o passo `📦 Carregar toolchain` que injeta `.github/toolchain.json` no `$GITHUB_ENV` via `jq`;
e endurece `scripts/ci/check-workflow-pins.mjs` para reprovar **qualquer** literal de versão no YAML.

## Por que é obsoleta: a main já garante a mesma coisa, por outro caminho
A necessidade de negócio do E75 é "uma só fonte de versões, sem drift". Isso **já está na main**, com literais no YAML
mais um guard que reprova divergência:

| Evidência na `main` | O que prova |
|---|---|
| `.github/toolchain.json` (idêntico byte a byte ao da branch: `bun 1.4.0`, `node 24`, `deno 2.9.5`, `supabase-cli 2.116.0`, `playwright 1.64.1`, `postgres-image …sha256:b0f9560a…`) | a fonte única existe |
| `scripts/ci/check-workflow-pins.mjs:13-14` (`TOOLCHAIN_PATH`, `TOOLCHAIN_KEYS`) e `:88-113` (`loadToolchain`) | o verificador lê a fonte única e falha se ela estiver ausente/incompleta |
| `scripts/ci/check-workflow-pins.mjs:133-136` — `const expected = Object.hasOwn(toolchain, tool) ? toolchain[tool] : null; if (value !== expected) violations.push(...)` | **qualquer literal diferente da fonte única reprova** |
| `scripts/ci/check-workflow-pins.unit.mjs:320-324` — `test("os workflows reais do repositório batem com a fonte única", … assert.equal(main(RAIZ), 0))` | o guard roda contra os workflows reais na suíte `node --test scripts/ci/*.unit.mjs` do CI |

Ou seja: hoje, mudar `node-version: '24'` para `'22'` em qualquer workflow da main reprova o CI. O ganho que a branch
entrega sobre isso é só estético (ler do JSON em runtime em vez de literal conferido). Custo: um passo `jq` extra por
job em 11 workflows, mais dependência de `jq` no runner.

## Defeito concreto na abordagem da branch
`db-guard.yml:66-68` (na branch) põe `POSTGRES_TEST_IMAGE: ${{ env.POSTGRES_IMAGE }}` no `env:` **do job**. O `env:` do job
é avaliado antes de qualquer step, e `POSTGRES_IMAGE` só passa a existir depois do passo `📦 Carregar toolchain`
(escreve em `$GITHUB_ENV`) — o valor resolveria vazio, e com ele os `${{ env.POSTGRES_TEST_IMAGE }}` das linhas
229-230 e 257. A própria branch reconhece o problema no caso de `services:` (`check-workflow-pins.mjs`, comentário
"Services são avaliados antes dos steps — env var de step não funciona aqui"), mas não no `env:` do job.
(Leitura do YAML; não executado.)

## Tabela arquivo × achado
| Arquivo | Lacuna | Achado |
|---|---|---|
| `.github/workflows/ci.yml` (7 jobs), `db-guard.yml`, `db-live-guard.yml`, `db-migrate.yml`, `deploy-functions.yml`, `e2e-logado.yml`, `e2e-talkx.yml`, `targeted-ledger-evidence.yml`, `types-sync.yml`, `vercel-env-cleanup.yml` | passo `📦 Carregar toolchain` + `${{ env.* }}` ausentes | OBSOLETA — main mantém literais conferidos pelo guard (`check-workflow-pins.mjs:133-136`); mesma garantia |
| `.github/workflows/auto-update-pr-branch.yml` | arquivo inexistente na main | OBSOLETA — removido da main em `41853318c` (PR #3113, pacote 6, 14/11/2026, 215 linhas); antes já em `5721e4f50`. O delta de 7 linhas da branch não tem alvo |
| `scripts/ci/check-workflow-pins.mjs` | guard que proíbe literal | OBSOLETA — inverteria a regra vigente da main e quebraria `check-workflow-pins.unit.mjs:320-324`, que exige literais iguais à fonte |
| `scripts/ci/check-workflow-pins.unit.mjs` | 23 linhas de teste adaptadas a `expected: null` | OBSOLETA — testes do novo contrato do guard; sem o guard, não se aplicam |
| `scripts/ci/deno-reproducibility.unit.mjs` | assert `deno-version: ${{ env.DENO }}` | OBSOLETA — main assere `deno-version: '2\.9\.5'`, coerente com o YAML atual |
| `scripts/ci/message-delivery-phase1-rollout.unit.mjs` | assert `POSTGRES_TEST_IMAGE: ${{ … POSTGRES_IMAGE … }}` | OBSOLETA — main assere `POSTGRES_TEST_IMAGE: postgres:17-alpine@sha256:`, coerente com o YAML atual |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | branch **esvazia** o arquivo (975 → 0 linhas) | Sem valor: destruição de doc histórico que a main preserva íntegro. Não portar |
| `docs/reconciliation/tasks/P006.json` | branch reescreve o ledger minificado como JSON indentado (+4733 linhas) | Sem valor: artefato gerado, só reformatação; main tem o mesmo conteúdo em uma linha |

## Nada a recuperar
Nenhuma lacuna com valor alto/médio. Se algum dia o dono quiser a leitura em runtime, o caminho é portar o hunk
abaixo por job **e** tratar o `env:` de job/`services:` (que não pode usar env de step):

```yaml
      - name: 📦 Carregar toolchain
        run: |
          jq -r 'to_entries[] | "\(.key | ascii_upcase | gsub("-";"_"))=\(.value)"' .github/toolchain.json >> "$GITHUB_ENV"
```

## Comandos de prova
- `git show origin/main:.github/toolchain.json` vs `git show origin/claude/feat-e75-toolchain-env-281028-0600:.github/toolchain.json` → idênticos
- `git show origin/main:scripts/ci/check-workflow-pins.mjs | sed -n '125,145p;240,250p'`
- `git show origin/main:scripts/ci/check-workflow-pins.unit.mjs | sed -n '319,325p'`
- `git log --diff-filter=D --oneline origin/main -- .github/workflows/auto-update-pr-branch.yml` → `41853318c`, `5721e4f50`

## Verificação adversarial

Parecer: **concordo com OBSOLETA** (`apagar_branch_seguro = true`). Tentei refutar e não achei hunk de valor ≥ médio fora da main.

### Prova executada (não só leitura)
Exportei a `origin/main` para um diretório descartável e rodei o guard dela contra os workflows reais:
- `git archive origin/main .github scripts/ci scripts/lib | tar -x -C <tmp>` + `node <tmp>/scripts/ci/check-workflow-pins.mjs <tmp>` →
  `OK: 21 workflows usam somente Actions fixadas por SHA, repositórios autorizados, imagens com digest e as versões de toolchain de .github/toolchain.json.` (exit 0)
- Injetei drift nessa cópia (`node-version: '24'` → `'22'` na primeira ocorrência de `ci.yml`) e rodei de novo →
  `FALHA: versão de toolchain divergente da fonte única .github/toolchain.json: ci.yml:51 node: 22 (fonte: 24)` (exit 1)

Isso fecha o ponto central: a necessidade do E75 ("uma só fonte, zero drift") **está satisfeita na main hoje**, e o
mecanismo da branch (`jq` + `${{ env.* }}`) é alternativa, não lacuna. `toolchain.json` é idêntico nos dois lados.

### Checagens adversariais que não deram em nada
- Diff integral de `ci.yml`, `db-guard.yml` e `auto-update-pr-branch.yml` (`git diff ab234da8f origin/claude/feat-e75-…`):
  **todos** os hunks são o passo `📦 Carregar toolchain` + troca de literal por `${{ env.* }}`. Nenhuma mudança de
  lógica, permissão, trigger, cache ou script escondida.
- `auto-update-pr-branch.yml`: confirmado ausente na main (`git ls-tree origin/main` → vazio; deleções em `41853318c` e `5721e4f50`).
  O delta da branch (`sparse-checkout-cone-mode: false` + `.github/toolchain.json` no sparse-checkout) existe só para
  servir o passo `jq`; sem arquivo e sem o mecanismo, não tem alvo.
- Defeito confirmado por leitura: na branch, `db-guard.yml:68` define `POSTGRES_TEST_IMAGE: ${{ env.POSTGRES_IMAGE }}` no
  `env:` do **job**, enquanto `POSTGRES_IMAGE` só nasce no passo `📦 Carregar toolchain` (`db-guard.yml:87-89`). `env:` de job
  não lê `$GITHUB_ENV` de step → resolveria vazio, e com ele **18 usos** de `${{ env.POSTGRES_TEST_IMAGE }}` (linhas 229, 230,
  257, 262, 277, 289, 294, 305, 313, …). Portar como está quebraria os testes de contrato. (Não executado; leitura do YAML.)
- `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`: main 975 linhas, branch 0 linhas. Confirmado que a branch só destrói.

### Correção ao dossiê (uma imprecisão, sem mudar o veredito)
O dossiê diz que `docs/reconciliation/tasks/P006.json` é "só reformatação; main tem o mesmo conteúdo". **Não é exato.**
Comparando canonicamente (`JSON.stringify` após parse) há **7 diferenças de campo**, todas na task 70:

| Campo | main | branch |
|---|---|---|
| `tasks/70/status` | `NOT_IMPLEMENTED` | `DONE_VERIFIED` |
| `tasks/70/implementation.state` / `acceptance.state` | `SEE_TASK_ASSESSMENT` / `NOT_IMPLEMENTED` | `DONE_VERIFIED` |
| `tasks/70/remaining_work` | "Não existe atalho de draft para jobs pesados…" | `""` |
| `tasks/70/pr_numbers` | ausente | `[2295]` |

E o registro da branch é o **factualmente correto**: a main **tem** o atalho de draft implementado —
`.github/workflows/ci.yml:86` e `:230` (`if: github.event.pull_request.draft != true`), `ci.yml:23`
(`types: [… ready_for_review]`), `db-guard.yml:49` e `db-guard.yml:24`. Ou seja, o ledger da main está desatualizado
num campo de status.

Mesmo assim o veredito não muda: é um campo de documentação sobre trabalho **já presente no código** da main, valor
baixo (nenhum efeito em CI, produto ou banco), e o conserto certo é atualizar a task 70 do ledger da main — não portar
a branch, que traria junto a destruição do plano de 975 linhas e a reformatação de 4.733 linhas do ledger gerado.

### Conclusão
Veredito final **OBSOLETA**, branch pode ser apagada. Única pendência residual (fora do escopo desta branch):
corrigir `docs/reconciliation/tasks/P006.json` task 70 para `DONE_VERIFIED` com `pr_numbers: [2295]`.
