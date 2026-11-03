# public.user_settings

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `business_hours_enabled` | `boolean` | sim | `true` |  |  |
| 4 | `business_hours_start` | `text` | sim | `'09:00'::text` |  |  |
| 5 | `business_hours_end` | `text` | sim | `'18:00'::text` |  |  |
| 6 | `work_days` | `integer[]` | sim | `'{1,2,3,4,5}'::integer[]` |  |  |
| 7 | `welcome_message` | `text` | sim | `''::text` |  |  |
| 8 | `away_message` | `text` | sim | `''::text` |  |  |
| 9 | `closing_message` | `text` | sim | `''::text` |  |  |
| 10 | `auto_assignment_enabled` | `boolean` | sim | `true` |  |  |
| 11 | `auto_assignment_method` | `text` | sim | `'roundrobin'::text` |  |  |
| 12 | `inactivity_timeout` | `integer` | sim | `30` |  |  |
| 13 | `sound_enabled` | `boolean` | sim | `true` |  |  |
| 14 | `browser_notifications_enabled` | `boolean` | sim | `true` |  |  |
| 15 | `quiet_hours_enabled` | `boolean` | sim | `false` |  |  |
| 16 | `quiet_hours_start` | `text` | sim | `'22:00'::text` |  |  |
| 17 | `quiet_hours_end` | `text` | sim | `'07:00'::text` |  |  |
| 18 | `theme` | `text` | sim | `'system'::text` |  |  |
| 19 | `language` | `text` | sim | `'pt-BR'::text` |  |  |
| 20 | `compact_mode` | `boolean` | sim | `false` |  |  |
| 21 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 22 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 23 | `sentiment_alert_threshold` | `integer` | sim | `30` |  | Threshold percentage below which sentiment alerts are triggered (0-100) |
| 24 | `sentiment_alert_enabled` | `boolean` | sim | `true` |  | Whether sentiment alerts are enabled for this user |
| 25 | `sentiment_consecutive_count` | `integer` | sim | `2` |  | Number of consecutive low sentiment analyses required to trigger alert |
| 26 | `tts_voice_id` | `text` | sim | `'EXAVITQu4vr4xnSDxMaL'::text` |  | ElevenLabs voice ID for text-to-speech |
| 27 | `tts_speed` | `numeric` | sim | `1.0` |  |  |
| 28 | `auto_transcription_enabled` | `boolean` | sim | `true` |  |  |
| 29 | `transcription_notification_enabled` | `boolean` | sim | `true` |  |  |
| 30 | `message_sound_type` | `text` | sim | `'chime'::text` |  | Som de mensagem nova: beep \| chime \| bell \| alert \| soft (vocabulario unico do front: SoundTypeOption / SoundType). |
| 31 | `mention_sound_type` | `text` | sim | `'bell'::text` |  | Som de mencao: beep \| chime \| bell \| alert \| soft. |
| 32 | `sla_sound_type` | `text` | sim | `'alert'::text` |  | Som de violacao de SLA: beep \| chime \| bell \| alert \| soft. |
| 33 | `goal_sound_type` | `text` | sim | `'chime'::text` |  | Som de meta atingida: beep \| chime \| bell \| alert \| soft. |
| 34 | `transcription_sound_type` | `text` | sim | `'soft'::text` |  | Som de transcricao pronta: beep \| chime \| bell \| alert \| soft. |
| 35 | `sound_volume` | `integer` | não | `70` |  | Volume dos alertas do sistema, NOT NULL, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled. |
| 36 | `new_message_sound_enabled` | `boolean` | sim | `true` |  | Som/aviso de "Novas Mensagens" (default true, igual a NotificationSettings.newMessageSound); NULL = sem preferencia gravada. |
| 37 | `mention_sound_enabled` | `boolean` | sim | `true` |  | Som/aviso de "Menções" (default true, igual a NotificationSettings.mentionSound); NULL = sem preferencia gravada. |
| 38 | `sla_breach_sound_enabled` | `boolean` | sim | `true` |  | Som/aviso de "Violação de SLA" (default true, igual a NotificationSettings.slaBreachSound); NULL = sem preferencia gravada. |
| 39 | `onboarding_completed` | `boolean` | não | `false` |  | Tour de onboarding concluído (default false). Fonte da verdade para exibir/reiniciar o tour; as linhas existentes na aplicação da migration foram backfilladas como true (critério documentado em 20261013044344_user_settings_onboarding_completed.sql). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_settings_goal_sound_type_valid | CHECK | `CHECK (goal_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))` |  |  | sim |
| user_settings_mention_sound_type_valid | CHECK | `CHECK (mention_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))` |  |  | sim |
| user_settings_message_sound_type_valid | CHECK | `CHECK (message_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))` |  |  | sim |
| user_settings_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_settings_sla_sound_type_valid | CHECK | `CHECK (sla_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))` |  |  | sim |
| user_settings_sound_volume_range | CHECK | `CHECK (sound_volume >= 10 AND sound_volume <= 100)` |  |  | sim |
| user_settings_transcription_sound_type_valid | CHECK | `CHECK (transcription_sound_type = ANY (ARRAY['beep'::text, 'chime'::text, 'bell'::text, 'alert'::text, 'soft'::text]))` |  |  | sim |
| user_settings_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| user_settings_user_id_key | UNIQUE | `UNIQUE (user_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| user_settings_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_settings_pkey ON public.user_settings USING btree (id)` |
| user_settings_user_id_key | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX user_settings_user_id_key ON public.user_settings USING btree (user_id)` |


## Policies (RLS)

### `Users can insert their own settings`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `Users can update their own settings`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view their own settings`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_user_settings_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
