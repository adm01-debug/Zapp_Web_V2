# Multiplix — Ponte Singu: contrato das 5 RPCs, guard, escopo e cache (F29)

> Leitura do repositório em **2026-10-01**, branch
> `hermes/bloco-b-permissoes-cache-docs-26100112476e9c` (`HEAD` commitado = `8cbfb4f1`;
> a branch recebeu, durante a leitura, trabalho concorrente de outras etapas do Bloco B —
> em especial **F25/F26** em `supabase/functions/multiplix-audience/index.ts`).
> Itens **F21–F29** de `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`
> (linhas 49–57) e **F97** (linha 185). Estilo de `CANAL.md`/`PERMISSOES.md`.
>
> A leitura original do repositório (2026-10-01) segue abaixo; os itens **F21/F22/F23/F27/F28**
> já foram medidos/aplicados e estão marcados **FEITO/APLICADO** com a prova nas seções. O que
> ainda depende de sessão com o banco vivo (ex.: **F24**, bloqueada) entra marcado **PENDENTE**
> — sem número inventado.
> Linhas citadas de `index.ts` conferem com o estado lido; reconfira por símbolo
> (`grep -n "<símbolo>" supabase/functions/multiplix-audience/index.ts`) se o arquivo tiver mudado.

## 1. Arquitetura da ponte

| Peça | Valor | Evidência no repo |
|---|---|---|
| Banco do público (Singu / Gestão de Clientes) | `pgxfvjmuubtbowutlide` (Supabase Cloud) | `CLAUDE.md:23` · `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md:13` |
| Edge mediadora | `supabase/functions/multiplix-audience` | `supabase/functions/multiplix-audience/index.ts` |
| Credenciais server-side | `EXTERNAL_SUPABASE_URL` / `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` (os mesmos do `crm-integration`; nenhum nome novo) | `index.ts:8-11,168-169` · ADR-007 `:22` e `:82` · `.github/workflows/deploy-functions.yml:173-174` |
| Validação do projeto/chave externos | `isExpectedExternalUrl` / `isExpectedExternalServerKey` | `index.ts:6,173` |
| Chamada do front | só a edge, com JWT; nenhuma URL/chave do Singu no navegador | `src/hooks/integrations/useMultiplixAudience.ts:7-10` · `src/integrations/supabase/externalClient.ts:1-4` |

O banco do ZAPP **não** alcança o Singu (projetos Supabase distintos, sem FDW/dblink) — por
isso a re-resolução de destinatários acontece **na edge**, que já tem o escopo do JWT
(`supabase/migrations/20260929630000_multiplix_create_draft.sql:17-24`).

## 2. Contrato das 5 RPCs (como o Zapp chama hoje)

Os **call sites existem** no repositório **e as definições SQL espelhadas também** (F21 feito,
§2.1): os espelhos em `supabase/migrations/_foreign/singu/` permitem conferir o DDL. A
"assinatura" abaixo é o que a edge envia e o que ela/o front consomem de volta — os nomes
dos parâmetros são exatos; os formatos de retorno vêm dos tipos do front
(`src/hooks/integrations/useMultiplixAudience.ts`), que a edge apenas repassa sem validar
(`index.ts:543-546`), **não** de uma validação de schema na própria edge.

