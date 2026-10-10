# AUDITORIA A1 — DBA / Postgres (adversarial, pós-merge)

**Alvo:** Fase 1 (E02/E06), PR #1173, merge `a4d85736c61e093de005964ea88b763979f5e385`
**Banco canônico auditado:** `tnnnlkbymytvtqngbbqh` (PostgreSQL 17.6), via gateway MCP, **somente leitura**
**Data/hora das leituras:** 2026-09-29 17:16–17:24 UTC (14:16–14:24 BRT)
**Missão:** tentar **falsificar** as afirmações do autor. Não concordar por padrão.

## Nota de ambiente (importante para o parent)

- O `workdir` prescrito no enunciado (`.../audit-a1-db-26092914149334`) foi **recusado pelo HERMES-GUARD**: esse diretório pertence a outro chat. A auditoria inteira foi executada no workspace que o guard atribuiu a esta sessão: `.../audit-a3-tempo-26092914146227`. Nenhum outro workspace foi tocado.
- `bun install` executado (386 pacotes em `node_modules`). `docker` disponível; runner `scripts/db-audit/retry-disposable-postgres-test.sh` usado como prescrito.
- Nenhum `git commit` / `git push` / `git checkout`. Nenhum DDL/DML no banco canônico. Nenhum dado de cliente exposto (somente `count(*)`, catálogo e definições).

---

## Placar das afirmações

| # | Afirmação | Veredicto |
|---|---|---|
| 1 | 6 campos novos depois de `longitude`, no RETURNS TABLE e no SELECT, sem quebrar leitor por posição | **PARCIAL** |
| 2 | ACL restaurada: PUBLIC sem EXECUTE, authenticated+service_role com EXECUTE | **VALIDADO** (com ressalva em F-03) |
| 3 | Filtro de visibilidade continua EXATAMENTE como antes | **PARCIAL** |
| 4 | Trigger grava só em mudança, não dispara em INSERT, sem PII, não quebra writer | **VALIDADO** |
| 5 | As 2 migrations estão no ledger com o SQL REAL | **VALIDADO** |
| 6 | Sem overload ambíguo / sem perda de performance (índice) | **PARCIAL** |
| 7 | O trigger permite DETECTAR perda de endereço; `audit_logs` já tem linhas de endereço | **PARCIAL** |

**Achado que domina a auditoria:** o banco canônico **não está mais no estado da base imutável**. `origin/main` avançou de `694bf084` para `0ab84095` e **três migrations pós-base já estão aplicadas em produção**, alterando o próprio objeto sob auditoria no meio da auditoria (ver **F-02**).

---

## Afirmação 1 — PARCIAL

**O que se confirma.** O `RETURNS TABLE` real em produção e o do arquivo/ledger são idênticos, com os 6 campos **depois de `longitude`** e `total_count` **por último**:

```
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "SELECT pg_get_function_result(p.oid) ... WHERE p.proname='search_contacts'"
TABLE(id uuid, name text, nickname text, surname text, job_title text, company text, phone text,
email text, avatar_url text, tags text[], notes text, contact_type text,
created_at timestamp with time zone, updated_at timestamp with time zone,
latitude double precision, longitude double precision, address text, address_number text,
neighborhood text, city text, state text, postal_code text, total_count bigint)
```

```
$ python3 scripts/db-audit/a1-diff-filter.py
pre-F1 : 17 colunas
F1     : 23 colunas
PROD   : 23 colunas
pre-F1 = F1[:16]+F1[-1]? True
colunas adicionadas pelo F1: ['address text', 'address_number text', 'neighborhood text', 'city text', 'state text', 'postal_code text']
ordinal de total_count: pre-F1=17  F1=23  PROD=23
ordinal de address:     pre-F1=None  F1=17  PROD=17
PROD vs F1 = [] (+0 colunas)
```

Ou seja: `pre-F1 == F1[1..16] + [total_count]` — as 6 colunas entraram **entre** `longitude` e `total_count`, exatamente como o arquivo promete. O SELECT lista `c.address, c.address_number, c.neighborhood, c.city, c.state, c.postal_code` nessa mesma ordem, na mesma posição relativa.

**Por que não é VALIDADO: "sem quebrar leitor por posição" é falso na parte que importa.** As 16 colunas iniciais mantêm o ordinal, mas `total_count` **andou do ordinal 17 para o 23**. Um leitor por posição (índice 17, ou "penúltima coluna") passa a ler `address` no lugar de `total_count`. A ressalva honesta: o consumidor principal (`src/services/contact.service.ts`, `supabase.rpc`) devolve objeto chaveado **por nome**, então na prática não quebra — mas a frase como está escrita é mais forte do que o fato. Ver **F-06**.

