# CLAUDE.md — ZAPP WEB V2 (ficha técnica do repositório)

> **Só conteúdo técnico e estado real do projeto**: qual banco, qual Evolution API, como o repo é
> escrito, o que o CI faz, o que a Vercel serve e as regras de domínio que o código não deixa óbvio.
> Errar o banco aqui já causou retrabalho real. Confira SEMPRE antes de rodar SQL ou deploy.
> Revisado em 2026-11-01 contra o estado real (GitHub, banco, workflows). Se algo divergir da
> realidade, corrija ESTE arquivo no mesmo PR do fix.
> Como trabalhar (comunicação, PR, merge) fica em [`AGENTS.md`](AGENTS.md) — aqui, não.

---

## 0. Onde se trabalha

Qual banco usar em cada situação:

| Situação | Banco | Como |
|---|---|---|
| Diagnóstico | **produção, só leitura** | `SELECT` pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`; nunca escrita para "testar" |
| Migration nova | arquivo em `supabase/migrations/` | PR → CI (`db-guard.yml` faz o replay em Postgres descartável) → apply (seção 1) |
| Teste de comportamento de banco | **Postgres descartável** | `scripts/db-audit/*.test.sh` no CI; nunca no banco oficial |
| Migration destrutiva, segredos, rotação de chaves | **só com o dono do projeto** | — |

Fatos técnicos que continuam valendo:

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

---

## 1. Banco de dados OFICIAL do projeto

| O que | Valor |
|---|---|
| Projeto Supabase | **`tnnnlkbymytvtqngbbqh`** (Supabase **Cloud**) |
| URL | `https://tnnnlkbymytvtqngbbqh.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh |
| PostgreSQL | 17.6 |
| MCP para SQL | **`SUPABASE - ZAPP WEB V2 - MCP`** (`db_query` via `mcp_exec`, service_role; multi-statement = 1 transação; timeout 120s) |
| Ledger | `supabase_migrations.schema_migrations` — 1.074 registros, maior versão `20261101213000` (medido em 2026-11-01) |

### ⚠️ Bancos que NÃO são deste projeto (não escrever neles)

- **`uqysyzndkfiwfztbqvsl`** — MCP "ZAPP WEB - LOVABLE" antigo. **NÃO é o banco atual.**
- **`vpkmqeumtxhrwgawxdrl`** — MCP "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2" (origem Lovable, `src_query` read-only). Nome quase idêntico ao MCP oficial — conferir sempre qual dos dois foi carregado antes de rodar SQL.
- **Supabase self-hosted da VPS AtomicaBR** — outros sistemas; o ZAPP não roda nele.
- `pgxfvjmuubtbowutlide` (Gestão de Clientes/CRM) e `doufsxqlfjyuvxuezpln` (Catálogo de Produtos) — bancos **externos, somente leitura** consumidos pelo front/edges. Nunca aplicar migration neles a partir deste repo.

### Regras de migration

1. **Como o DDL entra em produção hoje:** depois do merge, por `db_query` do MCP oficial, com o DDL
   e o `INSERT` no ledger na **mesma** chamada (1 transação) e `RETURNING` não-vazio como guarda.
   Gere o SQL exato com `node scripts/db-audit/register-migration.mjs <arquivo.sql>` (dry-run) — nunca
   transcreva à mão. O `.github/workflows/db-migrate.yml` (dry-run + hash SHA-256 + aprovação no
   environment `producao-ddl`) existe, mas **as 3 últimas execuções falharam** (25/10, 31/10 e 01/11) —
   não conte com ele até alguém consertar; se usar, `apply=false` primeiro, depois `apply=true` com o
   `confirm_runtime_sha256` do dry-run, e se outra sessão aplicar DDL no meio, repita o dry-run.
2. **Versão sem colisão:** antes de criar arquivo ou aplicar DDL, no mesmo turno: `SELECT max(version)`
   no ledger, `ls supabase/migrations | tail` e busca de PRs abertas tocando `supabase/migrations/`.
   Para reservar de forma atômica: `SELECT supabase_migrations.reserve_migration_version('<sessao>', '<motivo>')`
   (existe no banco; pega o maior entre ledger e reservas e soma `10000`). `INSERT ... ON CONFLICT DO
   NOTHING` sempre com `RETURNING`/SELECT de conferência — `DO NOTHING` já mascarou colisão.
3. Toda mudança de DDL = arquivo em `supabase/migrations/` + registro no ledger + `supabase/schema-catalog.json`
   atualizado + `scripts/db-audit/known-violations.json` se o guard mudar.
4. Validação de fechamento: `node scripts/db-audit/supabase-usage-guard.mjs` exit 0 (`novas: 0`) +
   paridade arquivos↔registros (count + md5 dos prefixos).
5. `CREATE INDEX CONCURRENTLY` falha (o gateway envolve em transação) — usar `CREATE INDEX` simples
   (tabelas são pequenas). `VACUUM` também não roda pelo MCP (`cannot run inside a transaction block`).
6. **Ordem obrigatória: arquivo → PR → merge em `main` → deploy do código → apply.** Nunca DDL a
   partir de branch aberto. `REVOKE`, `DROP`, rename ou mudança de contrato de função usada pelo
   front/edges: **nunca** antes do deploy do código correspondente — foi o que quebrou o lockout de
   login em produção em 04/09. DDL aplicado fora desse fluxo (já aconteceu em 02/09, 04/09 e 26/09)
   vira drift: o `db-live-guard` acusa, o catálogo/`types.ts`/manifesto ficam errados até o próximo
   `types-sync`, e lacunas de segurança da migration só aparecem se alguém auditar de propósito.
7. Ao registrar no ledger, `statements` é o SQL **real e completo**, um statement por elemento, sem `;`
   final e sem comentários — nunca resumo em prosa. Resumo obriga exceção `pinned-replay` em
   `migration-evidence.json` para sempre. Antes de registrar uma migration "ausente": confira também se
   a **mesma** função/tabela já está registrada sob outra versão (`SELECT version FROM
   supabase_migrations.schema_migrations, LATERAL unnest(statements) s WHERE s LIKE '%nome%'`) — o
   incidente `dashboard_kpi` de 2026-09-25 foi exatamente isso.
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

---

## 2. Evolution GO (WhatsApp) — Hostinger

| O que | Valor |
|---|---|
| Flavor | **Evolution GO** (`evoapicloud/evolution-go`) — `EVOLUTION_API_FLAVOR=go` |
| URL pública | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` (também em `public/version.json`) |
| Hospedagem | VPS **Hostinger** `srv1481814.hstgr.cloud` → Gerenciador Docker, projeto **`evolution-go-rxj2`** |
| Containers | `evolution-go-rxj2-api-1` (porta host **32783** → 4000), `evolution-go-rxj2-postgres-1`, `evolution-go-rxj2-pg-backup-1` |
| Instância padrão | `PRINCIPAL` (`EVOLUTION_INSTANCE_NAME`; é o `instance_id` da conexão real em `whatsapp_connections`) |
| Auth | `EVOLUTION_API_KEY` (global, endpoints admin `/instance/*`) e `EVOLUTION_INSTANCE_TOKEN` (endpoints por instância `/send/*`, `/message/*`) — secrets nas Edge Functions, nunca no front |
| Tradução de rotas | `supabase/functions/_shared/evolution-go-routes.ts` (GO ↔ v2 legada) |
| Gestão da VPS | MCP **`HOSTINGER`** (VPS/Docker). **NÃO** é a VPS AtomicaBR/Portainer — Portainer não enxerga estes containers. |

O Postgres do `evolution-go-rxj2` é interno da Evolution GO (estado de sessões WhatsApp). **Não
confundir com o banco do projeto** e não aplicar migrations do repo nele. A conexão
`[E2E] Conexão WhatsApp Teste` (`instance_id = E2E_FIXTURE`) é fixture do E2E — **não apagar**.

### Runbook: QR Code não aparece / trava no spinner (sessão órfã na GO)

Sintoma: dialog "Escanear QR Code" fica só com o loader; a conexão nunca pareia. Assinatura: o
registro da instância na GO vem com `jid` preenchido, `connected:false` e
`disconnect_reason:"Reconnecting"` — o device foi desvinculado no celular, mas o whatsmeow ainda tem
`Store.ID` e fica em loop; `Connect()` não abre o canal de QR, `/instance/qr` volta vazio e
`logout`/`reconnect` respondem 400/500 (`no active session found`).

Desde 2026-09-27 a edge `evolution-api` (ação `connect`) resolve sozinha, em três camadas:
1. poll do `/instance/qr` (3× / 1,5s), porque o QR na GO é assíncrono;
2. sem QR + não logado + registro com `jid` → **recria a instância na GO** (`DELETE /instance/delete/{id}`
   + `POST /instance/create` com o **mesmo** `EVOLUTION_INSTANCE_TOKEN` e o nome `PRINCIPAL`), reconecta
   e faz novo poll, devolvendo `recovered:true`;
3. se ainda assim não sair QR, devolve `error:true`/409 — o front mostra "Gerar novo código".

`whatsapp_connections` não é tocado nesse fluxo e o token não muda — nenhum secret precisa ser
regerado. Não há passo manual no Postgres da GO (o MCP `HOSTINGER` não expõe docker-exec).

---

## 3. Repo e escrita

- Repo: `adm01-debug/Zapp_Web_V2` (grafia canônica; a API aceita `zapp-web-v2`), branch `main`, público.
  Deploy do front: Vercel; edges: Supabase Cloud.
- **Escrita no GitHub: somente MCP `GITHUB - MCP - FOREVER`** (`github_push_files`). O MCP padrão do
  GitHub retorna 403 em write. `github_push_files` sobrescreve o arquivo — mande o conteúdo integral
  com apenas a mudança semântica, e confira depois que o arquivo remoto bate com o que você testou.
- Sessão na nuvem: `git clone` e leitura por `raw.githubusercontent.com` funcionam (repo público), mas
  `git push` volta 403 do proxy (o repo não está entre as fontes autorizadas da sessão) — escreva só
  pelo MCP. Para listar PRs abertas com os arquivos que tocam numa chamada só, use `github_graphql`
  (`pullRequests(states:OPEN){ nodes { number files { nodes { path } } } }`): `github_list_pull_requests`
  devolve o repositório inteiro em cada nó e estoura o contexto.
- Sessões paralelas commitam no mesmo repo e no mesmo banco: re-sync antes de editar, conferir
  `max(version)` antes de registrar migration.

### Mapa rápido e comandos (medido em 2026-11-01)

| Onde | O que tem |
|---|---|
| `src/` | front Vite + React: `components/`, `hooks/` (por domínio: `team-chat/`, `inbox/`, `crm/`…), `pages/`, `services/`, `integrations/supabase/` (`client.ts`, `types.ts` gerado) |
| `supabase/functions/` | 86 edge functions + `_shared/` (CORS em `cors-origins.ts`, rotas da Evolution GO em `evolution-go-routes.ts`) |
| `supabase/migrations/` | 1.073 arquivos `.sql` (+ `_foreign/` e `_superseded/`, arquivo morto) |
| `supabase/schema-manifest.json` · `schema-catalog.json` | snapshot da estrutura real da produção — o esperado dos testes de contrato vem daqui |
| `scripts/db-audit/` | testes de banco em Postgres descartável (`*.test.sh`), `register-migration.mjs`, `supabase-usage-guard.mjs`, `replay-local.sh` |
| `scripts/ci/` | guardas do CI (`fila-merge.mjs`, `render-workflow-docs.mjs`, `check-claude-md-integrity.mjs`, baselines) |
| `e2e/` | 51 specs Playwright; fixtures em `e2e/fixtures/` |
| `docs/` | `DEPLOYMENT.md`, `MIGRATIONS.md`, `INCIDENT-RUNBOOK.md`, `CONEXOES_WHATSAPP_RUNBOOK.md`, `ci/README.md` (gerado), `talkx/`, `audits/` |
| `analise/`, `analise-prs/`, `auditoria-supabase/`, `inventario/`, `qa/` | relatórios de sessões anteriores — leitura de contexto, não fonte de verdade |

Comandos (o repo usa **bun**: há `bun.lock` e **não** há `package-lock.json`, então `npm ci` falha —
use `bun install --frozen-lockfile`):

- testes unitários só do que você tocou: `npx vitest run <caminho>` (a suíte inteira é longa; só o
  Team Chat leva ~90s com 51 arquivos);
- typecheck: `bun run typecheck` (`tsc -b --force`, lento) ou `npx tsc --noEmit -p tsconfig.app.json`
  para conferir rápido;
- lint dos arquivos tocados: `npx eslint <arquivos>`; E2E: `bun run test:e2e` (Playwright, 1 worker no CI);
- guardas que o CI roda e você pode rodar antes do PR: `node scripts/ci/check-claude-md-integrity.mjs`
  (se mexer neste arquivo), `node --test scripts/ci/*.unit.mjs` (docs e baselines do CI),
  `node scripts/db-audit/supabase-usage-guard.mjs` (se mexer em `.from()`/`.rpc()` ou migration).

Arquivos com contrato verificado por teste — ao mexer, rode o teste junto:
`src/hooks/team-chat/README.md` (`__tests__/contratosModulo.test.ts`), este `CLAUDE.md`
(`check-claude-md-integrity.mjs` exige as seções 0–3 e barra encolher mais de 30% de uma vez;
`ci-docs-baseline.unit.mjs` e `docs-deploy-coerencia.unit.mjs` conferem contagem de workflows, `strict`
e a seção de deploy), `docs/ci/README.md` (gerado — não edite à mão).

---

## 4. GitHub — perímetro e CI

### Perímetro do GitHub — estado canônico (medido em 2026-11-01)

**Regra:** qualquer mudança nos campos abaixo atualiza **esta tabela** e
`scripts/ci/github-settings-baseline.json` **no mesmo PR** — o `settings-guard` compara a realidade com
o baseline e divergência é regressão.

| Campo | Estado canônico | Verificado por |
|---|---|---|
| Branch protection — required checks | **3**: `✅ CI Gate (required check)` · `🏗️ Build` · `🔎 TypeCheck` | `settings-guard` ⚠ |
| Branch protection — `strict` | **`true`** (política vigente; a opção `false` foi **revogada** em 02/10 — E15(b)) | `settings-guard` ⚠ |
| Branch protection — `enforce_admins` | `true` | `settings-guard` ⚠ |
| Branch protection — histórico linear | `true` | `settings-guard` ⚠ |
| Branch protection — review obrigatório | nenhum (deliberado: vários agentes com auto-merge) | — |
| Merge | `allow_squash_merge=true` · `allow_merge_commit=false` · `allow_rebase_merge=false` · `allow_auto_merge=true` · `delete_branch_on_merge=true` | `settings-guard` |
| Squash | `squash_merge_commit_message=PR_BODY` · `squash_merge_commit_title=PR_TITLE` | `settings-guard` |
| Environments | **9**: `banco-leitura` · `copilot` · `db-ledger-evidence` · `legacy-import-destrutivo` · `perimetro-leitura` · `Preview` · `producao-ddl` · `producao-edge-functions` · `Production` | `settings-guard` |
| Environments com revisor obrigatório | `producao-ddl` · `db-ledger-evidence` · `legacy-import-destrutivo` (revisor: `adm01-debug`); `producao-edge-functions` só restringe a branch | API, 2026-11-01 |
| Actions — `allowed_actions` | `selected` | `settings-guard` |
| Actions — `sha_pinning_required` | `true` | `check-workflow-pins` |
| GitHub Apps | **não auditado** — o token da sessão não lista instalações | — |

⚠ Os campos de branch protection são lidos com o `GITHUB_TOKEN` de workflow, que **não** tem o escopo
`administration`: a API responde **403** e o guard marca o campo como **"NÃO VERIFICÁVEL"** — não como
regressão. **403 administrativo é limite de evidência**, nunca confirmação de configuração errada.

Fatos do perímetro que já custaram retrabalho:

- **`✅ CI Gate`** existe porque, com `build` dependendo de `typecheck` e `unit-tests`, um teste
  vermelho fazia o `Build` ficar `skipped` e o merge passava. O gate (`ci.yml`, job `ci-gate`,
  `if: always()`) falha se qualquer job crítico falhar. E2E e mutação do mapa **não** estão no gate.
- **Sintoma de `strict=true`:** merge retorna 405 "N of N required status checks are expected" com CI
  verde — a PR ficou `BEHIND`. Atualize a branch; não mexa no `strict`. Antes de qualquer
  `github_update_branch_protection`, leia o estado com `github_get_branch_protection` (PUT completo sem
  mandar todos os campos já regrediu o `strict` três vezes; para um campo só, use
  `github_update_required_status_checks`).
- **Fila de merge nativa é impossível aqui** — `adm01-debug` é conta `User`; `merge_queue` responde
  `422 Invalid rule`. Os gatilhos `merge_group` em `ci.yml`, `db-guard.yml` e `codeql.yml` ficam lá,
  inertes. O substituto é o `auto-update-pr-branch.yml` (fila serial: atualiza uma PR com auto-merge
  por vez, via `scripts/ci/fila-merge.mjs`).
- **NÃO desligue `can_approve_pull_request_reviews`.** O toggle é "Allow GitHub Actions to create
  **and** approve pull requests": desligado, o `types-sync` não consegue abrir PR.
- **`TYPES_SYNC_PR_TOKEN` não é necessário — não crie.** O PR do `types-sync` nasce com `GITHUB_TOKEN`
  e o próprio workflow aprova os runs em `action_required`.
- **App "Supabase for GitHub": desligado** (branching automático e deploy). Ele apontava para o banco
  oficial e gerava custo por PR. Se um dia reativar preview, use um projeto Supabase separado.
- `secret_scanning_non_provider_patterns` não liga (exige plano pago): vazamento de `DESTINO_URL` não
  dispara alerta neste repo público.

### Workflows

**Inventário vigente (2026-11-01):** **17** arquivos em `.github/workflows/` — `auto-update-pr-branch`,
`branch-hygiene-audit`, `ci`, `codeql`, `crm-sync-worker`, `db-guard`, `db-live-guard`, `db-migrate`,
`deploy-functions`, `e2e-logado`, `e2e-talkx`, `notifica-falha-main`, `settings-guard`,
`talkx-status-regen`, `targeted-ledger-evidence`, `types-sync`, `vercel-env-cleanup` — mais os
dinâmicos do GitHub (Dependabot, Dependency Graph, Copilot). A fonte canônica do inventário é o
**gerado** `docs/ci/README.md` (`scripts/ci/render-workflow-docs.mjs --check` roda no CI); esta lista
é conveniência.

- **Agendamentos (UTC):** types-sync `49 5 * * 1` · db-live-guard `13 6 * * 1` · settings-guard
  `15 7 * * *` · talkx-status-regen `45 7 * * 1` · branch-hygiene `56 7 * * 1` · codeql `30 9 * * *` ·
  auto-update-pr-branch `7,37 * * * *`.
- **`db-live-guard` não roda em PR, por design** (não expõe `DESTINO_URL` a código de PR): roda no
  push da `main`, agendado e por dispatch, e abre/comenta uma issue única com label `db-live-guard`.
  Por isso o "Contrato DB vivo" nunca é required check. O retry de conexão mora **só** no transporte
  (`withPsqlEnvironment`, `PSQL_CONNECT_RETRIES`); o job passa `LEDGER_RETRY_DELAYS_MS: ""` para não
  empilhar um segundo retry dentro de `queryLedger()`.
- **CodeQL** analisa também os próprios workflows (job `analyze-actions`, check
  `🔬 CodeQL (actions)`); não é required check.
- **`crm-sync-worker`**: schedule comentado e condição `vars.CRM_SYNC_WORKER_ENABLED` são preparação
  deliberada para reativação, não código morto.
- **`db-guard.yml` usa um Postgres compartilhado** (`services:` + `scripts/db-audit/docker-shim`
  instalado como `docker`). Passo que usa `docker logs` para readiness ou depende de PostgREST precisa
  de `SKIP_DOCKER_SHIM: "1"` no `env:` do step — confira os passos vizinhos no próprio arquivo, a
  lista muda com frequência.
- **Issues de alerta com mais de 20 comentários de bot** (`types-sync`, `db-live-guard`): feche com
  comentário-resumo e abra uma nova com o mesmo título e link para a anterior.

---

## 5. Vercel — ZAPP Web V2

| O que | Valor |
|---|---|
| Projeto | `zapp_web_v2` (ID: `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`) |
| Team | `juca1` / `team_QyN41X0q8hrqhW80AwokbFLv` |
| Alias de projeto | `https://zapp-web-v2.vercel.app` (é o `FALLBACK_ORIGIN` em `supabase/functions/_shared/cors-origins.ts`) |
| Domínio próprio | `zappweb.app.br` / `www.zappweb.app.br` estão na lista de CORS das edges. **NÃO VERIFICADO** qual projeto da Vercel serve o domínio hoje (o MCP da sessão de 01/11 recebeu 403/404 na Vercel; o repo `Zapp_Web_V3` também declara `www.zappweb.app.br`) |
| Preview URL pattern | `https://zappwebv2-{hash}-juca1.vercel.app` |
| Região | `iad1` |
| Framework / build / output | Vite + React · `bun run build` · `dist/` · Node 24.x |
| Ignorar build | `sh scripts/vercel/ignore-build.sh` |
| MCP Vercel | ferramentas `mcp__Vercel__*` — escrita = ação de produção |

### Deploy e edge functions

- **Front (Vercel):** deploy automático na `main` — merge em `main` = deploy em produção.
- **Edge functions:** deploy automático quando o push na `main` altera código implantável em
  `supabase/functions/` ou `supabase/config.toml` (exceto `*.test.ts`, `.md` e `fixtures/`), pelo
  `deploy-functions.yml`. O environment `producao-edge-functions` restringe a branch e não exige revisor.
  `workflow_dispatch` é para rollback (`source_ref`), função única, dry-run e rotação de secrets.
  Confirme o run após o merge; não execute `supabase functions deploy` direto em produção.

**Retificação de 2026-10-07 — Edge Functions:** o registro histórico de deploy manual de edges foi
superado pela regra acima (deploy automático no push da `main`).

### Regras de env vars no Vercel

- **Nunca** colocar chaves de servidor (OPENAI, ANTHROPIC, GROQ, EVOLUTION) — não há serverless neste projeto.
- **Nunca** colocar `POSTGRES_*`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_JWT_SECRET` — são do back-end.
- `VITE_ZAPP_LOCAL_SUPABASE_*` são **apenas para dev local**, não devem existir no Vercel.
- Vars `VITE_*` vão para o bundle e são públicas — nunca segredo com prefixo `VITE_`.
- Baseline de vars esperadas: `scripts/ci/vercel-env-baseline.json`; snapshot "antes":
  `docs/audits/vercel-snapshot-2026-10-18-antes.json`.

### Pendências de Vercel (dependem de ação no dashboard)

1. Redirect: apex canônico, `www` → apex.
2. Remover 17 vars de integração morta + 5 chaves de servidor + `VITE_*` não lidas.
3. Pausar e apagar o projeto legado `zapp-web` (`prj_OsErjUqsrMbwwC7S1LVfawmNgEce`), que **ainda
   existe** (listado em 2026-11-01). Não é o projeto atual.
4. Trocar `FALLBACK_ORIGIN` para o domínio próprio 7 dias depois do DNS estabilizar.

---

## 6. Regras de domínio que o código não deixa óbvio

### Talk X / Campanhas
- Fixtures de E2E em produção — **não apagar:** conexão `e2e0e2e0-0000-4000-a000-e2e000000001`
  (status `connected`), segmento `621521f3-e9c9-49c2-834e-cea07545d476`, contato
  `04dff4dc-c6b1-4283-ac22-bd8639804759` ("[E2E] Contato de teste - nao apagar"). Sem eles,
  `talkx.spec.ts`, `conversation.spec.ts` e `messaging.spec.ts` falham.

### Contatos — critério de contato visível (decisão D4)
- **Contato visível** = `deleted_at IS NULL` + `is_lid_legacy = false` + `phone ~ '^[0-9]{10,15}$'`.
- `search_contacts(..., include_legacy boolean DEFAULT false)` e `contacts_count_by_type(include_legacy boolean DEFAULT false)`
  aplicam o critério quando `include_legacy` é falso (migration `20260930450000`). O front só envia
  `include_legacy: true` com o toggle "Mostrar legados" ligado (`localStorage` `contact-show-legacy`);
  `useContactsKpi(includeLegacy)` repete o filtro para KPI Total == aba "Todos".
- Mudar o critério = mudar os três juntos: migration + `CONTACT_VISIBLE_PHONE_PATTERN` em
  `src/hooks/crm/contactsAggregates.ts` + `scripts/db-audit/contacts-legacy-visibility.test.sh`.

### Convites de departamento (Team Chat)
- O convite vive em `department_invitations` — a tabela que o aceite (`accept_department_invite`) lê.
  `department_invites` é legada. Decisão de produto (2026-11-01): **somente admin** cria e apaga
  convites. Detalhes em `src/hooks/team-chat/README.md`.

### UI
- Painel escuro do inbox: use o token `--inbox-panel-bg` (classe `bg-inbox-panel`, definida por tema
  em `src/styles/tokens.css`), nunca `bg-black` literal — `bg-black` fixo já deixou texto preto sobre
  fundo preto no light/alto-contraste (#755 → #774).
- Renomear rótulo ≠ renomear id: ids internos de aba (`orders`, `history`) ficam; quem renomear id
  precisa de `TAB_REDIRECTS` em `useInboxUIState.ts` (precedente `reminders → tasks`). Estatísticas de
  contato não têm série histórica — não reintroduzir % de variação sem query real.

---

## graphify (grafo de código, opcional)

O projeto tem um grafo de conhecimento do código em `graphify-out/` quando ele foi gerado na máquina
(`bun run graph:setup` → `scripts/graphify/setup.sh`; precisa de `uv` ou `pipx`). `graphify-out/`
(~50 MB) e os hooks do husky ficam no `.gitignore`: cada clone gera os seus.

- Quando `graphify-out/graph.json` existir: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`
  e `graphify explain "<conceito>"` antes de buscar por texto. `graphify-out/GRAPH_REPORT.md` só para
  revisão ampla.
- Frescura: compare `git rev-parse --short HEAD` com a linha "Built from commit" do
  `GRAPH_REPORT.md`; se divergir, `graphify update .` (só AST, sem custo de API).
- Os hooks em `.claude/settings.json` chamam `graphify hook-guard` e não fazem nada onde o graphify
  não estiver instalado. Em sessão de nuvem sem graphify, siga sem ele.
