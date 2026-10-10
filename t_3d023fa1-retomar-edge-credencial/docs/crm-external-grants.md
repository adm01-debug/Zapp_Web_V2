# GRANTs Externos — CRM pgxfvjmuubtbowutlide

> **Contexto:** Em 27/08/2026, 5 RPCs do projeto CRM (`pgxfvjmuubtbowutlide`, Supabase Cloud, "GESTÃO DE CLIENTES") foram diagnosticadas com erro `42501` (permission denied) quando chamadas pela anon key do ZAPP WEB V2. Os GRANTs foram aplicados diretamente via SQL, sem arquivo de migration no projeto CRM.
>
> **ATENÇÃO:** Se o projeto CRM for restaurado de backup (pg_restore lógico), esses GRANTs podem não estar presentes. Replicar manualmente via `SUPABASE - GESTÃO DE CLIENTES:execute_sql`.

## GRANTs aplicados em 27/08/2026

```sql
-- Projeto: GESTÃO DE CLIENTES (pgxfvjmuubtbowutlide)
-- Aplicado diretamente, sem migration. Replicar após restore.
GRANT EXECUTE ON FUNCTION public.get_contact_360_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_contact_intelligence_by_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_companies_by_phones_batch(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_interaction_from_zapp(uuid, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.search_contacts_advanced(text, text, text, integer, integer) TO anon;
```

## Por que `anon` e não `authenticated`?

O ZAPP WEB V2 chama essas funções a partir de edge functions usando a service_role key interna, que neste contexto se comporta como anon para funções com `SECURITY INVOKER`. O GRANT para `anon` foi o suficiente para resolver o `42501` sem alterar a arquitetura das funções.

## Aviso de segurança (GATE C — pendente)

Essas 5 funções têm GRANT para `anon`, que inclui a anon key pública. Sem guards internos (verificação de `auth.jwt()` ou `auth.role()`), qualquer portador da anon key pode chamar as funções e acessar dados de 57k empresas e 48k clientes.

**Decisão pendente (GATE C):**
- **Opção A (arquitetural):** Mover chamadas CRM para edge function com service_role — remove exposição da anon key.
- **Opção B (guard interno):** Adicionar `IF auth.jwt() IS NULL THEN RAISE EXCEPTION 'unauthorized'` nas funções de escrita (`sync_interaction_from_zapp`). Leitura pura pode ter lógica diferente.

Verificar guards atuais antes de decidir:
```sql
SELECT proname, left(prosrc, 500) AS corpo
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND proname IN (
    'get_contact_360_by_phone', 'get_contact_intelligence_by_phone',
    'get_companies_by_phones_batch', 'sync_interaction_from_zapp',
    'search_contacts_advanced'
  );
```

## RPCs `multiplix_*` (ponte nova do Multiplix — sem exposição a `anon`)

O módulo Multiplix fala com o **mesmo** projeto Singu/CRM (`pgxfvjmuubtbowutlide`), mas por
um caminho novo: a edge `multiplix-audience` com a `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`
(o front nunca vê URL/chave do projeto externo). As 5 RPCs chamadas por essa edge são:

| RPC | Call site no Zapp (arquivo:linha) | Parâmetros enviados |
|---|---|---|
| `multiplix_list_ramos` | `supabase/functions/multiplix-audience/index.ts:240` (bloco `238-241`) | nenhum |
| `multiplix_list_ufs` | `supabase/functions/multiplix-audience/index.ts:246` (bloco `244-247`) | nenhum |
| `multiplix_search_audience` | `supabase/functions/multiplix-audience/index.ts:254-263` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email`, `p_page`, `p_page_size` |
| `multiplix_count_audience` | `supabase/functions/multiplix-audience/index.ts:270-277` | `p_roles`, `p_ramo`, `p_uf`, `p_search`, `p_scope_permissions`, `p_scope_vendedor_email` |
| `multiplix_resolve_recipients` | `supabase/functions/multiplix-audience/index.ts:284-289` e `:306-311` | `p_company_ids`, `p_contact_ids`, `p_scope_permissions`, `p_scope_vendedor_email` |

Pontos que separam estas 5 das 5 antigas abaixo:

- **Não têm `GRANT` para `anon`** — são `SECURITY DEFINER` e recebem o escopo do usuário
  ZAPP como parâmetro (`docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md:26`).
  Por isso **não entram** na revogação de F97 (abaixo).
- **As definições SQL ainda não estão versionadas no repo**: `supabase/migrations/_foreign/singu/`
  não existe (item F21 do plano, pendente). A assinatura conferível hoje é só a dos call
  sites acima; contrato completo em `docs/multiplix/PONTE_SINGU.md`.
- `multiplix_create_draft` **não** é uma RPC do Singu — é RPC do ZAPP
  (`supabase/migrations/20260929630000_multiplix_create_draft.sql:37`).

## Caminho de fechamento do GATE C (F97)

O plano (F97, `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md:185`)
define o fechamento em 5 passos, todos sobre as **5 RPCs antigas** listadas acima:

1. **Migrar as chamadas restantes** (`crm-integration`, CRM 360) para o caminho com
   **service key + guard (F22)**. Estado: o `crm-integration` já usa a service key do Singu
   (`supabase/functions/crm-integration/index.ts:154`; o front não fala com o banco externo)
   e já chama as RPCs antigas por essa edge (`:193`, `:202`, `:263-264`, `:291`, `:308`,
   `:412`), mas o **guard F22** (assinatura HMAC do escopo, `MULTIPLIX_SCOPE_HMAC_SECRET`)
   ainda **não existe** — ver `docs/multiplix/PONTE_SINGU.md` §3.2.
2. **Revogar `GRANT EXECUTE ... TO anon`** das 5 RPCs antigas:
   `get_contact_360_by_phone(text)`, `get_contact_intelligence_by_phone(text)`,
   `get_companies_by_phones_batch(text[])`, `sync_interaction_from_zapp(uuid, text, text, jsonb)`,
   `search_contacts_advanced(text, text, text, integer, integer)`.
3. Provar `has_function_privilege('anon', …, 'EXECUTE') = false` nas 5.
4. **Chat/CRM 360 intactos** (nada quebrou).
5. Este arquivo (`docs/crm-external-grants.md`) com o **estado final**.

**Feito quando:** as 5 sem `anon` e nada quebrou.

Conferência de fechamento (proposta; não executada nesta sessão):
```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_contact_360_by_phone', 'get_contact_intelligence_by_phone',
    'get_companies_by_phones_batch', 'sync_interaction_from_zapp',
    'search_contacts_advanced'
  );
-- esperado: anon_pode = false em todas
```

## Histórico

| Data | Ação | Por |
|---|---|---|
| 27/08/2026 | GRANTs aplicados diretamente via SQL | Sessão Claude (diagnóstico erro 42501) |
| 27/08/2026 | Risco documentado no handoff como GATE C | Sessão Claude |
| 29/08/2026 | Este arquivo criado para persistir a documentação | Sessão Claude |
| 01/10/2026 | RPCs `multiplix_*` (sem `anon`) e caminho de fechamento do GATE C (F97) documentados | Sessão Claude (F29) |
