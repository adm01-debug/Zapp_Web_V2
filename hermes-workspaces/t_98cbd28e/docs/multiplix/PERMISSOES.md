# Multiplix — Permissões e escopo por carteira (E007/E015)

Complementa `ESTADO_INICIAL.md` e o ADR-007. Este arquivo cobre dois pontos que a
descoberta inicial não fechou: o modelo de permissão do ZAPP e — **correção
verificada por query direta no Singu** — qual coluna carrega de fato a carteira do
vendedor.

## ZAPP não tem departamento — tem role + permissão nomeada

`src/hooks/system/usePermissions.ts` + `supabase/migrations/20251215025014_*.sql`:
`user_roles` (role por usuário) → `role_permissions` (permissão por role) →
`permissions` (catálogo) → RPC `user_has_permission`. Enum `app_role` base:
`('admin', 'supervisor', 'agent')`, ampliado depois para incluir `special_agent`
(`supabase/migrations/20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql:2`).
**Não existe "departamento" nem "carteira" no
ZAPP.** "Vendedor → carteira", "Compras → fornecedores", "Logística →
transportadoras" (E015 do plano) só existem do lado Singu.

## Correção: `companies.user_id` NÃO é a carteira do vendedor

O `ESTADO_INICIAL.md` (medição da outra sessão) registra: *"`companies.user_id` é a
carteira"*. **Verificado por query direta no Singu nesta sessão: é falso.**

```sql
select
  count(*) filter (where c.user_id is not null) as com_user_id,
  count(*) filter (where c.user_id is not null and u.id is not null) as bate_com_auth_users
from public.companies c
left join auth.users u on u.id = c.user_id;
-- com_user_id = 3833, bate_com_auth_users = 0
```

3.833 empresas têm `companies.user_id` preenchido — **zero** batem com `auth.users`
do próprio Singu. Não é referência a usuário nenhum reconhecível (provavelmente
resíduo de import do Bitrix). **A carteira real é outra tabela:**

- `public.customers.vendedor_id` (integer) → `public.users.id` (staff interno do
  Singu, tabela própria `id/name/email/is_vendedor/is_active/departamento`, **não**
  é `auth.users`).
- View já existente `vw_carteira_vendedores` confirma o padrão: `customers cu JOIN
  users u ON cu.vendedor_id = u.id`.
- `public.users.email` bate com e-mails reais dos dois lados — ex.: `adm01@promobrindes.com.br`
  existe em `auth.users` do ZAPP **e** em `public.users`/`auth.users` do Singu.

## Vínculo usuário ZAPP ↔ vendedor Singu: por e-mail, sem tabela nova

Não é preciso criar tabela de mapeamento. A edge `multiplix-audience` (E020) resolve
assim, depois de validar o JWT do ZAPP:

1. Pega o e-mail do usuário ZAPP autenticado (`auth.users.email`, já no JWT).
2. Passa esse e-mail como parâmetro para a RPC do Singu.
3. Dentro da RPC (`SECURITY DEFINER`): `SELECT id FROM public.users WHERE email =
   :email AND is_vendedor = true AND is_active = true` → dá o `vendedor_id`.
4. Escopo "carteira própria" = `EXISTS (SELECT 1 FROM customers cu WHERE
   cu.company_id = c.id AND cu.vendedor_id = :vendedor_id)`.

Se o e-mail não bater com nenhum `public.users` do Singu (caso de hoje: os únicos
usuários ZAPP são `admin`/`agent`/`ti`, não os `comercial01..09@promobrindes.com.br`
que são os vendedores reais no Singu), o escopo "carteira própria" simplesmente não
resolve nenhuma empresa — comportamento seguro por padrão, não um erro.

## Proposta de permissões nomeadas (E015)

> Catálogo **já aplicado** no banco por `supabase/migrations/20260926150000_seed_multiplix_audience_permissions.sql`
> (as 5 permissões existem na tabela `permissions`; nenhuma linha em `role_permissions`
> ainda — ver a matriz F25 abaixo para a atribuição a papel).

Novas permissões no catálogo já existente (`permissions`/`role_permissions`), sem
tabela nova:

