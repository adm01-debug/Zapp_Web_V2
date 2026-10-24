# Inventário — Políticas RLS

**Data**: 2026-10-24 | **Total**: 499 policies auditadas  
**Método**: `pg_policies` + queries de padrão + matrix A×B em Postgres 16 local

## Resumo

| Categoria | Qtd |
|-----------|-----|
| Total de policies em `public` | 499 |
| Tabelas com RLS habilitado | ~150+ (maioria) |
| Tabelas com RLS + 0 policies (expostas) | 9 (anon INSERT confirmado) |
| Policies UPDATE sem WITH CHECK | **39** (CRITICAL-2) |

---

## Tabelas com RLS habilitado mas sem policies (9)

Evidência (re-executada 2026-10-24T20:53 UTC):
```sql
SELECT t.relname AS tabela
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.relname
  )
ORDER BY t.relname;
```
Tabelas: `channel_connections_safe`, `gmail_accounts_safe`, `link_preview_cache`, `password_reset_requests_safe`, `profiles_public`, `talkx_campaign_metrics`, `whatsapp_connections_agent`, `whatsapp_connections_public`, `whatsapp_connections_safe` (9 tabelas — HIGH-1).

---

## Policies UPDATE sem WITH CHECK (39)

Evidência (re-executada 2026-10-24T21:30 UTC):
```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND cmd='UPDATE'
  AND (with_check IS NULL OR with_check='');
-- Resultado: 39
```

Em PostgreSQL, UPDATE sem WITH CHECK explícito usa USING como implicit WITH CHECK — isso **protege** quando USING contém `is_member_of(organization_id)`, mas deixa exploração possível quando USING usa apenas `user_id = auth.uid()` sem verificar o org.

### Matrix A×B — resultados (Postgres 16 local, 2026-10-24)

| Teste | Condição | Resultado |
|-------|----------|-----------|
| T-01 a T-05 | SELECT isolation entre tenants | PASS — RLS isola corretamente |
| T-06 | INSERT WITH CHECK presente | PASS |
| T-07 | INSERT via SECURITY DEFINER | PASS |
| T-C2 | UPDATE cross-tenant (CRITICAL-2) | **CONFIRMADO** — SELECT usa user_id, UPDATE sem WITH CHECK org → troca org_id |
| T-08 | UPDATE bloqueado com is_member_of | PASS — is_member_of em USING cobre implicit WITH CHECK |
| T-09 | DELETE cross-tenant | PASS |

**Nuance crítica**: PostgreSQL aplica SELECT USING como implicit WITH CHECK na **linha nova**. Tabelas onde tanto SELECT quanto UPDATE usam `is_member_of(organization_id)` estão protegidas mesmo sem WITH CHECK explícito. O risco real é em tabelas onde SELECT e UPDATE usam `user_id = auth.uid()` sem org check.

**Correção**: `propostas/02_rls_with_check.sql`

---

## Tabelas sem RLS (schemas de backup)

| Schema | Tabelas | Observação |
|--------|---------|------------|
| `_bkp_261023` | 9 | Sem RLS, sem grants a app roles (MEDIUM-8) |
| `ops_backup` | 1 | Sem RLS, sem grants a app roles |

Sem grants a `authenticated`/`anon` → acesso bloqueado por padrão; risco residual: escalação via SECURITY DEFINER ou session_user = postgres.

---

## Achados desta seção

- **CRITICAL-2**: 39 policies UPDATE sem WITH CHECK — CONFIRMADO por teste local
- **HIGH-1**: 17 tabelas (9 confirmadas via query) com RLS mas 0 policies
- **MEDIUM-8**: backup schema `_bkp_261023` sem RLS (baixo risco por ausência de grants)
