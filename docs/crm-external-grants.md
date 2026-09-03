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

## Histórico

| Data | Ação | Por |
|---|---|---|
| 27/08/2026 | GRANTs aplicados diretamente via SQL | Sessão Claude (diagnóstico erro 42501) |
| 27/08/2026 | Risco documentado no handoff como GATE C | Sessão Claude |
| 29/08/2026 | Este arquivo criado para persistir a documentação | Sessão Claude |
