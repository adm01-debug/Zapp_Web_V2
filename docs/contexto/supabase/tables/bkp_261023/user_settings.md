# _bkp_261023.user_settings

> [bkp-261023] Snapshot de public.user_settings em 23/10/2026 (4 linhas).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | não |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | sim |  |  |  |
| 2 | `user_id` | `uuid` | sim |  |  |  |
| 3 | `business_hours_enabled` | `boolean` | sim |  |  |  |
| 4 | `business_hours_start` | `text` | sim |  |  |  |
| 5 | `business_hours_end` | `text` | sim |  |  |  |
| 6 | `work_days` | `integer[]` | sim |  |  |  |
| 7 | `welcome_message` | `text` | sim |  |  |  |
| 8 | `away_message` | `text` | sim |  |  |  |
| 9 | `closing_message` | `text` | sim |  |  |  |
| 10 | `auto_assignment_enabled` | `boolean` | sim |  |  |  |
| 11 | `auto_assignment_method` | `text` | sim |  |  |  |
| 12 | `inactivity_timeout` | `integer` | sim |  |  |  |
| 13 | `sound_enabled` | `boolean` | sim |  |  |  |
| 14 | `browser_notifications_enabled` | `boolean` | sim |  |  |  |
| 15 | `quiet_hours_enabled` | `boolean` | sim |  |  |  |
| 16 | `quiet_hours_start` | `text` | sim |  |  |  |
| 17 | `quiet_hours_end` | `text` | sim |  |  |  |
| 18 | `theme` | `text` | sim |  |  |  |
| 19 | `language` | `text` | sim |  |  |  |
| 20 | `compact_mode` | `boolean` | sim |  |  |  |
| 21 | `created_at` | `timestamp with time zone` | sim |  |  |  |
| 22 | `updated_at` | `timestamp with time zone` | sim |  |  |  |
| 23 | `sentiment_alert_threshold` | `integer` | sim |  |  |  |
| 24 | `sentiment_alert_enabled` | `boolean` | sim |  |  |  |
| 25 | `sentiment_consecutive_count` | `integer` | sim |  |  |  |
| 26 | `tts_voice_id` | `text` | sim |  |  |  |
| 27 | `tts_speed` | `numeric` | sim |  |  |  |
| 28 | `auto_transcription_enabled` | `boolean` | sim |  |  |  |
| 29 | `transcription_notification_enabled` | `boolean` | sim |  |  |  |
| 30 | `message_sound_type` | `text` | sim |  |  |  |
| 31 | `mention_sound_type` | `text` | sim |  |  |  |
| 32 | `sla_sound_type` | `text` | sim |  |  |  |
| 33 | `goal_sound_type` | `text` | sim |  |  |  |
| 34 | `transcription_sound_type` | `text` | sim |  |  |  |
| 35 | `sound_volume` | `integer` | sim |  |  |  |
| 36 | `new_message_sound_enabled` | `boolean` | sim |  |  |  |
| 37 | `mention_sound_enabled` | `boolean` | sim |  |  |  |
| 38 | `sla_breach_sound_enabled` | `boolean` | sim |  |  |  |


## Constraints

_nenhum_


## Índices

_nenhum_


## Policies (RLS)

> ⚠️ RLS **desabilitado** nesta tabela.



## Triggers

_nenhum_


## Grants

_nenhum_
