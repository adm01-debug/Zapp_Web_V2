# Proposta de Reclassificação de Policies — Gate 16
**Status: APLICADO em 2026-08-30 — migration 20260830150000**  
**Data:** 2026-08-30

## Contexto
234 policies usam `is_admin_or_supervisor()` no banco.
A função `is_admin_or_supervisor()` dá ao supervisor o mesmo acesso que admin.
Isso contradiz a matriz RBAC em `role_permissions`.

## Categorias propostas

### 🔢 Admin-only (15 policies aplicadas — is_admin())
Supervisor NÃO deve ter acesso a estas tabelas (seguindo role_permissions):

| Tabela | Policy | Motivo |
|---|---|---|
| blocked_ips | Admins can insert/update/delete blocked IPs | manage_blocked_ips = admin only |
| blocked_countries | Admins can insert/delete blocked countries | manage_security = admin only |
| allowed_countries | Admins can insert/delete allowed countries | manage_security = admin only |
| connection_health_logs | Admins can insert/delete health logs | manage_connections = admin only |
| global_settings | Admins can manage global settings (ALL) | manage_settings = admin only |
| rate_limit_configs | Admins can manage rate limit configs (ALL) | manage_rate_limits = admin only |
| webhook_rate_limits | Admins can insert/update/delete rate limits | manage_security = admin only |
| whatsapp_connection_queues | Admins can manage connection queues (ALL) | manage_connections = admin only |

### 🔡 Admin+Supervisor OK (216 policies — ficaram com is_admin_or_supervisor())
Operações de gestão de equipe, visualização de relatórios, gestão de contatos/filas.
Supervisor tem `manage_agents`, `manage_contacts`, `manage_queues`, `view_reports`.

## Resultado da aplicação
Escopo final verificado contra pg_policies: **15 policies de escrita** em 7 tabelas (ai_providers já era admin-only via has_role; connection_health_logs entrou; SELECTsz mantidos em is_admin_or_supervisor para preservar view_security/view_settings/view_connections do supervisor). Contagem pós-migration: is_admin_or_supervisor=222, is_admin=17 policies.