# RELATÓRIO W1 — Meta-auditoria (onda 2) dos 7 achados principais da onda 1

- **Repo auditado:** `adm01-debug/Zapp_Web_V2`
- **Workspace:** `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae`
- **HEAD no momento da auditoria:** `77f1a054995130b1f9257eb7691a66985877d447` (pós-PR #1215), `git status --short` limpo exceto artefatos untracked deste chat (`W1-probes/`, `src/W1-probes/`) e de outros chats (`w2-*`, `w3-replay/`, `w4-perf/`, `w5-artefatos/`)
- **Método:** sondas próprias (nenhuma reexecução de teste de outro auditor como prova). Postgres 17 descartável via `scripts/db-audit/retry-disposable-postgres-test.sh`; hook/componentes **reais** (só o transporte de rede mockado); contagem da suíte comparada com o log do próprio CI no GitHub.
- **Banco canônico:** inacessível — ver §Infra, no fim.

## Veredito por achado

| # | Achado (onda 1) | Veredicto | Severidade onda 1 → corrigida |
|---|---|---|---|
| 1 | `20260929370000` reemite `search_contacts` com 17 colunas × 23 aplicadas ⇒ replay em ordem aborta `42P13` | **REPRODUZIDO** (literal, cadeia própria) | CRÍTICO → **MÉDIO** (já é exceção registrada e fixada por hash; nenhum gate faz replay em ordem) |
| 2 | A3-01 clique duplo/Enter ⇒ N−1 toasts destrutivos falsos + N−1 `/retrieve` + N sessões | **REPRODUZIDO** (com números exatos) | MÉDIO-ALTO → **MÉDIO** (a última seleção é aplicada corretamente; custo extra é limitado aos cliques do operador) |
| 3 | A3-04 pausa de 429 expira, nada religa, tela fica "pausadas por 0 s" para sempre | **PARCIALMENTE** | MÉDIO → **BAIXO** (uma tecla religa; texto "0 s" e botão ausente são reais) |
| 4 | A4-B `ContactForm` ignora a flag `mapa.searchbox-autocomplete` | **REPRODUZIDO** (código); parte "6 de 8 sessões" **NÃO VERIFICÁVEL** | ALTO → ALTO *se* o volume 6/8 se confirmar; sem ele, **MÉDIO** (gap de controle de rollout, sem impacto de dado) |
| 5 | A5-1 declarado 4153 ≠ real 4244 no SHA `694bf084` | **PARCIALMENTE** — a subdeclaração existe, mas o "real" **não é 4244**: é **4217** | MÉDIO mantido (o número do auditor também não reproduz) |
| 6 | A1-F03 `audit_contact_address_change()` nasceu com EXECUTE para PUBLIC/anon | **REPRODUZIDO** (fato da ACL) | BAIXO → **INFO/BAIXO** ("contraria a convenção" é falso; não é explorável) |
| 7 | A4-D 2º editor de contato abre com endereço VAZIO | **REPRODUZIDO** | MÉDIO → **BAIXO** (defeito de exibição; o UPDATE **não** apaga o endereço) |

---

## 1 · CRÍTICO (replay) — REPRODUZIDO, com rebaixamento

**Comando** (sonda própria, cadeia mínima; fixture + a migration irmã da F1 + a migration do achado):

```
bash scripts/db-audit/retry-disposable-postgres-test.sh bash W1-probes/W1-achado1-chain.sh
```

**Saída literal (trecho):**

```
### 1) estado inicial: search_contacts nao existe
0
### 2) aplicando 20260929140000_search_contacts_returns_address.sql (a migration irma da F1)
NOTICE:  function public.search_contacts(text,...,integer) does not exist, skipping
resultado: TABLE(id uuid, ..., latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
### 3) replay em ordem: aplicando 20260929370000_contacts_soft_delete_and_search_filters.sql
exit_code=3
ERROR:  42P13: cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION search_contacts(text,text,text,text,text,timestamp with time zone,text,text,integer,integer) first.
LOCATION:  ProcedureCreate, pg_proc.c:441
### 4) assinatura depois da tentativa (a antiga continua de pe?)
TABLE(... address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint)
### 5) colunas de saida declaradas POR search_contacts em cada arquivo
20260929370000: 17
20260929140000: 23
### 6) a 20260929370000 cita as 6 colunas de endereco em algum lugar?
0
```

O erro é **exatamente** o `42P13` alegado, com o `HINT` de `DROP FUNCTION`. A migration de 17 colunas não cita nenhuma das 6 colunas de endereço nem no `RETURNS TABLE` nem no corpo.

**O que isso muda na severidade:** nada do mecanismo cai — mas o rótulo CRÍTICO não se sustenta, porque a divergência **não é um achado novo nem não-controlado**:

- É uma exceção **declarada e fixada por hash** em `scripts/db-audit/migration-evidence.json` (entrada `20260929370000`, `kind: "ledger-divergence/pinned-replay"`, `reason: "safer-replay"`, com `file_sha256`/`file_sql_sha256`/`ledger_sql_sha256`), e existem **49** exceções do mesmo tipo no arquivo — é mecanismo de rotina, não anomalia.
- Está documentada em `docs/audits/DIAGNOSTICO_GUARDAS_HERMES_E_DIVERGENCIAS_2026-09-29.md` §2, inclusive com o rastro (arquivo renomeado dentro do próprio PR #1172 depois de aplicado, para evitar colisão de versão) e a explicação de por que editar o arquivo é proibido (regra 7).
- O rastro da correção do número está em `47468f7e` ("docs(evidencias): numero certo e rastro da divergencia do search_contacts").
- **Nenhum job de CI rejoga as migrations em ordem num banco vazio** (`db-guard.yml` valida hashes/drift/ACL offline; `check-migration-drift.mjs` só exige que a exceção `pinned-replay` tenha SQL executável e hash fixado). Logo o aborto não derruba nenhum gate hoje.
- O impacto real fica confinado a **rebuild greenfield / restore de DR a partir do histórico de migrations** — risco operacional real, mas já registrado e a decisão de fechar é do Joaquim (reemitir o arquivo histórico), não um defeito em produção.

**Não verificado:** que o banco canônico tenha de fato a função de 23 colunas (a alegação da onda 1). Offline a evidência é: a migration `20260929140000` (23 colunas) + a própria exceção `migration-evidence.json` que declara `ledger_sql_sha256` do SQL aplicado com "as 23 colunas de retorno". O `tools/call` do gateway MCP não responde (ver §Infra), então a medição viva não pôde ser repetida.

---

## 2 · A3-01 clique duplo / Enter segurado — REPRODUZIDO

**Comando** (hook `useAddressAutocomplete` **real**; só `@/lib/mapboxGeocode`, `mapboxCostGuard`, `mapboxToken` e `use-toast` mockados; `LocationPicker` real):

```
./node_modules/.bin/vitest run src/W1-probes/W1-achado2-3.test.tsx
```

**Saída literal** (`W1-probes/W1-achado2-3.evidence.jsonl`; 3 execuções consecutivas, resultado idêntico):

```json
{"tag":"A3-01-duplo","data":{"duranteRetrieve":{"optionEstaDesabilitada":false,"retrieve":1,"toastsFalsos":0},"totalRetrieve":2,"totalSessoesFaturadas":2,"toastsDestrutivosFalsos":1,"toastsTotais":1,"titulos":["Não consegui obter a coordenada"]}}
{"tag":"A3-01-triplo","data":{"totalRetrieve":3,"totalSessoesFaturadas":3,"toastsDestrutivosFalsos":2}}
```

- 2 cliques na mesma sugestão: **1 toast destrutivo falso** ("Não consegui obter a coordenada") + **2 `/retrieve`** + **2 sessões** faturadas (`logAudit({action:'searchbox_session'})`, contadas pelo módulo real `mapboxSession`).
- 3 cliques: 2 toasts falsos, 3 `/retrieve`, 3 sessões ⇒ a fórmula **N−1** confere.
- A opção **não** fica `disabled` durante o `/retrieve` em voo (`optionEstaDesabilitada: false`) — o item continua clicável, exatamente como alegado.
- Mecanismo confirmado no código real: `useAddressAutocomplete.ts:340` (`if (seq !== selectionSeqRef.current) return null;`) + `LocationPicker.tsx:84-92` (trata `null` como falha e emite toast `variant: 'destructive'`).

**O que isso muda na severidade:** MÉDIO-ALTO → **MÉDIO**. A seleção **final** é aplicada corretamente (`chooseSearchResult` recebe o resultado mais novo; `endSearchSession()` roda), então não há perda de dado nem bloqueio de fluxo: o dano é (a) um aviso destrutivo **falso** que pode levar o operador a refazer a operação, e (b) 1–2 sessões/`/retrieve` extras por clique duplo — custo marginal na faixa de 500 sessões/mês grátis. O "ALTO" exigiria impacto em dado ou fluxo.

---

## 3 · A3-04 pausa de 429 que expira — PARCIALMENTE

**Comando:** o mesmo `./node_modules/.bin/vitest run src/W1-probes/W1-achado2-3.test.tsx` (relógio avançado por spy em `Date.now`, sem fake timers).

**Saída literal:**

```json
{"tag":"A3-04","data":{
 "estadoApos429":{"suggestCalls":1,"temBotaoTentarNovamente":true,"causa":"Limite de buscas atingido — aguarde 1 min."},
 "estadoAposRetryNoBackoff":{"temBotaoTentarNovamente":false,"textoNaTela":"Sugestões pausadas por 60 s — a busca por Enter continua funcionando.","suggestCalls":1},
 "aposBackoffExpirar":{
   "antesDoBackoffExpirar":[{"t":0,"suggest":1,"tentativasAlemDoBackoff":0,"texto":"... por 60 s ..."},{"t":750,"suggest":1,"tentativasAlemDoBackoff":0,"texto":"... por 59 s ..."},{"t":2750,"suggest":1,"tentativasAlemDoBackoff":0,"texto":"... por 57 s ..."}],
   "depoisDoBackoffExpirar":[{"t":0,"suggest":1,"tentativasAlemDoBackoff":0,"texto":"... por 57 s ..."},{"t":500,"suggest":1,"tentativasAlemDoBackoff":0,"texto":"Sugestões pausadas por 0 s — a busca por Enter continua funcionando."}],
   "temBotaoTentarNovamente":false,"suggestCalls":1},
 "aposDigitarDeNovo":{"suggestCalls":2,"textoNaTela":null,"statusRenderizado":"nao-paused"}}}
```

**Confirma o achado:**
- Depois do backoff (relógio +61 s) o texto **fica em "por 0 s"** e nada religa: `suggestCalls` permanece **1** e nenhuma tentativa passa da guarda de backoff (`tentativasAlemDoBackoff: 0`).
- Clicar **"Tentar novamente" durante o backoff** faz o botão **desaparecer**: o `retrySuggest` cai em `SUGGEST_BLOCKED` ⇒ `status: 'paused'`, e `SuggestionList.tsx:99-108` só renderiza o botão em `status === 'error'`. Estado literal: `temBotaoTentarNovamente: false`.

**Falsifica o achado (por isso PARCIALMENTE):**
- **"para sempre" é falso na prática:** **uma tecla** religa a busca — `aposDigitarDeNovo.suggestCalls` vai de 1 para 2 e a tela sai do estado pausado. A pausa expirada é auto-corrigível no primeiro caractere digitado; não exige reload nem fechar o picker.
- A frase entre parênteses da onda 1 ("mesmo texto de 'expirado há 1 min'") **não corresponde a nenhuma string do código**: `pausedNoticeText('rate_limited', segundos)` só tem duas saídas — `Sugestões pausadas por N s — ...` (com `pausedUntil`) e `Sugestões pausadas — aguarde um instante.` (com `pausedUntil` nulo). Existe "aguarde 1 min" apenas em `SEARCH_FAILURE_TEXT.rate_limited` (bloco de erro `status='error'`), que é outro estado.
- Correção de leitura: depois de um 429 o estado é **`error`** (com o botão), não `paused`. O estado "pausada" só nasce depois do clique em "Tentar novamente" durante o backoff.

**O que isso muda na severidade:** MÉDIO → **BAIXO**. O operador não fica travado (um caractere resolve), não há perda de funcionalidade (o Enter/busca antiga continua, e o próprio aviso diz isso). Restam dois defeitos cosméticos/de recuperação: contagem "0 s" sem expiração visual e ausência do botão de retry no estado pausado.

---

## 4 · A4-B `ContactForm` ignora a flag — REPRODUZIDO (código)

**Comando** (hook real; `useFeatureFlag` mockada devolvendo `false`):

```
./node_modules/.bin/vitest run src/W1-probes/W1-achado4-7.test.tsx
```

**Saída literal:**

```json
{"tag":"A4-B","data":{"flagRetornoParaMapaSearchbox":[],"flagFoiConsultadaAlgumaVez":0,"suggestDisparadoComFlagDesligada":1,"argumentoDaBusca":"avenida paulista","listaDeSugestoesRenderizada":true}}
```

- Com a flag em `false`, o `ContactForm` **nunca chama** `useFeatureFlag` (`flagFoiConsultadaAlgumaVez: 0`) e o `/suggest` **dispara** ao digitar (`suggestDisparadoComFlagDesligada: 1`, termo `avenida paulista`), com a lista renderizada.
- Confere com o código: `grep -rn "searchbox-autocomplete" src/` → **1 única ocorrência** (`LocationPicker.tsx:44`), enquanto `ContactForm.tsx:90-95` monta `useAddressAutocomplete({ token: mapboxToken, enabled: !!mapboxToken, ... })`.

**O que isso muda na severidade:** o fato é incontestável, mas o "ALTO" da onda 1 se apoia em **"6 de 8 sessões medidas"** — número que eu **não pude reverificar** (depende de `audit_logs`/`feature_flags` no banco vivo, inacessível). Sem esse volume, é **MÉDIO**: gap de controle de rollout (desligar a flag não reduz o consumo dessa origem), **sem** impacto de correção de dado — o cadastro funcionalmente funciona.

---

## 5 · A5-1 contagem da suíte — PARCIALMENTE (o número do auditor também não reproduz)

**Comandos e saídas literais:**

(a) Export limpo do SHA alegado, sem tocar no repo (`git archive`, nada de `checkout`):

```
$ mkdir -p /tmp/wt694 && git archive 694bf084 | tar -x -C /tmp/wt694
$ ln -s <workspace>/node_modules /tmp/wt694/node_modules
$ (cd /tmp/wt694 && ./node_modules/.bin/vitest run)
 Test Files  304 passed | 1 skipped (305)
      Tests  4217 passed | 40 todo (4257)
VITEST_EXIT=0
$ git ls-tree -r --name-only 694bf084 -- src | grep -cE '\.(test|spec)\.(ts|tsx)$'
305
```

(b) Log do próprio CI no merge SHA `694bf084` (`gh`, job "🧪 Unit Tests", id `109526860279`):

```
$ gh api --allow-escape-sequences repos/adm01-debug/Zapp_Web_V2/actions/jobs/109526860279/logs | grep -a "Tests "
2026-09-29T17:19:01Z       Tests  4217 passed | 40 todo (4257)
Test Files  304 passed | 1 skipped (305)
```

(c) HEAD `77f1a054` — sonda local **e** CI (job `109586684910`) batem:

```
$ ./node_modules/.bin/vitest run            # workspace, HEAD
 Test Files  311 passed | 1 skipped (312)
      Tests  4262 passed | 40 todo (4302)
VITEST_EXIT=0
$ gh api .../jobs/109586684910/logs | grep -a "Tests "
       Tests  4262 passed | 40 todo (4302)
 (mais 195 passed do config de contratos)
```

(d) O número declarado, no corpo da PR #1195 (F3):

```
- [x] testes unitários: `npx vitest run` → **4153 passed, 0 failed** (40 todo)
```

**Leitura:** a substância do achado está certa — **4153 não é a contagem real** (o real no SHA `694bf084` é 4217). Mas o "real" alegado pela onda 1 (**4244 passed / 40 todo**, "`bun run test` no `694bf084`, exit 0") **não reproduz**: nem na minha sonda nem no CI, que dão **4217 passed | 40 todo (4257)**, com **305** arquivos de teste — e `694bf084` tem exatamente 305 arquivos de teste rastreados (`git ls-tree`), com `vitest.config.ts` idêntico ao de HEAD. A diferença de +27 testes / +4 arquivos indica que a execução da onda 1 mediu uma árvore **contaminada por arquivos não rastreados** (o próprio relatório da onda 1 declara que o workspace deles era compartilhado com os artefatos de A1/A4).

**O que isso muda na severidade:** MÉDIO mantido (o defeito é de relatoria: número declarado desatualizado), mas com a ressalva de que o número de referência do auditor está errado por +27 — quem for usar 4244 como baseline vai errar.

---

## 6 · A1-F03 `audit_contact_address_change()` com EXECUTE para PUBLIC/anon — REPRODUZIDO (fato), severidade derrubada

**Comando:**

```
bash scripts/db-audit/retry-disposable-postgres-test.sh bash W1-probes/W1-achado6-acl.sh
```

(o script emula o `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role` do Supabase antes de aplicar a migration real `20260929150000`)

**Saída literal (trecho):**

```
### 2) proacl cru da funcao
audit_contact_address_change|{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,anon=X/postgres}
### 3) has_function_privilege
anon: t
authenticated: t
service_role: t
PUBLIC(via public_): t
### 4) da para CHAMAR a funcao de trigger por RPC (PostgREST usa SELECT ...)?
--- como anon ---
    ERROR:  trigger functions can only be called as triggers
    CONTEXT:  compilation of PL/pgSQL function "audit_contact_address_change" near line 1
--- como authenticated ---
    ERROR:  trigger functions can only be called as triggers
### 6) contraste: com a remediacao do proprio repo (REVOKE ... FROM PUBLIC, anon)
anon depois do REVOKE: f
authenticated depois do REVOKE: t
o trigger continua funcionando depois do REVOKE: 2
```

O `proacl` reproduz **byte a byte** o que a onda 1 leu no banco vivo (`{=X/postgres,...,anon=X/postgres,...}`): PUBLIC e anon têm EXECUTE.

**O que isso muda na severidade:** BAIXO → **INFO/BAIXO**, por duas razões independentes:

1. **Não é explorável.** É função `RETURNS trigger`: qualquer tentativa de invocação direta (o que o PostgREST faria) devolve `ERROR: trigger functions can only be called as triggers` — para `anon` **e** para `authenticated` — com ou sem o `EXECUTE`. O `EXECUTE` do anon não é o mecanismo que faz o trigger disparar.
2. **A "convenção do repo" está sendo lida pela metade.** O baseline **commitado** (`scripts/db-audit/grants-baseline.json`, `anon_execute`, 9 entradas) já lista outras **5 funções `RETURNS trigger`** com EXECUTE para anon (`conversation_task_set_assignee`, `conversation_task_state_trigger`, `enforce_multiplix_dispatch_mutability`, `enforce_multiplix_recipient_mutability`, `team_receipts_fill_conversation_id` — todas verificadas como `RETURNS trigger` nas migrations) mais 3 de outros tipos. Ou seja: a função nova **seguiu** o padrão vigente do banco, não contrariou; as migrations de REVOKE existem, mas coexistem com essa classe tolerada e com um checker (`check-grants-fresh.mjs` + `grants-baseline.sql`) que **regenera e compara** a lista — e não acusa nada aqui.

---

## 7 · A4-D 2º editor de contato abre com endereço VAZIO — REPRODUZIDO (sem perda de dado)

**Comando:** o mesmo `./node_modules/.bin/vitest run src/W1-probes/W1-achado4-7.test.tsx`, renderizando o `EditContactDialog` **real** com as props **literais** dos dois callers (`ContactDetails.tsx:140-148` e `Crm360Tab.tsx:99-114`).

**Saída literal:**

```json
{"tag":"A4-D","data":{"caller":"ContactDetails","valores":{"Logradouro":"","Numero":"","Bairro":"","Cidade":"","UF":"","CEP":""}}}
{"tag":"A4-D","data":{"caller":"Crm360Tab","valores":{"Logradouro":"","Numero":"","Bairro":"","Cidade":"","UF":"","CEP":""}}}
{"tag":"A4-D-contraste","data":{"Logradouro":"Av. Paulista","Cidade":"São Paulo"}}
{"tag":"A4-D-payload","data":{"payload":{"name":"Fulano de Tal Jr"},"tocaEmEndereco":[]}}
```

- Com as props exatas dos dois callers, os **6 campos de endereço abrem vazios**. Com as colunas de endereço passadas (1º caller, lista de contatos), o form abre preenchido (`contraste`) — a causa é exatamente "o caller não passa as colunas", como alegado.
- **Mas o vetor de perda de dado do C1 não se aplica a este caminho:** `EditContactDialog.handleSubmit` monta o payload **só com campos que diferem de `initialValues`** (`FIELD_NORMALIZERS` + `if (formValues[key] === initialValues[key]) continue;`). Editando só o nome, o UPDATE foi `{"name":"Fulano de Tal Jr"}` e **nenhuma** coluna de endereço/coordenada é tocada (`tocaEmEndereco: []`).

**O que isso muda na severidade:** MÉDIO → **BAIXO**. É defeito de exibição/intenção (o operador não vê o endereço que existe), **não** regressão do C1: o dialog é diff-based, então abrir vazio não apaga nada; o risco residual é o operador redigitar um endereço parcial por achar que está vazio (aí ele muda o que digitou, de forma explícita, e os outros campos continuam intactos).

---

## Infra — o banco canônico (medido, não presumido)

O gateway **não está morto na mão de obra**: o handshake responde. O que não responde é a chamada de ferramenta.

```
$ curl -s -X POST "$URL" ... -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"supabase-zapp-web-v2-mcp","version":"1.1.2"}}}
[http=200 tempo=0.213349s bytes=161]

$ ... -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
74 ferramentas (ping, db_query, db_list_functions, ...)   [http=200]

$ ... -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
                                                                        [http=000 tempo=55.001963s bytes=0]  curl exit 28 (timeout)

$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "select 1"
(saída vazia, exit 0)
```

Correção do diagnóstico da tarefa: a rota `/mcp` **não** responde 200 na raiz — `GET` devolve `405` em 0,18 s; o que travava era o `tools/call` (medido acima em 55 s sem resposta). Consequência prática idêntica: **nenhuma leitura do banco canônico foi possível**; tudo que depende do estado vivo está marcado como não verificado abaixo.

## O que NÃO foi verificável

1. **Estado vivo do banco canônico** (gateway `tools/call` sem resposta; `zapp_db.py` vazio):
   - que `public.search_contacts` no banco tem as 23 colunas (achado 1, premissa) — evidência indireta: migration 140000 + a exceção `pinned-replay` que declara o SQL aplicado de 23 colunas;
   - o `proacl` vivo de `audit_contact_address_change()` (achado 6 reproduzido só no Postgres descartável, com emulação do `ALTER DEFAULT PRIVILEGES`);
   - `feature_flags.enabled` de `mapa.searchbox-autocomplete` e a contagem "6 de 8 sessões por origem" (achado 4);
   - a definição viva carregada pelo `EditContactDialog` via `contact-enriched` (achado 7) — o teste de contraste usou as props, não a query real.
2. **Contagem de testes em SHA intermediário** para isolar a contribuição por commit (feito apenas nos dois SHAs citados: `694bf084` e `77f1a054`), por proibição de `checkout`/`worktree` no repo — usei `git archive`.
3. **Corpo da PR #1173/#1182** foi lido via `gh` apenas para achar o número declarado da suíte; não revalidei as demais alegações dessas PRs (fora do escopo dos 7 achados).
4. **`eslint`/`tsc`/`db:guard`** não foram reexecutados (não fazem parte dos 7 achados).

## Artefatos deste chat (untracked)

- `W1-probes/W1-achado1-chain.sh` + `W1-probes/W1-achado1.out`
- `W1-probes/W1-achado6-acl.sh` + `W1-probes/W1-achado6.out`
- `W1-probes/W1-db-probe.sh` (sonda read-only do gateway MCP)
- `src/W1-probes/W1-achado2-3.test.tsx` + `W1-probes/W1-achado2-3.evidence.jsonl`
- `src/W1-probes/W1-achado4-7.test.tsx` + `W1-probes/W1-achado4-7.evidence.jsonl`
- `W1-probes/W1-suite-head.log` (suíte completa em `77f1a054`)
- `W1-probes/W1-suite-CI.log` (contagem extraída dos logs dos jobs `109526860279` e `109586684910`)
- `/tmp/wt694/` (export de `694bf084` usado só para a contagem; **removido depois**, com o symlink de `node_modules` desfeito antes de apagar)

Nenhum arquivo rastreado foi modificado: `git status --short` só mostra entradas `??` (as minhas e as de outros chats desta mesma pasta).