| RPC | Call site (arquivo:linha) | Parâmetros enviados (nomes exatos) | Retorno consumido |
|---|---|---|---|
| `multiplix_list_ramos` | `supabase/functions/multiplix-audience/index.ts:379-381` (RPC na linha 380) | nenhum | array de `{ ramo_atividade, total }` — `useMultiplixAudience.ts:48,71-77` |
| `multiplix_list_ufs` | `index.ts:385-387` (RPC na 386) | nenhum | array de `{ uf, total }` — `useMultiplixAudience.ts:49,79-85` |
| `multiplix_search_audience` | `index.ts:391-403` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email`, `p_page`, `p_page_size` | array de `{ company_id, company_name, ramo_atividade, uf, is_customer, is_supplier, is_carrier, destino_e164, destino_origem, motivo_inclusao }` — `useMultiplixAudience.ts:51-62,87-92` |
| `multiplix_count_audience` | `index.ts:409-419` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email` | `number` — `useMultiplixAudience.ts:94-99` |
| `multiplix_resolve_recipients` | `index.ts:426-435` **e** `index.ts:451-460` (re-resolução dentro de `create_draft`) | `p_company_ids`, `p_contact_ids`, `p_scope_permissions`, `p_scope_vendedor_email` | array de `{ company_id, contact_id, company_name, destino_e164, destino_origem, elegibilidade }` — `useMultiplixAudience.ts:101-108` · transformação na edge em `index.ts:264-274` (`elegibilidade='apto'` + `company_id` obrigatórios) · **F27: chamada em lotes de 1.000 via `resolveRecipientsInBatches`, cada lote com `{ count: 'exact' }`** |

Desenho pretendido dessas RPCs (ADR-007 D1): **`SECURITY DEFINER`**, recebem o escopo do
usuário ZAPP como parâmetro **assinado pela edge** e **não** têm `GRANT` para `anon`
(`docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md:26`).

### 2.1 Espelhos das 5 RPCs versionados no repo (F21 — ✅ FEITO, 2026-10-01)

- `supabase/migrations/_foreign/singu/` existe com os **5 espelhos** — `multiplix_list_ramos.sql`,
  `multiplix_list_ufs.sql`, `multiplix_search_audience.sql`, `multiplix_count_audience.sql` e
  `multiplix_resolve_recipients.sql` — mais um `README.md` com o `md5` de ida **e** de volta
  ("md5 do repo == md5 do banco em **5/5**"); o README registra que o `db-guard` **não** aplica
  esse diretório `_foreign`.
- Com os espelhos no repo, os filtros de E016 (`deleted_at IS NULL`, `is_duplicate = false`),
  E017 ("Não informado" explícito, ordem por frequência) e E014 (4 ramos de destino) passam a
  ser conferíveis por leitura: a contagem real está em §5.1 e o E014 no
  `_foreign/singu/20261001154000_singu_e014_b2b_e_papeis.sql` (§6.1).

### 2.2 `multiplix_create_draft` NÃO é uma das 5 RPCs do Singu

É RPC do **ZAPP** (`supabase/migrations/20260929630000_multiplix_create_draft.sql:37`),
`SECURITY DEFINER`, chamada pela edge com o client canônico do ZAPP (`index.ts:318`) e
restrita a `service_role` (`...:61-63`, `...:151-152`). Não confundir com as 5 do Singu.

## 3. Guard e escopo

### 3.1 Identidade e papel resolvidos NO SERVIDOR (existe hoje)

- JWT validado por `requireAuth` (`index.ts:158-160`); rate limit 60/min por usuário+IP (`index.ts:162-163`).
- Papel/permissões lidos no ZAPP por `is_admin` + `user_has_permission` (`index.ts:195-202`),
  e o escopo é montado **a partir do JWT** (`index.ts:204-213`); sem nenhuma permissão →
  `403` (`index.ts:213`).
- O e-mail do vendedor só é buscado quando o escopo inclui `customers_own` (`index.ts:215-219`).
- O `body` carrega **apenas** filtros, paginação e ids (`index.ts:69-109`); o escopo
  **nunca** vem do front — campo desconhecido é descartado pelo schema zod (ADR-007 `:27`).

### 3.2 Escopo assinado por HMAC (F22) — ✅ APLICADO (2026-10-01)

O que o plano exige (F22, `PLANO_...:50`):

- a edge assina o escopo (**permissões + e-mail + `exp`**) com **HMAC-SHA256** usando o
  secret **`MULTIPLIX_SCOPE_HMAC_SECRET`** (nas edges do ZAPP **e** no vault do Singu);
- a RPC recusa assinatura inválida ou expirada;
- assim a `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` sozinha (que o `crm-integration` também tem)
  deixa de conceder `admin`.