## Afirmação 2 — VALIDADO

`proacl` **real** de `search_contacts` (não o pretendido):

```
$ python3 .../zapp_db.py "SELECT p.proname, p.proacl::text ..."
{"proname":"search_contacts","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}", ...}
```

Não existe grantee vazio (`=X/...` = PUBLIC) e `anon` não aparece. Confirmado por privilégio **efetivo**, não por formatação:

```
$ ... "SELECT has_function_privilege('anon','public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)','EXECUTE')"
false
```

No PG descartável, com o mesmo arquivo aplicado:

```
      proacl search_contacts = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
      PUBLIC tem EXECUTE? f
      has_function_privilege(anon, search_contacts, EXECUTE) = f
PASS   A2.PUBLIC sem EXECUTE em search_contacts
PASS   A2.anon sem EXECUTE em search_contacts
PASS   A2.authenticated+service_role com EXECUTE
```

O comentário do arquivo está correto: o `DROP` + `CREATE` de fato re-concede via `ALTER DEFAULT PRIVILEGES` e o `REVOKE ... FROM PUBLIC, anon` explícito é necessário. **A ressalva é a irmã**: a *outra* função criada pelo mesmo PR nasceu sem essa disciplina — ver **F-03**.

## Afirmação 3 — PARCIAL

Usei o ledger (o SQL que o banco **realmente executou**), não só o arquivo.

**(a) O F1 não tocou o filtro.** O bloco `WHERE` normalizado da versão anterior (`20260926160000`, a última que definiu a função antes do F1 — confirmado como existente em `a4d85736^`) é **byte a byte igual** ao do F1:

```
########## 2. FILTRO: pre-F1 (20260926160000) vs F1 (20260929140000) ##########
WHERE identico (normalizado)? True
pre=12 linhas, f1=12 linhas
```

A única diferença de linha apontada no diff é a própria declaração (`CREATE OR REPLACE FUNCTION` → `CREATE FUNCTION`), não o predicado. **Nenhuma linha de filtro mudou por causa do F1.**

**(b) Mas a definição VIVA não é mais a do F1.** Às 17:16 UTC a produção devolvia o bloco de três ramos; às 17:23 UTC o mesmo `SELECT pg_get_functiondef` devolveu outra coisa:

```
PROD (17:16 UTC): AND ( is_admin_or_supervisor(auth.uid()) OR c.assigned_to IN (...) OR EXISTS (SELECT 1 FROM public.queue_members qm ...) )
PROD (17:23 UTC): AND public.can_edit_contact(c.assigned_to, c.queue_id)
```

Mudança introduzida por migrations **fora da base auditada** (`20260929370000` acrescentou `c.deleted_at IS NULL`; `20260929780000` trocou o predicado pelo helper). Semântica **preservada** — li o corpo do helper em produção e ele é exatamente os três ramos originais:

```
$ ... "SELECT pg_get_functiondef(p.oid) ... WHERE p.proname='can_edit_contact'"
  SELECT public.is_admin_or_supervisor(auth.uid())
    OR p_assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.queue_members qm
               WHERE qm.queue_id = p_queue_id
                 AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
                 AND qm.is_active = true)
```

**Conclusão:** o F1 é inocente (não mudou filtro nenhum), mas a afirmação "o filtro continua EXATAMENTE como antes" **não descreve o estado da produção no momento da auditoria**. Quem comparar `pg_get_functiondef` de hoje com a versão anterior vai ver diff — só que o diff não é do F1. Ver **F-02**.

## Afirmação 4 — VALIDADO

Fixture replica as 4 policies REAIS de `audit_logs` (nomes tirados de `pg_policy`), incluindo o bloqueio de INSERT para `authenticated`, para que o teste prove algo:

```
### controle: INSERT direto como authenticated bloqueado pela policy (RLS ativa)
PASS   A4.INSERT nao gera auditoria
PASS   A4.UPDATE sem coluna de endereco no SET nao gera
PASS   A4.UPDATE com valor IGUAL nao gera (IS DISTINCT FROM)
PASS   A4.UPDATE com mudanca real gera exatamente 1
PASS   A4.UPDATE em massa (3 linhas tocadas ate agora) = 3 eventos
PASS   A4.wipe total marca cleared=true
PASS   A4.sem PII em details (varredura por valores reais)
PASS   A4.writer existente nao quebra e auditoria grava via SECURITY DEFINER
      chaves de details: cleared contact_id
      maior details::text = 72 chars
```

