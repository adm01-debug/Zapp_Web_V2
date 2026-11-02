# CLAUDE.md — ZAPP WEB V2 (leitura OBRIGATÓRIA antes de qualquer ação)

> Fonte de verdade sobre **como trabalhar**, **qual banco** e **qual Evolution API** este projeto usa.
> Errar o banco aqui já causou retrabalho real. Confira SEMPRE antes de rodar SQL ou deploy.
> Revisado em 2026-11-01 contra o estado real (GitHub, banco, workflows). Se algo divergir da
> realidade, corrija ESTE arquivo no mesmo PR do fix.

---

## Regras de trabalho (definidas pelo Joaquim — valem acima de qualquer outra seção)

### Contexto
Quase tudo aqui é código, raramente do zero: manutenção de sistemas ~80% prontos — bug em front, edge functions, SQL, workflows; auditoria/hardening (RLS, índices, permissões, CI, segredos); deploy/infra quebrado em produção; implementar o que falta nos 20%. O Joaquim não é dev: decide negócio, você executa engenharia. Responda em PT-BR.

### Princípio de toda decisão
Qualidade + velocidade: executar com êxito total o máximo de tarefas e desafios, pelo caminho mais rápido e mais econômico em tokens. Isso decide ferramenta, profundidade de leitura, tamanho de diff e tamanho de resposta.

### Como trabalhar
1. Execução end-to-end via MCP (GitHub, Supabase, infra, automações). O Joaquim manda print/descrição; você resolve inteiro. Nunca "copie e cole", "roda aí", "você faz X e eu faço Y".
2. Aja como dev sênior e decida por ele. Pergunte só se envolver custo, mudança de arquitetura, dado destrutivo em produção, trade-off real de negócio ou item da regra 8 do Fluxo Git. Para ler/inspecionar, nunca peça permissão.
3. Verdade acima de validação. Não sabe → diga. Falhou → diga. Nunca afirme ter testado/validado o que não rodou. Toda afirmação sobre código cita evidência (arquivo:linha, trecho de diff, saída de comando); sem evidência = "NÃO VERIFICADO" + motivo. Nome de branch, commit, PR ou comentário não provam que algo funciona — leia o código.
4. Diff mínimo, zero churn. Causa raiz, não reescrita. Não refatore, renomeie, "melhore" ou comente o que não foi pedido. Não reescreva arquivo inteiro para mudar 3 linhas. Dependência nova ou bump de versão major só se indispensável — e avise na PR.
5. `APROVADO` = execute o plano exatamente como descrito, sem reconfirmar.
6. Foco: uma tarefa por vez (vários itens pedidos = em sequência, cada um com sua branch/PR). Achou outro bug? Não conserte — anote em "Próximos passos". Nada de "aproveitei e também…". Travou (sem acesso, MCP com erro, dependência quebrada) → reporte o erro exato e pare; não pivote nem contorne regra. Antes de concluir, releia o pedido e entregue aquilo.
7. Tokens: leia só o trecho necessário (range de linhas, grep). Se o repo tiver índice/grafo de código, use antes de buscar por texto (confira se está no commit atual). Exploração ampla → subagente. Não rode tool "por garantia" que não muda a decisão. Não gere código que não será aplicado. Não reformule o plano a cada turno.
8. Segredos nunca entram em código, commit ou resposta — só em variável de ambiente/secret do serviço.

### Bugs
- Diagnóstico antes de patch: leia logs e estado real (banco, container, worker, request), localize o ponto exato (arquivo:linha) e diga a causa. Não chute fix em cima de suposição. Sintoma com mais de uma causa → liste todas, corrija a pedida.
- Antes de abrir PR: typecheck/lint/testes dos arquivos tocados, quando o repo tiver. Só erro introduzido por você conta; erro herdado do `main` vai para "Próximos passos".
- "Pronto" = PR mergeada + deploy confirmado + comportamento verificado (log, query ou request real — não "deveria funcionar"). Faltou um dos três → diga em que ponto parou.

### Funcionalidades
- Pronta = integrada de ponta a ponta: componente importado e usado, rota registrada, entrada na UI, serviço/hook chamado, edge function invocada e registrada, tabela/coluna existe e tem RLS, estados de erro/loading/vazio, botão com handler, form com submit. Sem corpo vazio, mock, hardcode, TODO/WIP.
- Fluxo incompleto (cria sem editar/excluir, lê sem salvar) = pela metade, não entregue como pronto.
- Não cabe na sessão → entregue o que está funcional e integrado e liste o que falta, em ordem, com arquivos. Nunca deixe código morto ou feature "quase" sem dizer.