- **Feito quando:** chamada direta com a service key e
  `p_scope_permissions=['multiplix.audience.admin']` **sem assinatura** → erro.

Estado hoje (✅ APLICADO, provado no repo e em produção):

- a edge assina o escopo uma vez por requisição: `scopeSignaturePayload` (payload
  `v1|permissões ordenadas asc|email|exp`, TTL 300 s, `index.ts:201-221`) e `signScope`
  (HMAC-SHA256 em hex, `index.ts:223-243`);
- a assinatura viaja em **CABEÇALHO** no cliente externo, nunca em parâmetro:
  `x-multiplix-scope-hmac` / `x-multiplix-scope-exp` (`index.ts:447-450`), ligados em
  `global.headers` (`index.ts:457-463`). Medido: um parâmetro novo muda o conjunto de nomes do
  corpo e o PostgREST devolve **404 PGRST202** — não existe ordem de deploy segura nesse
  desenho, por isso cabeçalho;
- sem `MULTIPLIX_SCOPE_HMAC_SECRET` na env a edge **não segue** (fail-closed): responde
  `multiplix_scope_secret_ausente` antes de chamar o Singu (`index.ts:433-436`);
- do lado do Singu, o guard
  `supabase/migrations/_foreign/singu/20261001160000_singu_guard_hmac_escopo.sql` recusa escopo
  sem assinatura: chamada direta **sem cabeçalho → `42501` escopo sem assinatura**;
- **provado em produção (2026-10-01):** edge real → **HTTP 200** (`agent` 5319, `supervisor`
  55930); `multiplix-scope.test.sh` → **43 PASS**. Detalhe em `_foreign/singu/README.md` e §6.2.

## 4. Cache de ramos e UFs na edge (F26)

Desenho do plano (F26, `PLANO_...:54`): cache de **5 min** de ramos e UFs na edge
(`Map` + TTL por isolate) com header **`x-cache: HIT|MISS`**; feito quando o segundo request
em 5 min não chama o Singu (log).

**Presente no código da branch em 2026-10-01** (`supabase/functions/multiplix-audience/index.ts`):

- `AUDIENCE_CACHE_TTL_MS = 5 * 60_000` (`:31`) e um `Map` por conjunto (`:40-43`);
- `fetchAudienceList(kind, rpcName, callRpc, _injected)` (`:48-65`): serve do cache dentro do
  TTL (`HIT`), senão chama a RPC e grava (`MISS`); **erro da RPC nunca entra no cache**;
- só `list_ramos`/`list_ufs` passam pelo cache (`:379-387`); as demais ações ficam sem header;
- o header é setado na resposta (`:516`, `response.headers.set('x-cache', cacheStatus)`) e o
  status entra no log estruturado (`:505-508`, campo `cache`).
- Cobertura de teste: `supabase/functions/multiplix-audience/index.test.ts:89-202`
  (MISS→HIT, expiração do TTL, erro não envenena, ramos/ufs independentes).

O cache **client-side** de 5 min (react-query `staleTime` em
`src/hooks/integrations/useMultiplixAudience.ts:75,83`) continua existindo e é independente
deste — o de F26 é no servidor.

## 5. Medições

F23 e F27 já medidas (2026-10-01); F28 segue pendente. Tabela sem placeholder numérico — cada
linha fecha quando a medição for feita e registrada.

