# public.multiplix_events

> Trilha append-only do motor de envio Multiplix (F34). So cresce: DELETE sempre rejeitado e UPDATE so e aceito quando seu unico efeito e zerar uma FK (trigger guard_multiplix_event_immutable). FKs: dispatch_id e recipient_id ON DELETE RESTRICT (evento e registro historico).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `dispatch_id` | `uuid` | não |  |  |  |
| 3 | `recipient_id` | `uuid` | sim |  |  |  |
| 4 | `item_id` | `uuid` | sim |  |  |  |
| 5 | `kind` | `text` | não |  |  | Tipo do evento. Vocabulario inicial (text+CHECK): dispatch_*/recipient_*/item_* + note. Evolui por migration. |
| 6 | `payload` | `jsonb` | sim |  |  | Dados do evento (livre). Nao guardar segredo/PII: a leitura por authenticated passa pela RLS do dispatch. |
| 7 | `correlation_id` | `uuid` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_events_dispatch_id_fkey | FOREIGN KEY | `FOREIGN KEY (dispatch_id) REFERENCES multiplix_dispatches(id) ON DELETE RESTRICT` | RESTRICT | NO ACTION | sim |
| multiplix_events_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['dispatch_created'::text, 'dispatch_scheduled'::text, 'dispatch_started'::text, 'dispatch_paused'::text, 'dispatch_resumed'::text, 'dispatch_completed'::text, 'dispatch_failed'::text, 'dispatch_cancelled'::text, 'recipient_queued'::text, 'recipient_claimed'::text, 'recipient_sent'::text, 'recipient_delivered'::text, 'recipient_read'::text, 'recipient_failed'::text, 'recipient_skipped'::text, 'recipient_cancelled'::text, 'recipient_outcome_unknown'::text, 'item_queued'::text, 'item_claimed'::text, 'item_sent'::text, 'item_delivered'::text, 'item_read'::text, 'item_failed'::text, 'item_rescheduled'::text, 'item_dead_letter'::text, 'item_skipped'::text, 'item_cancelled'::text, 'connection_at_risk'::text, 'connection_failure'::text, 'note'::text]))` |  |  | sim |
| multiplix_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| multiplix_events_recipient_id_fkey | FOREIGN KEY | `FOREIGN KEY (recipient_id) REFERENCES multiplix_recipients(id) ON DELETE RESTRICT` | RESTRICT | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_events_correlation | btree | correlation_id | não | sim | `(correlation_id IS NOT NULL)` | `CREATE INDEX idx_multiplix_events_correlation ON public.multiplix_events USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)` |
| idx_multiplix_events_dispatch_created | btree | dispatch_id, created_at | não | sim |  | `CREATE INDEX idx_multiplix_events_dispatch_created ON public.multiplix_events USING btree (dispatch_id, created_at DESC)` |
| idx_multiplix_events_recipient | btree | recipient_id | não | sim | `(recipient_id IS NOT NULL)` | `CREATE INDEX idx_multiplix_events_recipient ON public.multiplix_events USING btree (recipient_id) WHERE (recipient_id IS NOT NULL)` |
| multiplix_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_events_pkey ON public.multiplix_events USING btree (id)` |


## Policies (RLS)

### `Users can view events of accessible dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_events.dispatch_id) AND ((md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_guard_multiplix_event_immutable | BEFORE | DELETE OR UPDATE | ROW | enabled | public.guard_multiplix_event_immutable |


## Grants

_nenhum_