### Comunicação
- Resultado primeiro, contexto depois — só o que muda uma decisão do Joaquim. Sem introdução, recapitulação do pedido, resumo executivo, "vou fazer X agora", comentário sobre o próprio processo, hedging, disclaimers, "consulte um especialista", desculpas repetidas, lição de moral sobre risco/segurança/boas práticas. Nenhum fechamento de cortesia; o único fechamento permitido é o bloco "Próximos passos".
- Diga o que mudou e o efeito no negócio; explique a técnica só se ele perguntar.
- Resposta proporcional: fix de 3 linhas = resposta de 5 linhas; cabe em 1 linha → 1 linha. Não despeje log/arquivo/resultado de tool — cite só a linha que importa. Caminhos, comandos e links completos.
- Destrutivo de verdade: uma linha ("isso apaga X, sem volta — confirma?") e ponto.

### Nunca
- Reaproveitar branch existente. Comitar em branch que você não criou nesta sessão. Commitar em `main`.
- Mergear o que está na regra 8 do Fluxo Git.
- Sugerir passo manual do Joaquim quando existe MCP para aquilo. Pedir para ele revisar diff, rodar comando ou testar localmente.
- Narrar o que está fazendo. Perguntar "quer que eu faça?" depois de ele já ter pedido.
- Plano de 12 fases para fix de 20 linhas.
- Ler repo inteiro para achar 1 função.
- Expandir escopo ou consertar o que não foi pedido, mesmo quebrado.
- Afirmar "testado", "validado", "funcionando" sem evidência real.

### Fluxo Git (vários agentes nos mesmos repos ao mesmo tempo)
Escrita no GitHub em repos `adm01-debug`: use o `GITHUB - MCP - FOREVER`. O MCP padrão do GitHub retorna 403 em write.
1. Nunca commite em `main`/`master`. Toda mudança nasce em branch própria.
2. Só escreva em branch que VOCÊ criou nesta sessão. Branch de outro agente/sessão é somente leitura — mesmo assunto, PR aberta ou "só uma linha" não mudam isso.
3. Antes de começar: liste as PRs abertas. PR aberta tocando os mesmos arquivos → pare e avise; não trabalhe nela nem abra outra por cima.
4. Branch nova a partir de `main` atualizado: `claude/<tipo>-<slug>-<AAMMDD-HHMM>` (tipo = fix | feat | chore | infra). Sem carimbo não é aceito. Uma tarefa = uma branch = uma PR. Antes de cada push, confirme que o último commit da branch é seu; se não for, pare e avise.
5. Commits curtos em PT-BR com prefixo (`fix:`, `feat:`, `chore:`, `infra:`), de preferência 1 commit atômico.
6. PR sempre. Título = o que muda. Corpo = causa/por quê + o que foi verificado de verdade, com a evidência.
7. Mergeie sem aprovação nem supervisão humana as PRs que você criou ou corrigiu e que já estão prontas: CI verde (ou repo sem CI), sem conflito com `main`, escopo comum (front, edge function, workflow, config). Squash-merge e apague a branch. Não espere "ok" — a única exceção é a regra 8.
8. Deixe a PR aberta e chame o Joaquim (sem mergear) quando envolver: DDL/migration em banco de produção; CI/workflows, segredos, Dockerfile, stack/Swarm, Traefik; deleção de dado, mudança de arquitetura ou custo; conflito com PR de outro agente.
9. Conflito: rebase da sua branch em `main`; `--force-with-lease` só na sua branch. Nunca force-push em `main`. Nunca rebase/force-push/commit/merge em branch alheia — nem para "ajudar".
10. Merge em repo com deploy automático (Lovable/Vercel/Cloudflare) = produção. Depois do merge, confira que o deploy subiu e reporte. CI vermelha → leia o resumo da falha antes de qualquer patch; se o vermelho veio do seu merge, corrija em branch nova (`fix:`) na mesma sessão.
11. Reporte no fim: link da PR + estado (mergeada / aberta aguardando o Joaquim / CI vermelha e por quê).

### Sempre feche com 3 próximos passos
Ao terminar qualquer tarefa de execução (fix, deploy, migração, auditoria, PR):

```
Próximos passos
1. [título curto] — [por que, em 1 linha] · [repo/arquivo/camada]
2. ...
3. ...
```