Cobertura: INSERT (não dispara — é `AFTER UPDATE`), UPDATE sem coluna de endereço no SET (não dispara — `UPDATE OF`), UPDATE escrevendo o valor idêntico (não dispara — `IS DISTINCT FROM`), mudança real (1 evento), bulk (N linhas → N eventos), PII (as chaves de `details` são só `cleared` e `contact_id`; nenhum valor de endereço em claro), e writer existente (`UPDATE` como `authenticated`, com RLS de `audit_logs` ligada e policy bloqueando INSERT direto, continua funcionando e o evento é gravado via `SECURITY DEFINER` — owner `postgres`, `relforcerowsecurity=false`).

Detalhe adversarial que não derruba a afirmação: `entity_id` recebe `NEW.id`, que é o id do contato (não é PII), e `user_id` recebe `auth.uid()` (id de usuário, não PII).

## Afirmação 5 — VALIDADO

Comparei **statement por statement** o SQL do ledger com o arquivo do repo, normalizando comentários/whitespace (`scripts/db-audit/a1-ledger-compare.py`), e depois repliquei o algoritmo canônico do próprio `check-migration-drift.mjs` (`a1-pin-verify.py`) — minha réplica reproduz os SHA-256 do manifesto, o que valida o método.

```
############ 20260929140000 vs repo ############     (4 statements)
stmt[0] MATCH sha256=c0771a45c93f6eba    DROP FUNCTION IF EXISTS ...
stmt[1] MATCH sha256=339c747806d798f2    CREATE FUNCTION ... (24 colunas)
stmt[2] MATCH sha256=d3bb4edbcd22b167    GRANT EXECUTE ... TO authenticated, service_role
stmt[3] MATCH sha256=9b86e056797c1f46    REVOKE EXECUTE ... FROM PUBLIC, anon
RESULTADO: TODOS OS STATEMENTS BATEM

############ 20260929150000 vs repo ############     (3 statements)
stmt[0] MATCH sha256=ba41b241ea1bea2a    CREATE OR REPLACE FUNCTION audit_contact_address_change()
stmt[1] MATCH sha256=44bfe53e11fe9166    DROP TRIGGER IF EXISTS trg_audit_contact_address_change
stmt[2] MATCH sha256=27b04e20b78257bf    CREATE TRIGGER trg_audit_contact_address_change ...
RESULTADO: TODOS OS STATEMENTS BATEM
```

```
$ python3 scripts/db-audit/a1-pin-verify.py 20260929140000 20260929150000 20260929370000
===== 20260929140000 =====  NAO HA PIN no manifesto.  ledger == arquivo (SQL canonico)? True
===== 20260929150000 =====  NAO HA PIN no manifesto.  ledger == arquivo (SQL canonico)? True
===== 20260929370000 =====
  file_sha256                OK   manifesto=1ca3e6799503259a calculado=1ca3e6799503259a
  file_sql_sha256            OK   manifesto=6da4f311b07de4f2 calculado=6da4f311b07de4f2
  ledger_sql_sha256          OK   manifesto=a9fd6ff288841742 calculado=a9fd6ff288841742
  ledger_statements_sha256   OK   manifesto=9f2ebf5ba36d5392 calculado=9f2ebf5ba36d5392
```

As duas migrations do F1 **não** aparecem em `migration-evidence.json` — corretamente, porque ledger e arquivo batem. `name` no ledger também casa com o filename nas duas.

## Afirmação 6 — PARCIAL

**Overload: confirmado que não há.** Uma única `search_contacts` em todo o cluster (não só em `public`):

```
$ ... "SELECT n.nspname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ... WHERE p.proname='search_contacts'"
{"nspname":"public","args":"search_term text, contact_type_filter text, ..., page_offset integer"}   row_count=1
```

**Performance: a premissa da afirmação é falsa.** Nem o filtro nem a ordenação usam índice. O `EXPLAIN` da *chamada* só mostra `Function Scan` (plpgsql não é inlinado), então medi com plano **genérico** (`PREPARE` + `EXPLAIN EXECUTE` sob `force_generic_plan`), que é o que o plpgsql faz de verdade com um parâmetro de runtime:

