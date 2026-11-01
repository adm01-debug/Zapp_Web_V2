# S5 — Performance: Índices e Queries

**Coletado em:** 2026-11-01

## pg_stat_statements

**NÃO DISPONÍVEL** — extensão `pg_stat_statements` não instalada.

## Índices Sem Uso (idx_scan = 0)

```sql
SELECT relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey' AND indexrelname NOT LIKE '%_unique'
ORDER BY pg_relation_size(indexrelid) DESC LIMIT 20;
```

**Top 10 índices sem uso (por tamanho):**

| Índice | Tabela | Tamanho |
|---|---|---|
| `email_attachments_msg_att_key` | email_attachments | **61 MB** |
| `email_messages_body_text_trgm_idx` | email_messages | 17 MB |
| `email_attachments_filename_trgm_idx` | email_attachments | 11 MB |
| `idx_messages_content_trgm` | messages | 5 MB |
| `ux_messages_dedup` | messages | 4.4 MB |
| `idx_messages_media_url_trgm` | messages | 4.4 MB |
| `messages_external_id_uq` | messages | 3 MB |
| `idx_audit_logs_user_id` | audit_logs | 968 kB |
| `idx_email_attachments_email_message_id` | email_attachments | 904 kB |
| `idx_messages_whatsapp_connection_id` | messages | 632 kB |

**Total de índices sem uso com tamanho significativo: ~107 MB**

## Dead Tuples

| Tabela | Dead% |
|---|---|
| `_http_response` | ~17.4% |
| `connection_health_logs` | ~9.5% |

Demais tabelas < 5%. VACUUM manual não pode ser executado via MCP.

## Queries Lentas (7 dias)

**NÃO DISPONÍVEL** — `pg_stat_statements` não instalado.