- Exatamente 3, por impacto (o 1 é o que ele deveria fazer agora).
- Derivados do que você realmente viu nesta sessão (código, logs, schema). Nada de "adicionar testes", "melhorar documentação", "revisar segurança".
- Cada item executável por você via MCP, não tarefa manual dele. Escrito para quem não é dev: efeito no negócio, não a técnica.
- É um menu, não uma pergunta: `1`, `1 e 3`, `APROVADO 2`, "todos" ou o bloco colado de volta = executar na ordem 1 → 2 → 3, sem reconfirmar. Nunca peça para "escolher uma" quando ele mandou o bloco inteiro.
- Não use o bloco em resposta que foi só consulta, quando ele já rejeitou aquelas 3 sugestões ou quando não sobrou nada — escreva `Próximos passos: nada pendente neste escopo.`

---

## 0. Onde se trabalha

**Fluxo vigente (medido em 2026-11-01):** agentes trabalham em branch própria `claude/...`, abrem PR, a
CI roda e o merge é feito pelo agente conforme as regras 7 e 8 do Fluxo Git acima. O fluxo antigo de
"git local + branch `dia/AAAA-MM-DD` + um PR por lote, nenhum agente abre PR" (2026-10-04) foi
**abandonado** na prática — não o siga.

| Situação | Banco | Como |
|---|---|---|
| Diagnóstico | **produção, só leitura** | `SELECT` pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`; nunca escrita para "testar" |
| Migration nova | arquivo em `supabase/migrations/` | PR → CI (`db-guard.yml` faz o replay em Postgres descartável) → aprovação do Joaquim (regra 8) → apply (seção 1) |
| Teste de comportamento de banco | **Postgres descartável** | `scripts/db-audit/*.test.sh` no CI; nunca no banco oficial |
| Migration destrutiva, segredos, rotação de chaves | **só com o Joaquim** | — |

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
  (`pullRequests(states:OPEN){ nodes { number files { nodes { path } } } }`): é o jeito barato de
  cumprir a regra 3 do Fluxo Git.
- Sessões paralelas commitam no mesmo repo e no mesmo banco: re-sync antes de editar, conferir
  `max(version)` antes de registrar migration.
- **Nunca feche PR de outra sessão** sem antes confirmar que o conteúdo dela chegou na `main` ou está
  coberto por outra PR — fechar não é neutro, é desfazer trabalho alheio. Duas sessões já corrigiram o
  mesmo problema em camadas diferentes e as duas mergearam (#704 + #707, retries que viraram 3 × 3).
- Branch mergeado = deletado no mesmo turno. Nunca trabalhar em worktree sob `/tmp` (acumula
  `prunable` silenciosamente).

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

### Planos e auditorias de referência

- CI: `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (checklist reconciliado com
  `docs/reconciliation/tasks/P006.json` — o teste `scripts/ci/ci-docs-baseline.unit.mjs` cobra a paridade).
- Perímetro: `docs/audits/e95-perimetro-github-2026-10-03.md`.
- Auditoria local↔GitHub↔banco: `docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md` (histórico).
- Estado e pendências correntes do CI: `RELATORIO_CI.md`, `PENDENCIAS.md`, `ESTADO.md`.

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

### Pendências de Vercel (dependem do Joaquim no dashboard)

1. **V017** — redirect: apex canônico, `www` → apex.
2. **V043–V065** — remover 17 vars de integração morta + 5 chaves de servidor + `VITE_*` não lidas.
3. **V175/V176** — pausar e apagar o projeto legado `zapp-web` (`prj_OsErjUqsrMbwwC7S1LVfawmNgEce`),
   que **ainda existe** (listado em 2026-11-01). Não é o projeto atual.
4. **V185** — trocar `FALLBACK_ORIGIN` para o domínio próprio 7 dias depois do DNS estabilizar.

---

## 6. Regras de domínio que o código não deixa óbvio

### Talk X / Campanhas
- **Plano vigente: V4** — `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` (X001–X200), placar em
  `docs/talkx/v4/STATUS.md` (gerado por `scripts/talkx/v4-status.mjs`; o CI roda `--check`). Os planos
  anteriores (V3, recuperação, implementação 100, `PARIDADE.md`) estão arquivados — não executar.
- Convenção V4: uma etapa = uma PR; branch `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`; título
  de PR terminando em `(X<NNN>)`.
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
  `department_invites` é legada. Decisão do Joaquim (2026-11-01): **somente admin** cria e apaga
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
