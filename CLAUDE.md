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
  Complemento E43 verificado em 2026-09-17: force-push e delеção da `main` bloqueados, strict
  mode ligado.

  **Correção de 2026-09-25:** a linha original afirmava "review obrigatório". A API não retorna
  `required_pull_request_reviews` para a `main` e `list_rulesets` volta vazio — **não há** revisão
  obrigatória, e o `.github/CODEOWNERS` é decorativo sem a regra ligada. Isso é deliberado: com
  vários agentes abrindo PR e usando auto-merge, exigir aprovação humana pararia o fluxo inteiro.
  `required_conversation_resolution` segue desligado pelo mesmo motivo (bots de review deixam
  threads abertas). O perímetro real da `main` hoje é: `enforce_admins`, sem force-push, sem
  deleção, e os 7 required checks da seção abaixo.

  **Correção de 2026-09-25 (auditoria de 5 agentes, achado do agente de cruzamento de PRs):**
  `required_status_checks.strict` está **`false`** ao vivo (confirmado via
  `github_get_branch_protection` em `main`), não `true` como as linhas acima e a seção "Fila de
  merge" abaixo afirmavam. Não determinado quando/por quem foi desligado — possivelmente mitigação
  manual do próprio ciclo de `BEHIND` descrito na seção "Fila de merge". Com `strict=false`, uma PR
  não é automaticamente marcada `BEHIND` só por `main` ter avançado; o `auto-update-pr-branch.yml`
  ainda existe e roda, mas o gatilho que o tornava necessário (toda PR reprovada por estar atrás)
  não se aplica mais do jeito descrito abaixo. Confirmar o estado ao vivo antes de assumir qualquer
  um dos dois lados.

## Auditoria de workflows (2026-09-25) — estado dos guardas

Auditoria dos 12 workflows, da branch protection, dos secrets e dos environments. O que passou a
valer (confira antes de propor mudança de CI, para não refazer o que já existe):

**Required checks da `main`** (7; `strict` está `false` ao vivo — ver correção em 25/09 acima): `🔍 Lint & TypeCheck`, `🧪 Unit Tests`,
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

**Retry de conexão mora em UM lugar só: o transporte.** O PR #704 (sessão paralela) adicionou um
segundo retry dentro de `queryLedger()` em `check-migration-drift.mjs`, no mesmo dia em que o #707
adicionou o do transporte. Como `queryLedger()` chama `withPsqlEnvironment`, os dois empilhados
viram produto, não soma: 3 × 3 = 9 execuções de psql e ~47s de espera acumulada. Por isso o job do
`db-live-guard` passa `LEDGER_RETRY_DELAYS_MS: ""`, que desliga a camada de dentro — a de fora
cobre todos os passos (ledger, catálogo, manifesto, paridade tripla, runtime config), não só o
ledger. As duas regex ficam em sincronia deliberada: ao mexer numa, replique na outra. Cuidado ao
mexer no parsing de `LEDGER_RETRY_DELAYS_MS`: `Number("")` é `0`, não `NaN`, então entradas vazias
precisam ser descartadas **antes** do `Number()`, senão "vazio" vira um retry imediato em vez de
nenhum.

**Agendamentos sem colisão:** types-sync `49 5 * * 1`, db-live-guard `13 6 * * 1` (nesta ordem, o
segundo compara o que o primeiro gera), branch-hygiene `56 7 * * 1`, codeql `30 9 * * 1`. Os dois
primeiros rodavam ambos às 06:00 e disputavam o banco no mesmo minuto.

**Repo:** `sha_pinning_required` ligado no GitHub (além do `check-workflow-pins.mjs`).

