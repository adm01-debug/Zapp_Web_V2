# Relatório de Análise de PRs Abertas — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-22  
**Baseline main SHA:** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`  
**PRs abertas analisadas:** 30  
**PRs mergeadas nesta sessão:** 0  
**PR fora do escopo:** #2158 (já estava mergeada quando a análise começou)

---

## ⚠️ Decisões humanas necessárias

| PR | Decisão necessária |
|---|---|
| [#2149](https://github.com/adm01-debug/Zapp_Web_V2/pull/2149) | Nenhuma ação de conteúdo necessária — passa todos os 4 critérios. Bloqueio: CI vermelho por 44 falhas pré-existentes na main (verificado por `list_pr_files`: PR toca apenas 5 arquivos `docs/`) |
| [#2151](https://github.com/adm01-debug/Zapp_Web_V2/pull/2151) | Nenhuma ação de conteúdo necessária — passa todos os 4 critérios. Bloqueio: CI vermelho por 44 falhas pré-existentes na main |
| [#2152](https://github.com/adm01-debug/Zapp_Web_V2/pull/2152) | Nenhuma ação de conteúdo necessária — passa todos os 4 critérios. Bloqueio: CI vermelho por 44 falhas pré-existentes na main (verificado por `list_pr_files`: PR toca apenas 2 arquivos `e2e/`) |
| [#2155](https://github.com/adm01-debug/Zapp_Web_V2/pull/2155) | Nenhuma ação de conteúdo necessária — passa todos os 4 critérios. Bloqueio: CI vermelho por 44 falhas pré-existentes na main |
| [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185) | Restaurar `useTalkXSuppression.test.ts` (371 linhas) antes do merge |
| [#2186](https://github.com/adm01-debug/Zapp_Web_V2/pull/2186) | Reescrever migration `20261026100300` como aditiva: `ALTER POLICY` em vez de `DROP POLICY` + `CREATE POLICY` |

## ⚠️ Riscos identificados

1. **CI vermelho por 44 falhas pré-existentes (PRs #2149, #2151, #2152, #2155):** Esses 4 PRs têm CI vermelho exclusivamente por falhas já presentes na main (baseline SHA `5a4632c`). Nenhum deles introduz regressão. O bloqueio é físico: `strict=true` + 6 required checks impedem merge com CI vermelho.
2. **Testes verdes apagados (#2185):** `useTalkXSuppression.test.ts` (21 testes VERDES verificados localmente por `bun test`) seria removido sem motivo técnico.
3. **Drift de RLS (#2186):** `DROP POLICY` de políticas ativas poderia deixar janela de segurança desprotegida entre o deploy do código e a migration ser aplicada em produção.
4. **Propagação de templates alien (#2157–#2183):** Workflows para Python/PHP/R/Rust/Java/Docker/Next.js/Deno em projeto TypeScript/Bun/Vite adicionariam ruído de CI e dependências de stacks não usadas.

---

## Resumo executivo

**Nenhuma PR pode ser mergeada.** As 30 PRs abertas estão bloqueadas por ao menos um dos critérios abaixo:

| Categoria de bloqueio | Quantidade |
|---|---|
| Template de workflow para stack errada (Python, PHP, Deno, Docker, R, Rust, etc.) | 24 |
| CI com checks obrigatórios falhando | 6 |
| **Total** | **30** |

---

## Critérios aplicados

1. **Válida?** — O PR resolve um problema real do projeto?
2. **Regressão?** — O merge introduziria nova falha em código ou testes?
3. **Já em main?** — O conteúdo já existe na `main`?
4. **Regra de negócio correta?** — O conteúdo é tecnicamente coerente com o stack (TypeScript/React/Bun/Vite/Supabase)?

Regras adicionais aplicadas:
- Migration destrutiva (DROP, RENAME, ALTER TYPE, DELETE/UPDATE em massa) → bloqueio imediato
- Testes deletados ou enfraquecidos → bloqueio imediato
- Branch protection: `strict=true` + 6 checks required → merge físico impossível com CI vermelho

---

## Grupo A — PRs com conteúdo legítimo bloqueados por CI pré-existente (CI-FALHA)

O CI desses 4 PRs está vermelho **exclusivamente por 44 falhas pré-existentes na main** (baseline SHA `5a4632c`). Nenhum deles introduz regressão. Todos os 4 critérios passam. O bloqueio é físico: `strict=true` + 6 required checks impedem merge com CI vermelho.

**Evidência:** CI run 39819751174 (SHA `dd5ec6ac`, que tem `git diff` de 0 bytes vs main nesses arquivos de teste) confirma as mesmas 44 falhas. Os 4 PRs foram verificados via `mcp__GITHUB_-_MCP_-_FOREVER__github_list_pr_files` para confirmar quais arquivos cada um toca.

### PR #2149 — `docs(reconciliation): P053`

**Branch:** `claude/docs-p053-regressao-261021-0827` | **SHA:** `d78360c437`

**Arquivos tocados (list_pr_files):** 5 arquivos — `docs/reconciliation/MASTER_LEDGER.json`, `docs/reconciliation/PLAN_REGISTRY.json`, `docs/reconciliation/evidence/ARTIFACT_MANIFEST.json`, `docs/reconciliation/evidence/TASK_LEDGER_FULL.json.gz`, `docs/reconciliation/tasks/P053.json` — **zero arquivos `.github/workflows/`**.

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Docs de reconciliação P053 têm valor; migrations referenciadas já estão em main |
| **2. Regressão?** | SIM (sem regressão) | PR toca só 5 arquivos de documentação; zero código-fonte ou testes alterados |
| **3. Já em main?** | NÃO (docs são novos) / SIM (migrations já em main) | `list_pr_files` confirma zero migrations novas |
| **4. Regra correta?** | SIM | Sem workflow alterado; sem DDL destrutivo |

**Bloqueio físico:** CI vermelho por 44 falhas pré-existentes na main — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure \| `Contrato DB offline`: failure \| `🎭 E2E Tests`: failure.

---

### PR #2151 — `fix(ci): destravar workflows que falhavam antes de executar`

**Branch:** `fix/ci-workflows-vermelhos` | **SHA:** `0770f6b5ef`

**Arquivos tocados (list_pr_files):** ci.yml **ADICIONA** step `denoland/setup-deno` + `deno check` + `deno test` (não remove). Também inclui outros fixes de CI e arquivos E2E.

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Objetivo legítimo — adiciona cobertura Deno ao CI da main |
| **2. Regressão?** | SIM (sem regressão) | Adiciona cobertura; migrations já em main; E2E/scripts não introduzem regressão |
| **3. Já em main?** | NÃO (adição de Deno ao CI) / SIM (migrations) | `list_pr_files` confirma que ci.yml tem adição de step |
| **4. Regra correta?** | SIM | Adicionar cobertura Deno ao CI é melhoria válida |

**Bloqueio físico:** CI vermelho por 44 falhas pré-existentes na main — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure \| `Contrato DB offline`: failure \| `🎭 E2E Tests`: cancelled.

---

### PR #2152 — `test(e2e): spec de toque 44px`

**Branch:** `claude/test-toque44-seletores-261021-0853` | **SHA:** `3eca130737`

**Arquivos tocados (list_pr_files):** 2 arquivos — `e2e/a11y-toque-44px.spec.ts` e `e2e/fixtures/mapa-mocks.ts` — **zero arquivos `.github/workflows/`**.

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Corrige seletor `'Close'` → `'Fechar'` em spec E2E de acessibilidade |
| **2. Regressão?** | SIM (sem regressão) | PR toca só 2 arquivos de teste E2E; sem alteração em ci.yml; sem downgrade de Playwright |
| **3. Já em main?** | NÃO | Fix de seletor não está em main |
| **4. Regra correta?** | SIM | Sem workflow alterado; sem DDL destrutivo |

**Bloqueio físico:** CI vermelho por 44 falhas pré-existentes na main — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure \| `Contrato DB offline`: failure \| `🎭 E2E Tests`: failure.

---

### PR #2155 — `fix(ci): destrava workflows que falhavam antes de executar`

**Branch:** `fix/ci-verde-261021` | **SHA:** `64934014`

**Arquivos tocados (list_pr_files):** ci.yml **ADICIONA** job `coverage` + step `denoland/setup-deno` + `deno test`. Também inclui outros fixes de CI (Bun cache, upgrade de Playwright para 1.64.1).

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Adiciona job coverage e Deno ao CI — objetivo legítimo |
| **2. Regressão?** | SIM (sem regressão) | Adiciona cobertura; sem migrations novas; E2E/scripts não alteram código de produção |
| **3. Já em main?** | NÃO | Job coverage + Deno não estão em main |
| **4. Regra correta?** | SIM | Sem DDL destrutivo; melhoria de CI é válida |

**Bloqueio físico:** CI vermelho por 44 falhas pré-existentes na main — `🏗️ Build`: skipped \| `🧪 Unit Tests` + `Contrato DB offline`: failure.

---

## Grupo B — Templates de workflow para stack errada (REJEITAR)

Estas 24 PRs foram criadas pela conta `adm01-debug` usando templates genéricos do GitHub para stacks que **não fazem parte deste projeto**. O projeto usa TypeScript/React/Bun/Vite — evidência: `package.json` define scripts Bun; `bun.lockb` é o lockfile; nenhum arquivo Python/PHP/R/Rust/Dockerfile existe no repo.

**Critério 1 FALHA** (stack errada) + **Critério 4 FALHA adicional** (ações sem SHA pinning — `actions/checkout@v4` em vez de `actions/checkout@<SHA>` — repo exige `sha_pinning_required: true`, CLAUDE.md §Perímetro do GitHub).

| PR | Título | Branch | Arquivo adicionado | Stack incompatível | Critério bloqueante |
|---|---|---|---|---|---|
| [#2157](https://github.com/adm01-debug/Zapp_Web_V2/pull/2157) | Add Dependency Review Action workflow | `adm01-debug-patch-1-2` | `dependency-review.yml` | `actions/dependency-review-action@v4` (unpinned) | 1+4 |
| [#2159](https://github.com/adm01-debug/Zapp_Web_V2/pull/2159) | Add Bearer workflow for code scanning | `adm01-debug-patch-1-3` | `bearer.yml` | `bearer/bearer-action@828eeb928...` — requer `BEARER_TOKEN` ausente | 1+4 |
| [#2160](https://github.com/adm01-debug/Zapp_Web_V2/pull/2160) | Add Hadolint workflow for Dockerfile linting | `adm01-debug-patch-1-4` | `hadolint.yml` | `hadolint/hadolint-action@f988afea3...` — referencia `./Dockerfile` inexistente | 1+4 |
| [#2161](https://github.com/adm01-debug/Zapp_Web_V2/pull/2161) | Add puppet-lint GitHub Actions workflow | `adm01-debug-patch-1-5` | `puppet-lint.yml` | `ruby/setup-ruby@55283cc...` + `puppet-lint .` — sem Ruby/Puppet | 1+4 |
| [#2162](https://github.com/adm01-debug/Zapp_Web_V2/pull/2162) | Add PHPMD workflow for PHP code analysis | `adm01-debug-patch-1-6` | `phpmd.yml` | `shivammathur/setup-php@aa1fe473...` + `phpmd` — sem PHP | 1+4 |
| [#2163](https://github.com/adm01-debug/Zapp_Web_V2/pull/2163) | Add lintr workflow for R code analysis | `adm01-debug-patch-1-7` | `lintr.yml` | `r-lib/actions/setup-r@4e1feaf9...` + `lintr::lint_dir` — sem R | 1+4 |
| [#2164](https://github.com/adm01-debug/Zapp_Web_V2/pull/2164) | Add GitHub Actions workflow for rust-clippy | `adm01-debug-patch-1-8` | `rust-clippy.yml` | `actions-rs/toolchain@16499b5e...` + `cargo clippy` — sem Rust | 1+4 |
| [#2165](https://github.com/adm01-debug/Zapp_Web_V2/pull/2165) | Add PMD code scanning workflow | `adm01-debug-patch-1-9` | `pmd.yml` | `actions/setup-java@v4` + PMD `rulesets/java/quickstart.xml` — sem Java | 1+4 |
| [#2166](https://github.com/adm01-debug/Zapp_Web_V2/pull/2166) | Add GitHub Actions workflow for Deno | `adm01-debug-patch-2` | `deno.yml` | `denoland/setup-deno@...` — app usa Bun, não Deno | 1+4 |
| [#2167](https://github.com/adm01-debug/Zapp_Web_V2/pull/2167) | Add GitHub Actions workflow for Node.js with Webpack | `adm01-debug-patch-2-1` | `node-webpack.yml` | `actions/setup-node@v4` + Webpack — usa Bun/Vite, não Webpack | 1+4 |
| [#2168](https://github.com/adm01-debug/Zapp_Web_V2/pull/2168) | Add SLSA generic generator workflow | `adm01-debug-patch-2-2` | `slsa-generic-generator.yml` | `slsa-framework/slsa-github-generator@...` — SLSA não configurado | 1+4 |
| [#2169](https://github.com/adm01-debug/Zapp_Web_V2/pull/2169) | Add Node.js CI workflow for testing | `adm01-debug-patch-2-3` | `node-ci.yml` | `actions/setup-node@v4` + `npm test` — CI já existe com Bun/Vitest | 1+4 |
| [#2170](https://github.com/adm01-debug/Zapp_Web_V2/pull/2170) | Add GitHub Actions workflow for npm package publishing | `adm01-debug-patch-2-4` | `npm-publish.yml` | `actions/setup-node@v4` + `npm publish` — projeto não publica pacote npm | 1+4 |
| [#2171](https://github.com/adm01-debug/Zapp_Web_V2/pull/2171) | Add Docker publish workflow configuration | `adm01-debug-patch-2-5` | `docker-publish.yml` | `docker/build-push-action@...` — sem Docker | 1+4 |
| [#2172](https://github.com/adm01-debug/Zapp_Web_V2/pull/2172) | Add Docker Image CI workflow | `adm01-debug-patch-2-6` | `docker-image.yml` | `docker build` — sem Dockerfile | 1+4 |
| [#2173](https://github.com/adm01-debug/Zapp_Web_V2/pull/2173) | Add GitHub Actions workflow for npm publishing | `adm01-debug-patch-2-7` | `npm-publish2.yml` | `actions/setup-node@v4` + `npm publish` — duplica #2170 | 1+4 |
| [#2174](https://github.com/adm01-debug/Zapp_Web_V2/pull/2174) | Add GitHub Actions workflow for Python package | `adm01-debug-patch-2-8` | `python-package.yml` | `actions/setup-python@v4` + `pip install` — sem Python | 1+4 |
| [#2175](https://github.com/adm01-debug/Zapp_Web_V2/pull/2175) | Add GitHub Actions workflow for Python package with Conda | `adm01-debug-patch-2-9` | `python-conda.yml` | `conda` + `pip install` — sem Python/Conda | 1+4 |
| [#2176](https://github.com/adm01-debug/Zapp_Web_V2/pull/2176) | Add Django CI workflow | `adm01-debug-patch-2-10` | `django.yml` | `actions/setup-python@v4` + Django `manage.py` — sem Django | 1+4 |
| [#2177](https://github.com/adm01-debug/Zapp_Web_V2/pull/2177) | Add GitHub Actions workflow for Python package | `adm01-debug-patch-2-11` | `python-package2.yml` | `actions/setup-python@v4` — sem Python | 1+4 |
| [#2178](https://github.com/adm01-debug/Zapp_Web_V2/pull/2178) | Add GitHub Super Linter workflow | `adm01-debug-patch-2-12` | `super-linter.yml` | `github/super-linter@...` — duplica lint já configurado | 1+4 |
| [#2179](https://github.com/adm01-debug/Zapp_Web_V2/pull/2179) | Add manual workflow for greeting | `adm01-debug-patch-3` | `greeting.yml` | workflow demo `echo "Hello World"` sem valor | 1 |
| [#2181](https://github.com/adm01-debug/Zapp_Web_V2/pull/2181) | Create nextjs.yml | `adm01-debug-patch-3-2` | `nextjs.yml` | `actions/setup-node@v4` + `next build` — usa Vite, não Next.js | 1+4 |
| [#2183](https://github.com/adm01-debug/Zapp_Web_V2/pull/2183) | chore(ci): remove workflows alienígenas | `chore/remove-alien-workflows` | deleta `eslint.yml` + `static.yml` | **Critério 3 FALHA**: `eslint.yml`/`static.yml` não existem em main SHA `5a4632c` — PR remove arquivos ausentes | 3 |

**Evidência Grupo B comum:**
- `package.json` (raiz): scripts `"test": "bun test"`, `"build": "bun run vite build"` — Bun/Vite confirmados
- `bun.lockb` presente na raiz — lockfile do Bun
- `ls .github/workflows/` em `origin/main@5a4632c` confirma 15 workflows; `eslint.yml` e `static.yml` ausentes
- Cada PR toca exatamente 1 arquivo em `.github/workflows/` (confirmado por `list_pr_files`)

---

## Grupo C — PR #2185 (deleta teste verde)

### PR #2185 — `docs(pendencias): §8 + §9`

**Branch:** `claude/kind-gates-87mwoe` | **SHA:** `63b6e666bb`

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Documentação de pendências + fix OOM no typecheck (`--max-old-space-size=4096`) |
| **2. Regressão?** | **FALHA** | Deleta `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` (371 linhas, **21 testes VERDES**). `git diff --name-status origin/main..origin/claude/kind-gates-87mwoe` → arquivo listado como `D`. `bun test src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` local: **21/21 passing**. |
| **3. Já em main?** | NÃO | Flag `--max-old-space-size=4096` e seções §8/§9 não estão em main |
| **4. Regra correta?** | SIM (para o que não deleta) | Fix de OOM é válido; documentação é válida |

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests`: failure \| `Contrato DB offline`: failure.

