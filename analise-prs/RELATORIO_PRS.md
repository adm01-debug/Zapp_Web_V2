# Relatório de Análise de PRs Abertas — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-22  
**Baseline main:** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`  
**PRs abertas analisadas:** 30  
**PRs mergeadas nesta sessão:** 0  
**PR fora do escopo:** #2158 (já estava mergeada quando a análise começou)

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

## Grupo 1 — Templates de workflow para stack errada (REJEITAR)

Estas 24 PRs foram criadas pela conta `adm01-debug` usando templates genéricos do GitHub, para stacks que **não fazem parte deste projeto** (Deno, Python, PHP, R, Rust, Docker, Node.js/Webpack, npm, SLSA, Hadolint, puppet-lint, PMD, Bearer, Dependency Review, Super Linter, Next.js). O projeto usa TypeScript/React/Bun/Vite — nenhum desses workflows tem relevância.

| PR | Título | Branch | Critério 1 |
|---|---|---|---|
| [#2157](https://github.com/adm01-debug/Zapp_Web_V2/pull/2157) | Add Dependency Review Action workflow | `adm01-debug-patch-1-2` | FALHA — stack errada |
| [#2159](https://github.com/adm01-debug/Zapp_Web_V2/pull/2159) | Add Bearer workflow for code scanning | `adm01-debug-patch-1-3` | FALHA — stack errada |
| [#2160](https://github.com/adm01-debug/Zapp_Web_V2/pull/2160) | Add Hadolint workflow for Dockerfile linting | `adm01-debug-patch-1-4` | FALHA — sem Docker neste projeto |
| [#2161](https://github.com/adm01-debug/Zapp_Web_V2/pull/2161) | Add puppet-lint GitHub Actions workflow | `adm01-debug-patch-1-5` | FALHA — Puppet não existe neste projeto |
| [#2162](https://github.com/adm01-debug/Zapp_Web_V2/pull/2162) | Add PHPMD workflow for PHP code analysis | `adm01-debug-patch-1-6` | FALHA — PHP não existe neste projeto |
| [#2163](https://github.com/adm01-debug/Zapp_Web_V2/pull/2163) | Add lintr workflow for R code analysis | `adm01-debug-patch-1-7` | FALHA — R não existe neste projeto |
| [#2164](https://github.com/adm01-debug/Zapp_Web_V2/pull/2164) | Add GitHub Actions workflow for rust-clippy | `adm01-debug-patch-1-8` | FALHA — Rust não existe neste projeto |
| [#2165](https://github.com/adm01-debug/Zapp_Web_V2/pull/2165) | Add PMD code scanning workflow | `adm01-debug-patch-1-9` | FALHA — PMD/Java não existe neste projeto |
| [#2166](https://github.com/adm01-debug/Zapp_Web_V2/pull/2166) | Add GitHub Actions workflow for Deno | `adm01-debug-patch-2` | FALHA — app usa Bun, não Deno |
| [#2167](https://github.com/adm01-debug/Zapp_Web_V2/pull/2167) | Add GitHub Actions workflow for Node.js with Webpack | `adm01-debug-patch-2-1` | FALHA — usa Bun/Vite, não Webpack |
| [#2168](https://github.com/adm01-debug/Zapp_Web_V2/pull/2168) | Add SLSA generic generator workflow | `adm01-debug-patch-2-2` | FALHA — SLSA não aplicável a este projeto |
| [#2169](https://github.com/adm01-debug/Zapp_Web_V2/pull/2169) | Add Node.js CI workflow for testing | `adm01-debug-patch-2-3` | FALHA — CI já existe com Bun/Vitest |
| [#2170](https://github.com/adm01-debug/Zapp_Web_V2/pull/2170) | Add GitHub Actions workflow for npm package publishing | `adm01-debug-patch-2-4` | FALHA — projeto não publica pacote npm |
| [#2171](https://github.com/adm01-debug/Zapp_Web_V2/pull/2171) | Add Docker publish workflow configuration | `adm01-debug-patch-2-5` | FALHA — sem Docker neste projeto |
| [#2172](https://github.com/adm01-debug/Zapp_Web_V2/pull/2172) | Add Docker Image CI workflow | `adm01-debug-patch-2-6` | FALHA — sem Docker neste projeto |
| [#2173](https://github.com/adm01-debug/Zapp_Web_V2/pull/2173) | Add GitHub Actions workflow for npm publishing | `adm01-debug-patch-2-7` | FALHA — projeto não publica pacote npm |
| [#2174](https://github.com/adm01-debug/Zapp_Web_V2/pull/2174) | Add GitHub Actions workflow for Python package | `adm01-debug-patch-2-8` | FALHA — Python não existe neste projeto |
| [#2175](https://github.com/adm01-debug/Zapp_Web_V2/pull/2175) | Add GitHub Actions workflow for Python package with Conda | `adm01-debug-patch-2-9` | FALHA — Python não existe neste projeto |
| [#2176](https://github.com/adm01-debug/Zapp_Web_V2/pull/2176) | Add Django CI workflow | `adm01-debug-patch-2-10` | FALHA — Django não existe neste projeto |
| [#2177](https://github.com/adm01-debug/Zapp_Web_V2/pull/2177) | Add GitHub Actions workflow for Python package | `adm01-debug-patch-2-11` | FALHA — Python não existe neste projeto |
| [#2178](https://github.com/adm01-debug/Zapp_Web_V2/pull/2178) | Add GitHub Super Linter workflow | `adm01-debug-patch-2-12` | FALHA — duplica lint já configurado |
| [#2179](https://github.com/adm01-debug/Zapp_Web_V2/pull/2179) | Add manual workflow for greeting | `adm01-debug-patch-3` | FALHA — demo/teste sem valor |
| [#2181](https://github.com/adm01-debug/Zapp_Web_V2/pull/2181) | Create nextjs.yml | `adm01-debug-patch-3-2` | FALHA — usa Vite, não Next.js |
| [#2183](https://github.com/adm01-debug/Zapp_Web_V2/pull/2183) | chore(ci): remove workflows alienígenas | `chore/remove-alien-workflows` | FALHA — `eslint.yml`/`static.yml` já não existem em main |

**Evidência comum:** `package.json` define scripts Bun; `bun.lockb` é o lockfile; nenhum arquivo Python/PHP/R/Rust/Dockerfile existe no repo. A branch `main` tem 15 workflows legítimos; `eslint.yml` e `static.yml` **não existem** em main — o PR #2183 pretende remover arquivos que já não estão lá.

---

## Grupo 2 — PRs com conteúdo legítimo mas CI falhando (CI-FALHA)

### PR #2149 — `docs(reconciliation): P053`

**Branch:** `claude/docs-p053-regressao-261021-0827` | **SHA:** `d78360c437`

- **Critério 1:** SIM (parcialmente) — documentação de reconciliação P053 tem valor; migrations são duplicatas do main
- **Critério 2:** NÃO — merge limpo (exit 0); conteúdo não-workflow é só documentação
- **Critério 3:** NÃO (documentação) / SIM (migrations — 4 migrations já em main)
- **Critério 4:** FALHA — `ci.yml` neste branch (ancestor compartilhado) remove o step `🦕 Setup Deno` que roda `deno check`/`deno test` em 201 arquivos `.test.ts` de `supabase/functions/`

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure | `Contrato DB offline`: failure | `🎭 E2E Tests`: failure. Branch protection (`strict=true` + 6 required checks) impede merge.

---

### PR #2151 — `fix(ci): destravar workflows que falhavam antes de executar`

**Branch:** `fix/ci-workflows-vermelhos` | **SHA:** `0770f6b5ef`

- **Critério 1:** SIM — objetivo legítimo (destrava CI); 431 arquivos modificados
- **Critério 2:** NÃO — 5 migrations do PR já estão em main; conteúdo E2E/scripts não introduz regressão conhecida
- **Critério 3:** NÃO (correções de CI) / SIM (migrations)
- **Critério 4:** FALHA — mesmo ancestry do #2149: `ci.yml` remove Deno do CI (201 test files de edge functions perderiam cobertura)

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure | `Contrato DB offline`: failure | `🎭 E2E Tests`: cancelled.

---

### PR #2152 — `test(e2e): spec de toque 44px`

**Branch:** `claude/test-toque44-seletores-261021-0853` | **SHA:** `3eca130737`

- **Critério 1:** SIM — corrige seletor `'Close'` → `'Fechar'` em spec E2E de acessibilidade
- **Critério 2:** FALHA — além de remover Deno (mesmo ancestry), faz downgrade de Playwright 1.64.1 → 1.63.0 sem justificativa (evidência: `git diff HEAD..test-pr-2152 -- .github/workflows/ci.yml`)
- **Critério 3:** NÃO (fix do seletor) / SIM (4 migrations já em main)
- **Critério 4:** FALHA — `ci.yml` remove Deno + downgrade de Playwright

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure | `Contrato DB offline`: failure | `🎭 E2E Tests`: failure.

---

### PR #2155 — `fix(ci): destrava workflows que falhavam antes de executar`

**Branch:** `fix/ci-verde-261021` | **SHA:** `6493401`

- **Critério 1:** SIM — objetivo legítimo idêntico ao #2151; 135 arquivos
- **Critério 2:** NÃO — sem migrations novas; conteúdo E2E/scripts/docs não altera código de produção
- **Critério 3:** NÃO (correções CI)
- **Critério 4:** FALHA — mesmo ancestry: `ci.yml` remove Deno do CI

**Bloqueio físico:** CI vermelho — `🏗️ Build`: skipped | `🧪 Unit Tests` + `Contrato DB offline`: failure. Padrão idêntico aos PRs #2149/#2151/#2152.

---

### PR #2185 — `docs(pendencias): §8 + §9`

**Branch:** `claude/kind-gates-87mwoe` | **SHA:** `63b6e666bb`

- **Critério 1:** SIM — documentação de pendências + fix de OOM no typecheck (`--max-old-space-size=4096`)
- **Critério 2:** FALHA — deleta `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` (371 linhas). Regra: "Proibido apagar, pular ou enfraquecer testes". Evidência: `git diff --name-status` lista o arquivo como `D` (deleted)
- **Critério 3:** NÃO — flag `--max-old-space-size=4096` e seções §8/§9 não estão em main
- **Critério 4:** SIM (para o que não deleta)

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests`: failure | `Contrato DB offline`: failure.