```
      PLANO GENERICO sort_field=name/asc:
        Limit  (cost=14.86..14.86 rows=1 width=696)
          ->  Sort  (cost=14.85..14.86 rows=1 width=696)
                Sort Key: (CASE WHEN (($7 = 'name'::text) AND ($8 = 'asc'::text)) THEN name ELSE NULL::text END), ...
                ->  WindowAgg  (cost=0.00..14.84 rows=1 width=696)
                      ->  Seq Scan on contacts c  (cost=0.00..14.80 rows=1 width=592)
                            Filter: ((deleted_at IS NULL) AND (($2 IS NULL) OR (contact_type = $2)) AND ... AND (($5 IS NULL) OR ($5 = ANY (tags))))
```

`Seq Scan` + `Sort` em memória (`WindowAgg` para o `COUNT(*) OVER ()`). O `ORDER BY` é uma cadeia de `CASE` sobre parâmetro — não dobra para um índice; e os filtros no formato `(param IS NULL OR coluna = param)` também não. **Isto não é regressão do F1** (a construção é idêntica antes do F1; o F1 só acrescentou colunas à lista do SELECT, o que não toca filtro nem chave de ordenação), mas a afirmação de que as colunas "ainda usam índice" **é FALSA como fato atual**. Ver **F-04**.

## Afirmação 7 — PARCIAL

**(a) O mecanismo de detecção existe e funciona.** O evento `contact_address_changed` dispara em qualquer mudança das 8 colunas, e a query de detecção roda:

```
$ ... "SELECT count(*) FROM public.audit_logs WHERE action='contact_address_changed' AND (details->>'cleared')::boolean IS TRUE"
{"detectados": 0, "row_count": 1}
```

**(b) Mas `cleared` só acusa apagamento TOTAL.** O booleano exige `address`, `city`, `latitude` **e** `longitude` todos nulos no mesmo UPDATE. A perda **parcial** — só `address` indo para NULL, que é a forma realista do C1 — grava o evento com `cleared=false`:

```
      ACHADO(7): perda PARCIAL de endereco -> cleared=f (evento registrado, mas cleared nao acusa)
      ACHADO(7): eventos para o contato com wipe parcial = 2
```

Ou seja: a perda é **detectável pela presença do evento**, mas **não** por `details->>'cleared'`. Quem monitorar apenas `cleared=true` fica cego para o caso parcial.

**(c) `audit_logs` NÃO tem linhas de endereço.** Contagem real (sem conteúdo):

```
$ ... "SELECT count(*) AS total, count(*) FILTER (WHERE action='contact_address_changed') AS eventos_endereco FROM public.audit_logs"
{"total": 7697, "eventos_endereco": 0}
```

Zero eventos desde a criação do trigger. A detecção **ainda não produziu sinal nenhum em produção** — não há como afirmar que o detector "já pegou" algo, e não há linha de base para calibrar ruído.

---

## Achados

### F-02 — MÉDIO — A base auditada está desatualizada e a produção mudou durante a auditoria
`origin/main` remoto = `0ab84095d34548124d0feefb6cdec0dedda7c5fe`, **não** `694bf084` (a "base imutável" declarada). O ledger mostra 21 migrations aplicadas com versão > `20260929370000`, incluindo as três do PR #1198 (`20260929770000_contacts_can_edit_contact_helper`, `20260929780000_contacts_single_permission_predicate`, `20260929790000_contacts_hijack_guards_only_on_change`) — que já estão **em produção** e **não existem** no snapshot auditado (`git cat-file -e HEAD:<arquivo>` falha).

```
$ git ls-remote origin main
0ab84095d34548124d0feefb6cdec0dedda7c5fe	refs/heads/main
$ ... "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version > '20260929370000' ORDER BY version"
20260929380000 disable_sicoob_bridge_trigger
... (21 linhas) ...
20260929770000 contacts_can_edit_contact_helper
20260929780000 contacts_single_permission_predicate
20260929790000 contacts_hijack_guards_only_on_change
```

**Impacto:** qualquer veredicto de "estado atual" é válido só no instante da leitura — e foi literalmente o caso aqui: duas leituras do mesmo `pg_get_functiondef`, separadas por ~7 min, devolveram corpos diferentes. A afirmação 3 descreve um predicado que não existe mais em produção (o de hoje é `can_edit_contact(...)`). A semântica **não** regrediu (li o corpo do helper: mesmos três ramos), mas quem auditar contra `694bf084` está auditando um snapshot errado.
**Exploitability:** nenhuma (é problema de processo/coordenação).
**Ação:** fixar a base em `0ab84095` (ou posterior) e re-executar o item (b) da afirmação 3 contra o helper; e alinhar o carimbo da base com o que o ledger tem.

