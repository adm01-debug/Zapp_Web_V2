# SECURITY — módulo Catálogo (ZAPP Web V2)

Documento de segurança **do módulo de catálogo** (`src/components/catalog/**`,
`src/hooks/integrations/use*Catalog*`, `supabase/functions/promogifts-catalog`,
migrations `catalog_*`). É **outro arquivo** que o `SECURITY.md` da raiz
(política geral de reporte de vulnerabilidade do projeto) — aquele continua
sendo a porta de entrada para reportar falhas; este aqui é a descrição técnica
do que o módulo garante hoje e do que ainda **não** está provado.

Tudo abaixo é **lido do código e das migrations**, com `arquivo:linha`. O que
não foi exercitado em runtime está dito como tal (não se presuma que passou por
teste o que só foi lido).

---

## 1. Tabelas do módulo e RLS

### 1.1 `public.catalog_favorites` — favoritos por agente

- Colunas: `id uuid pk`, `user_id uuid not null references auth.users(id) on delete cascade`,
  `product_id uuid`, `product_name text`, `product_sku text`, `primary_image_url text`,
  `created_at`, com **`unique (user_id, product_id)`** — `20260913013153_catalog_favorites.sql:7-16`.
  `product_id` aponta para o produto no **PromoGifts** (banco externo, Supabase Cloud
  separado): **não há FK possível**, é um uuid solto (`:5-6`).
- **RLS ligada:** `alter table public.catalog_favorites enable row level security;`
  (`20260913013153_catalog_favorites.sql:18`).
- **Policy única `FOR ALL`**, restrita ao dono da linha (`:20-23`):
  `using (user_id = auth.uid())`. Reescrita depois com **`TO authenticated`**
  (`20260925130000_add_to_authenticated_catalog_send_events_favorites.sql:23-29`) —
  o `USING` não mudou; o que mudou foi o escopo: antes rodava para a role
  `public` (que no RLS do Supabase **inclui `anon`**), agora só para
  `authenticated`.

### 1.2 `public.catalog_send_events` — log append-only de envios

- Tabela criada em `20260913122557_catalog_send_events.sql:9-23`. `agent_id`
  referencia **`profiles(id)`** (não `auth.users` direto — é o atendente no
  app), `ON DELETE SET NULL`; `contact_id` referencia `contacts(id)`
  `ON DELETE CASCADE`.
- **RLS ligada:** `:25`.
- Duas policies (não uma `FOR ALL`, porque é log de atividade com visibilidade
  restrita — `:7-8`):
  - **INSERT** (`:27-34`): `with check (agent_id is null or agent_id in
    (select profiles.id from public.profiles where profiles.user_id = auth.uid())
    or is_admin_or_supervisor(auth.uid()))`. **Endurecida** em
    `20260924123033_fix_catalog_send_events_insert_policy_anon_bypass.sql:3-10`:
    a versão antiga aceitava `agent_id is null` como **bypass do `anon`**
    (qualquer um podia inserir linha sem agente); a nova cláusula exige
    `agent_id` de um profile do próprio usuário **ou** admin/supervisor, e a
    policy passa a ser declarada **`TO authenticated`**.
  - **SELECT** (`20260913122557_catalog_send_events.sql:36-42`): `using (agent_id
    in (select profiles.id from public.profiles where profiles.user_id = auth.uid())
    or is_admin_or_supervisor(auth.uid()))`. Reescrita com **`TO authenticated`**
    em `20260925130000_add_to_authenticated_catalog_send_events_favorites.sql:12-21`
    (mesmo `USING`, escopo restringido).
  - **Não existem policies de UPDATE nem DELETE** — por desenho: é log
    append-only (ver §2).

---

## 2. Grants pós-CT-01 (endurecimento de privilégios)

Migration `20260929650000_catalog_grants_append_only.sql` (bloco A do plano de
finalização, CT-01/CT-02). Medição que motivou o corte, registrada na própria
migration (`:4-9`): **antes**, `anon` e `authenticated` tinham os 7 privilégios
de tabela (`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`) **e** os
privilégios de coluna correspondentes nas duas tabelas.

Problema: `TRUNCATE`, `REFERENCES` e `TRIGGER` **não são cobertos por RLS** — uma
sessão `authenticated` com acesso REST podia **esvaziar** o log de envios e os
favoritos sem passar por policy alguma (`:11-14`). Como a `anon` key é pública
por desenho, os grants eram superfície pura.

Forma final aplicada (`:32-43`):

