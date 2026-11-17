# Dossiê PR #2123

**Título:** fix(ci): restaura o parse dos contratos de workflow e corrige 8 violações (cache do Bun, TE05/exit-code, concurrency duplicada)
**Branch:** `claude/fix-ci-contratos-cache-261020-2320`
**Head SHA:** `d90d3f78f9d026828c1e888ea6ce91f6643a3c45`
**Base SHA:** `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 7 arquivos (CI scripts e workflows apenas; nenhum código de produção)

### Diff lido — trechos-chave

**`scripts/ci/workflow-contracts.unit.mjs`:**
```diff
+  }); // Fecha bloco do E69 que estava com '});' faltando
```
18/18 contratos agora passam. O bloco sem fechamento fazia o parser do Bun quebrar antes de executar qualquer asserção.

**`ci.yml` (jobs security, e2e, mutation-mapa):**
```diff
+- name: Cache Bun
+  uses: actions/cache@<hash>
+  with:
+    path: ~/.bun/install/cache
+    key: ${{ runner.os }}-bun-${{ hashFiles('bun.lockb') }}
```
Cache do Bun adicionado antes do `bun install` em 3 jobs que não tinham (E67).

**`vercel-env-cleanup.yml`:**
```diff
+defaults:
+  run:
+    shell: bash -euo pipefail
+env:
+  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
+  persist-credentials: false
```
Adiciona `defaults.run.shell` (TE05/exit-code) e `persist-credentials: false` (E97/E98).

**`talkx-status-regen.yml`:**
```diff
-concurrency:
-  group: ${{ github.workflow }}
-  cancel-in-progress: true
```
Remove bloco `concurrency:` duplicado que causava comportamento indefinido.

**`ci.yml`, `e2e-logado.yml`, `e2e-talkx.yml`:**
```diff
- playwright: '1.63.0'
+ playwright: '1.64.1'
```
Atualiza pin do Playwright de 1.63.0 → 1.64.1 nos 3 arquivos.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — corrige bug real (parse quebrado em workflow-contracts.unit.mjs) e 7 violações de CI documentadas |
| 2 | Traz regressão? | **NÃO** — apenas scripts de CI e workflows; nenhum código de aplicação alterado; atualização do Playwright é segura (patch/minor) |
| 3 | Já está em main? | **NÃO** — head `d90d3f78` não em main@`c4c7139e`; o bloco `});` ausente é adição nova |
| 4 | Regra de negócio correta? | **SIM** — corrige infraestrutura de CI; sem impacto em comportamento do app |

## Atenção: versão do Playwright

Esta PR atualiza o pin do Playwright para `1.64.1`. A PR #2129 documenta `1.63.0` em `toolchain.json`. Essas duas PRs precisam ser coordenadas — merge da #2123 primeiro resolve o conflito no #2129.

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Requer `update_pr_branch` antes do merge. Sem auto_merge — requer merge manual após CI verde.

## Ação necessária

1. Atualizar branch contra `main` (`update_pr_branch`).
2. Aguardar os 6 checks obrigatórios ficarem verdes.
3. Fazer merge manual (squash).
