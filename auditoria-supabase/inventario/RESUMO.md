# Inventario Completo — Supabase tnnnlkbymytvtqngbbqh

**Data:** 2026-10-30 | **Gerado por:** Claude Code (somente leitura)

---

## Visao Geral do Banco

| Metrica | Valor |
|---|---|
| Tamanho total | 433 MB |
| Versao PostgreSQL | 17.6 |
| Usuarios auth | 10 (6 ativos nos ultimos 30d) |
| Cache hit rate | 99,64% |
| Conexoes ativas | 2 de 35 totais |

---

## Schemas

| Schema | Tabelas |
|---|---|
| public | 204 |
| auth | 27 |
| realtime | 10 |
| storage | 8 |
| supabase_migrations | 2 |
| cron | 2 |
| net | 2 |
| _bkp_261023 | 9 (backup 2026-10-23) |
| vault | 1 |
| ops | 1 |

---

## Extensoes

| Extensao | Schema | Versao |
|---|---|---|
| pg_cron | pg_catalog | 1.6.4 |
| pg_net | extensions | 0.20.4 |
| pg_stat_statements | extensions | 1.11 |
| pg_trgm | extensions | 1.6 |
| pgcrypto | extensions | 1.3 |
| plpgsql | pg_catalog | 1.0 |
| supabase_vault | vault | 0.3.1 |
| uuid-ossp | extensions | 1.1 |

---

## Enums

| Enum | Valores |
|---|---|
| ai_provider_type | lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent |
| app_role | admin, supervisor, agent, special_agent |
| channel_type | whatsapp, instagram, telegram, messenger, webchat, email |
| multiplix_block_type | text, voice_ai, audio_recorded, file |
| multiplix_dispatch_status | draft, scheduled, sending, paused, completed, completed_with_failures, failed, cancelled |
| talkx_blacklist_reason | opt_out, invalid_number, manual, lgpd, no_commercial_permission, bounce |

---

## Sequencias

| Sequencia | Ultimo Valor | % Usado |
|---|---|---|
| catalog_rate_limit_hits_id_seq | 888 | ~0% |
| contact_deletion_audit_id_seq | 800 | ~0% |
| security_acl_alerts_id_seq | 831 | ~0% |
| talkx_help_views_id_seq | NULL | 0% |

Nenhuma sequencia proxima ao limite.

---

## Funcoes (478)

| Categoria | Quantidade |
|---|---|
| Total | 478 |
| SECURITY DEFINER | 399 |
| SECURITY DEFINER sem search_path fixo | 0 |
| plpgsql | 400 |
| sql | 78 |
| Com SQL dinamico | 11 |

---

## Cron Jobs (24)

| Nome | Schedule | Taxa Falha 30d |
|---|---|---|
| talkx-scheduler-1min | * * * * * | **10,06%** |
| voice-changer-tmp-purge | 17 * * * * | 8,47% |
| close-stale-calls | */5 * * * * | 7,09% |
| csat-reply-capture-tick | */2 * * * * | 6,41% |
| dispatch-scheduled-messages | * * * * * | 6,53% |
| security-acl-score | 23 * * * * | 6,21% |
| avatars-refresh | 7 * * * * | 5,56% |

---

## Edge Functions (85 no repo)

| Nivel Risco | Quantidade | verify_jwt=false |
|---|---|---|
| R0 (publico/trivial) | 4 | 2 (csp-report, public-api) |
| R1 (leitura/baixo impacto) | 12 | 1 (talkx-link) |
| R2 (estado/producao) | 69 | 11 (justificados) |

---

## Storage Buckets (9)

| Bucket | Publico | Policies | MIME Restrito |
|---|---|---|---|
| audio-memes | SIM | 5 | audio/* |
| audio-messages | nao | 5 | audio/* |
| avatars | nao | 4 | image/* |
| custom-emojis | SIM | 3 | image/* + SVG |
| multiplix-voice | nao | **0** | **nao** |
| stickers | SIM | 4 | image/* |
| team-chat-files | nao | 3 | variado |
| voice-changer-tmp | nao | 4 | audio/* |
| whatsapp-media | nao | 4 | image/video/audio |

---

## Migrations

| Metrica | Valor |
|---|---|
| No repo | 1.064 |
| No banco | 1.064 |
| Somente no banco | 0 |
| Somente no repo | 0 |
| Com NULL statements | **63** |
| Tabelas no banco nao em types.ts | 30 |
| Tabelas em types.ts nao no banco | 0 |

---

## Segredos do Vault (13 — apenas nomes)

ai_jobs_cron_secret, avatars_refresh_cron_secret, connection_health_check_cron_secret, gmail_cron_secret, gmail_encryption_key, multiplix_cron_secret, multiplix_send_url, sicoob_service_role_key, talkx_anon_key, talkx_cron_secret, talkx_scheduler_url, talkx_send_url, zapp_anon_key