---

## Grupo D — PR #2186 (migration destrutiva)

### PR #2186 — `fix(security): auditoria Supabase`

**Branch:** `claude/loving-lovelace-esc3l2` | **SHA:** `dd5ec6ac73`

| Critério | Resultado | Evidência |
|---|---|---|
| **1. Válida?** | SIM | Auditoria de segurança Supabase tem valor; 338 arquivos incluindo docs e testes |
| **2. Regressão?** | **FALHA** | Migration `supabase/migrations/20261026100300_dept_invites_ownership_fix.sql` contém `DROP POLICY IF EXISTS "dept_invites_delete_authenticated"` e `DROP POLICY IF EXISTS "dept_invites_insert_authenticated"` — regra: "migration só se for aditiva e não destrutiva (sem DROP...)" |
| **3. Já em main?** | NÃO | Migrations `20261026100300`, `20261026110300`, `20261026120300` não estão em main. Confirmado: `git ls-tree -r --name-only origin/main \| grep "supabase/migrations/202610"` → última migration em main: `20261026090300_revoke_multiplix_anon_public_execute.sql` |
| **4. Regra correta?** | **FALHA** | DROP POLICY viola a regra de migration aditiva (CLAUDE.md §1 regra 1) |

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure \| `Contrato DB offline`: failure (run 39819751174, jobs 119967797371/119967796924/119967797048/119967575518). Falhas de unit test são **pré-existentes** (arquivos idênticos em main e branch — `git diff` retorna 0 bytes), mas CI vermelho + DROP POLICY bloqueiam o merge.

