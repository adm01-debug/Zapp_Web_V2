# public.copilot_sessions

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `profile_id` | `uuid` | não |  |  |  |
| 5 | `brinde_budget` | `text` | sim |  |  |  |
| 6 | `brinde_responsible` | `text` | sim |  |  |  |
| 7 | `brinde_intention` | `text` | sim |  |  |  |
| 8 | `brinde_quantity` | `integer` | sim |  |  |  |
| 9 | `brinde_deadline` | `date` | sim |  |  |  |
| 10 | `brinde_delivery` | `text` | sim |  |  |  |
| 11 | `brinde_meter` | `integer` | não | `0` |  |  |
| 12 | `sale_stage` | `text` | não | `'novo_contato'::text` |  |  |
| 13 | `temperature` | `integer` | não | `0` |  |  |
| 14 | `state_version` | `integer` | não | `1` |  |  |
| 15 | `started_at` | `timestamp with time zone` | não | `now()` |  |  |
| 16 | `last_tick_at` | `timestamp with time zone` | sim |  |  |  |
| 17 | `closed_at` | `timestamp with time zone` | sim |  |  |  |
| 18 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 20 | `brinde_evidence` | `jsonb` | não | `'{"B": null, "D": null, "E": null, "I": null, "N": null, "R": null}'::jsonb` |  | CV-031 — id da mensagem que originou cada letra B·R·I·N·D·E. |
| 21 | `comm_style` | `text` | sim |  |  | CV-037 — etiquetas de estilo de comunicação do cliente. |
| 22 | `decision_role` | `text` | sim |  |  | CV-038 — papel do interlocutor na decisão (buyer/approver/intermediary/…). |
| 23 | `occasion` | `text` | sim |  |  | CV-035/036 — ocasião comercial detectada (natal, sipat, outubro_rosa, …). |
| 24 | `stakeholders` | `jsonb` | não | `'[]'::jsonb` |  | CV-039 — pessoas citadas na conversa que participam da decisão. |
| 25 | `brinde_state` | `jsonb` | não | `'{}'::jsonb` |  | CV-026 -- estado acumulado B.R.I.N.D.E da sessao; atualizado atomicamente por merge_brinde_state(). |
| 26 | `last_processed_message_at` | `timestamp with time zone` | sim |  |  |  |
| 27 | `intent` | `text` | sim |  |  |  |
| 28 | `sentiment` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_sessions_brinde_meter_check | CHECK | `CHECK (brinde_meter >= 0 AND brinde_meter <= 6)` |  |  | sim |
| copilot_sessions_conversation_id_key | UNIQUE | `UNIQUE (conversation_id)` |  |  | sim |
| copilot_sessions_decision_role_check | CHECK | `CHECK (decision_role = ANY (ARRAY['buyer'::text, 'user'::text, 'approver'::text, 'intermediary'::text, 'unknown'::text]))` |  |  | sim |
| copilot_sessions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_sessions_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| copilot_sessions_sale_stage_check | CHECK | `CHECK (sale_stage = ANY (ARRAY['novo_contato'::text, 'qualificando'::text, 'apresentando'::text, 'negociando'::text, 'fechando'::text, 'pos_venda'::text, 'perdido'::text]))` |  |  | sim |
| copilot_sessions_temperature_check | CHECK | `CHECK (temperature >= 0 AND temperature <= 100)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.copilot_insights | copilot_insights_session_id_fkey | session_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_sessions_conversation_id_key | btree | conversation_id | sim | sim |  | `CREATE UNIQUE INDEX copilot_sessions_conversation_id_key ON public.copilot_sessions USING btree (conversation_id)` |
| copilot_sessions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_sessions_pkey ON public.copilot_sessions USING btree (id)` |
| idx_copilot_sessions_profile | btree | profile_id | não | sim |  | `CREATE INDEX idx_copilot_sessions_profile ON public.copilot_sessions USING btree (profile_id)` |
| idx_copilot_sessions_temperature | btree | temperature | não | sim |  | `CREATE INDEX idx_copilot_sessions_temperature ON public.copilot_sessions USING btree (temperature DESC)` |


## Policies (RLS)

### `service_role_sessions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |

### `vendor_own_sessions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | public |
| USING | `(profile_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_copilot_sessions_updated_at | BEFORE | UPDATE | ROW | enabled | public.copilot_sessions_updated_at |


## Grants

_nenhum_