| Permissão | Efeito no filtro da RPC |
|---|---|
| `multiplix.audience.suppliers` | `is_supplier = true` |
| `multiplix.audience.carriers` | `is_carrier = true` |
| `multiplix.audience.customers.own` | `is_customer = true` **e** dentro da carteira do vendedor (via e-mail, acima) |
| `multiplix.audience.customers.all` | `is_customer = true`, sem filtro de dono |
| `multiplix.audience.admin` | ignora as regras acima |

O filtro aplica-se **dentro da RPC do Singu**, nunca no front (E015/E020).

## Matriz perfil × papel × escopo (F25)

Papéis que **existem hoje no banco**: `app_role` = `('admin', 'supervisor', 'agent')`
(`supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql:2`)
**+ `special_agent`** (`supabase/migrations/20260329175853_8f18172f-981a-4c58-b505-ce1630af8ab6.sql:2`;
mesmo enum no front, `src/services/role.service.ts:3`). São esses 4 — a matriz não
inventa papel.

Legenda: **✅** = atribuição já versionada (existe hoje); **🎯** = alvo da etapa F25
(`role_permissions` a semear numa migration que **ainda não está neste repo**);
**—** = não atribuído.

> **Nomenclatura — shorthand do plano × nome real medido.** O plano cita as permissões
> de audiência de forma abreviada (`suppliers`, `carriers`, `customers.all`,
> `customers.own`); os nomes **reais** na tabela `permissions` carregam o prefixo
> `multiplix.audience.`. Este doc usa sempre o **nome completo**. Fonte: SELECT no banco
> canônico (líder, 2026-10-01) — as 5 permissões existem no catálogo e **0 linhas** em
> `role_permissions` as ligam a papel algum (bate com o comentário da migration
> `20260926150000_seed_multiplix_audience_permissions.sql:3-4`). `multiplix.dispatch.create`
> **não existe ainda**: é criada na migration de `role_permissions` (F25 parte 1) e é ela
> que vai gatear a rota `/multiplix`.

### 1. Papel × permissão nomeada

| Papel (`app_role`) | `multiplix.audience.admin` | `multiplix.audience.suppliers` | `multiplix.audience.carriers` | `multiplix.audience.customers.own` | `multiplix.audience.customers.all` | `multiplix.dispatch.create` | `multiplix.dispatch.manage_all` |
|---|---|---|---|---|---|---|---|
| `admin`        | 🎯 | — | — | — | — | 🎯 (nota ¹) | ✅ |
| `supervisor`   | — | 🎯 | 🎯 | — | 🎯 | 🎯 | — |
| `agent`        | — | — | — | 🎯 | — | 🎯 | — |
| `special_agent`| — | — | — | — | — | — | — |

¹ O texto literal da F25 (plano, linha 53) atribui a `admin` só `multiplix.audience.admin`
e `multiplix.dispatch.manage_all` — **não** lista `multiplix.dispatch.create`. Isso é uma
lacuna do enunciado: se o gate de nav/rota passa a ser exclusivamente pela permissão
nomeada (como a mesma etapa pede), `admin` também precisa dela para ver `/multiplix`.
A migration de `role_permissions` em construção (F25 parte 1) liga
`multiplix.dispatch.create` a `admin`, `supervisor` e `agent` — resolvendo a lacuna.

