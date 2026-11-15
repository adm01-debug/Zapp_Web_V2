# Dossiê — claude__w85-w86-w87-ossf-scorecard (PR #2051, tip fe00bdfe5, merge-base e322d379)

## Propósito
W85/W86/W87: workflow `scorecard.yml` (OpenSSF Scorecard em push na main + semanal, SARIF no Code Scanning) e step
`🔍 Dependency review` no job `security` do `ci.yml` (falha em severidade ≥ HIGH, só em `pull_request`). Carona:
bump Playwright 1.63.0→1.64.1 em 3 workflows, cache Bun no ci.yml, minify do `allowed-actions.json`, regex do
`security-workflow.unit.mjs`, README gerado.

Contexto decisivo: a main já teve scorecard.yml + dependency-review (lote #1942, 15/10) e os removeu em
`5721e4f50` (16/10, "CI mínimo", PR #1973). Esta branch nasceu DEPOIS (merge-base descende de 5721e4f50 —
`git merge-base --is-ancestor` = yes) e os reaplicou de propósito. O fechamento de #2051 ("delta zero, tudo na
main") é FALSO para scorecard.yml e dependency-review. A reabertura mínima #2510 (01/11) foi fechada pelo
congelamento de features (#2545, decisão do dono 01/11): "branch preservada — reabrir quando destravar fluxo
crítico". Nenhuma PR posterior trouxe scorecard.yml ou dependency-review (`git log -S'dependency-review-action'
origin/main -- .github/workflows/ci.yml` → só 4dadbb74d e 5721e4f50; `git ls-tree origin/main .github/workflows/`
sem scorecard.yml).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/scorecard.yml` | **PERDIDA** (removido em 5721e4f50, readicionado pela branch, reaplicação #2510 fechada por freeze) | ausente em `git ls-tree origin/main .github/workflows/`; `scripts/ci/check-workflow-pins-resolvem.mjs:6-10` menciona o arquivo só como histórico |
| `.github/workflows/ci.yml` — step Dependency review | **PERDIDA** | main job `🔒 Security Audit` (ci.yml:297-342) tem só audit + gitleaks; nenhuma ocorrência de `dependency-review` em `origin/main:.github/workflows/` |
| `.github/workflows/ci.yml` — cache Bun (3 jobs) | INCORPORADA | `origin/main:.github/workflows/ci.yml:243,313,456` (`actions/cache` + `~/.bun/install/cache`) |
| `.github/workflows/ci.yml` — `playwright@1.64.1 install --with-deps` | INCORPORADA | ci.yml:484 |
| `.github/workflows/ci.yml` — `playwright@1.64.1 install-deps` | OBSOLETA | main despina de propósito: `c543c6ade` (#2054, 28/10) troca para `bunx playwright install-deps` (ci.yml:490) |
| `.github/workflows/e2e-logado.yml` | OBSOLETA | main reestruturou: sem passos `playwright install`; roda `scripts/e2e-isolated/run.sh` (e2e-logado.yml:126-150) |
| `.github/workflows/e2e-talkx.yml` | INCORPORADA/OBSOLETA | `1.64.1 install --with-deps` em main:94; `install-deps` despinado em main:98 (mesma decisão #2054) |
| `.github/workflows/talkx-status-regen.yml` | INCORPORADA | hunk PRESENT_REVERSE_APPLIES |
| `scripts/ci/allowed-actions.json` | OBSOLETA (e regressiva) | main já removeu `step-security/harden-runner` (`b94be0a2c` #2100) e mantém formato multilinha; `ossf/scorecard-action` e `actions/dependency-review-action` JÁ estão na main (linhas 17-18); a versão da branch apagaria `actions/download-artifact` (main linha 15) |
| `scripts/ci/security-workflow.unit.mjs` | INCORPORADA (equivalente) | main:36 `/\$\{\{\s*secrets\.(\w+)/gu` — mesma intenção (só expressões reais), sem o `\}\}` final; sem efeito prático |
| `scripts/ci/workflow-contracts.unit.mjs` | INCORPORADA | PRESENT_REVERSE_APPLIES |
| `docs/ci/README.md` | gerado (`render-workflow-docs.mjs --check`); seção Scorecard segue a lacuna 1; `supabase-sync.yml` não existe mais na main; linha crm-sync-worker já em main:193; contagem hoje é **21** (ci-docs-baseline.unit.mjs:296,300) | não portar à mão: regenerar |

## Veredito: PERDIDA_PARCIAL (confiança alta)
Duas lacunas reais, ambas de segurança/CI, deliberadamente adiadas pelo freeze (#2545) — não contradizem regra da
main (as duas actions continuam na allowlist e no baseline `github-settings-baseline.json`), não têm custo externo.
Direção atual do dono é reduzir workflows (tarefa "desativar não essenciais"), então scorecard.yml = valor baixo;
dependency-review = um step no job já existente, valor médio. `apagar_branch_seguro` = false (fechamento de #2510
pediu "branch preservada").

## Lacunas a recuperar (portar sobre main atual, PR nova)
### 1. `.github/workflows/ci.yml` — step no job `security`, após `🔍 Detect secrets introduced in commits` (main ~l.342-350)
```yaml
      # W86: revisa dependências novas introduzidas no PR; falha se alguma tiver
      # severidade HIGH ou maior. Só em pull_request: o evento push não tem diff
      # de dependências relevante (o lock já foi auditado no passo anterior).
      - name: 🔍 Dependency review
        if: github.event_name == 'pull_request'
        uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
        with:
          fail-on-severity: high
```
Conferir: permissões do job (`contents: read` basta); `check-workflow-pins-resolvem.mjs` exige SHA real da tag v5.0.0.
Ressalva do Qodo em #2510: a action compara o dependency graph do GitHub, não o `bun.lock` — cobertura parcial para
mudanças só transitivas (o `bun audit` bloqueante da main já cobre produção).

### 2. `.github/workflows/scorecard.yml` (novo) — conteúdo integral em `git show origin/claude/w85-w86-w87-ossf-scorecard:.github/workflows/scorecard.yml`
Pontos: `on: push(main) + schedule '50 7 * * 1' + workflow_dispatch`; `permissions: read-all` no topo; job com
`id-token: write`, `security-events: write`; `actions/checkout@3d3c42e5…` v7.0.1 `persist-credentials: false`;
`ossf/scorecard-action@fa7117db83c52d787ae5a89f350999701505d78e # v2.5.0` (`results_format: sarif`,
`publish_results: true`, `repo_token: ${{ secrets.GITHUB_TOKEN }}`); `github/codeql-action/upload-sarif` — usar o
pin atual da main `33d7b85da1a04171e211befe2c739303b9a4c066 # v4.39.3` (codeql.yml:56), não o `2892aa5e… v4.38.2`
da branch. Bloco `# docs:` no topo é obrigatório. Depois: `node scripts/ci/render-workflow-docs.mjs` para regerar
`docs/ci/README.md` e atualizar os dois testes de contagem em `scripts/ci/ci-docs-baseline.unit.mjs:296,300,337`
(21 → 22). Checar com `node --test scripts/ci/*.unit.mjs`.

## Não portar
Playwright `install-deps` pinado (main despinou em #2054), `allowed-actions.json` minificado (apagaria
`actions/download-artifact`), e2e-logado.yml (reestruturado), README à mão (gerado).

## Verificação adversarial

**Parecer: CONCORDO com PERDIDA_PARCIAL.** Tentei refutar por INCORPORADA e por OBSOLETA; nenhuma das duas sustenta.

Conferido na `origin/main` atual (só leitura):
- `git ls-tree --name-only origin/main .github/workflows/` → 21 arquivos, **sem** `scorecard.yml`. `git grep -i scorecard origin/main -- .github/ scripts/` só retorna docs/arquivo histórico e a allowlist — nenhum workflow.
- `git grep -n "dependency-review" origin/main -- .github/` → zero ocorrência em workflow (só docs e inventário). `git log -S'dependency-review-action' --oneline origin/main -- .github/workflows/ci.yml` → apenas `4dadbb74d` (entrou) e `5721e4f50` (saiu).
- Remoção deliberada confirmada: `5721e4f50` ("fix(ci): corrige testes pós-CI-mínimo…", 16/10) apaga `scorecard.yml` (−59) e corta 650 linhas do `ci.yml`. **Mas** `git merge-base --is-ancestor 5721e4f50 e322d379` = yes: a branch nasceu depois e readicionou de propósito (commit "fix(W85/W86/W87): resolve conflito — dependency-review + scorecard sobre main atual"). Removido de propósito ≠ rejeitado: perímetro continua permitindo as duas actions — `origin/main:scripts/ci/allowed-actions.json:15-16` (`actions/dependency-review-action`, `ossf/scorecard-action`) e `github-settings-baseline.json` `selected_actions_patterns`. Logo não é OBSOLETA.
- Teste de substituição para a lacuna 1: o job `🔒 Security Audit` da main (`ci.yml:295-342`) tem `bun audit --audit-level=low` **informativo** e o gate bloqueante `audit-prod.mjs --level high` restrito a **dependências de produção**. O `dependency-review` bloquearia HIGH+ em dependência nova de qualquer escopo (inclui dev) no diff do PR. Cobertura parcial → lacuna real, valor médio confirmado.
- Encaixe no código atual: `ci.yml` da main tem `permissions: contents: read` no topo (linha 29-30) — suficiente para a action em repo público; o step entra depois do gitleaks sem conflito. `workflow-contracts.unit.mjs` não exige bloco `permissions` por job (grep sem resultado).
- Freeze confirmado: PR #2510 CLOSED 2026-11-01T23:49:43Z, `merged_at: null`, `mergeable_state: behind`; PR #2545 (congelamento) MERGED 2026-11-02T03:01:18Z. `docs/PRONTO_PRODUCAO.md:4` — "Tudo o que não está aqui fica para depois" = adiado, não rejeitado.
- "Não portar" da triagem checado e correto: `install-deps` despinado na main (`ci.yml:490`, `e2e-talkx.yml:98`, commit `c543c6ade` #2054); `allowed-actions.json` da branch é minificado e **perde** `actions/download-artifact` (está na main, linha 14) — regressivo; `security-workflow.unit.mjs:36` da main é equivalente.

**Achado novo (muda a execução, não o veredito):** a branch `origin/claude/fix-gr023-ossf-scorecard` (tip `de5df6dfd`, merge-base `1252bb5a4` de 01/11, 6 à frente / 363 atrás) **já contém as duas lacunas** rebaseadas sobre main muito mais nova e com as 12 revisões de #2510 aplicadas: `scorecard.yml` (sem o bloco `defaults` que a versão antiga tinha) e `ci.yml:311-313` com o step `🔍 Dependency review` no mesmo pin `a1d282b3… v5.0.0`. Portar daí custa menos que da `claude/w85-w86-w87-ossf-scorecard` (132 linhas, 4 arquivos em conflito). Observação sobre o "branch preservada" citado no dossiê: aquele comentário é do fechamento de **#2510**, isto é, refere-se à `claude/fix-gr023-ossf-scorecard` — não a esta branch. Esta aqui só continua necessária como cópia de segurança enquanto a recuperação não entrar na main; por isso mantive `apagar_branch_seguro = false`, mas o conteúdo único dela é zero se a `fix-gr023` for preservada.
