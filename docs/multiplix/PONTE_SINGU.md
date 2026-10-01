# Multiplix — Ponte Singu: contrato das 5 RPCs, guard, escopo e cache (F29)

> Leitura do repositório em **2026-10-01**, branch
> `hermes/bloco-b-permissoes-cache-docs-26100112476e9c` (`HEAD` commitado = `8cbfb4f1`;
> a branch recebeu, durante a leitura, trabalho concorrente de outras etapas do Bloco B —
> em especial **F25/F26** em `supabase/functions/multiplix-audience/index.ts`).
> Itens **F21–F29** de `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`
> (linhas 49–57) e **F97** (linha 185). Estilo de `CANAL.md`/`PERMISSOES.md`.
>
> **Nada aqui foi medido contra o banco vivo nesta sessão.** Só é afirmado o que a leitura do
> repositório prova; o que depende do banco (assinatura SQL real das RPCs, contagens,
> `EXPLAIN`, tempos) entra marcado **PENDENTE** — sem número inventado.
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

Os **call sites existem** no repositório; as **definições SQL não** (F21 pendente, §6.1). A
"assinatura" abaixo é o que a edge envia e o que ela/o front consomem de volta — os nomes
dos parâmetros são exatos; os formatos de retorno vêm dos tipos do front
(`src/hooks/integrations/useMultiplixAudience.ts`), que a edge apenas repassa sem validar
(`index.ts:364-367`), **não** de um DDL conferível.

| RPC | Call site (arquivo:linha) | Parâmetros enviados (nomes exatos) | Retorno consumido |
|---|---|---|---|
| `multiplix_list_ramos` | `supabase/functions/multiplix-audience/index.ts:238-241` (RPC na linha 240) | nenhum | array de `{ ramo_atividade, total }` — `useMultiplixAudience.ts:48,71-77` |
| `multiplix_list_ufs` | `index.ts:244-247` (RPC na 246) | nenhum | array de `{ uf, total }` — `useMultiplixAudience.ts:49,79-85` |
| `multiplix_search_audience` | `index.ts:254-263` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email`, `p_page`, `p_page_size` | array de `{ company_id, company_name, ramo_atividade, uf, is_customer, is_supplier, is_carrier, destino_e164, destino_origem, motivo_inclusao }` — `useMultiplixAudience.ts:51-62,87-92` |
| `multiplix_count_audience` | `index.ts:270-277` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email` | `number` — `useMultiplixAudience.ts:94-99` |
| `multiplix_resolve_recipients` | `index.ts:284-289` **e** `index.ts:306-311` (re-resolução dentro de `create_draft`) | `p_company_ids`, `p_contact_ids`, `p_scope_permissions`, `p_scope_vendedor_email` | array de `{ company_id, contact_id, company_name, destino_e164, destino_origem, elegibilidade }` — `useMultiplixAudience.ts:101-108` · transformação na edge em `index.ts:124-134` (`elegibilidade='apto'` + `company_id` obrigatórios) |

Desenho pretendido dessas RPCs (ADR-007 D1): **`SECURITY DEFINER`**, recebem o escopo do
usuário ZAPP como parâmetro **assinado pela edge** e **não** têm `GRANT` para `anon`
(`docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md:26`).

### 2.1 O que ainda NÃO está no repo (F21 — PENDENTE)

- `supabase/migrations/_foreign/singu/` **não existe** (conferido por `ls`); logo não há
  arquivo com o `pg_get_functiondef` das 5, nem o `md5` exigido por F21, nem o README
  dizendo que o `db-guard` não as aplica.
- Consequência: a assinatura SQL real, os filtros de E016 (`deleted_at IS NULL`,
  `is_duplicate = false`), E017 ("Não informado" explícito, ordem por frequência) e E014
  (4 ramos de destino) **não são verificáveis por leitura do repo** — só por sessão com
  MCP do Singu.

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

### 3.2 Escopo assinado por HMAC (F22) — DESENHO, PENDENTE

O que o plano exige (F22, `PLANO_...:50`):

- a edge assina `p_scope` (**permissões + e-mail + `exp`**) com **HMAC-SHA256** usando o
  secret **`MULTIPLIX_SCOPE_HMAC_SECRET`** (novo — nas edges do ZAPP **e** no vault do Singu);
- a RPC recusa assinatura inválida ou expirada;
- assim a `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` sozinha (que o `crm-integration` também tem)
  deixa de conceder `admin`.
- **Feito quando:** chamada direta com a service key e
  `p_scope_permissions=['multiplix.audience.admin']` **sem assinatura** → erro.

Estado hoje (PENDENTE):

- `p_scope_permissions` e `p_scope_vendedor_email` trafegam **em claro**, sem assinatura
  (`index.ts:259-260`, `275-276`, `287-288`, `309-310`);