**O que existe hoje, de fato:** a única linha `role_permissions` de permissão Multiplix
versionada no repo é `admin → multiplix.dispatch.manage_all`
(`supabase/migrations/20260929640000_multiplix_dispatch_manage_all_permission.sql:17-28`).
As 5 permissões de audiência estão no catálogo `permissions`
(`20260926150000_seed_multiplix_audience_permissions.sql:16-20`) mas **sem nenhuma
atribuição a papel** — a própria migration registra isso ("sem nenhuma linha em
`role_permissions`", linhas 3-4). Até o seed F25 rodar, quem abre escopo na edge é apenas
`is_admin()` (fallback), não a permissão nomeada.

### 2. Permissão → escopo → o que libera na prática

| Permissão nomeada | Escopo | O que libera (tela / rota / RPC / edge) |
|---|---|---|
| `multiplix.audience.admin` | **admin** — vê e conta qualquer audiência, ignorando as demais regras | edge `multiplix-audience`, `scopePermissions=['admin']` (`supabase/functions/multiplix-audience/index.ts:197,204-206`) → `search`/`count`/`resolve`/`create_draft` sem restrição de segmento nem de dono |
| `multiplix.audience.suppliers` | **segmento** fornecedores (`is_supplier = true`) | edge, `scope='suppliers'` (`index.ts:198,208`) → vira `p_scope_permissions` das RPCs `multiplix_search_audience`/`multiplix_count_audience` (`index.ts:243-257,259-271`) |
| `multiplix.audience.carriers` | **segmento** transportadoras (`is_carrier = true`) | edge, `scope='carriers'` (`index.ts:199,209`) |
| `multiplix.audience.customers.own` | **carteira própria** — só os clientes do vendedor | edge, `scope='customers_own'` + e-mail do JWT resolvido a `vendedor_id` no Singu (`index.ts:201,211,217-218`) |
| `multiplix.audience.customers.all` | **todos** os clientes (`is_customer = true`, sem filtro de dono) | edge, `scope='customers_all'` (`index.ts:200,210`) |
| `multiplix.dispatch.create` | n/a — é **gate de navegação/acesso** | item de nav `multiplix` + rota `/multiplix`, via `NavigationService`/`ViewRouter.canAccess` (alvo F25/F71, plano linhas 53 e 152). **Hoje** a fonte `navigation.service.ts` ainda filtra por papel `STAFF_ROLES` (`src/services/navigation.service.ts:34,44`) e `canAccess` só olha papéis (`navigation.service.ts:159-169`, chamado em `src/pages/ViewRouter.tsx:131`) |
| `multiplix.dispatch.manage_all` | n/a — é **operação de disparo** | edge `multiplix-send`: iniciar/pausar/cancelar disparo de **outro** dono (`supabase/functions/multiplix-send/index.ts:94,124-130`); catálogo + atribuição a `admin` em `20260929640000_multiplix_dispatch_manage_all_permission.sql:17-28` |

### 3. Perfil de negócio (F24) → papel (F25)

| Perfil de negócio (F24) | Papel (`app_role`) | Escopo resultante |
|---|---|---|
| Vendedor / Comercial com carteira | `agent` | `multiplix.audience.customers.own` (só a própria carteira) + `multiplix.dispatch.create` |
| Compras | `supervisor` | `multiplix.audience.suppliers` (+ `.carriers` + `.customers.all` — a F25 dá os três ao mesmo papel) |
| Logística | `supervisor` | `multiplix.audience.carriers` (+ `.suppliers` + `.customers.all` — idem) |
| Gestão / Admin | `admin` | `multiplix.audience.admin` (qualquer audiência) + `multiplix.dispatch.manage_all` |

> **Incerteza registrada:** a F25 atribui `multiplix.audience.suppliers` **e**
> `multiplix.audience.carriers` **e** `multiplix.audience.customers.all`
> ao mesmo papel `supervisor`. Como `role_permissions` é por papel (não por usuário),
> um `supervisor` vê os dois segmentos e todos os clientes — a separação fina entre
> "Compras" e "Logística" não sai da matriz F25 como está escrita. Se o produto quiser
> separá-los, seria preciso um papel por segmento (novo valor no enum) ou permissão por
> usuário; nenhum dos dois está no repo hoje.

### 4. Estado atual × alvo (para não confundir documentação com banco)

- **Hoje:** catálogo `permissions` com as 6 permissões Multiplix
  (`20260926150000_...sql:16-20` + `20260929640000_...sql:17-19`); `role_permissions`
  só com `admin → multiplix.dispatch.manage_all`. Escopo da edge aberto por `is_admin()`.
- **Alvo F25:** `role_permissions` com `admin → multiplix.audience.admin +
  multiplix.dispatch.manage_all`; `supervisor → multiplix.audience.suppliers +
  multiplix.audience.carriers + multiplix.audience.customers.all +
  multiplix.dispatch.create`; `agent → multiplix.audience.customers.own +
  multiplix.dispatch.create` (é o texto literal do plano, linha 53).
  Essa semeadura é uma migration **a criar** (fora do escopo deste arquivo — o F25
  inteiro parte 2). O gate de nav/rota deixa de ser por papel e passa a ser a permissão
  nomeada `multiplix.dispatch.create`.

## Regra de escopo (F24) — o escopo nunca vem do body

- `multiplix.audience.customers.own` → **somente a própria carteira**. Resolvido no
  servidor: e-mail do JWT → `public.users` do Singu (`is_vendedor = true AND is_active = true`)
  → `vendedor_id`; o filtro é `EXISTS (... cu.vendedor_id = :vendedor_id)`
  (`index.ts:211,217-218` e a cadeia de escopo em `index.ts:190-211`).
- `multiplix.audience.customers.all` → **todos os clientes** (`is_customer = true`, sem
  filtro de dono; `index.ts:200,210`).
- `multiplix.audience.suppliers` / `multiplix.audience.carriers` → **segmentos**
  (`is_supplier` / `is_carrier`; `index.ts:198-199,208-209`).
- `multiplix.audience.admin` → **vê e conta qualquer audiência**, ignorando as demais
  regras (`index.ts:197,204-206`).

**O escopo é derivado exclusivamente do JWT validado na edge** (`requireAuth`,
`index.ts:158`), nunca do corpo da requisição. O corpo (`RequestSchema`,
`index.ts:106-109`) só carrega `action` + `params`; `params` só aceita filtros de
audiência (`roles`, `ramo`, `uf`, `search` — `FiltersSchema`, `index.ts:69-74`) e a
seleção de ids (`company_ids`, `contact_ids`) nos casos `resolve`/`create_draft`
(`ResolveParamsSchema`/`CreateDraftParamsSchema`, `index.ts:81-104`). **Não existe campo
de permissão/escopo no schema do body.** O `p_scope_permissions` enviado ao Singu é
montado *apenas* a partir de `user_has_permission` sobre o `userId` do JWT
(`index.ts:190-211`). Portanto um escopo forjado no body (ex.:
`{"p_scope_permissions":["admin"]}`) é **ignorado** — é exatamente o que o F24 vai provar
em `scripts/db-audit/multiplix-scope.test.sh` (plano, linha 52).

## Testes e evidências (F24) — contas de escopo e execução medida

### Contas de teste de escopo criadas no ZAPP (2026-10-01)

Pré-requisito do F24 (plano, linha 50). Criadas via Admin API de auth + tabelas
`profiles`/`user_roles`/`role_permissions` (matriz F25). **Senha aleatória, 28
caracteres, gravada apenas em `~/.secrets/zapp-multiplix-escopo.env` (chmod 0600,
fora do repo) — nunca em log, commit ou documento.**

| Perfil de negócio | Papel (`app_role`) | E-mail | `user_roles.user_id` |
|---|---|---|---|
| Vendedor com carteira | `agent` | `comercial01@promobrindes.com.br` | `ce48bee0-8e75-42fa-9c84-af4c20a5de28` |
| Compras | `supervisor` | `multiplix.compras@promobrindes.com.br` | `d2229ada-f924-4453-bb62-121eb52ead32` |
| Logística | `supervisor` | `multiplix.logistica@promobrindes.com.br` | `ab2d4b9b-d748-41c9-9649-7c4b4f15b70c` |

- O e-mail do vendedor é o de um **vendedor real do Singu** (`public.users` id 11,
  `is_vendedor=true`) **de propósito**: o vínculo carteira↔usuário ZAPP é por e-mail
  (ver acima) e o Singu está sob autorização **somente leitura** — não há como criar
  um vendedor com carteira sem reusar um e-mail existente. Ele resolve pela RPC para
  `vendedor_id=11`, cuja carteira tem clientes reais.
- Cada conta tem **exatamente um papel**: o `agent` auto-provisionado pelo trigger
  `handle_new_user_role` foi substituído pelo papel alvo (senão um `supervisor`
  herdaria também `customers.own`, mudando o escopo).
- Permissões efetivas medidas por `user_has_permission`: `comercial01` →
  `customers.own` + `dispatch.create`; **as duas contas `supervisor`** →
  `suppliers` + `carriers` + `customers.all` + `dispatch.create`.

### O que `scripts/db-audit/multiplix-scope.test.sh` prova (e o que não prova)

- **BLOCO 1 (estático, sempre roda no CI):** o schema do corpo da edge
  (`RequestSchema`) só aceita `action` + `params`; `params` só carrega filtros de
  audiência; a edge nunca lê `p_scope_*`/`scope`/`permission` de `params`; e
  `scopePermissions` só é montado a partir de `user_has_permission`/`is_admin`.
- **BLOCO 2 (ao vivo, PULA e sai 0 sem credenciais):** com as 3 contas reais, faz
  login (JWT) e chama a edge `multiplix-audience` **deployada**, comparando cada
  contagem com a RPC do Singu chamada direto com o mesmo escopo (dois caminhos
  independentes), e manda **escopo forjado no corpo** (`p_scope_permissions:["admin"]`
  em `params` e no topo, mais `scope`) exigindo que seja ignorado.
- **Não prova:** o gate de nav/rota `/multiplix` (`multiplix.dispatch.create`), RLS de
  tabela, nem varre todo o conteúdo das linhas de `search` (amostra).

### Execução real (2026-10-01, edge + Singu reais)

`bash scripts/db-audit/multiplix-scope.test.sh` → **39 asserções, 0 falhas** (BLOCO 1
5/5; BLOCO 2 34/34). Contagens medidas (`count` da edge):

| Perfil | sem filtro | cliente | fornecedor | transportadora |
|---|---|---|---|---|
| admin (referência direta) | 57.314 | 55.450 | 754 | 113 |
| supervisor (Compras = Logística) | 55.930 | 55.450 | 754 | 113 |
| vendedor (agent, carteira) | 5.319 | 5.319 | **0** | 1 ¹ |

¹ O vendedor "vê" 1 transportadora porque ela **também está na carteira dele**
(`customers_own`) — o ramo de escopo é a carteira, não `carriers`. O agente não tem
`multiplix.audience.carriers` (a sonda de escopo admin direto devolve 113).

Escopo forjado no corpo: o vendedor mandou `["admin"]` e continuou contando **5.319**
(não os 55.450 de admin); o supervisor mandou `["customers_own"]` e continuou em
**55.450** (não 0, que seria o resultado da carteira dele, inexistente). Forjado
**ignorado** em ambos.

> **Incerteza F25 agora medida:** Compras e Logística são ambos `supervisor` e as duas
> contas devolvem **exatamente o mesmo** número para os 4 filtros — não há separação
> fina entre os perfis com a matriz como está escrita (ver §3).

## Voz (F64) — quem enxerga qual voz

`multiplix_voice_grants` concede o uso de uma voz **por papel** (`roles`, enum `app_role`) **ou por
perfil** (`perfis`, uuid de `profiles`), com `origem` (o contrato/autorização) e `revoked_at`. A
revogação é a única forma de tirar o acesso: corta **a lista** (`multiplix-voices` → `voices.list`,
que responde "quais vozes eu posso usar", e por isso **não** oferece voz revogada nem ao admin) e
corta **a recuperação do asset** (`assets.sign` → `403`) mesmo que o áudio continue no bucket.

Duas armadilhas medidas na implementação, que valem para qualquer tabela nova do módulo:

1. **Policy que lê outra tabela sofre a RLS dessa outra tabela.** A policy de leitura de
   `multiplix_voice_assets` consulta `multiplix_voice_grants`; como a RLS de `multiplix_voice_grants`
   já filtra `revoked_at IS NULL` para o chamador, a checagem de revogação escrita na policy dos
   ativos fica **mascarada** — mutar só ela não derruba nenhum teste. Por isso o red-first muta a
   policy de `multiplix_voice_grants` (`scripts/db-audit/f64-voz-assets-e-grants.test.sh`).
2. **`authenticated` não lê `user_roles`.** Policy escrita com `exists (select 1 from user_roles ...)`
   funciona em teste de fixture e **quebra em produção** com `permission denied for table user_roles`.
   O padrão do módulo é chamar `public.has_role(auth.uid(), papel)` e
   `public.is_admin_or_supervisor(auth.uid())` — ambas `SECURITY DEFINER`.

ACL de `multiplix_voice_assets`/`multiplix_voice_grants`: `anon` fora; `authenticated` **só
`SELECT`** (as policies apenas leem — quem grava é a edge, com a service key); `service_role` no
módulo. A edge `multiplix-voices` usa o cliente service e **reimplementa a mesma regra de forma
explícita** (`grantReachesCaller`/`canRecoverAsset`, testadas sem banco em `index.test.ts`): a policy
é a segunda camada, para quem consultar a tabela por outro caminho.