- `REVOKE ALL PRIVILEGES (colunas…) / ON TABLE` de `anon, authenticated` nas
  **duas** tabelas — o revoke de **coluna** é explícito porque sobrevive a um
  `REVOKE ... ON TABLE` (`:13-15`, `:32-37`).
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_favorites TO authenticated;` (`:42`)
  — favoritos são CRUD do próprio dono.
- `GRANT SELECT, INSERT ON public.catalog_send_events TO authenticated;` (`:43`)
  — log append-only: sem `UPDATE`/`DELETE` o PostgREST recusa antes de avaliar
  policy (`:17-19`).
- `anon` **não recebe grant nenhum** em nenhuma das duas.

`service_role`, `postgres` e `supabase_admin` **não** são tocados (`:30`).

---

## 3. View `public.catalog_send_stats` — `security_invoker = on`

Criada em `20260930740000_catalogo_send_stats.sql` (CT-48). Agrega os envios em
três grãos (dia/30d, agente, produto) com contagem de `sent`/`partial`/`failed`
e taxas.

```sql
create view public.catalog_send_stats
with (security_invoker = on)
as ...
```

**Por que isso respeita a RLS:** com `security_invoker = on`
(`20260930740000_catalogo_send_stats.sql:18-19`), a view é avaliada com as
**permissões e a RLS de QUEM CONSULTA** — e não com as do dono da view. O corpo
lê `public.catalog_send_events` (`:28`), cuja policy de SELECT filtra por
`agent_id` (§1.2). Efeito prático (`:9-11`): um **agente comum vê apenas os
próprios envios**; **admin/supervisor** veem o conjunto que a própria policy já
lhes permite. **Sem** essa cláusula, a view (criada por um dono privilegiado)
vazaria envios de outros agentes. A view é **aditiva** — só uma `view` nova,
nenhuma tabela/coluna/policy/grant/dado alterado (`:5-7`, `:15-16`).

O filtro de 30 dias é aplicado na CTE base e vale para os três grãos (`:13`).

---

## 4. Rate limit da edge `promogifts-catalog`

`supabase/functions/promogifts-catalog/index.ts`.

- A edge **exige JWT de usuário** antes de qualquer coisa: lê o
  `Authorization: Bearer` e valida com `auth.getUser()` (`:228-242`); sem
  usuário → `401 Unauthorized`.
- Cota **por usuário E por ação** (`checkRateLimit`, `:166-177`), com balde
  próprio por ação (uma rajada de `list_products` não consome a cota de
  `bootstrap`).
- Limites: `RATE_LIMIT = 60` por 60 s é o **teto global/fallback** (`:141-142`);
  `ACTION_RATE_LIMITS` (`:151-158`) dá **120/min** para `list_products` (ação de
  abrir a tela e paginar) e **60/min** para as outras 5
  (`get_product`, `list_categories`, `list_suppliers`, `catalog_stats`,
  `bootstrap`). Corpo inválido/malformado **também consome cota** (cai no
  teto global como `action=null`) — não há bypass por requisição malformada
  (`:249-250`, `:163-164`).
- Estourou → `429 "Too many requests. Try again in 1 minute."` (`:268-270`).
- O `RATE_LIMIT`/`ACTION_RATE_LIMITS` são **derivados pelo teste** Deno
  (`index.actions.test.ts`, CT-77/CT-19), não fixados em número solto.

---

## 5. O que a chave `anon` **NÃO** enxerga

Depois do CT-01/CT-02, a `anon` key (pública por desenho, protegida por RLS)
**não lê nem escreve nenhuma das duas tabelas**:

- **Sem grant:** `20260929650000_catalog_grants_append_only.sql:32-43` revoga
  tabela **e** coluna de `anon` e não devolve grant nenhum.
- **Sem policy:** nenhuma das policies das duas tabelas é destinada a `anon`
  (`TO authenticated` em todas — §1.1/§1.2).

Ou seja, o problema do achado auditado em 24/09 (policies rodando para a role
`public`, que inclui `anon`) foi fechado nos **dois** níveis.

---

## 6. Service key do PromoGifts — só como **nome**, nunca literal

A credencial privilegiada do banco **externo** (PromoGifts) aparece no
repositório **apenas como nome de variável / secret**, jamais como valor:

- Código: `Deno.env.get("PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY")`
  (`supabase/functions/promogifts-catalog/index.ts:276`). Comentário explícito
  ao lado (`:273-275`): as tabelas de catálogo **negam de propósito** a role
  `anon` externa; a função já é protegida pelo JWT do usuário canônico,
  `rate-limited` e read-only — por isso a credencial cross-project só existe em
  Edge secrets.
- CI: `${{ secrets.… }}` em `.github/workflows/deploy-functions.yml` — nenhum
  literal.
- **Este documento não reproduz nenhum valor de chave.** A prova de "0 hits de
  literal no bundle de produção" está registrada no **CT-92** do
  `PLANO_FINALIZACAO_CATALOGO_100.md` (13 chunks JS da produção greppados → 0
  hits).

---

## 7. ⚠️ PENDÊNCIA DECLARADA — o teste de RLS com 2 usuários reais **NÃO foi feito**

O aceite original (CT-91, plano de finalização §FASE 9) pede: *"RLS testada com
2 usuários reais (agente vê só os próprios envios; supervisor vê todos;
favoritos isolados)"* — e o resultado registrado **neste** arquivo.

**Isso NÃO foi executado.** Fazer esse teste exige **duas sessões
autenticadas simultâneas** (um usuário comum + um admin/supervisor) com tokens
reais, o que não está disponível neste ambiente (não há fixture de login real;
`e2e/auth.spec.ts` só valida formulário). **Não afirmo que foi testado.**

### ✅ Estado de PRODUÇÃO medido em 02/10/2026 (o que dá para provar sem 2 logins)

Com o banco canônico (`tnnnlkbymytvtqngbbqh`) respondendo, a camada de segurança
foi **medida no próprio banco** pelo gateway de leitura (somente leitura), em vez
de apenas lida nas migrations. Saídas cruas:

| Verificação | Fonte (catálogo) | Resultado medido |
|---|---|---|
| RLS ligada | `pg_class.relrowsecurity` | `catalog_favorites` = **true** · `catalog_send_events` = **true** |
| Policy de favoritos | `pg_policy` | `FOR ALL TO authenticated USING (user_id = auth.uid())` — role **`authenticated`**, não mais `public` |
| Policy SELECT dos envios | `pg_policy.polqual` | `agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())` |
| `WITH CHECK` do INSERT | `pg_policy.polwithcheck` | `agent_id IN (…) OR is_admin_or_supervisor(…)` — **sem** o furo `agent_id IS NULL` |
| Grants do `authenticated` | `information_schema.role_table_grants` | `catalog_favorites`: DELETE, INSERT, SELECT, UPDATE · `catalog_send_events`: **INSERT, SELECT** (append-only) |
| Grants do `anon` | idem | **zero linhas** — o `anon` não tem privilégio nenhum nas duas tabelas |
| View do módulo | `pg_class.reloptions` | `catalog_send_stats` → `security_invoker=on` |
| Migrations do módulo no ledger | `supabase_migrations.schema_migrations` | **6/6** registradas: `20260913013153`, `20260913122557`, `20260924123033`, `20260925130000`, `20260929650000`, `20260930740000` |

Isto é **estado de configuração em produção** — mais forte do que ler o código,
porque pega o caso de uma migration de endurecimento que **não** tenha sido
aplicada (foi assim que descobri, no mesmo dia, um DDL de outro módulo pendente:
a função existia mas os triggers de versão não). O que ele **não** substitui é
exercitar a RLS com dois principais distintos — ver a seção seguinte.

### O que já estava provado por leitura das migrations

Está provado, por **leitura** das migrations, que:

- `catalog_favorites` tem RLS ligada e **uma** policy `FOR ALL TO authenticated
  USING (user_id = auth.uid())` — o predicado **é** o isolamento por dono
  (`20260913013153_catalog_favorites.sql:18-23`,
  `20260925130000_...favorites.sql:23-29`).
- `catalog_send_events` tem RLS ligada e policies de INSERT/SELECT que filtram
  por `agent_id` do próprio usuário **ou** `is_admin_or_supervisor(auth.uid())`
  (`20260913122557_catalog_send_events.sql:25-42`,
  `20260924123033_...anon_bypass.sql:3-10`,
  `20260925130000_...favorites.sql:12-21`) — o predicado **é** "agente vê os
  próprios, supervisor vê todos".
- A view `catalog_send_stats` propaga essa RLS via `security_invoker = on`
  (`20260930740000_catalogo_send_stats.sql:18-19`).
- A `anon` não tem grant nem policy (§5).

### O que **AINDA NÃO** está provado

- O **comportamento em runtime com dois usuários distintos**: que, de fato, com
  dois JWTs reais, o agente A **não** enxerga o envio do agente B, que um
  supervisor enxerga os dois, e que os favoritos de A não vazam para B.
  As policies foram lidas, **não** exercitadas.

### Como fechar (pré-requisito do aceite do CT-91)

Rodar com dois logins reais (agente + supervisor) — via `e2e` logado ou
chamada REST com os dois JWTs (anon key + `Authorization` de cada um) — e
anexar aqui a saída crua das três verificações (envios do agente × envios do
supervisor × isolamento de favoritos). Até lá, o CT-91/CT-96 permanecem
**abertos** na parte de runtime.

---

## 8. Referências cruzadas

- Plano de finalização (estado por etapa): `docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md`
  (§FASE 9: CT-91, CT-92, CT-93, CT-94, CT-95, CT-96).
- Contraste/legibilidade dos badges (decisão de produto pendente):
  `docs/catalogo/CONTRASTE.md` + CT-69 no plano.
- Política geral de segurança do projeto (reporte de vulnerabilidade):
  `./SECURITY.md` **da raiz** — arquivo distinto deste.