- o nome `MULTIPLIX_SCOPE_HMAC_SECRET` **não aparece em nenhum arquivo do repo** (`grep` = 0);
- nenhuma verificação de assinatura existe do lado do Singu (definições fora do repo, §2.1).

## 4. Cache de ramos e UFs na edge (F26)

Desenho do plano (F26, `PLANO_...:54`): cache de **5 min** de ramos e UFs na edge
(`Map` + TTL por isolate) com header **`x-cache: HIT|MISS`**; feito quando o segundo request
em 5 min não chama o Singu (log).

**Presente no código da branch em 2026-10-01** (`supabase/functions/multiplix-audience/index.ts`):

- `AUDIENCE_CACHE_TTL_MS = 5 * 60_000` (`:31`) e um `Map` por conjunto (`:40-43`);
- `fetchAudienceList(kind, rpcName, callRpc, _injected)` (`:48-65`): serve do cache dentro do
  TTL (`HIT`), senão chama a RPC e grava (`MISS`); **erro da RPC nunca entra no cache**;
- só `list_ramos`/`list_ufs` passam pelo cache (`:238-249`); as demais ações ficam sem header;
- o header é setado na resposta (`:370`, `response.headers.set('x-cache', cacheStatus)`) e o
  status entra no log estruturado (`:360-363`, campo `cache`).
- Cobertura de teste: `supabase/functions/multiplix-audience/index.test.ts:77-185`
  (MISS→HIT, expiração do TTL, erro não envenena, ramos/ufs independentes).

O cache **client-side** de 5 min (react-query `staleTime` em
`src/hooks/integrations/useMultiplixAudience.ts:75,83`) continua existindo e é independente
deste — o de F26 é no servidor.

## 5. Medições

Nenhuma medição de F23/F27/F28 existe no repositório. Tabela deliberadamente vazia (sem
placeholder numérico) — cada linha fecha quando a medição for feita e registrada.

| Medição exigida | Métrica de aceite | Estado | Evidência da ausência |
|---|---|---|---|
| `multiplix_count_audience` × query direta (papel×3, ramo, UF, texto) e combinado | 8 pares iguais | **PENDENTE** | `scripts/db-audit/multiplix-audience-parity.mjs` **não existe** (F23) |
| `multiplix_count_audience` sem filtro = `companies_ativas` | igual | **PENDENTE** | idem (F23) |
| `multiplix_resolve_recipients` com 1.000 IDs | < 1 s | **PENDENTE** | sem medição no repo; a edge limita a 500 por chamada (`index.ts:82-83`) (F27) |
| Busca combinada em ~57k empresas (`EXPLAIN ANALYZE`) | < 500 ms | **PENDENTE** | sem `EXPLAIN` anexado no repo (F28) |
| Índices `companies(is_supplier)`, `(is_carrier)`, `(ramo_atividade)`, `company_addresses(company_id, is_primary)` | só se o plano pedir | **PENDENTE** | depende do `EXPLAIN` — decisão não tomada (F28) |

Baseline de referência (NÃO é medição de F23/F27/F28 — medido em **2026-09-26** por outra
sessão, e números mudam): `docs/multiplix/ESTADO_INICIAL.md:40-45` — 57.675 empresas ativas,
754 `is_supplier`, 114 `is_carrier`, 566 ramos distintos. O único teto verificável hoje no
código é o de 500 ids por chamada de `resolve` (`index.ts:82-83`), abaixo dos 1.000 de F27.

## 6. Itens pendentes de decisão/execução (F21–F28)

### 6.1 F21 — versionar as 5 RPCs (🔒 PARA)
Colocar em `supabase/migrations/_foreign/singu/` o `pg_get_functiondef` ao vivo das 5 + README
dizendo que o `db-guard` **não** as aplica, com `md5(pg_get_functiondef)` registrado; corrigir
na mesma PR E016 (`deleted_at IS NULL`, `is_duplicate = false`), E017 ("Não informado"
explícito, ordem por frequência) e E014 (4 ramos de destino). Exige sessão com MCP do Singu.
**PENDENTE** — diretório inexistente.

### 6.2 F22 — guard HMAC nas RPCs (🔒 PARA) → ver §3.2.
### 6.3 F23 — prova de contagem → ver §5 (script inexistente).
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
retorno com papéis da empresa e `last_interaction_at`. **PENDENTE** — a edge limita a 500 ids
por chamada (`index.ts:82-83`) e o retorno consumido hoje não inclui papéis nem
`last_interaction_at` (`useMultiplixAudience.ts:101-108`).

### 6.7 F28 — `EXPLAIN ANALYZE` da busca combinada (🔒 PARA) → ver §5.

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