| Medição exigida | Métrica de aceite | Estado | Evidência da ausência |
|---|---|---|---|
| `multiplix_count_audience` × query direta (papel×3, ramo, UF, texto) e combinado | 8 pares iguais | **MEDIDO — PASSA** | 11/11 pares iguais (2026-10-01) — `scripts/db-audit/multiplix-audience-parity.mjs` (RPC por PostgREST × SQL direto pela Management API, mesmo Postgres `pgxfvjmuubtbowutlide`). Ver §5.1 |
| `multiplix_count_audience` sem filtro = `companies_ativas` | igual | **MEDIDO — PASSA** | RPC sem filtro (escopo `admin`) = 57.314 = `count(*)` do SQL direto (2026-10-01). Ver §5.1 |
| `multiplix_resolve_recipients` com 1.000 IDs | < 1 s | **MEDIDO — PASSA** | 2 séries de 6 rodadas contra o Singu (2026-10-01): medianas **0,324 s** / **0,302 s**, máximos (sem a 1ª, fria) **0,519 s** / **0,457 s**. Ver §6.6 |
| Busca combinada em ~57k empresas (`EXPLAIN ANALYZE`) | < 500 ms | **PENDENTE** | sem `EXPLAIN` anexado no repo (F28) |
| Índices `companies(is_supplier)`, `(is_carrier)`, `(ramo_atividade)`, `company_addresses(company_id, is_primary)` | só se o plano pedir | **PENDENTE** | depende do `EXPLAIN` — decisão não tomada (F28) |

Baseline de referência (NÃO é medição de F23/F27/F28 — medido em **2026-09-26** por outra
sessão, e números mudam): `docs/multiplix/ESTADO_INICIAL.md:40-45` — 57.675 empresas ativas,
754 `is_supplier`, 114 `is_carrier`, 566 ramos distintos. O único teto verificável hoje no
código é o de 500 ids por chamada de `resolve` (`index.ts:82-83`), abaixo dos 1.000 de F27.

### 5.1 F23 — pares medidos (2026-10-01)

`node scripts/db-audit/multiplix-audience-parity.mjs` — escopo fixado em `admin`
(`'admin' = ANY(p_scope_permissions)`; o objetivo é provar os filtros, não o escopo).
Coluna A = `multiplix_count_audience` por PostgREST (caminho de produção da edge);
coluna B = `count(*)` com o MESMO `WHERE` do espelho `_foreign/singu/multiplix_count_audience.sql`,
rodado no mesmo Postgres pela Management API do Supabase. **11/11 pares iguais, exit 0.**

| Caso (filtro) | RPC (A) | SQL direto (B) | Igual |
|---|---|---|---|
| sem filtro | 57.314 | 57.314 | sim |
| papel=cliente | 55.450 | 55.450 | sim |
| papel=fornecedor | 754 | 754 | sim |
| papel=transportadora | 113 | 113 | sim |
| ramo=Cooperativas de Crédito | 10.698 | 10.698 | sim |
| uf=SP | 14.867 | 14.867 | sim |
| texto=credito | 3.379 | 3.379 | sim |
| **combinado** cliente + uf=SP | 14.684 | 14.684 | sim |
| **combinado** ramo=Coop.Crédito + uf=MG | 1.569 | 1.569 | sim |
| **combinado** texto=credito + uf=SP | 600 | 600 | sim |
| ramo=Não informado | 6.978 | 6.978 | sim |

Notas de execução: (i) o combinado citado no plano deu 0 — igualdade degenerada; por isso os
três combinados acima têm valor real. (ii) O ramo correto é `Cooperativas de Crédito` (**com**
acento) — a forma sem acento não casa (= 0); é a mesma string do espelho. (iii) Os números são
do banco vivo e derivam entre medições (UF/`is_primary` mudam): a exigência é A = B, não bater
com uma referência cravada. (iv) Sem `EXTERNAL_SUPABASE_URL`,
`EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` ou token (`~/.supabase/access-token`), o script **PULA** e
sai 0 (CI offline não quebra); sai != 0 se qualquer par diferir. (v) O caso `sem filtro` (count
de ~57k com LEFT JOIN) já estourou `statement_timeout` (57014) intermitente no PostgREST do
Singu — o script re-tenta 5xx/timeout/rede (nunca 4xx), para não falhar por hiccup de infra.

### 5.2 F28 — `EXPLAIN (ANALYZE, BUFFERS)` da busca combinada (2026-10-01)

Medido no Singu com `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`. **Critério do plano: < 500 ms.**

