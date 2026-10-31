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

## 4. Branches adm01-debug/patch-* — verificar e podar

As branches abaixo foram encontradas no remoto e aparecem como candidatas a poda (patch-equivalentes à `main` ou sem commit recente). **Antes de deletar qualquer uma, confirme que já foi mergeada:**

| Branch | Ação sugerida |
|---|---|
| `adm01-debug-patch-*` (várias) | Verificar se foram mergeadas; deletar se sim |

**Verificar com:**
```bash
git fetch origin
git branch -r | grep 'adm01-debug-patch'
# Para cada branch:
git cherry origin/main origin/<branch> | grep '^+' | wc -l
# Se retornar 0: branch é patch-equivalente, segura para deletar
```

---

_Este arquivo deve ser atualizado ou removido quando os itens forem resolvidos._
