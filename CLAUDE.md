# CLAUDE.md — ZAPP WEB V2

Leia antes de rodar SQL, deploy ou push. Errar o banco aqui já causou retrabalho real.

## 1. Banco de dados

| O que | Valor |
|---|---|
| Banco oficial (produção) | Supabase Cloud **`tnnnlkbymytvtqngbbqh`** — `https://tnnnlkbymytvtqngbbqh.supabase.co` (PostgreSQL 17) |
| MCP para SQL | **`SUPABASE - ZAPP WEB V2 - MCP`** (`db_query`, service_role; multi-statement = 1 transação; timeout 120s) |

**Não são deste projeto — não escrever neles:** `uqysyzndkfiwfztbqvsl` (MCP "ZAPP WEB - LOVABLE" antigo),
`vpkmqeumtxhrwgawxdrl` (MCP "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2", nome quase igual ao oficial — confira qual
foi carregado), o Supabase self-hosted da VPS AtomicaBR. `pgxfvjmuubtbowutlide` (CRM) e `doufsxqlfjyuvxuezpln`
(Catálogo) são externos, **somente leitura**.

**Como usar:**
- Desenvolver e testar: banco **local** da cópia de trabalho. Sem `VITE_ZAPP_LOCAL_SUPABASE_URL` +
  `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY`, o dev server aponta para a **produção**.
- Antes de aplicar migrations num Postgres local: `scripts/db-audit/replay-local.sh` (aponta o host oficial para
  `127.0.0.1` e desliga o `pg_cron`; sem isso o banco local chama as edge functions reais).
- Produção: diagnóstico só com `SELECT`. DDL entra por arquivo → PR → merge → deploy → `.github/workflows/db-migrate.yml`
  (dry-run `apply=false`, depois `apply=true` com o hash do dry-run). DDL destrutivo, segredos e rotação de chaves: só o Joaquim.

**Migrations:**
- Toda DDL = arquivo em `supabase/migrations/` + registro em `supabase_migrations.schema_migrations` com o SQL real
  (`node scripts/db-audit/register-migration.mjs <arquivo.sql>` gera o SQL exato; nunca resumo em prosa).
- Versão nova: `SELECT supabase_migrations.reserve_migration_version('<sessao>','<motivo>')` e confira `ls supabase/migrations`
  e as PRs abertas. Antes de registrar uma migration "ausente", confira se o mesmo objeto já está sob outra versão.
- `supabase_apply_migration` está bugado (coluna `executed_at`). `CREATE INDEX CONCURRENTLY` falha (use `CREATE INDEX`).
- `REVOKE`/`DROP`/rename/mudança de contrato de função: nunca antes do deploy do código que depende dela.
- `supabase/migrations/_foreign/` e `_superseded/` são arquivo morto: filtre `*.sql` ao contar.

## 2. Evolution GO (WhatsApp) — VPS Hostinger

| O que | Valor |
|---|---|
| URL | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` (`EVOLUTION_API_FLAVOR=go`) |
| Hospedagem | Hostinger `srv1481814.hstgr.cloud`, projeto Docker **`evolution-go-rxj2`** — gerir pelo MCP **`HOSTINGER`** (Portainer/AtomicaBR não enxerga) |
| Instância | `PRINCIPAL`; secrets `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_TOKEN` só nas Edge Functions, nunca no front |
| Rotas GO ↔ v2 | `supabase/functions/_shared/evolution-go-routes.ts` |

O Postgres interno da Evolution não é o banco do projeto. QR que não aparece (sessão órfã: `jid` presente,
`connected:false`): a edge `connect` já recria a instância sozinha e devolve `recovered:true` ou erro 409 — sem passo manual.

## 3. Repo, escrita e deploy

- Repo `adm01-debug/Zapp_Web_V2`, branch `main`, público. **Escrita no GitHub: MCP `GITHUB - MCP - FOREVER`**
  (`github_push_files`); o MCP padrão dá 403 em write.
- Branch própria por tarefa, PR sempre, diff mínimo. Re-sincronize antes de editar: há sessões paralelas.
- Front: Vercel, sobe sozinho no merge na `main`. Edge functions: `deploy-functions.yml` (automático no push da `main`
  que muda `supabase/functions/**`; dispatch para uma função ou rollback). Confira o run antes de dizer "em produção".
- CI (desde 16/10/2026): só `ci.yml` em PR/push — tipos, testes de unidade e build. A `main` está sem branch protection.
  `db-guard`, `e2e-talkx` e `codeql` rodam por dispatch (codeql e `db-live-guard` também 1x por semana).
- Nunca imprimir tokens ou secrets.

## 4. Armadilhas de código

- Fundo escuro de painel do inbox: token `bg-inbox-panel` (`--inbox-panel-bg`), nunca `bg-black` fixo (quebra o tema claro).
- Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + telefone `^[0-9]{10,15}$`; mudar exige alterar juntos a
  migration, `src/hooks/crm/contactsAggregates.ts` e `scripts/db-audit/contacts-legacy-visibility.test.sh`.
- Renomear id de aba exige `TAB_REDIRECTS` em `useInboxUIState.ts`.
- Talk X: plano vigente `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`.
- Grafo do código: `graphify query "<pergunta>"` (instalação: `bun run graph:setup`).
