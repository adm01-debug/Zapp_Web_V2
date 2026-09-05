# CLAUDE.md — ZAPP WEB V2 (leitura OBRIGATÓRIA antes de qualquer ação)

> Este arquivo é a fonte de verdade sobre **qual banco** e **qual Evolution API** este projeto usa.
> Errar o banco aqui já causou retrabalho real. Confira SEMPRE antes de rodar SQL ou deploy.

---

## 1. Banco de dados OFICIAL do projeto

| O que | Valor |
|---|---|
| Projeto Supabase | **`tnnnlkbymytvtqngbbqh`** (Supabase **Cloud**) |
| URL | `https://tnnnlkbymytvtqngbbqh.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh |
| PostgreSQL | 17.6 |
| MCP para SQL | **`SUPABASE - ZAPP WEB V2 - MCP`** (`db_query` via `mcp_exec`, service_role; multi-statement = 1 transação; timeout 120s) |

### ⚠️ Bancos que NÃO são deste projeto (não escrever neles)

- **`uqysyzndkfiwfztbqvsl`** — MCP "ZAPP WEB - LOVABLE" antigo. **NÃO é o banco atual.**
- **Supabase self-hosted da VPS AtomicaBR** — outros sistemas; o ZAPP não roda nele.
- `pgxfvjmuubtbowutlide` (Gestão de Clientes/CRM) e `doufsxqlfjyuvxuezpln` (Catálogo de Produtos) — bancos **externos, somente leitura** consumidos pelo front/edges. Nunca aplicar migration neles a partir deste repo.

### Regras de migration (self-explicativas, já validadas)

1. `supabase_apply_migration` **está bugado** (coluna `executed_at` inexistente). Procedimento: DDL via `db_query` + `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)` manual.
2. Antes de registrar: `SELECT max(version)` e usar versão estritamente maior; `INSERT ... ON CONFLICT DO NOTHING` com `RETURNING`/SELECT de conferência (DO NOTHING já mascarou colisão).
3. Toda mudança de DDL = arquivo em `supabase/migrations/` + registro no banco + `supabase/schema-catalog.json` atualizado + `scripts/db-audit/known-violations.json` se o guard mudar.
4. Validação de fechamento: `node scripts/db-audit/supabase-usage-guard.mjs` exit 0 (`novas: 0`) + paridade arquivos↔registros (count + md5 dos prefixos).
5. `CREATE INDEX CONCURRENTLY` falha (gateway envolve em transação) — usar `CREATE INDEX` simples (tabelas são pequenas).
6. **Ordem obrigatória: arquivo → PR → apply. Nunca DDL a partir de branch paralelo.**
   Só aplique DDL em produção **depois** do merge em `main` e do deploy do código que
   depende dele. Única exceção: DDL **aditivo e compatível com o código atual de `main`**
   (tabela/função/coluna nullable/índice novos, que nada em produção usa ainda) pode ser
   aplicado antes do merge, e só porque o `supabase-usage-guard` precisa do catálogo
   regenerado a partir do banco para o PR passar — o PR precisa estar verde e ser mergeado
   no mesmo turno. `REVOKE`, `DROP`, rename ou mudança de contrato de função usada pelo
   front/edges: **nunca** antes do deploy do código correspondente. Aplicar de um branch que fica aberto foi a
   causa dos dois drifts de setembro/2026 (2026-09-02: 2 migrations; 2026-09-04: 5 migrations
   dos PRs #213/#218) — o segundo quebrou o lockout de login em produção porque o `REVOKE`
   entrou no banco antes do código que o acompanhava. Se o PR não vai mergear agora, o DDL
   espera. Validação local antes do push: `DESTINO_URL=postgres://x PSQL_BIN=<shim que
   imprime o ledger> node scripts/db-audit/check-migration-drift.mjs` (o ledger sai de
   `SELECT json_build_object('version',version,'name',name,'statements',statements)::text
   FROM supabase_migrations.schema_migrations`).
7. Ao registrar no ledger, `statements` é o SQL **real e completo**, um statement por elemento,
   sem `;` final e sem comentários — nunca resumo em prosa ("... (add guard)"). Resumo obriga
   exceção `pinned-replay` em `migration-evidence.json` para sempre.

---

## 2. Evolution GO (WhatsApp) — Hostinger

| O que | Valor |
|---|---|
| Flavor | **Evolution GO** (`evoapicloud/evolution-go`) — `EVOLUTION_API_FLAVOR=go` |
| URL pública | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` |
| Hospedagem | VPS **Hostinger** `srv1481814.hstgr.cloud` → Gerenciador Docker, projeto **`evolution-go-rxj2`** |
| Containers | `evolution-go-rxj2-api-1` (porta host **32783** → 4000), `evolution-go-rxj2-postgres-1`, `evolution-go-rxj2-pg-backup-1` |
| Instância padrão | `PRINCIPAL` (`EVOLUTION_INSTANCE_NAME`) |
| Auth | `EVOLUTION_API_KEY` (global, endpoints admin `/instance/*`) e `EVOLUTION_INSTANCE_TOKEN` (endpoints por instância `/send/*`, `/message/*`) — secrets nas Edge Functions, nunca no front |
| Tradução de rotas | `supabase/functions/_shared/evolution-go-routes.ts` (GO ↔ v2 legada) |
| Gestão da VPS | MCP **`HOSTINGER`** (VPS/Docker). **NÃO** é a VPS AtomicaBR/Portainer — Portainer não enxerga estes containers. |

O Postgres do `evolution-go-rxj2` é interno da Evolution GO (estado de sessões WhatsApp). **Não confundir com o banco do projeto** (seção 1) e não aplicar migrations do repo nele.

---

## 3. Repo e escrita

- Repo: `adm01-debug/zapp-web-v2`, branch `main`, público. Deploy do front: Vercel; edges: Supabase Cloud.
- **Escrita no GitHub: somente MCP `GITHUB - MCP - FOREVER`** (`github_push_files`). O MCP padrão do GitHub retorna 403 em write.
- Diff mínimo, causa raiz. `github_push_files` sobrescreve o arquivo — mandar conteúdo integral com apenas a mudança semântica.
- Pode haver sessão paralela commitando no mesmo branch/banco: re-sync antes de editar, conferir `max(version)` antes de registrar migration, `uniq -d` nos prefixos após push.

---

*Atualizado em 2026-08-28. Se algo aqui divergir do banco/infra real, corrija ESTE arquivo no mesmo commit do fix.*

## graphify
This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.
- For codebase questions: `graphify query "<question>"` when graph.json exists.
- After modifying code: `graphify update .` to keep graph current.

## Frescura do Grafo
```sh
git rev-parse --short HEAD
grep "Built from commit" graphify-out/GRAPH_REPORT.md
```
Se divergirem, auto-sync N8N corrige em ate 15min.
