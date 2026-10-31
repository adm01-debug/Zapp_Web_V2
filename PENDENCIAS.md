# PENDENCIAS.md — Itens que dependem do Joaquim

_Atualizado em 2026-10-31 por sessão GF._

---

## 1. DB Live Guard — 2 falhas estruturais que exigem intervenção no banco

**Issue de alerta:** [#1965](https://github.com/adm01-debug/Zapp_Web_V2/issues/1965)

### 1a. ACL de `mcp_exec` / `mcp_exec_many` — `search_path` perdido

**Diagnóstico:** As funções `public.mcp_exec(text, integer)` e `public.mcp_exec_many(text[], integer)` perderam o atributo `SET search_path = pg_catalog, public`. O check `check-mcp-exec-acl.sql` verifica `p.proconfig @> ARRAY['search_path=pg_catalog, public']` e retorna `search_path_is_safe = false` para ambas.

**Causa provável:** A migration `fix_security_definer_search_path_batch2` (aplicada em 2026-10-16) pode ter conteúdo divergente entre o arquivo e o que foi aplicado em produção — as duas funções podem ter sido sobrescritas sem o `SET search_path`.

**O que o Joaquim precisa fazer:**
1. Confirmar o estado atual das funções:
   ```sql
   SELECT proname, proconfig
   FROM pg_catalog.pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('mcp_exec', 'mcp_exec_many');
   ```
2. Se `proconfig` não contiver `search_path=pg_catalog, public`, restaurar com:
   ```sql
   ALTER FUNCTION public.mcp_exec(text, integer) SET search_path = pg_catalog, public;
   ALTER FUNCTION public.mcp_exec_many(text[], integer) SET search_path = pg_catalog, public;
   ```
3. Registrar como migration (`supabase/migrations/`) + ledger antes de aplicar em produção.

---

### 1b. Migrations 2026-10-16 com "prosa pura" no ledger

**Diagnóstico:** O passo "Comparar migrations" (`lote-pendente.mjs`) falha porque várias migrations de 2026-10-16 têm a coluna `statements` preenchida com texto descritivo (resumo em prosa) em vez do SQL real. Isso viola a regra 7 da seção 1 do CLAUDE.md.

**O que o Joaquim precisa fazer:**
1. Identificar as migrations afetadas:
   ```sql
   SELECT version, name,
          array_to_string(statements, ' | ') AS stmt_preview
   FROM supabase_migrations.schema_migrations
   WHERE version LIKE '20261016%'
     AND (statements IS NULL
          OR array_length(statements, 1) = 0
          OR statements[1] !~ '^\s*(ALTER|CREATE|DROP|INSERT|UPDATE|REVOKE|GRANT|DO)');
   ```
2. Para cada migration afetada, confirmar o SQL real que foi aplicado em produção (via `pg_get_functiondef`, `pg_indexes`, `pg_constraint`, etc.).
3. Atualizar o ledger com o SQL real:
   ```sql
   UPDATE supabase_migrations.schema_migrations
   SET statements = ARRAY['<SQL real>']
   WHERE version = '<versao>'
   RETURNING version;
   ```
4. Revalidar com `node scripts/db-audit/supabase-usage-guard.mjs` (deve sair com `novas: 0`).

---

## 2. DB Migrate — pendente de aprovação humana

O workflow `db-migrate.yml` está aguardando aprovação no environment `producao-ddl` para migrations que estão na branch `main` mas ainda não foram aplicadas em produção.

**O que o Joaquim precisa fazer:**
1. Acessar a aba Actions → workflow "DB Migrate" → run mais recente
2. Verificar o dry-run (passou no step `apply=false`)
3. Aprovar o apply no environment `producao-ddl`

---

## 3. Copilot Code Review — falha de firewall interno do Copilot

**O que falha:** Step "Processing Request (Linux)" no workflow dinâmico do GitHub Copilot — firewall bloqueando URLs externas.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Adicionar na lista de permissões do firewall (ver: https://gh.io/copilot/firewall-config)
3. Ou aguardar correção do próprio GitHub (pode ser indisponibilidade temporária)

---

## 4. Branches adm01-debug-patch-* — 24 workflows templates não necessários

**Diagnóstico (2026-10-31):** 24 branches criadas por Joaquim via interface do GitHub ("Create new file" com template de workflow) em 2026-10-21. Cada branch adiciona **um único arquivo** de workflow genérico em `.github/workflows/` que **não existe em `main`** e não tem relação com o projeto TypeScript/Supabase. Nenhuma foi mergeada. São a fonte dos "25 ghost workflows" mencionados no backlog.

**Conteúdo de cada branch** (arquivo adicionado → não existe em main):

| Branch | Arquivo adicionado | Template |
|---|---|---|
| `adm01-debug-patch-1` | `.github/workflows/dependency-review.yml` | Dependency Review Action |
| `adm01-debug-patch-1-2` | `.github/workflows/bearer.yml` | Bearer code scanning |
| `adm01-debug-patch-1-3` | `.github/workflows/hadolint.yml` | Hadolint (Dockerfile linting) |
| `adm01-debug-patch-1-4` | `.github/workflows/puppet-lint.yml` | puppet-lint |
| `adm01-debug-patch-1-5` | `.github/workflows/phpmd.yml` | PHPMD (PHP) |
| `adm01-debug-patch-1-6` | `.github/workflows/lintr.yml` | lintr (R) |
| `adm01-debug-patch-1-7` | `.github/workflows/rust-clippy.yml` | rust-clippy |
| `adm01-debug-patch-1-8` | `.github/workflows/pmd.yml` | PMD code scanning |
| `adm01-debug-patch-2` | `.github/workflows/deno.yml` | Deno CI |
| `adm01-debug-patch-2-1` | `.github/workflows/webpack.yml` | Node.js + Webpack |
| `adm01-debug-patch-2-2` | `.github/workflows/generator-generic-ossf-slsa3-publish.yml` | SLSA generic generator |
| `adm01-debug-patch-2-3` | `.github/workflows/node.js.yml` | Node.js CI |
| `adm01-debug-patch-2-4` | `.github/workflows/npm-publish-github-packages.yml` | npm publish (GitHub Packages) |
| `adm01-debug-patch-2-5` | `.github/workflows/docker-publish.yml` | Docker publish |
| `adm01-debug-patch-2-6` | `.github/workflows/docker-image.yml` | Docker Image CI |
| `adm01-debug-patch-2-7` | `.github/workflows/npm-publish.yml` | npm publish |
| `adm01-debug-patch-2-8` | `.github/workflows/python-publish.yml` | Python package publish |
| `adm01-debug-patch-2-9` | `.github/workflows/python-package-conda.yml` | Python + Conda |
| `adm01-debug-patch-2-10` | `.github/workflows/django.yml` | Django CI |
| `adm01-debug-patch-2-11` | `.github/workflows/python-package.yml` | Python package CI |
| `adm01-debug-patch-2-12` | `.github/workflows/super-linter.yml` | GitHub Super Linter |
| `adm01-debug-patch-3` | `.github/workflows/manual.yml` | Manual workflow (greeting) |
| `adm01-debug-patch-3-2` | `.github/workflows/nextjs.yml` | Next.js CI |
| `adm01-debug-patch-4` | `.github/workflows/main.yml` | Workflow genérico |

**O que o Joaquim precisa fazer:**
1. Confirmar que nenhum desses 24 workflows template é necessário para o projeto (são todos irrelevantes para TypeScript/Supabase: PHP, R, Rust, Deno, Docker, Python, etc.)
2. Deletar as 24 branches no GitHub (Settings → Branches ou via API):
   ```bash
   for b in adm01-debug-patch-1 adm01-debug-patch-1-2 adm01-debug-patch-1-3 adm01-debug-patch-1-4 adm01-debug-patch-1-5 adm01-debug-patch-1-6 adm01-debug-patch-1-7 adm01-debug-patch-1-8 adm01-debug-patch-2 adm01-debug-patch-2-1 adm01-debug-patch-2-2 adm01-debug-patch-2-3 adm01-debug-patch-2-4 adm01-debug-patch-2-5 adm01-debug-patch-2-6 adm01-debug-patch-2-7 adm01-debug-patch-2-8 adm01-debug-patch-2-9 adm01-debug-patch-2-10 adm01-debug-patch-2-11 adm01-debug-patch-2-12 adm01-debug-patch-3 adm01-debug-patch-3-2 adm01-debug-patch-4; do
     git push origin --delete "$b"
   done
   ```

---

_Este arquivo deve ser atualizado ou removido quando os itens forem resolvidos._
