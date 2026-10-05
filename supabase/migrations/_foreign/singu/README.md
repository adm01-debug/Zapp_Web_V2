# RPCs do Singu — versões espelhadas (F21)

Este diretório **não é aplicado por nenhum gate**. O `db-guard`, o `check-migration-drift.mjs` e o
`hermes-db-migrar` só olham `supabase/migrations/*.sql` — subdiretórios como `_foreign/` ficam fora do
inventário de migrations do projeto. Estes arquivos existem para **versionar** funções que vivem no banco
do **Singu** (projeto Supabase `pgxfvjmuubtbowutlide`, outro projeto, outra credencial), de modo que uma
mudança nelas seja revisável em PR em vez de nascer direto no banco.

## Origem e prova de identidade

Extraídas ao vivo por `pg_get_functiondef` (sessão autorizada, somente leitura — decisão
`20261001-124731-6bf8`, resposta **A**). Os `md5` abaixo foram medidos dos dois lados na mesma execução:
`md5(<arquivo no repo>)` contra `md5(pg_get_functiondef(p.oid))` no banco.

| função | arquivo | md5 (repo = banco) | bytes |
|---|---|---|---|
| `multiplix_search_audience` | `multiplix_search_audience.sql` | `86fc1393286a2f0783d6bf50ec3c121e` | 4417 |
| `multiplix_count_audience` | `multiplix_count_audience.sql` | `f123d5abf1065321692def6fb355ec22` | 2128 |
| `multiplix_resolve_recipients` | `multiplix_resolve_recipients.sql` | `1678f438d543a16d936f060e5d955cb1`¹ | 4967 |
| `multiplix_list_ramos` | `multiplix_list_ramos.sql` | `133d1043dd4d96fe1a186ce66cd33788` | 439 |
| `multiplix_list_ufs` | `multiplix_list_ufs.sql` | `b7942d122f2f34b7764e8dff3141754b` | 487 |

Os 5 pares **batiam** na remedida de 2026-10-01 (já com a migração E014/F27 aplicada); o `resolve` voltou a
divergir em 05/10/2026 por decisão — corpo redige fora do escopo, aplicação no Singu pendente (nota ¹). Todas são `LANGUAGE sql`/`plpgsql`, `STABLE
SECURITY DEFINER`, com `SET search_path TO 'public'`. A coluna `bytes` é o tamanho do arquivo; o `resolve`
tem 4967 bytes / 4966 caracteres (o corpo tem `ó` multibyte em `-- E014: telefone da empresa só vale para B2B`).
Reproduzir a conferência:

```bash
for f in supabase/migrations/_foreign/singu/multiplix_*.sql; do md5sum "$f"; done
# e, no Singu:
#   select proname, md5(pg_get_functiondef(oid)) from pg_proc
#   where proname like 'multiplix_%' order by 1;
```

## O que a leitura revelou (E016, E017, E014)

O `F21` pede para corrigir, na mesma PR, o que a leitura revelar. Medido item por item:

- **E016 — `deleted_at IS NULL`, `is_duplicate = false`: JÁ IMPLEMENTADO.** Os dois filtros estão em
  `multiplix_resolve_recipients.sql:49-50` (escolha do contato, tanto pelo `p_contact_ids` quanto pelo
  fallback `ORDER BY created_at ASC`), e o `deleted_at IS NULL AND status = 'ativo'` em
  `multiplix_count_audience.sql:21` e `multiplix_list_ramos.sql:10`. Nada a corrigir.
- **E017 — "Não informado" explícito e ordem por frequência: JÁ IMPLEMENTADO.**
  `multiplix_list_ramos.sql:7` usa `COALESCE(NULLIF(trim(c.ramo_atividade), ''), 'Não informado')` e a
  linha 12 fecha com `ORDER BY total DESC`; idem em `multiplix_list_ufs.sql`. Nada a corrigir.
- **E014 — `company_phones` só B2B: CORRIGIDO (aplicado em 2026-10-01).** O destino monta 4 degraus em
  `multiplix_resolve_recipients.sql:63-68`: `contact_phones` (`is_whatsapp = true`, `ORDER BY is_primary
  DESC`) → `contacts.whatsapp` → `company_phones` → `sem_destino`/`destino_invalido` (`:90-97`). O degrau
  de `company_phones` (`:81-86`) agora **restringe a empresa a B2B**:

  ```sql
  LEFT JOIN LATERAL (
    SELECT cph.numero_e164 FROM public.company_phones cph
    WHERE cph.company_id = av.company_id AND cph.is_whatsapp = true
      AND (av.is_supplier OR av.is_carrier)   -- E014: telefone da empresa só vale para B2B
    ORDER BY cph.is_primary DESC LIMIT 1
  ) cph ON true
  ```

  Para isso `av.is_supplier`/`av.is_carrier`/`av.is_customer` passaram a ser projetados na CTE `avaliado`
  (`.sql:31-33`) — a mesma fonte alimenta a coluna nova `empresa_papeis` do F27. Antes da correção, um
  cliente pessoa-física (nem supplier nem carrier) com telefone de empresa recebia esse telefone como
  destino; agora vira `sem_destino` → `destino_invalido`. Ver "Aplicado no Singu" abaixo.

