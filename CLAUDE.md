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
- **`vpkmqeumtxhrwgawxdrl`** — MCP "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2" (origem Lovable, `src_query` read-only). Nome quase idêntico ao MCP oficial da seção 1 — conferir sempre qual dos dois foi carregado antes de rodar SQL.
- **Supabase self-hosted da VPS AtomicaBR** — outros sistemas; o ZAPP não roda nele.
- `pgxfvjmuubtbowutlide` (Gestão de Clientes/CRM) e `doufsxqlfjyuvxuezpln` (Catálogo de Produtos) — bancos **externos, somente leitura** consumidos pelo front/edges. Nunca aplicar migration neles a partir deste repo.

### Regras de migration (self-explicativas, já validadas)

1. `supabase_apply_migration` **está bugado** (coluna `executed_at` inexistente). Procedimento: DDL via `db_query` + `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)` manual. Para apply em produção com dry-run + confirmação de hash SHA-256 (**preferível** a fazer manual pelo MCP), existe `.github/workflows/db-migrate.yml` (`workflow_dispatch` na `main`, `apply=false` primeiro para o dry-run, depois `apply=true` com `confirm_runtime_sha256` do dry-run anterior). Desde 2026-09-25 (PR #695) ele aceita **qualquer** migration: quando a version não tem contrato runtime dedicado no workflow, cai no contrato genérico (`scripts/db-audit/generic-migration-runtime.sql`), que não afirma nada sobre a semântica do alvo mas prova que o schema `public` não mudou entre o dry-run e o apply. Antes disso o fallback rejeitava toda migration nova, e foi por isso que o DDL passou a ir por MCP — origem dos drifts de setembro/2026. O job exige aprovação humana no environment `producao-ddl` (PR #687). Se outra sessão aplicar DDL entre o dry-run e o apply, o apply falha fechado: repetir o dry-run e usar o hash novo, nunca relaxar a comparação.
2. Antes de registrar: `SELECT max(version)` e usar versão estritamente maior; `INSERT ... ON CONFLICT DO NOTHING` com `RETURNING`/SELECT de conferência (DO NOTHING já mascarou colisão duas vezes em 2026-09-16). `scripts/db-audit/register-migration.mjs <arquivo.sql> [--apply]` automatiza esse ritual — gera o bloco SQL pronto (dry-run) ou aplica e aborta sozinho se `RETURNING` vier vazio.
3. Toda mudança de DDL = arquivo em `supabase/migrations/` + registro no banco + `supabase/schema-catalog.json` atualizado + `scripts/db-audit/known-violations.json` se o guard mudar.
4. Validação de fechamento: `node scripts/db-audit/supabase-usage-guard.mjs` exit 0 (`novas: 0`) + paridade arquivos↔registros (count + md5 dos prefixos).
5. `CREATE INDEX CONCURRENTLY` falha (gateway envolve em transação) — usar `CREATE INDEX` simples (tabelas são pequenas).
6. **Ordem obrigatória: arquivo → PR → merge em `main` → deploy → apply. Nunca DDL a partir de branch paralelo.**
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
8. `supabase/migrations/_foreign/` e `_superseded/` são arquivo morto (cada um com seu README) —
   **nunca** contar com `ls supabase/migrations/` sem filtrar `*.sql`, senão a paridade
   arquivos↔ledger dá falso positivo (aconteceu na auditoria de 2026-09-16).
9. Antes de propor um novo guard/script de CI, conferir se `.github/workflows/db-guard.yml`
   (por-PR) ou `db-live-guard.yml` (push em `main` **e agendado**) já cobre: este último já
   compara migrations com o ledger, regenera catálogo e manifesto contra o commitado, e
   verifica frescor de `types.ts` — reconstruir isso do zero é retrabalho.

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

- Repo: `adm01-debug/Zapp_Web_V2` (nome real no GitHub; a API aceita `zapp-web-v2` por case-insensitive, mas referências novas usam a grafia canônica), branch `main`, público. Deploy do front: Vercel; edges: Supabase Cloud.
- **Escrita no GitHub: somente MCP `GITHUB - MCP - FOREVER`** (`github_push_files`). O MCP padrão do GitHub retorna 403 em write.
- Diff mínimo, causa raiz. `github_push_files` sobrescreve o arquivo — mandar conteúdo integral com apenas a mudança semântica.
- Pode haver sessão paralela commitando no mesmo branch/banco: re-sync antes de editar, conferir `max(version)` antes de registrar migration, `uniq -d` nos prefixos após push.
- Branch mergeado = deletado no mesmo turno em que o merge é confirmado (local com `git branch -d`, remoto se ainda existir). Nunca trabalhar em worktree sob `/tmp` — `git worktree prune` não é automático e acumula silenciosamente (22 worktrees `prunable` encontrados na auditoria de 2026-09-16, todos de branches já mergeadas ou abandonadas).

---

*Atualizado em 2026-09-25. Se algo aqui divergir do banco/infra real, corrija ESTE arquivo no mesmo commit do fix.*

## Auditoria e plano de correções (2026-09-16)

**Plano vigente:** `docs/audits/PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` (sucessor; herda
os 80 checkboxes abertos de 16/09 e adiciona o aprendido em 17/09).
Auditoria exaustiva local↔GitHub↔banco em `docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md`.
Estado dos achados após re-auditoria de 2026-09-17:
- `messages` >75% dead tuples — **RESOLVIDO**: autovacuum executou em 2026-09-16 18:37; em
  2026-09-17 a tabela estava com 4,2% de dead tuples (1.557/35.900). Lembrete permanece válido:
  `VACUUM` manual não roda pelo MCP (`VACUUM cannot run inside a transaction block`); se voltar a
  acumular, usar `psql` direto ou o SQL Editor do dashboard.
- Branch protection sem `Contrato DB vivo` — **NÃO É BUG, é design**: `db-live-guard.yml`
  deliberadamente não tem trigger de `pull_request` (não expor `DESTINO_URL` a código de PR — ver
  cabeçalho do workflow), logo o check nunca reportaria no SHA de PR e torná-lo required
  congelaria todos os merges. O contrato vivo roda pós-merge (push na `main`), agendado (segunda
  06:00 UTC) e via `workflow_dispatch`; os required checks de PR seguem sendo os offline.
  Complemento E43 verificado em 2026-09-17: force-push e deleção da `main` bloqueados, strict
  mode ligado.

  **Correção de 2026-09-25:** a linha original afirmava "review obrigatório". A API não retorna
  `required_pull_request_reviews` para a `main` e `list_rulesets` volta vazio — **não há** revisão
  obrigatória, e o `.github/CODEOWNERS` é decorativo sem a regra ligada. Isso é deliberado: com
  vários agentes abrindo PR e usando auto-merge, exigir aprovação humana pararia o fluxo inteiro.
  `required_conversation_resolution` segue desligado pelo mesmo motivo (bots de review deixam
  threads abertas). O perímetro real da `main` hoje é: `enforce_admins`, sem force-push, sem
  deleção, strict mode e os 7 required checks da seção abaixo.

## Auditoria de workflows (2026-09-25) — estado dos guardas

Auditoria dos 12 workflows, da branch protection, dos secrets e dos environments. O que passou a
valer (confira antes de propor mudança de CI, para não refazer o que já existe):

**Required checks da `main`** (7, strict mode): `🔍 Lint & TypeCheck`, `🧪 Unit Tests`,
`🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🔬 CodeQL (javascript-typescript)` e
`🎭 E2E Tests (Playwright)` — este último passou a ser obrigatório em 25/09; antes rodava em PR
sem bloquear merge.

**Environments com aprovação humana** (`required_reviewers`, branch policy restrita a branches
protegidas) — os quatro já criados no repo; os dois primeiros passam a ser exigidos pelos
workflows quando a PR #687 mergear: `producao-edge-functions` (deploy-functions.yml),
`producao-ddl` (db-migrate.yml),
`legacy-import-destrutivo` (supabase-sync.yml) e `db-ledger-evidence` (que existia só com
`branch_policy`, portanto sem exigir aprovação de ninguém). Disparar qualquer um desses
workflows agora pausa em `Waiting` até alguém aprovar na aba Actions.

**`supabase-sync.yml` está desarmado.** A única barreira era digitar o project-ref, que é público
(está neste arquivo, num repo público). Agora exige, cumulativamente, aprovação no environment e o
secret `LEGACY_IMPORT_UNLOCK` igual ao project-ref — secret que **não existe**, logo todo dispatch
falha fechado. Para reativar: regerar o export a partir do banco oficial, criar o secret, removê-lo
após o import. O export continua sendo um snapshot legado e defasado.

**CodeQL analisa os próprios workflows** (job `analyze-actions`, linguagem `actions`, check
`🔬 CodeQL (actions)`). Deliberadamente um job separado: matrixar o job `analyze` renomearia o
check required e travaria todos os merges.

**`db-live-guard` deixou de falhar em silêncio.** Como ele não roda em PR (por design), o vermelho
na `main` só aparecia para quem abrisse a aba Actions — foi assim que os drifts de 25/09 passaram.
Agora abre, ou comenta em, uma issue única com label `db-live-guard`. **Complemento de 25/09:** o job
liga `PSQL_CONNECT_RETRIES=2` — sem isso um timeout do pooler abria alerta de "contrato quebrado"
que não era verdade (run 36135041890 morreu em `timeout expired` antes de consultar qualquer coisa).
O retry vive em `withPsqlEnvironment` e é **desligado por padrão**: só cobre falha de transporte (o
comando não chegou ao servidor), nunca erro de SQL, de autenticação ou drift, e quem escreve
(`register-migration --apply`) não liga.

**Agendamentos sem colisão:** types-sync `49 5 * * 1`, db-live-guard `13 6 * * 1` (nesta ordem, o
segundo compara o que o primeiro gera), branch-hygiene `56 7 * * 1`, codeql `30 9 * * 1`. Os dois
primeiros rodavam ambos às 06:00 e disputavam o banco no mesmo minuto.

**Repo:** `sha_pinning_required` ligado no GitHub (além do `check-workflow-pins.mjs`).

**NÃO desligue `can_approve_pull_request_reviews`.** O nome da API engana: esse toggle é a opção
"Allow GitHub Actions to create **and** approve pull requests" — ele governa a criação de PR por
Actions, não só a aprovação. Desliguei em 25/09 achando que fechava só o caminho de auto-aprovação;
o types-sync quebrou na hora, com `GitHub Actions is not permitted to create or approve pull
requests` no passo "Abrir ou atualizar PR de sincronizacao` (run 36133450406). Revertido para
ligado no mesmo dia. O ganho de segurança seria nulo de qualquer forma: sem
`required_pull_request_reviews` na `main`, não há aprovação para um workflow contornar.

**`types-sync`:** o PR de sincronização nasce com `GITHUB_TOKEN` porque `TYPES_SYNC_PR_TOKEN` não
existe, e pela política anti-loop do GitHub os checks do Actions nascem em `action_required` — o PR
não ficava verde sozinho (o rollup engana: parece verde contando só apps de terceiros). **Resolvido
em 2026-09-25 (PR #696):** o passo "Destravar os checks do PR de sincronizacao" aprova esses runs
com `actions:write`. Provado no run 36134562996 — CI, DB Guard e CodeQL do PR #668 passaram de
`action_required` para `run_attempt` 2 sem ninguém tocar e fecharam verdes. **O `TYPES_SYNC_PR_TOKEN`
deixou de ser necessário: não crie o secret.** Se o Job Summary algum dia listar runs "recusados
pelo GITHUB_TOKEN", é regressão de permissão — investigar, não contornar com PAT.

**Não mexer nestes, que parecem bugs e não são:**
- `chromium-authenticated` fora do CI: `conversation.spec.ts` e `messaging.spec.ts` estão
  inteiramente em `test.skip` (sem dados semeados) e o único spec ativo é o do Talk X, que o
  usuário de teste (agente) não enxerga. Habilitar hoje = zero cobertura e `main` vermelha.
- `vars.CRM_SYNC_WORKER_ENABLED` no crm-sync-worker: o schedule está comentado e a condição é
  preparação deliberada para a reativação, não código morto.
- `secret_scanning_non_provider_patterns` desligado: a API aceita o PATCH e ignora — exige GitHub
  Secret Protection (pago). Enquanto estiver off, um vazamento acidental da `DESTINO_URL` (que não
  casa com padrão de provider) não dispara alerta neste repo público.

## graphify
This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.
- For codebase questions: `graphify query "<question>"` when graph.json exists.
- After modifying code: `graphify update .` to keep graph current.

## Frescura do Grafo
```sh
git rev-parse --short HEAD
grep "Built from commit" graphify-out/GRAPH_REPORT.md
```
Se divergirem, rode `graphify update .` localmente (fonte de verdade). O "Graph Sync — Dispatcher"
do N8N (id `67dWSoWEPUGTX5mA`) existe e está ativo, mas a cadência de 15min não se confirma na
prática (execução de 2026-09-15 12:00 falhou; nenhuma outra até 2026-09-17) — não depender dele
como única via de atualização.

## Talk X / Campanhas
Módulo em desenvolvimento ativo. Fase 0 (saneamento, E01–E10) e Fase 1 (design system, E11–E20)
já mergeadas em `main` (Fase 1 via PR #370, branch `feat/catalog-f1-design`). `feat/talkx-f0-remaining`
não existe mais — próximas fases usam branch novo por fase, padrão `feat/talkx-f{N}-*`.
- Plano completo: `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md`
- **NUNCA** imprimir tokens ou secrets no output.