| caso | plano (nós principais) | tempo |
|---|---|---|
| **combinada** (papel + ramo + UF SP + texto) | `Bitmap Heap Scan on companies c` ← `Bitmap Index Scan on idx_companies_search` + `Index Scan using idx_company_addresses_primary` | **49,8 ms** |
| **página da busca** (`limit 50 offset 0`, o que a UI faz) | `Index Scan using companies_pkey` + `Seq Scan on company_addresses ca` | **0,9 ms** |

Conclusões:

- **Nenhum índice novo.** Os planos já usam `idx_companies_search` (busca textual) e
  `idx_company_addresses_primary`. Criar `companies(is_supplier)`, `(is_carrier)`, `(ramo_atividade)` não
  seria escolhido pelo planejador: o ramo lê ~19% de 57k linhas, patamar em que o `Seq Scan` sai mais
  barato — seria dívida de manutenção sem ganho de leitura.
- O `Seq Scan on company_addresses` na página é esperado e barato: são poucas linhas por página.
- Folga de ~10x sobre o critério. Não há nada a otimizar aqui.

## 6. Itens pendentes de decisão/execução (F21–F28)

### 6.1 F21 — versionar as 5 RPCs — ✅ FEITO (2026-10-01)
Diretório `supabase/migrations/_foreign/singu/` com os 5 espelhos + README: **md5 do repo == md5 do banco
em 5/5**. E016 e E017 já estavam implementados; **E014 divergia** (o degrau de `company_phones` não
restringia a B2B) e foi corrigido + aplicado (`20261001154000_singu_e014_b2b_e_papeis.sql`), com prova A/B
medida no retorno da RPC.

### 6.2 F22 — guard HMAC nas RPCs — ✅ APLICADO NO SINGU (01/10/2026)
Ver §3.2 (desenho) e o detalhe em `_foreign/singu/README.md`. O arquivo
`20261001160000_singu_guard_hmac_escopo.sql` foi **aplicado depois do deploy da edge assinando**. Provas
medidas em produção: chamada direta sem cabeçalho → `42501 escopo sem assinatura`; edge real → **HTTP 200**
(`agent` 5319, `supervisor` 55930); `multiplix-scope.test.sh` → **43 PASS**. A assinatura viaja em
**cabeçalho** (`x-multiplix-scope-hmac`/`-exp`), não em parâmetro: medido, parâmetro novo faz o PostgREST
devolver `404 PGRST202` e — como a chamada é casada pelo conjunto de nomes — **não existe ordem de deploy
segura** nesse desenho.
### 6.3 F23 — prova de contagem — ✅ FEITO (2026-10-01): `scripts/db-audit/multiplix-audience-parity.mjs`, 11/11 pares iguais → ver §5.
### 6.4 F24 — teste de escopo (⚠️ BLOQUEANTE)
`scripts/db-audit/multiplix-scope.test.sh` com 3 perfis reais (vendedor com carteira, Compras,
Logística) + escopo **forjado no body ignorado**; pré-requisito: criar no ZAPP 3 contas de
teste. **PENDENTE** — script não existe e só há contas admin/teste/CI
(`20260926150000_seed_multiplix_audience_permissions.sql:9-14`).

### 6.5 F25 — matriz perfil × papel × escopo
`PERMISSOES.md` + `role_permissions`: `admin` → `multiplix.audience.admin` +
`multiplix.dispatch.manage_all`; `supervisor` → `suppliers` + `carriers` + `customers.all` +
`multiplix.dispatch.create`; `agent` → `customers.own` + `multiplix.dispatch.create`; nav e
`ViewRouter` por permissão nomeada. **EM ANDAMENTO na branch (2026-10-01):** a matriz já está
escrita em `docs/multiplix/PERMISSOES.md` (seção "Matriz perfil × papel × escopo (F25)") e há
uma migration de seed em rascunho com versão reservada
(`supabase/migrations/__VERSAO___multiplix_role_permissions_matrix.sql`); o gate de
nav/`ViewRouter` (`src/services/navigation.service.ts`) também está em edição. Permissões de
público já no catálogo: `20260926150000_seed_multiplix_audience_permissions.sql:15-21`;
`multiplix.dispatch.manage_all`: `20260929640000_multiplix_dispatch_manage_all_permission.sql:18`.
Falta o que estiver fora dessas edições (conferir `role_permissions` no banco).

