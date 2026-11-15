# Dossiê — claude/fix-z022-z024-dbguard-ci-261018-1930 (PR #2093)

**Tip** `f0b5b7cd2` · **merge-base** `e322d3794` · 1 commit: `fix: desafixar versão do Playwright nos workflows de E2E (Z024)` · 2 arquivos, +4/−4.

## Propósito
Remover o pin literal `playwright@1.63.0` dos passos `bunx playwright ... install` e `install-deps` em `.github/workflows/e2e-logado.yml` e `.github/workflows/e2e-talkx.yml` (versão viria só do `bun.lock`).

## Arquivo × achado × evidência

| Arquivo | Hunk da branch | Achado na main | Evidência |
|---|---|---|---|
| `.github/workflows/e2e-logado.yml` | desafixar `install --with-deps chromium firefox webkit` e `install-deps` | **OBSOLETA** — os dois passos `bunx playwright` não existem mais; a suíte logada roda via `bash scripts/e2e-isolated/run.sh suite ...` | `git show origin/main:.github/workflows/e2e-logado.yml` sem nenhum `bunx playwright` (grep vazio); passo "Validar grupo e executar a suíte no backend descartável" chama `scripts/e2e-isolated/run.sh`; remoção em `afd8c7ca3 fix: validar a suíte logada em ambiente isolado (#2717)` (`git log -S'bunx playwright' origin/main -- .github/workflows/e2e-logado.yml`) |
| `.github/workflows/e2e-talkx.yml` hunk 1 (`install --with-deps chromium` sem pin) | **OBSOLETA (decisão oposta, deliberada)** — main pinou `playwright@1.64.1`, igual ao `bun.lock`, por regra SonarCloud S8543 | `origin/main:.github/workflows/e2e-talkx.yml:94` = `bunx playwright@1.64.1 install --with-deps chromium`; racional em `origin/main:.github/workflows/ci.yml:481-483` ("SonarCloud githubactions:S8543: `bunx playwright` sem versao puxaria um release nao verificado"); lock `bun.lock:1153` = `playwright@1.64.1`; histórico: `4641c8729` (#1923) tirou o pin → `c543c6ade` (#2054) / `4b9585052` (#2156) repuseram em 1.64.1 |
| `.github/workflows/e2e-talkx.yml` hunk 2 (`install-deps chromium` sem pin) | **INCORPORADA** | `origin/main:.github/workflows/e2e-talkx.yml:98` = `bunx playwright install-deps chromium` (byte igual ao da branch) |

## Veredito
**OBSOLETA** — confiança alta. O arquivo logado perdeu o alvo (#2717); no talkx, a única linha que falta (desafixar o `install`) contradiz a decisão vigente na main de pinar `@1.64.1` casado com o `bun.lock` (S8543), tomada depois de a main já ter experimentado o desafixamento (#1923) e revertido (#2054/#2156). A linha de `install-deps` já está igual.

Nada a recuperar. Risco residual: pin `1.64.1` em `ci.yml:484` e `e2e-talkx.yml:94` precisa ser atualizado junto com o `bun.lock` quando o Playwright subir — é a política atual, não lacuna desta branch.

## apagar_branch_seguro
true (OBSOLETA/INCORPORADA com prova para os 2 arquivos).

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** — confiança alta; apagar a branch é seguro.

Refutação tentada hunk por hunk do `git diff e322d3794 origin/claude/fix-z022-z024-dbguard-ci-261018-1930` (4 linhas em 2 arquivos, nada além disso):

1. `.github/workflows/e2e-logado.yml` (2 hunks) — alvo inexistente na main. `git show origin/main:.github/workflows/e2e-logado.yml | grep -n playwright` só retorna a linha 156 (nome do artifact `playwright-report-logado-…`); não há nenhum passo `bunx playwright`. A suíte logada roda por `bash scripts/e2e-isolated/run.sh suite "$E2E_GROUP" "$E2E_OUTPUT"` (passo "Validar grupo e executar a suíte no backend descartável"), com browsers vindos da imagem fixada `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05…8768f` (`scripts/e2e-isolated/network-proof-policy.mjs:9`, `scripts/e2e-isolated/images.lock.json:14`). Remoção dos passos em `afd8c7ca3` (#2717). Aplicar o hunk hoje não teria onde aplicar.
2. `.github/workflows/e2e-talkx.yml` hunk 2 (`install-deps` sem pin) — já idêntico byte a byte na main: `origin/main:.github/workflows/e2e-talkx.yml:98` = `run: bunx playwright install-deps chromium`. INCORPORADA.
3. `.github/workflows/e2e-talkx.yml` hunk 1 (desafixar `install --with-deps chromium`) — única linha realmente ausente, e **aplicá-la quebraria a main**, não a corrigiria:
   - `origin/main:scripts/ci/ci-docs-baseline.unit.mjs:368-372` lê a versão do `bun.lock` e exige literalmente `assert.ok(wf.includes('playwright@' + pwVer))` para `ci.yml` **e** `e2e-talkx.yml`. Sem pin, esse teste de CI falha.
   - `origin/main:scripts/ci/check-workflow-pins.mjs:21` (`PLAYWRIGHT_PIN`) trata `playwright@X` em `run:` como pin de toolchain que deve casar com a fonte única; `check-workflow-pins.unit.mjs:170-176` aceita `@1.64.1` e rejeita versão divergente.
   - Racional registrado em `origin/main:.github/workflows/ci.yml:480-484`: "Versao exata resolvida no bun.lock (SonarCloud githubactions:S8543: `bunx playwright` sem versao puxaria um release nao verificado)".
4. A necessidade de negócio que originou a branch (Z024: workflow em `1.63.0` contra `bun.lock` em `1.64.1` — `docs/audits/PLANO_AUDITORIA_500_COMMITS_200_ETAPAS_2026-10-18.md:312`) **já está atendida por outro caminho**: `git grep -n "playwright@" origin/main -- scripts/ .github/workflows/` não devolve nenhum `1.63.0`; sobram `ci.yml:484` e `e2e-talkx.yml:94` em `@1.64.1`, casados com `bun.lock:339` (`@playwright/test@1.64.1`) e `bun.lock:1153` (`playwright@1.64.1`). Qualquer ocorrência de `1.63.0` na main está só em `docs/_arquivo/` e `docs/audits/` (histórico).
5. Checado "removido de propósito?": o desafixamento chegou a existir (`4641c8729`, #1923) e foi deliberadamente revertido para pin casado com o lock em `c543c6ade` (#2054) e `4b9585052` (#2156) — ou seja, a main já testou a tese da branch e decidiu o contrário.

Nenhum hunk de valor ≥ médio não coberto. Lacunas adicionais: nenhuma.
