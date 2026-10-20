# RELATÓRIO W3 — REPLAY / RESILIÊNCIA de migrations

**Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD auditado:** `77f1a054995130b1f9257eb7691a66985877d447` (`main`, 29/09/2026)
**Workspace:** `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae` (worktree; `~/projetos/Zapp_Web_V2` **não foi tocado**)
**Motor:** `public.ecr.aws/supabase/postgres:17.6.1.159` (PostgreSQL 17.6 — a mesma versão do banco canônico), descartável, DDL/DML só nele
**Método:** 658 arquivos de `supabase/migrations/*.sql` (maxdepth 1, ordem de versão), **uma transação por arquivo**, `ON_ERROR_STOP=1`, **sem parar no primeiro erro** — semântica do `supabase db push` / `db reset` (arquivo atômico, cadeia continua).
**Onda 1 (F-01) reprovada de forma independente.** Este relatório mede a **extensão** do problema, isola a causa e entrega o patch verificável + o gate de CI.

---

## 0. Log bruto (artefatos no workspace)

| artefato | o que é |
|---|---|
| `w3-replay/replay.sh` | runner do replay resiliente (imagem + prelude de plataforma + cadeia) |
| `w3-replay/analyze.py` | classifica as falhas em ambiental / cascata / raiz |
| `w3-replay/out3/replay.log` | **log bruto do replay as-is**: 658 linhas `OK|FAIL <version> <arquivo> <SQLSTATE> <rc> <msg>` |
| `w3-replay/out3/raw/<version>__<arquivo>.log` | 658 logs por arquivo, com a saída literal do psql |
| `w3-replay/out3/failures.tsv` | as 24 falhas (versão · arquivo · SQLSTATE · mensagem) |
| `w3-replay/out3/analysis.json` | classificação automática (raiz / cascata / ambiental) |
| `w3-replay/out4/*` | mesma coisa com o **patch aplicado** (20 falhas) |
| `w3-replay/patched-migrations/` | cópia **sandbox** de `supabase/migrations` com o patch aplicado |
| `w3-replay/migration-replay.test.sh` + `migration-replay-allowlist.txt` | o gate de CI proposto, já executado |
| `w3-replay/out/`, `w3-replay/out2/` | execuções exploratórias (imagem crua / prelude incompleto) — guardadas como evidência do item 3 |

Reprodução: `W3_CONTAINER=w3-pg3 bash w3-replay/replay.sh w3-replay/out3 supabase/migrations w3-replay/platform`

---

## 1. Extensão real da quebra

### 1.1 Medida que importa: ambiente novo com a plataforma Supabase presente

| execução | cadeia | OK | FALHA | duração |
|---|---|---|---|---|
| `out3` — repo **as-is** | 658 | **634** | **24** | 68 s |
| `out4` — repo **+ patch** | 658 | **638** | **20** | 65 s |

**24 arquivos falham de 658.** A primeira falha é a **migration 304** (`20260830050000`): um runner *fail-fast* (`supabase db reset`, `supabase db push`) aplicaria 303 migrations e abortaria aí — **as 355 seguintes nunca seriam tentadas**, inclusive todo o módulo de contatos.

### 1.2 Classificação (a pergunta "é cascata?")

| classe | nº | detalhe |
|---|---|---|
| **Causadas pelo rowtype de 23 colunas (fases 1–3)** | **4** | 1 raiz (`42P13`) + 3 cascata direta |
| **Pré-existentes** (não introduzidas pelas fases 1–3) | **20** | dentro da allowlist do gate |
| Ambientais / de harness | **0** | zeradas depois do prelude correto (§1.4) |

Verificado por **experimento diferencial**: aplicando só o patch do §5, as 4 saem da lista e **nenhuma nova falha aparece** (24 → 20).

**As 4 da cadeia de contatos (todas com a MESMA raiz):**

| version | SQLSTATE | mensagem | por que |
|---|---|---|---|
| `20260929370000` | **42P13** | `cannot change return type of existing function` / `HINT: Use DROP FUNCTION search_contacts(...) first.` | arquivo reemite `search_contacts` com **17** colunas de retorno; a função viva tem **23** (F1). **É o CRÍTICO da onda 1, reproduzido.** |
| `20260929770000` | 42703 | `column c.deleted_at does not exist` | cascata: `deleted_at` só nasce em `20260929370000`, que abortou em bloco |
| `20260929780000` | 42883 | `function public.can_edit_contact(uuid, uuid) does not exist` | cascata: o overload de 2 args é criado por `20260929770000` |
| `20260929820000` | 42703 | `column c.deleted_at does not exist` | cascata direta |