### 6.6 F27 — `multiplix_resolve_recipients` em lotes de 1.000
Paginação interna na edge, sem teto silencioso (o teto de política de F17 vira erro nomeado);
retorno com papéis da empresa e `last_interaction_at`.

**PARTE DA EDGE — FEITA (2026-10-01).** O teto não estava no SQL da RPC: o espelho de F21
(`supabase/migrations/_foreign/singu/multiplix_resolve_recipients.sql`, `md5`
`704c954dbebad98693ef7c95d96df950`, conferido ao vivo) **não tem `LIMIT` na entrada**. O teto
está na camada REST: o **PostgREST do Singu corta a resposta em 1.000 linhas** e devolve sucesso
com o resto descartado. Medido em 2026-10-01 contra o projeto real (contagem via
`content-range` com `Prefer: count=exact`):

| ids enviados numa chamada | HTTP | linhas devolvidas | `content-range` | descartado |
|---|---|---|---|---|
| 1.000 | 200 | 1.000 | `0-999/1000` | 0 |
| 1.200 | 206 | 1.000 | `0-999/1200` | **200, sem erro** |
| 2.000 | 206 | 1.000 | `0-999/2000` | **1.000, sem erro** |
| 5.001 | 206 | 1.000 | `0-999/5001` | **4.001, sem erro** |
| 10.000 | 206 | 1.000 | `0-999/10000` | **9.000, sem erro** |

O teto vale também para `contact_ids` e conta a **soma** dos dois arrays — cada `contact_id`
resolve para no máximo uma empresa DISTINCT:

| ids numa chamada | HTTP | linhas | `count` | descartado |
|---|---|---|---|---|
| 1.000 `contact_ids` | 200 | 809 | 809 | 0 (≤ 1 linha por id) |
| 2.000 `contact_ids` | 206 | 1.000 | 1.506 | **506, sem erro** |
| 600 empresas + 600 contatos | 206 | 1.000 | 1.116 | **116, sem erro** |

Essa última linha é a razão de `planResolveBatches` fatiar pela **soma**: 600+600 num lote só
perderia 116 empresas em silêncio.

O que a edge passou a fazer (`supabase/functions/multiplix-audience/index.ts`):

- `RESOLVE_RPC_MAX_ROWS = 1.000` (`:111`) — o teto medido, cravado com a data;
- `planResolveBatches` (`:160-184`) reparte em lotes contando **company_ids + contact_ids
  juntos** (cada `contact_id` vira até uma empresa distinta, então o teto de linhas vale para a
  soma); a soma dos ids dos lotes é exatamente o total recebido;
- `resolveRecipientsInBatches` (`:193-219`) chama a RPC uma vez por lote, pede
  `{ count: 'exact' }` e **recusa** `data.length < count` com o erro nomeado
  `multiplix_resolve_truncated` — se o `max-rows` do Singu mudar, vira erro em vez de resultado
  pela metade;
- os dois call sites (`:426-435` em `resolve`, `:451-460` dentro de `create_draft`) usam o mesmo
  caminho;
- teto de POLÍTICA `RESOLVE_POLICY_MAX_IDS = 10.000` (`:114`) → HTTP 400 com corpo
  `{ error: 'multiplix_over_policy_limit', count, limit, message }` (o `over_policy_limit` que
  F47 cita), **nunca truncamento**; e `RESOLVE_REQUEST_MAX_IDS = 20.000` (`:122`) é só a guarda
  de transporte do Zod (corpo grande demais é recusado antes de qualquer trabalho, senão o teto
  nomeado nunca teria chance de responder).