## Aplicado no Singu (E014 + F27, 2026-10-01)

Escrita no Singu autorizada pela decisão `20261001-152728-906f` (= **A**). A migração versionada que
descreve a mudança — com `-- rollback:` real no cabeçalho — é:

- `20261001154000_singu_e014_b2b_e_papeis.sql` (neste diretório).

Mudança única: `public.multiplix_resolve_recipients`.

- **E014** — `AND (av.is_supplier OR av.is_carrier)` no LATERAL de `company_phones` (`:84`).
- **F27 (parte Singu)** — o `RETURNS TABLE` (`:2`) ganha duas colunas:
  - `empresa_papeis text[]` — papéis da empresa na ordem `supplier`, `carrier`, `customer` (só os
    verdadeiros; vazio quando nenhum), montado em `.sql:98-104`.
  - `last_interaction_at timestamptz` — `.sql:69-72`. Fonte medida no próprio Singu:
    `public.contacts.last_interaction_at` **existe mas está 0/4748 preenchido** (o campo ainda não é
    alimentado — é o alvo do sync de F85/E097); a fonte **populada** equivalente é
    `public.interactions.data_interacao` (10.461 linhas, 2.321 com `contact_id`, 100% com data;
    2025-12-15 a 2026-04-12), a MESMA agregação que a view do Singu `v_company_summary` usa como
    `last_interaction` (`max(data_interacao)`). Por isso a RPC devolve
    `COALESCE(contacts.last_interaction_at, max(interactions por contato))`: fiel ao campo declarado e
    já útil enquanto o sync não existe. **Pendência:** quando F85/E097 passarem a alimentar
    `contacts.last_interaction_at`, o `COALESCE` já o prefere — nenhuma mudança nova na RPC.

Acrescentar colunas ao `RETURNS TABLE` muda o tipo de retorno, que `CREATE OR REPLACE` não altera
(`42P13`): a migração faz `DROP FUNCTION` + `CREATE`, e como o `DROP` derruba a ACL e o `CREATE` volta com
os default privileges do Supabase (`… | authenticated=X/postgres`), o bloco revoga `PUBLIC`/`authenticated`/`anon`
e regranta só `service_role`, republicando a ACL medida antes e depois: `postgres=X/postgres |
service_role=X/postgres` (`anon` e `authenticated` sem EXECUTE, conferido por `has_function_privilege`).

## Guard HMAC do escopo (F22) — ✅ APLICADO no Singu em 01/10/2026

Arquivo: `20261001160000_singu_guard_hmac_escopo.sql` (neste diretório).

**Aplicado depois do deploy da edge assinando** (a ordem decidida em `20261001-152728-906f`:
(1) arquivo versionado → (2) deploy da edge assinando → (3) aplicar no Singu → (4) `md5` de volta nesta
tabela — este passo 4 está feita acima).

Provas medidas **depois** de aplicar (a produção é o Singu real):

| prova | resultado |
|---|---|
| RPC direta com a service key e **sem cabeçalho** | **`42501 escopo sem assinatura: cabecalhos x-multiplix-scope-hmac/x-multiplix-scope-exp ausentes`** |
| edge real `multiplix-audience`, `agent` (`comercial01`) | **HTTP 200**, `count = 5319` (a carteira dele) |
| edge real, `supervisor` (compras e logística) | **HTTP 200**, `count = 55930` |
| `scripts/db-audit/multiplix-scope.test.sh` (3 perfis, escopo forjado) | **43 PASS / 0 FAIL**, `exit 0` |
| `md5` dos 5 espelhos | 3 mudaram (as 3 com escopo), 2 de lista iguais — tabela acima atualizada |

Efeito colateral corrigido no mesmo follow-up: a perna de **referência** do `multiplix-scope.test.sh` chama a
RPC direto, então passou a assinar o escopo (mesmo contrato v1, segredo lido do vault ou da env
`MULTIPLIX_SCOPE_HMAC_SECRET`) — sem isso ela abortava com `42501`.

