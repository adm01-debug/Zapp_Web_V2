# S12 — Lacunas: Backup/PITR, Staging, LGPD, Alertas

**Coletado em:** 2026-11-01

## Backup / PITR

```sql
SELECT name, setting FROM pg_settings
WHERE name IN ('archive_mode', 'archive_command', 'wal_level', 'max_wal_senders');
```

| Parâmetro | Valor |
|---|---|
| archive_mode | `on` |
| archive_command | `/usr/bin/admin-mgr wal-push %p` (WAL-G) |
| wal_level | `logical` |
| max_wal_senders | `5` |

**PITR está ATIVO** via WAL archiving gerenciado pela Supabase. ✓

**NÃO VERIFICADO:** janela de retenção do PITR. Verificar no painel: Project Settings > Backups.

## Ambiente de Staging

**LACUNA CONFIRMADA** — Não existe ambiente de staging separado para o Zapp Web V2.

Confirmado pela arquitetura descrita no CLAUDE.md (seção 0): toda validação acontece em banco
local por worktree + produção somente leitura para diagnóstico.

## LGPD / Retenção de Dados Pessoais

| Tabela | Dados sensíveis |
|---|---|
| `contacts` | phone, email, name, address |
| `profiles` | phone, email, name |
| `password_reset_requests` | email, ip_address |
| `login_attempts` | email, ip_address |
| `audit_logs` | ip_address |
| `blocked_ips` | ip_address |

**Políticas de retenção observadas:**
- `search-events-retention` — ativo
- `reconnection-logs-retention-30d` — 30 dias
- `cleanup-link-preview-cache` — ativo
- `crm-sync-outbox-cleanup` — ativo

**LACUNA:** sem política formal de exclusão de dados de contatos deletados (`deleted_at IS NOT NULL`).
Contatos com soft delete permanecem na tabela com phone/email.

## Alertas / Observabilidade

**Alertas existentes:**
- `db-live-guard.yml` — diário, abre issue se drift ✓
- `settings-guard.yml` — a cada 6h ✓

**Lacunas:**
- Sem alerta de pg_cron failure rate (6-8% falha silenciosa)
- Auth audit log vazio (zero visibilidade sobre logins anômalos)
- pg_stat_statements desabilitado (sem análise de queries lentas)
- log_min_duration_statement = -1 (queries lentas não logadas)

## Vault

```sql
SELECT count(*) as total_secrets FROM vault.secrets;
-- Resultado: 13 secrets
```

**13 secrets no vault** — nomes não consultados (política: não expor nomes de secrets).