### F-01 — MÉDIO — O repo não replays do zero: a migration seguinte falha depois do F1
`20260929370000` (arquivo em `main`) ordena **depois** do F1 mas seu `RETURNS TABLE` **não** tem as 6 colunas de endereço, enquanto o SQL efetivamente aplicado (ledger) **tem**. Como `CREATE OR REPLACE` não muda row type, replay em ordem de versão quebra:

```
$ python3 scripts/db-audit/a1-ledger-compare.py /tmp/stmts_20260929370000.json supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql
--- stmt[9] *** DIVERGE ***
    ledger sha256=ab1e4daae5c84002 len=2944
    repo   sha256=20de31859c5e7004 len=2772
    DIVERGE no char 770:
      ledger: ...'e zone, latitude double precision, longitude double precision, address text, address_number text, neighborhood text, city text, state text, postal_code text, total_count bigint) ...
      repo  : ..."e zone, latitude double precision, longitude double precision, total_count bigint) ...
RESULTADO: HA DIVERGENCIA

# PG descartável, repo aplicado em ordem de versão (F1 primeiro):
      (controle) CREATE OR REPLACE mudando row type: ERROR:  cannot change return type of existing function
                 HINT:  Use DROP FUNCTION a1_probe(integer) first.
FAIL   REPLAY: repo aplica em ordem de versao do zero
      -> migration 20260929370000 FALHA apos o F1:
         ERROR:  cannot change return type of existing function
         DETAIL:  Row type defined by OUT parameters is different.
```