**Por que a assinatura vai em cabeçalho, e não em parâmetro** (medido, não suposto): acrescentar
`p_scope_hmac`/`p_scope_exp` muda a assinatura da função, e o PostgREST casa a chamada pelo **conjunto de
nomes** do corpo — chamar com um parâmetro que a função não tem devolve `404 PGRST202` ("no matches were
found in the schema cache"). Consequência prática: com parâmetro **não existe ordem segura** — ou a edge
publica primeiro e todas as chamadas do Multiplix viram 404, ou o guard entra primeiro e a edge antiga é
recusada. Com cabeçalho o acoplamento desaparece: o PostgREST repassa os headers da requisição em
`current_setting('request.headers')` (provado com função-sonda por HTTP), a RPC antiga simplesmente ignora,
e a assinatura de entrada não muda — então é `CREATE OR REPLACE` puro, **sem `DROP`**, preservando owner e
ACL (`postgres=X/postgres | service_role=X/postgres`, `anon`/`authenticated` sem EXECUTE).

Contrato (v1), idêntico nos três lugares que assinam/verificam (edge, este SQL e
`scripts/db-audit/multiplix-audience-parity.mjs`):

```
payload    = 'v1|<permissoes ordenadas asc, unidas por ",">|<email ou "">|<exp_unix>'
assinatura = HMAC-SHA256 hex, chave = MULTIPLIX_SCOPE_HMAC_SECRET
cabeçalhos = x-multiplix-scope-hmac  /  x-multiplix-scope-exp
```

O segredo vive em **dois** lugares e em nenhum arquivo: a env das edges do Zapp e a tabela
`vault.decrypted_secrets` deste projeto (nome `MULTIPLIX_SCOPE_HMAC_SECRET`). Conferido por *fingerprint*
do valor nos dois lados (`sha256[0:12] = 6bbab0593c38`), sem nunca imprimir o segredo.

**Provado antes de entrar em produção** (tudo revertido; produção intocada, `md5` das 3 RPCs idêntico):

| prova | resultado |
|---|---|
| vetor de referência do HMAC | Deno, Python e `pgcrypto` no Singu produzem `2119521f8ae8…` |
| transação + `ROLLBACK` (6 casos) | sem cabeçalho/expirada/assinatura errada/outro escopo → recusa; assinatura correta → conta `57314` = SQL direto; escopo vazio → aceita |
| HTTP real (PostgREST → validadora → vault) | sem cabeçalho **403**; assinatura errada **403**; correta **200**; outro escopo **403** |

⚠️ `extensions.hmac`, não `hmac`: no Supabase o `pgcrypto` vive no schema `extensions`, e dentro de uma
função com `SET search_path TO 'public'` o nome sem qualificar **não resolve** (`42883`) — o guard cairia em
*toda* chamada, inclusive com assinatura correta. O teste em transação pegou isso antes de ir para produção.

¹ **Aplicação no Singu PENDENTE** (05/10/2026): o md5 da linha `resolve` é o do **arquivo** — o corpo mudou
sem mudar colunas (`CREATE OR REPLACE` puro). Até o passo (3) abaixo, o banco responde com o md5 anterior
(`4badeb626e52a38a836aa5ead50a26c6`). Ver a seção seguinte.

## Redação fora do escopo (R2-DB-003, cartão t_891763fa) — versionado 05/10/2026, Singu pendente

Arquivo: `20261005103000_singu_resolve_redige_fora_escopo.sql` (neste diretório).

Mudança única: `public.multiplix_resolve_recipients`. Na projeção final, quando `no_escopo` é falso **ou** a
empresa está inativa, a RPC devolve `NULL` em `contact_id`, `company_name`, `empresa_papeis` e
`last_interaction_at` — além do que já era `NULL` (`destino_e164`, `destino_origem`). `company_id` fica (é o
id que o próprio chamador enviou — eco, não vazamento) e `elegibilidade` continua
`'fora_do_escopo'`/`'destino_invalido'` para a UI dizer "fora do escopo". Antes, a linha fora do escopo
carregava todos esses metadados até o cliente.

Mesma ordem do guard HMAC: (1) arquivo versionado → (2) deploy da edge `multiplix-audience` redigindo a
linha no ramo `resolve` → (3) aplicar este arquivo no Singu → (4) `md5` de volta na tabela acima. A ordem não
é crítica: a assinatura de entrada e o `RETURNS TABLE` não mudam, e a edge já redige por conta própria desde
o passo (2) — se o Singu ainda estiver na versão antiga, nada vaza.

**Aplicação no Singu é passo manual do dono** (este diretório não é aplicado por gate — ver a seção
seguinte). Rollback: reaplicar a definição de `20261001160000_singu_guard_hmac_escopo.sql`, linhas 243–351
(a `resolve` inteira; extrair com `sed -n '243,351p'`, md5 do arquivo `e826bc7a055b71d09f94d134cae37abb`).

## Por que não há migration aplicável por gate aqui

Estas funções pertencem ao Singu. O ciclo de DDL deste repositório (`arquivo → PR → merge → deploy →
apply`) não as alcança: o `hermes-db-migrar` aponta para o banco canônico do Zapp
(o projeto deste repositório), não para `pgxfvjmuubtbowutlide`. Os arquivos aqui são portanto **fonte de
revisão**, não de aplicação. Quem for alterar uma delas precisa aplicar no Singu por fora e **atualizar o
`md5` desta tabela** no mesmo PR, senão o espelho vira mentira silenciosa.
