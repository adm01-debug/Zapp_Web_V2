# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-22  
**Baseline (main):** `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`  
**PRs analisadas:** 30 abertas (intervalo #2149–#2186, exceto #2158/#2180/#2182/#2184 já mergeadas)  
**Resultado:** 0 mergeadas · 30 BLOQUEADAS  

---

## Metodologia

Para cada PR:
1. Test merge em worktree local (`/tmp/wt-mergetest`, HEAD = main `5a4632c`)
2. Leitura integral do diff: `git diff HEAD..test-pr-<N> -- .` e `-- .github/workflows/`
3. Avaliação dos 4 critérios com evidência (arquivo:linha, SHA, saída de comando)

---

## Resultado por Critério

| Critério | PRs reprovadas |
|---|---|
| 1 — Ainda válida? | 1 (PR #2166) |
| 2 — Traz regressão? | 2 (PRs #2185, #2186) |
| 3 — Já implementada no main? | 1 (PR #2183) |
| 4 — Regra de negócio correta? | 27 (PRs #2149–#2181 excl. #2183/#2185/#2186) |

> Uma PR pode falhar em mais de um critério; o relatório registra o critério principal de cada uma.

---

## Grupos de Bloqueio

### Grupo 1 — Remove Deno do CI (4 PRs)

PRs: **#2149, #2151, #2152, #2155**

**Evidência:** `git diff HEAD..test-pr-<N> -- .github/workflows/ci.yml` mostra remoção do step:
```yaml
# linhas 118-150 do ci.yml da main (SHA 5a4632c):
- name: 🦕 Setup Deno
  uses: denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed
# + deno check + deno test para 201 arquivos .test.ts em supabase/functions/
```

O merge de qualquer dessas branches eliminaria o contrato de testes das edge functions do CI.  
PR #2152 tem falha adicional: downgrade de Playwright `1.64.1` → `1.63.0` sem justificativa.

### Grupo 2 — Workflows de template para stack errado (23 PRs)

PRs: **#2157–#2181** (exceto #2183, #2185, #2186)

Cada PR adiciona um workflow de template GitHub para uma linguagem ou framework que não é usado neste projeto (TypeScript/React/Bun/Vite):

| PR | Workflow adicionado | Por que está errado |
|---|---|---|
| #2157 | dependency-review.yml | Sem SHA pinning; usa package-lock.json, projeto usa bun.lockb |
| #2159 | bearer.yml | SAST para stack genérico; sem SHA pinning |
| #2160 | hadolint.yml | Dockerfile linter; sem Dockerfile no repo |
| #2161 | puppet-lint.yml | Linguagem Puppet |
| #2162 | phpmd.yml | Linguagem PHP |
| #2163 | lintr.yml | Linguagem R |
| #2164 | rust-clippy.yml | Linguagem Rust |
| #2165 | pmd.yml | Linguagem Java |
| #2166 | deno.yml | Deno para app principal (usa Bun) |
| #2167 | webpack.yml | Bundler Webpack (usa Vite) |
| #2168 | slsa.yml | SLSA para publicação de pacotes (app privado) |
| #2169 | node.js.yml | Node.js CI duplica ci.yml; sem SHA pinning; usa npm |
| #2170 | npm-publish.yml | Publicar pacote npm (app privado) |
| #2171 | docker-publish.yml | Docker publish (sem Dockerfile, deploy via Vercel) |
| #2172 | docker-image.yml | Docker CI (sem Dockerfile, deploy via Vercel) |
| #2173 | npm-publish2.yml | npm publish; sem SHA pinning |
| #2174 | python-publish.yml | Linguagem Python |
| #2175 | python-package-conda.yml | Linguagem Python + Conda |
| #2176 | django.yml | Linguagem Python/Django |
| #2177 | python-package.yml | Linguagem Python |
| #2178 | super-linter.yml | Multi-linter para dezenas de linguagens irrelevantes |
| #2179 | greet.yml | Boas-vindas para novos contribuidores (repo privado) |
| #2181 | nextjs.yml | Framework Next.js (usa Vite) |

**Evidência:** `sha_pinning_required: true` (CLAUDE.md "Perímetro do GitHub"); `package.json` confirma Bun/Vite; `bun.lockb` é o lockfile oficial; ausência de `Dockerfile` na raiz.

### Grupo 3 — Já implementado no main (1 PR)

PR: **#2183** `chore(ci): remove workflows alienígenas eslint.yml e static.yml`

**Evidência:** `ls .github/workflows/` na HEAD `5a4632c` não lista `eslint.yml` nem `static.yml` — já removidos anteriormente. O PR remove arquivos que não existem.

### Grupo 4 — Deleta teste existente (1 PR)

PR: **#2185** `docs(pendencias): §8 RESOLVIDO + §9 inventário de workflows da main`

**Evidência:** `git diff HEAD..test-pr-2185 --name-only` lista `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` como deletado (371 linhas).  
`useTalkXSuppression()` (`src/hooks/integrations/useTalkXSuppression.ts`) é exportada e usada em `TalkXSuppression.tsx`.  
Regra violada: "proibido apagar, pular ou enfraquecer testes e asserções".

### Grupo 5 — Migration destrutiva (1 PR)

PR: **#2186** `fix(security): auditoria Supabase 2026-10-22 — department_invites ownership + login_attempts TTL LGPD`

**Evidência:** migration `20261026100300_dept_invites_ownership_fix.sql` contém:
```sql
DROP POLICY IF EXISTS "dept_invites_delete_authenticated" ON department_invites;
DROP POLICY IF EXISTS "dept_invites_insert_authenticated" ON department_invites;
```
Regra violada: "migration só se aditiva e não destrutiva (sem DROP, RENAME, ALTER TYPE, DELETE/UPDATE em massa)".

O bug fix em `useDepartmentManagement.ts` (profile.id vs auth UID) é legítimo, mas não pode ser mergeado com migration destrutiva no mesmo PR.

---

## Resumo Executivo

Todas as 30 PRs abertas foram bloqueadas por falhas reais em critérios de qualidade e segurança:

- **27 PRs** são workflows de template do GitHub gerados automaticamente, incompatíveis com o tech stack (TypeScript/React/Bun/Vite) ou sem SHA pinning conforme política do repositório.
- **4 PRs** compartilham ancestor com uma versão do `ci.yml` que remove os testes Deno das edge functions (`denoland/setup-deno` + `deno test` para 201 arquivos em `supabase/functions/`).
- **1 PR** deleta um arquivo de teste.
- **1 PR** contém migration com `DROP POLICY`.
- **1 PR** remove arquivos que já não existem na main.

Nenhuma PR aprovada para merge. Nenhuma mergeada.

---

## Dossiês Individuais

Ver `analise-prs/dossies/PR-<numero>.md` para análise completa de cada PR com evidências por critério.
