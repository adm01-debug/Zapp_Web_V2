# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-22  
**Main SHA baseline:** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`  
**Branch de trabalho:** `claude/busy-cannon-40szm9`  
**PRs analisadas:** 30 (todas as abertas no momento da análise)  
**PRs mergeadas:** 0

---

## Resumo Executivo

| Veredicto | Quantidade | PRs |
|-----------|-----------|-----|
| **MERGEADO** | 0 | — |
| **CI-FALHA** | 6 | #2149, #2151, #2152, #2155, #2185, #2186 |
| **REJEITAR** | 24 | #2157–#2183 (exceto CI-FALHA) |

Nenhuma PR pôde ser mergeada:
- **6 PRs** têm CI falhando em checks obrigatórios (Unit Tests e/ou Contrato DB offline)
- **24 PRs** são templates de GitHub Actions para stacks incorretas ou configurações inválidas

---

## PRs CI-FALHA (não mergeáveis — 6 required checks exigem CI verde)

### PR #2149 — docs(reconciliation): P053
- **Branch:** `claude/docs-p053-regressao-261021-0827`
- **SHA:** `d78360c437f7621d9cf75aed0fec813e9f96906d`
- **CI:** 🧪 Unit Tests (x3): failure | Contrato DB offline: failure | 🎭 E2E: failure
- **Critério 4:** ci.yml remove Deno do CI (main L118-150 usa deno check+test para 201 supabase/functions/ .test.ts)
- **Conclusão:** Não pode mergear — CI falha + regressão em ci.yml

### PR #2151 — fix(ci): destravar workflows que falhavam antes de executar
- **Branch:** `fix/ci-workflows-vermelhos`
- **SHA:** `0770f6b5ef6f1f0df653ffe5c9dd479955673848`
- **CI:** 🧪 Unit Tests (x3): failure | Contrato DB offline: failure | 🎭 E2E: cancelled
- **Critério 4:** ci.yml (ancestry comum com #2149) remove Deno do CI
- **Conclusão:** Não pode mergear — CI falha + regressão em ci.yml

### PR #2152 — test(e2e): spec de toque 44px
- **Branch:** `claude/test-toque44-seletores-261021-0853`
- **SHA:** `3eca130737aa49024286ab3a96be626897da6e35`
- **CI:** 🧪 Unit Tests (x3): failure | Contrato DB offline: failure | 🎭 E2E: failure
- **Critério 4:** ci.yml remove Deno do CI + downgrade Playwright 1.64.1→1.63.0
- **Conclusão:** Não pode mergear — CI falha + regressões em ci.yml

### PR #2155 — fix(ci): destrava workflows que falhavam antes de executar
- **Branch:** `fix/ci-verde-261021`
- **SHA:** `64934014e107190fc83f304c291a2faf35308b7b`
- **CI:** 🏗️ Build: skipped (padrão idêntico #2149/#2151/#2152)
- **Critério 4:** ci.yml remove Deno do CI (ancestry comum)
- **Conclusão:** Não pode mergear — CI falha + regressão em ci.yml

### PR #2185 — docs(pendencias): §8 + §9
- **Branch:** `claude/kind-gates-87mwoe`
- **SHA:** `63b6e666bbe6e3d523df8de12ae5c268693569da`
- **CI:** 🧪 Unit Tests: failure | Contrato DB offline: failure
- **Conclusão:** Não pode mergear — CI falha (2 required checks)

### PR #2186 — fix(security): auditoria Supabase
- **Branch:** `claude/loving-lovelace-esc3l2`
- **SHA:** `dd5ec6ac739588e1ef965b4435911b0113e10936`
- **CI:** 🧪 Unit Tests: failure | Contrato DB offline: failure
- **Conclusão:** Não pode mergear — CI falha (2 required checks)

---

## PRs REJEITAR (24 templates GitHub Actions para stacks incorretas)

### Grupo A — Stack Totalmente Errada

| PR | Título | Motivo |
|----|--------|--------|
| #2160 | hadolint (Dockerfile linter) | Sem Dockerfile no projeto |
| #2161 | puppet-lint | Sem Puppet no projeto |
| #2162 | phpmd (PHP) | Sem PHP no projeto |
| #2163 | lintr (R) | Sem R no projeto |
| #2164 | rust-clippy (Rust) | Sem Rust no projeto |
| #2165 | pmd (Java) | Sem Java no projeto |
| #2166 | deno.yml | Projeto usa Bun, não Deno |
| #2167 | Node.js + Webpack | Projeto usa Bun/Vite |
| #2168 | SLSA generator | Sem relevância para o projeto |
| #2169 | Node.js CI (npm) | Projeto usa Bun, não npm |
| #2170 | npm package publishing | Projeto não é pacote npm |
| #2171 | Docker publish | Sem Dockerfile |
| #2172 | Docker Image CI | Sem Dockerfile |
| #2173 | npm publishing | Projeto não é pacote npm |
| #2174 | Python package publishing | Sem Python no projeto |
| #2175 | Python + Conda | Sem Python no projeto |
| #2176 | Django CI | Sem Django/Python |
| #2177 | Python package | Sem Python no projeto |
| #2178 | GitHub Super Linter | Template genérico; conflita com CI existente; não SHA-pinned |
| #2179 | Greeting workflow | Sem valor de negócio (hello world) |
| #2181 | nextjs.yml | Projeto usa Vite/React, não Next.js |

### Grupo B — Configuração Inválida

| PR | Título | Motivo |
|----|--------|--------|
| #2157 | dependency-review.yml | sha_pinning_required=true: usa @v4 (tag flutuante, não SHA) |
| #2159 | bearer.yml | Secret BEARER_TOKEN inexistente no repositório |

### Grupo C — Já implementado / No-op

| PR | Título | Motivo |
|----|--------|--------|
| #2183 | Remove eslint.yml/static.yml | Esses arquivos já NÃO existem em main (inventário confirmado: 15 workflows, SHA 5a4632c) |

---

## Metodologia

Cada PR foi avaliada contra 4 critérios:

1. **Ainda é válida?** — O problema que resolve ainda existe?
2. **Traz regressão?** — Alguma mudança quebra código existente ou reduz cobertura de testes?
3. **Já está implementada no main?** — A funcionalidade já existe?
4. **A regra de negócio está correta?** — O código implementa a lógica certa para este projeto?

**Evidências coletadas:**
- Diff completo lido via `github_get_pr_diff` para PRs substantivos
- CI check runs verificados via `github_list_check_runs` (SHAs dos HEADs das branches)
- Baseline de 44 falhas pré-existentes em main (`analise-prs/baseline/tests.txt`)
- Inventário de 15 workflows legítimos em main confirmado via `ls .github/workflows/` no SHA `5a4632c`
- `git merge --no-commit --no-ff` em worktree isolado para verificação de conflitos

**Limitação:** PRs com CI falhando não puderam ser mergeadas por branch protection (6 required checks obrigatórios, `strict=true`, `enforce_admins=true`). O problema raiz das falhas de CI (#2149, #2151, #2152, #2155) é que o ci.yml nessas branches remove o bloco Deno (L118-150 em main) que roda `deno check` + `deno test` em 201 arquivos `.test.ts` de `supabase/functions/`.

---

## Próximos Passos (para Joaquim)

Para as PRs CI-FALHA substantivas (#2149, #2151, #2152, #2155):
- O ci.yml nessas branches removeu o bloco Deno do CI
- Para mergear, seria necessário corrigir o ci.yml preservando o bloco Deno (L118-150 de main)
- Depois disso, as PRs #2149 (docs P053) e #2155 (fix CI) ainda precisariam passar em todos os 6 required checks

Para as PRs #2185 e #2186:
- Verificar quais testes unitários estão falhando e corrigir antes de tentar novo merge
