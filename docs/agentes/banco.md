# Banco de dados — referência para agentes

Ler quando for rodar SQL, criar/aplicar migration, montar Postgres local ou auditar o ledger.
Resumo das regras no `AGENTS.md`; aqui está o detalhe. Errar o banco já causou retrabalho real.

## Onde se trabalha

| Situação | Banco | Como |
|---|---|---|
| Diagnóstico | **produção, só leitura** | `SELECT` pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`; nunca escrita para "testar" |
| Migration nova | arquivo em `supabase/migrations/` | PR → CI (`db-guard.yml` faz o replay em Postgres descartável) → apply (abaixo) |
| Teste de comportamento de banco | **Postgres descartável** | `scripts/db-audit/*.test.sh` no CI; nunca no banco oficial |
| Migration destrutiva, segredos, rotação de chaves | **só com o dono do projeto** | — |

1. **O app só fala com um banco local por desvio explícito:** `VITE_ZAPP_LOCAL_SUPABASE_URL` +
   `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY`, aceitos apenas fora de build de produção e apenas para
   `http://127.0.0.1` ou `http://localhost` (`src/config/supabase.ts`). Sem as duas variáveis, o
   servidor de desenvolvimento aponta para a **produção** — confira antes de testar tela.
2. **E2E contra outro banco:** `e2e/fixtures/supabase-env.ts` aceita `E2E_SUPABASE_URL_OVERRIDE` e
   `E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE`. Specs que fixam o projeto oficial (`e2e/catalog.spec.ts`,
   `e2e/fixtures/talkx-demo.ts`, `e2e/fixtures/mapa-mocks.ts`) não foram adaptados.
3. **Um Postgres local montado com estas migrations chama a produção se ninguém travar.** As
   migrations gravam a URL do banco oficial em jobs do `pg_cron`, funções e segredos do cofre; com
   `pg_cron` e `pg_net` ativos, o banco local faz POST nas edge functions reais. Antes de aplicar
   migrations em qualquer Postgres local: (a) apontar o host do projeto oficial para `127.0.0.1` no
   `/etc/hosts` do contêiner e (b) `alter system set cron.launch_active_jobs = off`.
   `scripts/db-audit/replay-local.sh` já faz as duas coisas e aborta se alguma falhar.
4. **Replay do zero não é igual à produção.** Reaplicar as migrations deixa falhas esperadas
   listadas em `scripts/db-audit/replay-known-failures.json`; a referência da estrutura real é
   `supabase/schema-manifest.json` (snapshot da produção, mantido pelo `types-sync`).

## Banco OFICIAL

| O que | Valor |
|---|---|
| Projeto Supabase | **`tnnnlkbymytvtqngbbqh`** (Supabase **Cloud**) |
| URL | `https://tnnnlkbymytvtqngbbqh.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh |
| PostgreSQL | 17.6 |
| MCP para SQL | **`SUPABASE - ZAPP WEB V2 - MCP`** (`db_query` via `mcp_exec`, service_role; multi-statement = 1 transação; timeout 120s) |
| Ledger | `supabase_migrations.schema_migrations` |

### Bancos que NÃO são deste projeto (não escrever neles)

- **`uqysyzndkfiwfztbqvsl`** — MCP "ZAPP WEB - LOVABLE" antigo. **NÃO é o banco atual.**
- **`vpkmqeumtxhrwgawxdrl`** — MCP "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2" (origem Lovable,
  `src_query` read-only). Nome quase idêntico ao MCP oficial — conferir sempre qual dos dois foi
  carregado antes de rodar SQL.
- **Supabase self-hosted da VPS AtomicaBR** — outros sistemas; o ZAPP não roda nele.
- `pgxfvjmuubtbowutlide` (Gestão de Clientes/CRM) e `doufsxqlfjyuvxuezpln` (Catálogo de Produtos) —
  bancos **externos, somente leitura** consumidos pelo front/edges. Nunca aplicar migration neles a
  partir deste repo.

## Regras de migration

1. **Como o DDL entra em produção:** depois do merge, por `db_query` do MCP oficial, com o DDL e o
   `INSERT` no ledger na **mesma** chamada (1 transação) e `RETURNING` não-vazio como guarda. Gere o
   SQL exato com `node scripts/db-audit/register-migration.mjs <arquivo.sql>` (dry-run) — nunca
   transcreva à mão. O `.github/workflows/db-migrate.yml` (dry-run + hash SHA-256 + aprovação no
   environment `producao-ddl`) é o caminho com aprovação humana; se usar, `apply=false` primeiro,
   depois `apply=true` com o `confirm_runtime_sha256` do dry-run, e se outra sessão aplicar DDL no
   meio, repita o dry-run. **NÃO VERIFICADO ponta a ponta:** a falha de 31/10 (`Cannot find project
   ref`) foi corrigida com `db push --db-url` e a execução de 01/11 recusou corretamente (migrations
   fora do ledger), mas nenhuma execução verde com `apply=true` foi observada desde a correção — confira
   o último run antes de contar com ele. Ele conecta como `postgres`, que não é superuser: `REVOKE` de
   grant do `supabase_admin` e `CREATE INDEX` em `cron.*` só pelo SQL Editor.
2. **Versão sem colisão:** antes de criar arquivo ou aplicar DDL, no mesmo turno: `SELECT max(version)`
   no ledger, `ls supabase/migrations | tail` e busca de PRs abertas tocando `supabase/migrations/`.
   Para reservar de forma atômica: `SELECT supabase_migrations.reserve_migration_version('<sessao>', '<motivo>')`
   (pega o maior entre ledger e reservas e soma `10000`). `INSERT ... ON CONFLICT DO NOTHING` sempre
   com `RETURNING`/SELECT de conferência — `DO NOTHING` já mascarou colisão.
3. Toda mudança de DDL = arquivo em `supabase/migrations/` + registro no ledger +
   `supabase/schema-catalog.json` atualizado + `scripts/db-audit/known-violations.json` se o guard mudar.
4. Validação de fechamento: `node scripts/db-audit/supabase-usage-guard.mjs` exit 0 (`novas: 0`) +
   paridade arquivos↔registros (count + md5 dos prefixos).
5. `CREATE INDEX CONCURRENTLY` falha (o gateway envolve em transação) — usar `CREATE INDEX` simples
   (tabelas são pequenas). `VACUUM` também não roda pelo MCP (`cannot run inside a transaction block`).
6. **Ordem obrigatória: arquivo → PR → merge em `main` → deploy do código → apply.** Nunca DDL a
   partir de branch aberto. `REVOKE`, `DROP`, rename ou mudança de contrato de função usada pelo
   front/edges: **nunca** antes do deploy do código correspondente (já quebrou o lockout de login em
   produção). DDL aplicado fora desse fluxo vira drift: o `db-live-guard` acusa, o
   catálogo/`types.ts`/manifesto ficam errados até o próximo `types-sync`, e lacunas de segurança da
   migration só aparecem se alguém auditar de propósito.
7. Ao registrar no ledger, `statements` é o SQL **real e completo**, um statement por elemento, sem `;`
   final e sem comentários — nunca resumo em prosa. Resumo obriga exceção `pinned-replay` em
   `migration-evidence.json` para sempre. Antes de registrar uma migration "ausente": confira também se
   a **mesma** função/tabela já está registrada sob outra versão (`SELECT version FROM
   supabase_migrations.schema_migrations, LATERAL unnest(statements) s WHERE s LIKE '%nome%'`) — o
   incidente `dashboard_kpi` foi exatamente isso.
8. `supabase/migrations/_foreign/` e `_superseded/` são arquivo morto (cada um com seu README) —
   **nunca** contar com `ls supabase/migrations/` sem filtrar `*.sql`, senão a paridade
   arquivos↔ledger dá falso positivo.
9. Antes de propor um novo guard/script de CI, conferir se `.github/workflows/db-guard.yml` (por-PR)
   ou `db-live-guard.yml` (push em `main` e agendado) já cobre: este último já compara migrations com o
   ledger, regenera catálogo e manifesto contra o commitado e verifica frescor de `types.ts`.
10. **O ledger ao vivo é a verdade.** Nunca renomeie um arquivo para outra versão "para resolver"
    colisão: se o slot está ocupado no ledger, o arquivo fica com a versão que já tem lá. Rename =
    delete e create em commits separados (o guard "Rejeitar edicao de migration ja existente" do
    `db-guard.yml` reprova rename por similaridade). Ledger só com comentário não descreve o que rodou:
    confirme o estado real por `pg_get_functiondef`/`pg_indexes`/`pg_constraint`.

Sessões paralelas commitam no mesmo repo e no mesmo banco: re-sync antes de editar, conferir
`max(version)` antes de registrar migration.