**As 20 pré-existentes** (congeladas na allowlist, com SQLSTATE): `20260830050000` 42703 (`u.banned_until`), `20260902000200` XX000 (`Job 8 does not exist`), `20260903260000` 42883 (`get_identity_matrix()`), `20260906000001` P0001 (guard E31 recusa banco vazio), `20260910100000` 42704 (policy inexistente), `20260916230000` 42601 (**erro de sintaxe** em `talkx_e93_settings.sql`), `20260925100500` 42501 (`SET app.settings.trusted_domains` exige superuser), `20260925153000`/`20260927460000` 42883 (REVOKE de função que só existe em produção), `20260925153100` 42703 (`notified_at`), `20260925170000`+`20260928140200` **42P13** (mesma classe do C1, em `get_conversation_tab_counts`/`tab_counts`), `20260926410000` 42P07 (`idx_gmail_accounts_user_id` já existe), `20260927450000` 25001 (`CREATE INDEX CONCURRENTLY` dentro de transação — o arquivo tem `BEGIN` explícito), `20260927540000` 42P01 (`public.conversations`), `20260927570000`/`20260928200000`/`20260928210000` 42710 (`ADD TABLE` na publicação `supabase_realtime` não idempotente), `20260928430000` 42703 (`conversation_id`), `20260929610000` 42P01 (`public.talkx_settings`).

> **Achado estrutural:** a classe `42P13 cannot change return type` tem **3 instâncias** na cadeia, das quais **2 já existiam antes** desta auditoria. Não é um caso isolado do F1 — é um padrão do repositório.

### 1.3 A cadeia de falhas é dominada por cascata quando o ambiente está incompleto

Para não confundir defeito de repo com defeito de harness, medi também **sem** o baseline da plataforma (§1.4). Nessa configuração a cadeia morre na **segunda** migration e o resto é dominó:

* `20251215025014` falha em `INSERT INTO storage.buckets` → `42P01` → **95 descendentes** (inclusive `is_admin_or_supervisor`, `public.app_role`, `public.messages`).
* Total com a imagem crua: **448 arquivos com erro** (315× `42P01`, 92× `42883`, 21× `42703`, 5× `42710`, 1× `42P13`, …).
* Classificação automática: **348 cascata · 43 "raízes" (quase todas cascata não ligada) · 26 ambientais (`storage.buckets`/`storage.objects`) · 31 não classificadas**.

### 1.4 Por que o baseline da plataforma é obrigatório (e onde ele falta)

`auth`, `storage`, `realtime`, `vault`, `net`, `cron` **não vêm do repo**: em produção quem cria essas tabelas são os próprios serviços (GoTrue, storage-api, realtime) ao subir. A imagem `supabase/postgres` entrega só `init-scripts/` (roles + schemas vazios) — as migrations de plataforma ficam em `/docker-entrypoint-initdb.d/migrations/` e as do storage em `/app/migrations/tenant/` da imagem `storage-api`. O runner aplica as duas (**121 arquivos, 0 falhas, pós-condição `storage.{buckets,objects,migrations}` = 3/3**) antes da cadeia do repo. Sem isso o replay mede a ausência do serviço, não o repo — foi a diferença entre 24 e 424 falhas.

> **Consequência para o item 3:** o repositório **não tem caminho de instalação limpa próprio**. Nenhum script do repo sobe a plataforma; o único procedimento documentado é o que a auditoria acabou de escrever. Um `docker run supabase/postgres` + `psql -f` **não** é um procedimento de DR válido.

---

## 2. Estado final de um ambiente novo (provado)

### 2.1 `public.search_contacts` — as-is

`CREATE OR REPLACE` que muda rowtype **aborta e deixa a versão anterior viva**. Provado:

```
$ SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='search_contacts' …
TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text,
      email text, avatar_url text, tags text[], notes text, contact_type text,
      created_at timestamptz, updated_at timestamptz,
      latitude double precision, longitude double precision,
      address text, address_number text, neighborhood text, city text, state text, postal_code text,
      total_count bigint)                                            ← 23 colunas
```

Ou seja: **o C1 NÃO volta** — os 6 campos de endereço continuam no rowtype final. O que quebra é outra coisa, e pior (2.3).

Erro literal do arquivo (`raw/20260929370000__…log`):
```
psql:/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql:162: ERROR:  42P13: cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer) first.
```

### 2.2 `public.contacts` — as-is