**Fila de merge (merge queue) é IMPOSSÍVEL neste repo — não tente de novo.** Em 25/09, com `strict`
ligado (hoje está `false` ao vivo — ver correção acima, seção "Branch protection sem `Contrato DB
vivo`"), e várias sessões mergeando, toda PR que não entra primeiro volta para `BEHIND`, o
`auto-update-pr-branch` recria o head e o CI (~6 min) recomeça; em 25/09 três PRs verdes ficaram
~40 min nesse ciclo. A fila do GitHub resolveria isso, e os gatilhos `merge_group` já foram
adicionados a `ci.yml`, `db-guard.yml` e `codeql.yml` (PR #712) — eles ficam lá, inertes e sem
custo, porque a fila em si **não pode ser ligada**: `POST /repos/.../rulesets` com
`{"type":"merge_queue"}` responde `422 Invalid rule 'merge_queue'` mesmo no payload mínimo.
Rulesets funcionam (um ruleset de teste com `deletion` foi criado e apagado com sucesso no mesmo
minuto); o que falta é a conta: `adm01-debug` é do tipo `User`, e merge queue é recurso exclusivo
de repositório de **organização**, independente do plano (a conta é `pro`). Só passa a existir se o
repo for transferido para uma org — decisão de negócio, não de CI.

**App "Supabase for GitHub" — DESLIGADO em 25/09, confirmado por teste real.** Apontava para o
banco oficial (`supabase/config.toml`: `project_id = "tnnnlkbymytvtqngbbqh"`) com "Automatic
branching" ligado e sem cobertura do Spend Cap (custo por PR que tocasse `supabase/`). Joaquim
desligou "Automatic branching" e "Deploy to production" no dashboard do Supabase
(Settings → Integrations → GitHub). **Confirmado pela API, não só pela tela**: o PR #703 (antes do
desligamento) tinha o check `Supabase Preview` vermelho; o PR #717 (mesma branch de origem, depois
do desligamento) **não tem esse check** — o app parou de reagir a PRs. Se precisar reativar o
preview um dia, aponte para um projeto Supabase separado, nunca para `tnnnlkbymytvtqngbbqh`.

Achado durante o fechamento deste item, e um erro meu no meio do caminho — registrado por
transparência, não escondido: `20260925170000` (reminders_pending) estava aplicada em produção com
a linha do ledger existindo mas `statements` NULL — corrigida com `UPDATE ... WHERE statements IS
NULL`, guardada por `RETURNING` não-vazio. Já `20260925133000` (dashboard_kpi) eu registrei por
engano: vi que a version não existia no ledger e inseri o conteúdo do arquivo, sem checar se a MESMA
função já estava registrada sob OUTRA version. Estava — `20260925132706`, reconciliada por outra
sessão momentos antes (PR #719) com conteúdo idêntico, e o PR #727 (mergeado durante esta mesma
sessão) já tinha apagado o arquivo `133000` do disco por ser duplicata. Meu INSERT recriou o
problema do lado do banco. Corrigido com `DELETE ... WHERE version = '20260925133000' AND
array_length(statements,1) = 3` (o formato exato do que eu tinha inserido), guardado por
`RETURNING` não-vazio — nada mais foi tocado. **Lição para quem for registrar uma migration
"ausente" no ledger: não basta checar se a VERSION existe — checar também se a MESMA função/tabela
já está registrada sob version diferente** (`SELECT version FROM supabase_migrations.schema_migrations,
LATERAL unnest(statements) s WHERE s LIKE '%nome_da_funcao%'` antes de inserir).

Os 7 versions com `statements` NULL encontrados na auditoria (`20260827140000`, `20260827150000`,
`20260901000002`, `20260901200001`, `20260906000001`, `20260925153000`, `20260925153100`) foram
corrigidos em sessão posterior de 25/09: cada arquivo já existia em `supabase/migrations/`, o
conteúdo aplicado em produção foi confirmado ao vivo (`pg_get_functiondef`, `pg_indexes`, grants,
existência de fila/coluna) antes de qualquer escrita, nenhum tocava função/tabela já registrada sob
outra version, e o `UPDATE ... WHERE statements IS NULL RETURNING` confirmou as 7 linhas gravadas
(`SELECT count(*) FILTER (WHERE statements IS NULL)` = 0 no ledger, 477 registros no total). Quem
encontrar `statements IS NULL` de novo: `SELECT version FROM supabase_migrations.schema_migrations
WHERE statements IS NULL` primeiro, confirmar o estado ao vivo do objeto antes de registrar, e
`scripts/db-audit/register-migration.mjs` (via `parseMigrationFile`/`buildInsertSql`) para gerar o
SQL exato do arquivo em vez de transcrever à mão.

**Sessões paralelas colidem de verdade — a regra 3 do fluxo Git existe por isso e não está sendo
seguida.** Em 25/09, em poucas horas: (a) duas sessões corrigiram o MESMO timeout de pooler em
camadas diferentes (#704 em `queryLedger()`, #707 em `withPsqlEnvironment`), as duas mergearam e as
tentativas viraram produto (3 × 3 = 9 execuções de psql) até o #716 consolidar; (b) o PR #703, de
sincronização de types, foi **fechado sem merge** por outra sessão enquanto esta o mergeava — o
conteúdo não entrou na `main`, o `types.ts` continuou sem `dashboard_hourly_volume` e o PR #700
seguiu travado até o types-sync ser redisparado e abrir o #717. Antes de abrir PR: liste as PRs
abertas e confira sobreposição de arquivos, como a regra 3 já manda. E **nunca feche PR de outra
sessão** sem antes confirmar que o conteúdo dela chegou na `main` — fechar não é neutro, é desfazer
trabalho alheio silenciosamente.

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
- `talkx.spec.ts` fora do CI: é o único spec do `chromium-authenticated` que continua de fora —
  o usuário de teste (agente) não enxerga "Campanhas". Habilitar hoje = zero cobertura e `main`
  vermelha. **Correção de 2026-09-26:** `conversation.spec.ts`/`messaging.spec.ts` NÃO estão mais
  nesta lista — havia um contato fixo já seedado em produção desde 24/09
  (`04dff4dc-c6b1-4283-ac22-bd8639804759`, "[E2E] Contato de teste - nao apagar", atribuído ao
  usuário de teste) que ninguém tinha ligado ao código; os dois specs tinham `test.skip` e
  seletores que nunca bateram com a UI real (`data-testid="message-input"`/`"message-bubble"`
  não existem no código; o fluxo de "resolver" real é `ChatPanelHeader` → "Mais ações" → "Marcar
  como resolvido" → `CloseConversationDialog`, não um botão simples). Reescritos e habilitados no
  `e2e-logado.yml` (ver `e2e/README.md` e `e2e/fixtures/e2e-contact.ts`).
- `vars.CRM_SYNC_WORKER_ENABLED` no crm-sync-worker: o schedule está comentado e a condição é
  preparação deliberada para a reativação, não código morto.
- `secret_scanning_non_provider_patterns` desligado: a API aceita o PATCH e ignora — exige GitHub
  Secret Protection (pago). Enquanto estiver off, um vazamento acidental da `DESTINO_URL` (que não
  casa com padrão de provider) não dispara alerta neste repo público.

## Incidente de 2026-09-26 — DDL do E40 direto no banco, sem PR (issue #724)

Às 11:38 outra sessão aplicou a mudança do E40 (decisão de Joaquim: `scheduled_report_configs`
vira owner-only) direto em produção via MCP, sem passar pelo fluxo arquivo→PR→merge da seção 3 —
nenhum arquivo em `supabase/migrations/`. Isso é exatamente o padrão dos drifts de setembro que a
seção 1/regra 6 já documenta, e voltou a acontecer apesar do aviso. `db-live-guard` pegou (version
`20260926113806` "DDL fora do Git"), reconciliado na PR #824 com o SQL exato lido do ledger — sem
aplicar nada novo, só documentando o que já estava em produção.

**Efeito cascata que isso disparou** (nenhum sozinho seria óbvio, juntos formam uma cadeia de 4 PRs
numa hora): (1) reconciliar o arquivo do E40 (#824) não bastou — o `types-sync` automático (#823)
ainda precisava rodar e mergear para o catálogo/`types.ts`/manifesto pegarem as novas policies,
porque o DDL aplicado fora do fluxo nunca passou pelo passo que regenera esses artefatos; (2) uma
auditoria de segurança (5 agentes, a pedido do Joaquim) sobre a migration reconciliada achou que a
policy de INSERT só validava `is_admin_or_supervisor()`, sem restringir `created_by` — um
supervisor podia plantar um registro "possuído" por outra pessoa (corrigido em #833); (3) o
`db-live-guard` disparado após o merge de #833 falhou de novo, mas por causa **não relacionada**:
3 exceções `pinned-replay` antigas (`20260904320000`, `20260904370000`, `20260909130000`) ficaram
obsoletas porque uma sessão paralela corrigiu essas linhas do ledger (que só tinham resumo em
prosa) para conter o SQL completo — coincidência de timing com sessões mergeando em paralelo,
removidas em #842.

**Lição:** um DDL fora do fluxo nunca é "só aquele objeto" — quebra o catálogo até o próximo
`types-sync`, e qualquer lacuna de segurança na migration reconciliada só aparece se alguém
auditar de propósito (a auditoria de 5 agentes achou o INSERT; um reconciliamento só de "faz o
guard passar" não teria achado). Se você é a sessão que vai aplicar DDL: pare, abra o arquivo,
espere o PR mergear — a regra 6 da seção 1 existe por isto, escrita depois dos drifts de
02/09 e 04/09, e ainda assim isso se repetiu em 26/09.

## Lição de UI (2026-09-25) — fundo de painel preto sem escopo de tema

PRs #755 → #771 → #774: pedido de fundo preto nos painéis do inbox (sidebar de conversas,
detalhes do contato, barra de chat) foi implementado com `bg-black` **fixo**, sem variante
`dark:`. Quebrou o light mode: contraste do texto principal caiu para 1.24:1 (mínimo WCAG AA é
4.5:1) e o modo alto-contraste claro chegou a 1:1 (texto preto sobre fundo preto, invisível).
Corrigido em #771 (`dark:bg-black`) e consolidado em #774 no token `--inbox-panel-bg` (definido
por tema em `src/styles/tokens.css`, classe Tailwind `bg-inbox-panel`) — usa-lo em vez de
`bg-black`/`dark:bg-black` literal sempre que escurecer um painel novo do inbox, para não repetir
o bug. Referência: `docs/audits/` não tem entrada dedicada; a auditoria completa (5 agentes,
cálculo de contraste WCAG) ficou só na sessão que corrigiu.

## Decisões de 2026-09-26 — como DDL entra em produção, e por que merge ≠ deploy

**DDL em produção vai por MCP (`db_query`) + registro no ledger no mesmo turno, não pelo
`db-migrate.yml`.** O workflow existe, funciona e é mais seguro no papel (dry-run + hash), mas
pausa em `Waiting` no environment `producao-ddl` até alguém aprovar na aba Actions. Com várias
sessões trabalhando e o Joaquim fora do teclado, o DDL fica parado e o arquivo já mergeado passa a
ser drift — exatamente o que o guarda vivo acusa. Regra prática, nesta ordem:

1. arquivo em `supabase/migrations/` → PR → merge em `main` (regra 6 da seção 1 continua valendo);
2. `node scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar o SQL exato (nunca
   transcrever à mão — é isso que garante a regra 7 do `statements`);
3. o DDL e o `INSERT` no ledger na **mesma** chamada de `db_query` (1 transação), com
   `RETURNING` não-vazio como guarda;
4. fechar com `supabase-usage-guard.mjs` (`novas: 0`) e paridade arquivos↔ledger.

Aplicado assim hoje: `20260926120600` (`DROP INDEX idx_talkx_template_versions_template_version`,
índice duplicado da unique `(template_id, version_number)`; 0 linhas e 0 `idx_scan` na tabela
antes do drop). O arquivo estava em `main` desde a manhã sem nunca ter sido aplicado.

**Merge em `main` NÃO deploya edge function.** O front é Vercel e sobe sozinho; as edge functions
sobem **só** por `workflow_dispatch` do `deploy-functions.yml` (é deliberado — ver cabeçalho do
workflow), e o job ainda pausa em `Waiting` no environment `producao-edge-functions`. Ou seja:
uma correção de edge function mergeada continua **fora do ar** até alguém disparar o workflow E
aprovar. Quem mergear fix de edge function e disser "está em produção" sem esse par de passos está
reportando errado — aconteceu nesta sessão com o fix do `trash-thread` do Gmail (PR #840).

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