- **Medição:** 1 lote de 1.000 ids → 2 séries de 6 rodadas, medianas **0,324 s** e **0,302 s**,
  máximos (sem a 1ª, fria) **0,519 s** e **0,457 s** — abaixo do 1 s exigido. 5.001 ids em 6
  lotes: 5.001 linhas íntegras em **4,995 s** e **2,001 s** (as duas séries; é o caso de F47).
  Evidência bruta: `.tmp/medicao-f27/` (scripts + saídas + ids reais usados).
- Testes: `index.test.ts:216-365` (8 casos: repartição, contagem conjunta, teto nomeado,
  2.500 ids → 3 chamadas sem perda, RPC capada em 1.000 não perde 200, resposta parcial vira
  erro, erro de lote derruba o pedido, teto conferido antes de chamar o Singu).

**FEITO DO LADO DO SINGU (2026-10-01).** Escrita autorizada pela decisão `20261001-152728-906f` (= A).
O `RETURNS TABLE` da RPC (`multiplix_resolve_recipients.sql:2`) ganhou `empresa_papeis text[]` e
`last_interaction_at timestamptz` — como a assinatura de retorno muda, `CREATE OR REPLACE` não serve
(`42P13`): a migração `supabase/migrations/_foreign/singu/20261001154000_singu_e014_b2b_e_papeis.sql` faz
`DROP` + `CREATE` e restaura a ACL (`service_role` executa; `anon`/`authenticated` não — default privileges
do Supabase reseedados pelo DROP são revogados de volta). Ela também aplica o E014 (telefone da empresa só
para B2B: `AND (av.is_supplier OR av.is_carrier)`). `last_interaction_at` vem de
`COALESCE(contacts.last_interaction_at, max(interactions.data_interacao) por contato)`: a coluna
`contacts.last_interaction_at` existe mas está **0/4748 preenchida**, e `public.interactions`
(10.461 linhas, 100% com `data_interacao`) é a fonte populada que a própria view `v_company_summary` usa
como `last_interaction`. O `md5` novo (`525e84b737a03959db8e9f5ddefbe274`) já está na tabela do README dos
espelhos. A ação `resolve` da edge continua repassando as colunas como vierem (basta a RPC devolver mais),
e o consumidor do front (`useMultiplixAudience.ts:101-108`) segue tipando só as 6 colunas de hoje — passa a
poder usar as duas novas.

### 6.7 F28 — `EXPLAIN ANALYZE` da busca combinada — ✅ FEITO, **nenhum índice novo** → ver §5.2.

## 7. GATE C (F97) — caminho de fechamento

Detalhado em `docs/crm-external-grants.md` (§ "Caminho de fechamento do GATE C (F97)"). Resumo:
migrar as chamadas restantes para o caminho com service key + guard (F22), revogar
`GRANT EXECUTE ... TO anon` das **5 RPCs antigas** do Singu, provar
`has_function_privilege('anon', …) = false` nas 5 e manter Chat/CRM 360 intactos
(`PLANO_...:185`). As 5 RPCs novas do Multiplix **não** entram nessa revogação — nascem sem
`GRANT` para `anon` (ADR-007 `:26`).

## Referências

- `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md` — F21–F29 (49–57), F97 (185)
- `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` — D1 (22–28), D4 (70–74)
- `docs/multiplix/PERMISSOES.md` (inclui a matriz F25) · `docs/multiplix/ESTADO_INICIAL.md` · `docs/multiplix/CANAL.md`
- `docs/crm-external-grants.md` — GRANTs das 5 RPCs antigas
- `supabase/functions/multiplix-audience/index.ts`, `.../index.test.ts`, `supabase/functions/crm-integration/index.ts`
- `src/hooks/integrations/useMultiplixAudience.ts`
- `supabase/migrations/20260929630000_multiplix_create_draft.sql`,
  `20260929640000_multiplix_dispatch_manage_all_permission.sql`,
  `20260926150000_seed_multiplix_audience_permissions.sql`