| objeto | existe? | origem |
|---|---|---|
| `contacts.deleted_at` | **NÃO** | só `20260929370000` a cria, e o arquivo abortou inteiro (1 transação/arquivo) |
| índice parcial `idx_contacts_deleted_at` | **NÃO** | idem |
| `delete_contact(uuid)` / `delete_contacts(uuid[])` | **SIM** | `20260929720000` (aplicou; corpo referencia `deleted_at` que não existe) |
| `is_admin_or_supervisor(uuid)` | SIM | baseline antigo |
| `can_edit_contact` (#1198) | SIM, **2 overloads** | `20260929810000` (o arquivo que *introduz* o helper, `20260929770000`, falhou) |
| `can_delete_contacts` (#1198) | **NÃO** | só `20260929820000` a cria, e ela falhou |

**Os guards do #1198 entraram pela metade:** `can_edit_contact` existe (via o PR posterior), mas o helper original e o `can_delete_contacts` não. Os dois arquivos do #1198 que tocam `deleted_at` falharam — **os guards do #1198 dependem do arquivo do C1 para existir**, que é o próprio achado: o C1 não é "só" um rowtype divergente, é a **raiz de 3 migrations posteriores**.

### 2.3 Objetos do dia — comportamento em runtime (a parte que dói)

O corpo **vivo** de `search_contacts` referencia `c.deleted_at IS NULL` (herdado de `20260929810000`, que aplicou), mas a coluna não existe. Resultado: **a RPC está quebrada em runtime**, não só "sem endereço".

```
$ SET request.jwt.claim.sub='…'; SELECT count(*) FROM public.search_contacts(…);
ERROR:  column c.deleted_at does not exist
LINE 9:     c.deleted_at IS NULL

$ SET request.jwt.claim.sub='…'; SELECT public.delete_contact(<uuid>);
ERROR:  column c.deleted_at does not exist
LINE 4:      AND c.deleted_at IS NULL

$ SELECT public.delete_contacts(ARRAY[<uuid>]);
ERROR:  column c.deleted_at does not exist
```

### 2.4 Estado final com o patch (§5) — tudo verde

```
search_contacts  → 23 colunas (idênticas ao rowtype do ledger)
contacts.deleted_at        → existe
idx_contacts_deleted_at    → CREATE INDEX … WHERE (deleted_at IS NOT NULL)
is_admin_or_supervisor=1  can_edit_contact=2  can_delete_contacts=1  delete_contact=1  delete_contacts=1
search_contacts('',…,5,0)   → executa (0 linhas, filtro de visibilidade aplicado)
delete_contact(<uuid>)      → executa e devolve a mensagem de permissão (sem 42703): a semântica de autorização passa a ser alcançável
cadeia: 638/658 OK (20 pré-existentes na allowlist)
```

---

## 3. DR / reset — impacto de negócio

**Em uma frase:** um ambiente novo (branch de
rascunho, `supabase db reset`, restore de DR ou novo projeto) nasce com a **busca/lista de contatos e a exclusão lógica de contatos inutilizáveis** — `search_contacts`, `delete_contact` e `delete_contacts` levantam `42703 column c.deleted_at does not exist` em *toda* chamada (a tela de contatos cai por erro engolido → lista vazia, e "excluir contato" nunca funciona), enquanto `contacts.deleted_at` e o helper `can_delete_contacts` do #1198 nunca chegam a existir; o C1 (endereço sumindo na edição) **não** volta, porque o rowtype de 23 colunas do F1 sobrevive ao abort — o dano é maior do que a regressão original.

---

## 4. Divergência repo × ledger do dia (29/09/2026)

**45 migrations** de 29/09/2026. Cruzamento direto com o ledger (`supabase_migrations.schema_migrations`): **PENDENTE** — o gateway MCP do banco canônico está fora (rota `/mcp` travando em 20 s, helper devolvendo vazio), e a tarefa proíbe DDL/DML no canônico. A comparação de bytes ficou pendente; o que segue vem de `scripts/db-audit/migration-evidence.json` (fonte do próprio repo).

| version | pin em `migration-evidence.json` | motivo declarado |
|---|---|---|
| `20260929370000_contacts_soft_delete_and_search_filters` | **`ledger-divergence/pinned-replay`, reason `safer-replay`** | único pin do dia. Justificativa literal: *"Migration aplicada no banco com o SQL corrigido (search_contacts com as 23 colunas de retorno) depois de o gateway recusar 42P13 na primeira tentativa; o arquivo no repo preserva o replay anterior, de 20 colunas, porque migration ja aplicada e imutavel (guarda do db-guard). O conteudo correto e o do ledger; o replay fica fixado por hash proprio."* |
| as outras **44** | nenhum pin | pela convenção do `check-migration-drift.mjs`, ausência de pin ⇒ ledger ≡ arquivo. **Isso NÃO pôde ser reconferido agora** (gateway fora) — é uma afirmação do repo, não uma verificação desta auditoria. |

**Achado adicional no próprio pin:** a justificativa diz *"o replay anterior, de **20 colunas**"*. O arquivo tem **17** colunas de retorno (`id…longitude` + `total_count`); o F1/ledger tem 23. A contagem no texto do pin está errada em 3 — quem calibrar um fix por essa frase vai errar o alvo. (Os 4 hashes do pin **conferem** com o estado atual, revalidado pela onda 1.)

**Leitura do pin:** ele é tecnicamente correto e, ao mesmo tempo, é o **mascaramento** exato do defeito — a divergência arquivo↔ledger está registrada e passa no drift checker, mas nada no repo registra que o *arquivo* deixou de ser replayável. Foi assim que a cadeia quebrou sem nenhum guard acusar.

---

## 5. Correção mínima e verificada

**Um único bloco, em um único arquivo:** `supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql`, na definição de `public.search_contacts` (linhas 111–123). Sincroniza o arquivo com o SQL que o ledger registrou (as 6 colunas entram **após `longitude`**, `total_count` continua por último — mesma ordem do F1).

```diff
@@ -112,7 +112,7 @@ CREATE OR REPLACE FUNCTION public.search_contacts(search_term text DEFAULT ''::t
- RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, total_count bigint)
+ RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text, email text, avatar_url text, tags text[], notes text, contact_type text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
@@ -122,6 +122,7 @@
     c.created_at, c.updated_at, c.latitude, c.longitude,
+    c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code,
     COUNT(*) OVER () AS total_count
```

As **duas** metades são obrigatórias: mudar só o `RETURNS TABLE` quebra na hora (`structure of query does not match function result type` — a RPC devolveria 17 valores para um rowtype de 23).

**Verificação (replay completo, não inspeção):**

| | as-is | com o patch |
|---|---|---|
| arquivos falhando | 24 | **20** |
| `20260929370000` | 42P13 | OK |
| `20260929770000` / `20260929780000` / `20260929820000` | 42703 / 42883 / 42703 | OK / OK / OK |
| `contacts.deleted_at` | ausente | presente |
| `search_contacts`/`delete_contact` em runtime | `42703` | executam |
| falhas novas introduzidas | — | **0** |

Diff exato em `w3-replay/patched-migrations/…` (mesmo par de hashes do `.sql` original exceto as 2 linhas). **O repo real não foi alterado.**

**Nota de processo (regra 7 / guard do `db-guard.yml`):** editar um arquivo já aplicado contraria a regra do próprio repo. Duas saídas, e o dono decide:
1. **Replayability primeiro** (recomendado, é o que onda 1 também propõe): aplicar este patch e **atualizar o pin** (`file_sha256`/`file_sql_sha256` do evidence passam a coincidir com o ledger ⇒ o pin pode ser **removido**, e o `db-guard` precisa liberar a exceção para este arquivo, apontando para este relatório);
2. **Forward-only puro**: manter o arquivo intocado e acrescentar um `20260929830000_…` que `DROP FUNCTION public.search_contacts(...)` + `CREATE` com as 23 colunas — conserta o ambiente novo, mas deixa o replay quebrado entre a 20260929370000 e essa nova versão (as 3 migrations cascata continuam falhando nesse intervalo). **Por isso a opção 1 é a única que torna a cadeia replaysável de ponta a ponta.**

---

## 6. Teste de CI proposto (já executado, custo medido)

**Arquivo:** `w3-replay/migration-replay.test.sh` (+ `w3-replay/migration-replay-allowlist.txt`)
**Não é um teste de fixture:** sobe a imagem real da produção, aplica o prelude de plataforma, aplica **a cadeia inteira** e depois **verifica o contrato** que o replay deve deixar vivo.

```
PASS   prelude: schema storage completo (3/3)
== replay: 24 arquivos falharam de 658
FAIL   migrations quebradas FORA da allowlist:
       20260929370000  SQLSTATE=42P13  20260929370000_contacts_soft_delete_and_search_filters.sql
       20260929770000  SQLSTATE=42703  20260929770000_contacts_can_edit_contact_helper.sql
       20260929780000  SQLSTATE=42883  20260929780000_contacts_single_permission_predicate.sql
       20260929820000  SQLSTATE=42703  20260929820000_contacts_can_delete_contacts_hoisted_params.sql
PASS   allowlist ainda e exata (nenhuma correcao deixou de ser reconhecida)
PASS   search_contacts vive com as 6 colunas de endereco
FAIL   contacts.deleted_at NAO existe
FAIL   search_contacts levanta 42703 em runtime
FAIL   delete_contact levanta 42703 em runtime
REPLAY REPROVOU: 4 check(s)          >>> exit=1  custo=53s
```

Mesmo teste com o patch: **9/9 PASS, exit 0, 208 s.** (Sem o patch ele reprova; com o patch ele passa — o gate é sensível ao defeito e não é um carimbo.)

**Como plugar** (2 linhas em `.github/workflows/db-guard.yml`, junto dos outros testes de banco — o job já tem Docker e roda `retry-disposable-postgres-test.sh`):

```bash
cp w3-replay/migration-replay.test.sh    scripts/db-audit/
cp w3-replay/migration-replay-allowlist.txt scripts/db-audit/
```
```yaml
      # O drift checker compara arquivo x ledger e um pin `pinned-replay` faz a
      # divergencia passar de proposito; nenhum guard aplicava a CADEIA. Foi assim
      # que 20260929370000 (42P13) chegou em main sem ninguem notar.
      - name: Replay da cadeia de migrations em PostgreSQL 17 descartavel
        env:
          MIGRATION_REPLAY_POSTGRES_IMAGE: public.ecr.aws/supabase/postgres:17.6.1.159
          MIGRATION_REPLAY_STORAGE_IMAGE: public.ecr.aws/supabase/storage-api:v1.73.1
        run: |
          bash scripts/db-audit/retry-disposable-postgres-test.sh \
            bash scripts/db-audit/migration-replay.test.sh
```

**Custo medido:** **53 s a 208 s** por execução com as imagens já em cache (658 migrations + prelude, o `docker run`/healthcheck incluídos); somar **~1–2 min de pull** numa runner fria (`supabase/postgres` ~160 MB + `storage-api` ~80 MB). Cabe no `timeout-minutes: 20` do job. Alternativa mais barata se o custo incomodar: rodar só em PRs que tocam `supabase/migrations/**` (mas aí perde a proteção contra *revert* que reintroduza a divergência), ou reduzir o motor a `postgres:17-alpine` + prelude sintético — perde a fidelidade de roles/`SUPERUSER` que é justamente onde o harness vacilou.

**Ratchet:** a allowlist congela as 20 falhas pré-existentes **por versão**. Se uma migration quebrada nova aparecer, o gate falha; se uma das 20 começar a passar, o gate também falha (obrigando a remover a linha) — a lista só encolhe.

---

## 7. O que NÃO foi verificável

1. **Cruzar cada arquivo de 29/09/2026 com o SQL do ledger** (§4). Gateway MCP do canônico fora; `DESTINO_URL` indisponível; DDL/DML no canônico proibido. Usei `migration-evidence.json` do próprio repo, que é evidência pinada — **não** é a leitura do ledger.
2. **Contra o banco de produção:** nada foi lido do canônico nesta onda. Tudo em PostgreSQL descartável.
3. **Fidelidade do prelude de plataforma:** usei `storage-api:v1.73.1` (a versão presente nesta máquina) e a imagem `supabase/postgres:17.6.1.159`; as versões de GoTrue/realtime/`pg_graphql` **não** foram replicadas. Os 3 schemas de plataforma que o repo de fato toca (`auth`, `storage` e a publicação `supabase_realtime`) estão cobertos; o resto não foi exercitado.
4. **Custo real em runner fria do GitHub Actions** (não medido aqui — só o custo local).
5. **`supabase db reset` de verdade** (CLI deslogado por prescrição). A semântica de transação por arquivo foi **replicada** (`--single-transaction`), não observada na ferramenta.
6. **Correção das outras 20 falhas pré-existentes:** identificadas e congeladas, **não** corrigidas — fora do escopo (duas delas, `20260916230000` com `syntax error at or near "NOT"` e `20260925170000`/`20260928140200` com `42P13`, merecem chamado próprio).

## 8. Limpeza

- `~/projetos/Zapp_Web_V2` **intocado** (nenhuma escrita, commit, checkout ou push).
- Nenhum DDL/DML fora do PostgreSQL descartável. Containers `w3-pg3`, `w3-pg4` e `w3-replay-pg` ficaram de pé para inspeção; `docker rm -f w3-pg3 w3-pg4 w3-replay-pg` derruba tudo.
- O patch vive **apenas** em `w3-replay/patched-migrations/` (cópia sandbox). Se preferir o repo sem resíduo, `rm -rf w3-replay` — o log bruto está citado §0.
