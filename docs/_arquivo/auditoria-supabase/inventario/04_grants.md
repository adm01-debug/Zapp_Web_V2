# Inventário — Grants e Permissões

**Data**: 2026-10-24 | **Projeto**: tnnnlkbymytvtqngbbqh  
**Método**: `information_schema.role_table_grants` + `pg_roles`

## Resumo

| Categoria | Qtd |
|-----------|-----|
| Tabelas com GRANT escrita para `anon` | 97–98 (CRITICAL-1) |
| Tabelas com GRANT INSERT para `anon` | 98 |
| Tabelas com GRANT UPDATE para `anon` | 97 |
| Tabelas com GRANT DELETE para `anon` | 97 |
| Tabelas com GRANT TRUNCATE para `anon` | 98 |

---

## Grants de escrita para `anon` (CRITICAL-1)

Evidência (re-executada 2026-10-24T20:53 UTC):
```sql
SELECT privilege_type, count(*) AS tabelas
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
  AND table_schema = 'public'
GROUP BY privilege_type ORDER BY privilege_type;
```

| Privilege | Tabelas |
|-----------|---------|
| DELETE | 97 |
| INSERT | 98 |
| TRUNCATE | 98 |
| UPDATE | 97 |

### Tabelas de maior criticidade com anon INSERT (amostra)

- `user_roles` — controle de acesso por usuário
- `security_alerts` — alertas de segurança
- `login_attempts` — log de tentativas de login
- `mfa_sessions` — sessões MFA
- `password_reset_requests` — solicitações de reset
- `campaigns` — campanhas de mensagem
- `whatsapp_connections` — conexões WhatsApp
- `channel_connections` — conexões de canal
- `global_settings` — configurações globais
- `permissions` — tabela de permissões
- `talkx_blacklist` — blacklist de campanhas

### Tabelas com anon INSERT + 0 policies RLS (máximo risco)

Query confirmada (2026-10-24):
```sql
SELECT rtg.table_name
FROM information_schema.role_table_grants rtg
WHERE rtg.grantee = 'anon'
  AND rtg.privilege_type = 'INSERT'
  AND rtg.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = rtg.table_name
  )
ORDER BY rtg.table_name;
```
Resultado: `channel_connections_safe`, `gmail_accounts_safe`, `link_preview_cache`, `password_reset_requests_safe`, `profiles_public`, `talkx_campaign_metrics`, `whatsapp_connections_agent`, `whatsapp_connections_public`, `whatsapp_connections_safe` (9 tabelas — acesso sem RLS confirmado).

---

## Grants esperados (padrão Supabase)

| Role | Acesso esperado | Observação |
|------|----------------|------------|
| `anon` | SELECT em tabelas públicas | Escrita deve ser removida (CRITICAL-1) |
| `authenticated` | SELECT/INSERT/UPDATE/DELETE com RLS | Padrão correto |
| `service_role` | Bypassa RLS | Apenas edge functions + pg_cron |
| `postgres` | Superusuário | Apenas migrations e sistema |

---

## Correção proposta

`propostas/01_revogar_grants_anon.sql` — REVOKE de INSERT/UPDATE/DELETE/TRUNCATE da role `anon` em todas as 99 tabelas afetadas, mantendo apenas SELECT onde necessário para endpoints públicos (ex.: `status`, `link_preview_cache`).

**Risco de regressão**: funções SECURITY DEFINER que verificam `auth.role() = 'anon'` podem mudar comportamento. Testar as 14 edge functions com `verify_jwt=false` antes do merge.

---

## Achados desta seção

- **CRITICAL-1**: anon role com escrita em 97–98 tabelas — incluindo tabelas de controle de acesso