**Isto NÃO é um achado não-documentado.** A divergência está registrada em `migration-evidence.json` como `ledger-divergence/pinned-replay`, `reason: safer-replay`, e **os 4 hashes do pin conferem com o estado atual** (ver Afirmação 5) — logo `check-migration-drift` não vai acusar. O problema é que o pin descreve a divergência de conteúdo e, ao mesmo tempo, **mascara** que o arquivo do repo deixou de ser replaysável: um `supabase db reset`, uma branch nova ou um restore de DR param no `42P13`.
**Atribuição:** causado em conjunto — o F1 mudou o row type, e o PR posterior (#1172/`8b993820`) mandou para `main` um arquivo que não acompanha.
**Impacto:** impossível reconstruir o banco a partir do repo. **Exploitability:** nenhuma.
**Ação:** reescrever o `RETURNS TABLE` de `20260929370000` com as 6 colunas (equivalente ao SQL do ledger) e atualizar/remover o pin; um teste de replay em CI pegaria isso.

### F-03 — BAIXO — A função de trigger criada pelo F1/2 nasceu com EXECUTE para PUBLIC e anon
`search_contacts` recebeu o tratamento de ACL correto (afirmação 2), mas **a outra** função do mesmo PR, nova e `SECURITY DEFINER`, não:

```
$ ... "SELECT p.proname, p.proacl::text ... WHERE p.proname IN ('search_contacts','audit_contact_address_change')"
audit_contact_address_change  acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
search_contacts               acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

$ ... "SELECT ... has_function_privilege(r, p.fn, 'EXECUTE') ..."
{"fn":"public.audit_contact_address_change()","role":"anon","pode_executar":true}
{"fn":"public.audit_contact_address_change()","role":"authenticated","pode_executar":true}
```

O `=X/postgres` é grantee vazio = **PUBLIC**. Isto contraria uma convenção explícita da casa: o repo tem **duas** migrations dedicadas só a revogar EXECUTE de funções de trigger (`20260927310000_revoke_trigger_functions_anon_execute.sql`, `20260927390000_revoke_trigger_funcs_public_execute.sql`), listando função por função. A função nova do F1 não foi incluída.
**Exploitability: NÃO demonstrada.** Testei a invocação direta como `anon` no PG descartável:

```
      chamada direta por anon: ERROR:  trigger functions can only be called as triggers
CONTEXT:  compilation of PL/pgSQL function "audit_contact_address_change" near line 1
```

Como `anon` não cria triggers, não achei caminho de abuso. Graduei **BAIXO** pela exploitability nula; mas é violação de regra de casa e o conserto é de duas linhas (`REVOKE EXECUTE ... FROM PUBLIC, anon`), e o próprio projeto historicamente tratou esse padrão como digno de migration dedicada.
**Ação:** migration curta com `REVOKE EXECUTE ON FUNCTION public.audit_contact_address_change() FROM PUBLIC, anon;`.

### F-04 — MÉDIO — Nenhum índice é usado no filtro nem na ordenação da lista de contatos
Ver afirmação 6. Plano genérico = `Seq Scan` + `Sort` em memória sobre `contacts` (3.104 linhas hoje, todas vivas) a cada carga da lista. **Pré-existente, não introduzido pelo F1**, e hoje irrelevante em tempo (tabela pequena) — o risco é latente e cresce com o volume. Registrar aqui porque a afirmação 6 pediu explicitamente a verificação e o resultado é o oposto do afirmado.
**Exploitability:** nenhuma; DoS interno só se a tabela crescer muito.
**Ação (fora do escopo do F1):** o `ORDER BY` com `CASE` sobre parâmetro nunca será indexável sem reescrita (ex.: ordenar no cliente, ou `IF sort_field=...` com queries separadas).

### F-05 — BAIXO — `cleared` não detecta a perda parcial de endereço
Ver afirmação 7(b). O booleano só é `true` no apagamento simultâneo de `address`+`city`+`latitude`+`longitude`. A forma realista do defeito original (só `address` sumindo) grava o evento mas com `cleared=false`. Recomendo detector por **presença do evento** + contagem por contato, não por `cleared=true`.

### F-06 — BAIXO — `total_count` deslocou do ordinal 17 para o 23
Ver afirmação 1. Leitor por nome não é afetado; leitor por posição é. Vale um `grep` nos consumidores (é do A4) para descartar indexação posicional.

---

## O que NÃO foi verificável

1. **NÃO VERIFICÁVEL: rodar `check-migration-drift.mjs` de verdade contra o ledger.** `DESTINO_URL` não está definida no ambiente e eu não tenho (nem devo manusear) credencial de conexão direta. Mitigação: repliquei o algoritmo canônico do próprio script em Python (`a1-pin-verify.py`) e ele reproduz **exatamente** os SHA-256 do manifesto — o que valida meu método — mas replicar não é o mesmo que executar a ferramenta.
2. **NÃO VERIFICÁVEL em produção: o comportamento do trigger sob as policies reais de `audit_logs`.** Verifiquei em réplica descartável com as 4 policies copiadas por nome/comando (controle positivo: INSERT direto como `authenticated` bloqueado por RLS; o trigger grava mesmo assim). Testar direto no canônico exigiria um `UPDATE` real em `contacts`, que a tarefa proíbe. O que sustenta a conclusão em produção é o catálogo: owner `postgres` + `relforcerowsecurity=false`.
3. **NÃO VERIFICÁVEL: efeito sobre consumidores de frontend.** Fora do meu escopo (A4); só confirmei que `contact.service.ts` consome via `supabase.rpc` (chaveado por nome).
4. **NÃO VERIFICADO (fora de escopo): o SQL real no ledger das migrations pós-base** (`20260929770000/780000`) não foi comparado com os arquivos do commit `0ab84095` — li apenas os arquivos do commit, não o ledger deles. Fica registrado como próximo passo para quem auditar contra `0ab84095`.
5. **NÃO VERIFICÁVEL: exploração real de F-03.** Nenhum caminho de abuso encontrado; ausência de exploit não é prova de inexistência.

---

## Limpeza / artefatos

- **Nenhum arquivo rastreado foi modificado.** `git status --short` mostra apenas entradas `??` (untracked).
- Artefatos criados por esta sessão (todos em `scripts/db-audit/`):
  `a1-adversarial-f1.test.sh` (teste adversarial), `a1-ledger-compare.py`, `a1-ledger-fetch.py`, `a1-pin-verify.py`, `a1-diff-filter.py`, `a1-evidence-prod.sh` e `a1-evidence/*.txt` (saídas literais).
  Um helper intermediário sem uso (`a1-explain.py`) foi removido.
- **Não toquei** em `.a4-scratch/`, `AUDITORIA-A4-CONSUMIDORES.md`, `src/__a3audit__/`, `src/components/contacts/__tests__/A4*` — são artefatos de outros chats que compartilham este diretório.
- Reprodução: `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/a1-adversarial-f1.test.sh` (15 PASS, 1 FAIL **esperado** = F-01) e `bash scripts/db-audit/a1-evidence-prod.sh` (somente leitura).
