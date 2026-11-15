# Dossiê — `claude/fix-gr023-ossf-scorecard` (branch, sem PR)

- tip `de5df6dfd` · merge-base `1252bb5a` (2026-11-01) · 6 commits à frente
- Origem: tentativa de reaplicar o GR-023 (PR #2051 `claude/w85-w86-w87-ossf-scorecard`, fechada 2026-11-01 sem merge; comentário de fechamento dizia que "os 3 deltas essenciais serão reaplicados num PR novo").

## Propósito
Reintroduzir W85/W86 (OpenSSF Scorecard semanal + `dependency-review-action` no job `security` do `ci.yml`), registrar o Scorecard no `notifica-falha-main.yml` e atualizar o inventário de workflows de 17 → 18 (CLAUDE.md, plano, `docs/ci/README.md`, teste `ci-docs-baseline.unit.mjs`).

## Veredito: **OBSOLETA** (confiança alta) — apagar branch: seguro

Prova central: Scorecard e dependency-review **já estiveram na main** e foram **removidos de propósito por decisão do dono**:
- `4dadbb74d` 2026-10-15 `ci(W50…W94): CI/CD score batch (#1942)` adiciona `.github/workflows/scorecard.yml` e dependency-review no `ci.yml`; `e4c1cb0ac`/`05826d1e0` (#1950/#1952) corrigem permissões; `18f28831d` (#1959) bump v2.5.0.
- `17daae1f1` 2026-10-16 `chore(ci): CI mínimo — tipos, testes de unidade e build` — corpo: "**Decisão do Joaquim (16/10/2026)**: o CI por PR fica só com checagem de tipos, testes de unidade e build. remove 6 workflows: …, **scorecard**, …". Diffstat: `.github/workflows/scorecard.yml | 59 ---`, `ci.yml | 667 +---`.
- `git log --diff-filter=A origin/main -- .github/workflows/scorecard.yml` após 16/10: nenhum commit (nunca voltou). `git grep 'dependency-review\|ossf/scorecard' origin/main -- .github/` → 0 resultados.
- Alguns workflows removidos no "CI mínimo" voltaram depois (`notifica-falha-main.yml`, `settings-guard.yml` em `c543c6ade` 2026-10-28) — o Scorecard **não** voltou, confirmando que a remoção dele ficou mantida.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/scorecard.yml` (novo, 59 linhas) | OBSOLETA — alvo removido de propósito | `17daae1f1` (decisão do dono); ausente em `git ls-tree origin/main .github/workflows/` (21 arquivos, sem scorecard) |
| `.github/workflows/ci.yml` | Hunk W86 (dependency-review, +9 linhas): OBSOLETA pelo mesmo commit. **Demais hunks são corrupção** (valor negativo): remove os passos "Cache de dependências Bun"/"Install dependencies" do job e2e (deixa o step de cache apontando para `~/.cache/ms-playwright`), troca `"${BASE_SHA}^{commit}"` por `"${ BASE_SHA}^{commit}"` e `"HEAD^1^{commit}"` por `"HEAD^1{commit}"` (shell quebrado), `🔧Dependências` sem espaço, `deslogado.—`. Main está correta | `origin/main:.github/workflows/ci.yml:569-570` tem `"${BASE_SHA}^{commit}"` / `"HEAD^1^{commit}"`; `:455` e `:486` mantêm os passos; `removed_still_in_main=22` |
| `.github/workflows/notifica-falha-main.yml` | OBSOLETA — adiciona `OpenSSF Scorecard (push + semanal)` à lista de `workflows:`; sem o workflow, a entrada é morta. Main já evoluiu a lista por conta própria (`Front release targets (V2/V3)`) | `origin/main:.github/workflows/notifica-falha-main.yml:6,13-20` |
| `CLAUDE.md` | OBSOLETA — linha "Inventário vigente (2026-11-01): 18 arquivos" não existe mais; CLAUDE.md da main é só `@AGENTS.md`, inventário mudou para `docs/agentes/github-ci.md` | `git grep 'Inventário vigente' origin/main -- CLAUDE.md` → vazio; teste na main lê `docs/agentes/github-ci.md` (`ci-docs-baseline.unit.mjs:303`) |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | OBSOLETA — contagem 18/21 superada: main diz **21** arquivos YAML (medido 2026-11-14) | `origin/main:docs/audits/PLANO…2026-10-01.md:78` |
| `docs/ci/README.md` | OBSOLETA — "18 workflows" e a linha/seção do Scorecard; main é arquivo gerado com **21 workflows** e sem Scorecard (`render-workflow-docs.mjs --check` regenera a partir dos YAML) | `origin/main:docs/ci/README.md:7` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | OBSOLETA — asserts 18 superados; main asserta **21** | `origin/main:scripts/ci/ci-docs-baseline.unit.mjs:296-298,340` |
| `.github/ci-refresh` | nenhum — arquivo vazio (1 linha em branco) criado só para re-disparar CI | `git show origin/claude/fix-gr023-ossf-scorecard:.github/ci-refresh | cat -A` → `$` |

Observação sobre hipóteses anteriores: o 1.º comentário de fechamento da #2051 ("delta líquido vazio — todo o conteúdo já está na main") é **falso** para o Scorecard — ele não está na main; está fora por decisão, não por incorporação. O 3.º comentário ("reaplicar em PR novo") gerou esta branch, que contraria a decisão de 16/10.

## Lacunas a recuperar
Nenhuma. Se o dono um dia **reverter** a decisão de 16/10 e quiser o Scorecard de volta, a referência pronta (pins reais: checkout v7.0.1 `3d3c42e5…`, scorecard-action v2.5.0 `fa7117db…`, codeql upload-sarif v4.38.2 `2892aa5e…`) é `git show de5df6dfd:.github/workflows/scorecard.yml`, e o passo de dependency-review:

```yaml
      - name: 🔍 Dependency review
        if: github.event_name == 'pull_request'
        uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
        with:
          fail-on-severity: high
```
(`allowed-actions.json` e `patterns_allowed` do baseline já contêm as duas actions — `scripts/ci/allowed-actions.json:17-18`.) Não usar o `ci.yml` da branch: está corrompido (ver tabela).

## Verificação adversarial

Parecer: **concordo com OBSOLETA** · apagar branch: **seguro**. Tentei refutar hunk por hunk (`git diff 1252bb5a origin/claude/fix-gr023-ossf-scorecard`, 8 arquivos) e não achei nenhum hunk de valor ≥ médio fora da main.

Checagens feitas (todas de leitura):

1. **Ausência na main confirmada:** `git ls-tree --name-only origin/main .github/workflows/` = 21 arquivos, sem `scorecard.yml`; `git grep -E 'dependency-review|ossf/scorecard' origin/main -- .github/` → 0 resultados.
2. **Remoção deliberada confirmada, com correção de SHA:** a decisão está em `17daae1f1` (16/10/2026 10:55, "Decisão do Joaquim (16/10/2026)… remove 6 workflows: …, scorecard, …"), mas o arquivo foi de fato apagado no follow-up do mesmo dia: `git log --diff-filter=D origin/main -- .github/workflows/scorecard.yml` → **`5721e4f50`** (16/10 12:56, `fix(ci): corrige testes pós-CI-mínimo…`, diffstat `scorecard.yml | 59 --`). O dossiê atribuía o diffstat a `17daae1f1`; não muda o veredito (mesmo dia, mesma decisão).
3. **Nunca voltou:** `git log --diff-filter=A origin/main -- .github/workflows/scorecard.yml` → só `4dadbb74d` (15/10). Único commit pós-16/10 que menciona scorecard é `384befe83` (10/11, #2850) e o faz como **histórico** ("classe de erro que já quebrou o `scorecard.yml` em 15/10/2026") ao registrar `check-workflow-pins-resolvem.mjs` no CI — ou seja, o subproduto útil daquela época já está na main, o workflow não.
4. **Necessidade do dependency-review já coberta em parte:** `origin/main:.github/workflows/ci.yml:327-336` tem `bun audit --audit-level=low` (informativo) + **"🔒 Audit bloqueante (HIGH/CRITICAL em dependencias de producao)"**, mesma severidade de corte do `fail-on-severity: high`. Não é idêntico (o action lê o diff do PR e a advisory DB do GitHub), mas reintroduzi-lo é nova decisão do dono, não lacuna de resgate.
5. **Corrupção do `ci.yml` confirmada linha a linha:** a branch remove os passos "💾 Cache de dependências Bun"/"📚 Install dependencies" do job E2E (deixando o `actions/cache` apontado para `~/.cache/ms-playwright` e o job sem `bun install`) e quebra o shell: `"${ BASE_SHA}^{commit}"` e `"HEAD^1{commit}"`. A main está correta em `origin/main:.github/workflows/ci.yml:569-570` (`"${BASE_SHA}^{commit}"` / `"HEAD^1^{commit}"`) e mantém os passos em `:455-463`. Valor negativo — nada a aproveitar.
6. **Inventário: a contagem da branch está superada, não perdida.** Branch: 17→18. Main: `docs/ci/README.md:7` = "**21 workflows.**"; `scripts/ci/ci-docs-baseline.unit.mjs:296-300,337-340` assertam **21**; `docs/audits/PLANO…2026-10-01.md:78` = "**21** arquivos YAML" (medido 14/11). `origin/main:CLAUDE.md` é só `@AGENTS.md` e o teste passou a ler `docs/agentes/github-ci.md` (`:10`), logo o hunk de CLAUDE.md da branch nem tem destino.
7. **`notifica-falha-main.yml`:** o hunk só acrescenta `OpenSSF Scorecard (push + semanal)` ao gatilho `workflow_run` — entrada morta sem o workflow; a lista da main evoluiu por conta própria.
8. **`.github/ci-refresh`:** arquivo vazio (1 linha em branco) para re-disparar CI. Zero valor.

Nenhuma lacuna adicional. Única ressalva de precisão (não de conteúdo): usar `5721e4f50` como SHA da deleção do arquivo e `17daae1f1` como SHA da decisão.