---

### PR #2186 — `fix(security): auditoria Supabase`

**Branch:** `claude/loving-lovelace-esc3l2` | **SHA:** `dd5ec6ac73`

- **Critério 1:** SIM — auditoria de segurança Supabase tem valor; 338 arquivos incluindo docs e testes
- **Critério 2:** FALHA (migration destrutiva) — `supabase/migrations/20261026100300_dept_invites_ownership_fix.sql` contém:
  ```sql
  DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON public.department_invites;
  DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON public.department_invites;
  ```
  Regra: "migration só se for aditiva e não destrutiva (sem DROP...)". Este arquivo **não está em main** (última migration em main: `20261026090300`).
- **Critério 3:** NÃO — as 3 migrations do PR (`20261026100300`, `20261026110300`, `20261026120300`) **não estão em main**. Confirmado: `git show origin/main:supabase/migrations/202610261*` retorna vazio.
- **Critério 4:** FALHA — DROP POLICY viola a regra de migration aditiva

**Bloqueio físico:** CI vermelho — `🧪 Unit Tests` (1/3, 2/3, 3/3): failure | `Contrato DB offline`: failure (run 39819751174, jobs 119967797371/119967796924/119967797048/119967575518). As falhas de unit test são **pré-existentes** (arquivos `FilesTab.fase6.test.tsx` e `ChatMessagesArea.movimento-reduzido.test.tsx` são idênticos em main e no branch — `git diff` retorna 0 bytes), mas o CI vermelho + DROP POLICY juntos bloqueiam o merge.

---

## O que pode ser feito para desbloquear

### PRs do Grupo 1 (templates)
Fechar. Não têm valor para o projeto.

### PRs #2149, #2151, #2152, #2155 (ancestry com Deno removido)
O bloqueio raiz está em um ancestor compartilhado que modificou `ci.yml` removendo o step Deno. Para criar um PR mergeável com o conteúdo legítimo dessas branches, seria necessário:
1. Criar uma branch nova a partir de `main`
2. Cherry-pick apenas os commits com o conteúdo relevante (excluindo o commit que toca `ci.yml`)
3. Abrir novo PR

### PR #2185 (deleta teste)
Restaurar `useTalkXSuppression.test.ts` (371 linhas) antes do merge.

### PR #2186 (DROP POLICY)
Reescrever `20261026100300_dept_invites_ownership_fix.sql` como migration aditiva: em vez de `DROP POLICY` + `CREATE POLICY`, usar `ALTER POLICY` ou criar as políticas novas com nomes diferentes, deixando as existentes até que o código que as referencia seja atualizado.

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