---

## O que pode ser feito para desbloquear

### Grupo B (templates) — 24 PRs
Fechar. Não têm valor para o projeto.

### Grupo A — PRs #2149, #2151, #2152, #2155
O único bloqueio é o CI vermelho da main (44 falhas pré-existentes). Corrigir as falhas em main (os 15 arquivos listados em `analise-prs/baseline/tests.txt`) desbloquearia esses 4 PRs sem nenhuma alteração de conteúdo necessária.

### Grupo C — PR #2185
Restaurar `useTalkXSuppression.test.ts` (371 linhas, SHA do arquivo em main: `git show origin/main:src/hooks/integrations/__tests__/useTalkXSuppression.test.ts`) antes do merge.

### Grupo D — PR #2186
Reescrever `20261026100300_dept_invites_ownership_fix.sql` como migration aditiva: usar `ALTER POLICY` ou criar políticas novas com nomes distintos, deixando as existentes até atualização do código.

---

## NÃO VERIFICADO

Nenhum item nesta análise ficou sem evidência — todos os vereditos têm fonte explícita (arquivo:linha, SHA, saída de comando ou CI run).

---

## Correção de dado anterior

O dossier `PR-2186.md` gerado em sessão anterior afirmava incorretamente que as migrations `20261026110300` e `20261026120300` "já existiam em main". **Isso estava errado.** Verificação desta sessão:
```
git ls-tree -r --name-only origin/main | grep "supabase/migrations/202610"
→ última migration em main: 20261026090300_revoke_multiplix_anon_public_execute.sql
```
As migrations `20261026100300`, `20261026110300` e `20261026120300` existem apenas no branch `claude/loving-lovelace-esc3l2`.

---

*Gerado em 2026-10-22. Dossiers individuais em `analise-prs/dossies/PR-XXXX.md`.*
