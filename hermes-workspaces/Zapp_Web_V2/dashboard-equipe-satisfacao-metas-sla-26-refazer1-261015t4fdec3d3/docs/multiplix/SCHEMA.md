# Multiplix — Schema do banco (`public`)

> Fonte de verdade deste documento: as migrations `supabase/migrations/*multiplix*.sql` e
> `src/integrations/supabase/types.ts` na ponta de dia de **2026-10-08**. É o retrato do que existe,
> não do que o plano previa. As cinco RPCs de audiência do Singu vivem em
> `supabase/migrations/_foreign/singu/` e pertencem ao **outro** banco (ver `PONTE_SINGU.md`).

O Multiplix tem **9 tabelas** em `public`, todas com **RLS habilitada**. O modelo é *disparo → destinatário
→ item de entrega → evento*: o disparo guarda os contadores que a tela mostra, o destinatário guarda a
decisão de aptidão, o item de entrega é a fila reivindicável pelo worker e o evento é o log append-only.

## Tabelas

| Tabela | Papel | Colunas-chave |
|---|---|---|
| `multiplix_dispatches` | Cabeça do disparo: status, janela, cadência e contadores que a UI lê | `status`, `total_recipients`, `sent_count`, `failed_count`, `outcome_unknown_count`, `delivered_count`, `scheduled_at`, `send_window_start/end`, `send_interval_min/max`, `typing_delay_min/max`, `whatsapp_connection_id`, `pause_reason` |
| `multiplix_recipients` | Um destino resolvido por disparo, com a decisão de aptidão | `status`, `eligibility`, `eligibility_reason`, `destino_origem`, `company_id`, `company_name_snapshot`, `inclusion_reason`, `delivery_claim_token`, `delivery_claim_expires_at` |
| `multiplix_delivery_items` | Fila de entrega reivindicável (1 item por bloco × destinatário), com lease e idempotência | `status`, `dispatch_version`, `block_id`, `recipient_id`, `idempotency_key`, `attempt_count`, `next_attempt_at`, `lease_token`, `lease_until`, `worker_id`, `external_id`, `provider_dispatch_started_at` |
| `multiplix_events` | Log append-only (sem UPDATE/DELETE) do que aconteceu em cada item/disparo | `kind`, `dispatch_id`, `recipient_id`, `item_id`, `correlation_id`, `payload` |
| `multiplix_blocks` | Blocos de conteúdo do disparo (texto, voz IA, áudio gravado, arquivo) e a ordem | `block_type`, `block_order`, `content`, `content_hash`, `content_version`, `template_text`, `personalization_mode`, `voice_id`, `voice_script`, `media_url` |
| `multiplix_audiences` | Público salvo/reutilizável (F35) | `kind`, `definition`, `cached_count`, `owner_id`, `shared_with_roles`, `last_used_at` |
| `multiplix_audience_members` | Membros materializados de um público salvo (empresas/contatos do Singu) | `audience_id`, `singu_company_id`, `singu_contact_id`, `added_reason` |
| `multiplix_voice_assets` | Áudios de voz IA gerados (referência ao objeto no storage) | `voice_id`, `modelo`, `caminho`, `hash`, `caracteres`, `duracao_ms`, `invalidated_at` |
| `multiplix_voice_grants` | Concessão de uso de uma voz para papéis/perfis | `voice_id`, `origem`, `titular`, `roles`, `perfis`, `revoked_at` |

## Enums

Criados em `20261001201230_f30_multiplix_enums_modelo_v2.sql` (o modelo v2):

| Enum | Valores |
|---|---|
| `multiplix_dispatch_status` | `draft`, `scheduled`, `sending`, `paused`, `completed`, `completed_with_failures`, `failed`, `cancelled` |
| `multiplix_recipient_status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `skipped`, `outcome_unknown` (+ variantes de reivindicação) |
| `multiplix_item_status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` |
| `multiplix_block_type` | `text`, `voice_ai`, `audio_recorded`, `file` |
| `multiplix_eligibility` | `eligible`, `no_destination`, `suppressed`, `out_of_scope`, `media_pending`, `connection_unavailable`, `requires_template` |

## RPCs no banco do ZAPP (`public`, `SECURITY DEFINER`)

| RPC | Papel |
|---|---|
| `multiplix_create_draft` | Cria o rascunho do disparo a partir do público resolvido |
| `multiplix_confirm_dispatch` | Confirma e materializa a fila (recusa sem bloco, sem destinatário, sem conexão) |
| `multiplix_dispatch_window_is_open` | Diz se a janela de horário/fuso do disparo está aberta agora |
| `multiplix_connection_daily_usage` | Consumo diário da conexão (teto de envio por dia) |

Os *triggers* de manutenção (`multiplix_bump_version_on_dispatch_edit`, `multiplix_bump_version_on_block_change`,
`multiplix_audiences_validate_shared_roles`) são internos, não são chamados pela UI.

## RPCs de audiência no banco do Singu (`_foreign/singu/`)

Chamadas apenas pela edge `multiplix-audience`, com a chave de serviço do outro lado (nunca `anon`):

`multiplix_list_ramos`, `multiplix_list_ufs`, `multiplix_search_audience`, `multiplix_count_audience`,
`multiplix_resolve_recipients`.

## Realtime e cron

- **Realtime:** `multiplix_dispatches` e `multiplix_recipients` estão em `supabase_realtime` com **lista
  explícita de colunas** (`20261001201230_...`), para nunca publicar PII de destinatário (`20260927210000_...`).
  `multiplix_blocks` **não** está na publication.
- **Cron:** `pg_cron` agenda `multiplix-send-trigger` a cada **2 minutos**
  (`20260927320000_multiplix_cron_scheduler.sql`), que chama `trigger_pending_multiplix_dispatches()`; esse
  invoca a edge `multiplix-send` via `pg_net` com o segredo `multiplix_cron_secret` (Vault). `get_multiplix_cron_secret()`
  e `trigger_pending_multiplix_dispatches()` são `service_role`-only (`REVOKE ... FROM PUBLIC, anon, authenticated`).
- **Guardas:** `multiplix_mutability_guard`, `multiplix_guards_fail_closed`, `multiplix_revoke_recipient_writes`
  e `multiplix_rls_*` restringem escrita de destinatário ao caminho das edges.
