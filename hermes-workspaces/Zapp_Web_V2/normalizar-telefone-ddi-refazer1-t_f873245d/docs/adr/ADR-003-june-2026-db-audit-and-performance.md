# ADR-003: Auditoria DB e Otimizações de Performance — Junho 2026

**Status:** Aceito  
**Data:** 2026-06-12  
**Autores:** Dev Sênior / PhD DB Audit  

---

## Contexto

Auditoria técnica exaustiva do banco de dados PostgreSQL 15.8 (2.86 GB, 513 tabelas públicas, 866 funções) revelou múltiplos problemas de performance e arquitetura. Este ADR documenta as decisões tomadas e os problemas encontrados.

---

## Descobertas e Decisões

### 1. `evolution_webhook_events` é tabela PARTICIONADA (não tabelas independentes)

**Problema:** A tabela `evolution_webhook_events` tem `relkind = 'p'` (partitioned table parent). Existem 24 partições físicas no formato `evolution_webhook_events_{instance_name}`.

**Impacto:** A função `fn_purge_processed_webhook_events` usava `relkind = 'r'` sem filtrar a tabela pai, causando tentativas de deleção em tabelas inexistentes.

**Correção:** JOIN `pg_class c ON c.relkind = 'r'` para excluir a tabela pai da iteração do cron de purga.

**Migration:** `20260612141500_purge_processed_webhook_events_cron.sql`

---

### 2. Índices Duplicados e Não-Utilizados

**Problema:** Identificados 16+ índices com `idx_scan = 0` representando ~7.5 MB de overhead de escrita.

**Índices Removidos:**
| Índice | Tabela | Motivo |
|--------|--------|--------|
| `idx_conv_wpp2_last_msg` | evolution_conversations_wpp2 | Duplicata de outro índice |
| `idx_dept_inv_code` | department_invitations | Duplicata da UNIQUE constraint |
| `idx_contacts_name_trgm` | evolution_contacts | 0 scans, 1.5 MB |
| `idx_contacts_last_name_trgm` | evolution_contacts | 0 scans |
| `idx_contacts_company_trgm` | evolution_contacts | 0 scans |
| `idx_evolution_contacts_search_vector` | evolution_contacts | 0 scans, 488 KB |
| `idx_evolution_contacts_message_count` | evolution_contacts | 0 scans |
| `idx_contacts_assigned` | evolution_contacts | 0 scans |
| `idx_conversations_wpp2_assigned` | evolution_conversations_wpp2 | 0 scans |
| `idx_solic_pendente` | solicitacoes_vale | Duplicata |
| `idx_mdq_pending` | media_download_queue | 0 scans |
| `idx_mdq_type` | media_download_queue | 0 scans |
| `idx_stickers_name_trgm` | stickers | 0 scans |
| `idx_stickers_image_url_unique` | stickers | 0 scans |
| `idx_deals_products` | evolution_deals | 0 scans |
| `idx_audio_memes_active` | audio_memes | 0 scans |

**Nota:** `webhook_events_processed_idempotency_key_key` NÃO foi removido — é uma UNIQUE CONSTRAINT necessária para idempotência de webhooks.

**Migrations:** `20260612150000_audit_index_cleanup.sql`, `20260612160000_fk_indexes_and_cleanup.sql`

---

### 3. Índices de FK Faltantes

**Problema:** JOINs e operações de cascata em chaves estrangeiras sem índices causam seq scans.

**Índices Criados:**
| Índice | Tabela | Coluna FK |
|--------|--------|-----------|
| `idx_conversations_contact_id` | conversations | contact_id |
| `idx_evolution_conversations_contact_id` | evolution_conversations | contact_id |
| `idx_evolution_conversations_status_assigned` | evolution_conversations | status + assigned_to |
| `idx_app_notifications_created_at` | app_notifications | created_at DESC |
| `idx_outbound_queue_audio_meme_id` | outbound_message_queue | audio_meme_id |
| `idx_ai_providers_created_by` | ai_providers | created_by |

---

### 4. Dead Tuples / VACUUM

**Problema:** Várias tabelas com dead tuple ratio acima de 5% sem autovacuum configurado.

**VACUUM ANALYZE executado em:**
- `evolution_webhook_events_wpp2`: 13.9% dead → 0%
- `evolution_webhook_events_wpp_pink_test`: 6.9% dead → 0%
- `evolution_media`: 4.8% dead → 0%
- `empresas`: 1.0% dead → 0%
- `cron.job_run_details`: 6.6% dead → limpo

---

### 5. Realtime Publication: 50 → 24 tabelas

**Problema:** 50 tabelas na publicação `supabase_realtime` geravam overhead desnecessário de WAL decoding para cada WRITE em tabelas como catálogos estáticos e logs de alta frequência.

**Removidas da publicação:**
- `evolution_webhook_events_wpp2` — **maior impacto**: volume de escrita muito alto, não há subscriber real-time para raw webhook events
- `audio_meme_categories`, `audio_meme_favorites`, `audio_memes` — catálogos estáticos
- `connection_health_logs` — logs históricos
- `email_tracked_messages`, `email_tracking_events` — tracking de email não requer real-time
- `evolution_settings` — configurações raramente mudam
- `sticker_categories`, `sticker_favorites`, `stickers` — catálogos estáticos
- `talkx_campaigns` — baixa frequência de mudança

**Estimativa de redução:** ~35% de overhead de WAL decoding para conexões realtime.

---

### 6. Funções SECURITY DEFINER com search_path

**Verificado:** As funções críticas de admin (`admin_criar_usuario_painel`, `admin_atualizar_usuario_painel`, etc.) JÁ têm `SET search_path TO 'public'` configurado. O advisory "functions_without_search_path" gerou falsos positivos para extensões de sistema (pgvector, etc.).

**Status:** ✅ Sem ação necessária para as funções de negócio.

---

### 7. Slow Queries Identificadas

| Query | Avg (ms) | Calls | Total (s) |
|-------|----------|-------|-----------|
| `rpc_refresh_daily_metrics` | 2208 | 739 | 1631 |
| `fn_handle_expired_r2_media` | 2585 | 31 | 80 |
| `fin_sync_parcelas_planilha` | 1489 | 542 | 807 |
| `refresh_mv_daily_kpis` | 477 | 35 | 17 |

**`rpc_refresh_daily_metrics`:** Cron schedule `0 */1 * * *` (a cada hora) — ACEITÁVEL. Mas 2.2s é alto para uma operação que apenas faz `REFRESH MATERIALIZED VIEW`. O `mv_daily_metrics` agrupa 90 dias de `evolution_messages` — investigar se o índice `idx_evo_wpp2_mv_daily_cover` está sendo usado.

---

## Consequências

- **Performance de escrita:** Melhorada com remoção de ~7.5 MB de índices inúteis
- **Performance de leitura:** Melhorada com novos FK indexes em tabelas de join frequente
- **Realtime latência:** Reduzida com menos tabelas na publicação WAL
- **Manutenibilidade:** Melhorada com documentação clara da arquitetura de particionamento
- **Dead tuples:** Eliminados nas tabelas afetadas

---

## Referências

- [ADR-001](./ADR-001-evolution-webhook-events-per-instance-tables.md) — Arquitetura de particionamento webhook events
- [ADR-002](./ADR-002-evolution-messages-data-rotation-strategy.md) — Estratégia de rotação de dados de mensagens
- Migrations: `20260612141500`, `20260612150000`, `20260612160000`
