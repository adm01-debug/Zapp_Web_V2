# public.notifications

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `title` | `text` | não |  |  |  |
| 4 | `message` | `text` | não |  |  |  |
| 5 | `type` | `text` | não | `'info'::text` |  |  |
| 6 | `is_read` | `boolean` | sim | `false` |  |  |
| 7 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `read_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `dedupe_key` | `text` | sim |  |  | IA-047: chave idempotente do aviso (ux_notifications_user_dedupe_key: user_id+dedupe_key único, parcial). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| notifications_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| notifications_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_notifications_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC)` |
| idx_notifications_is_read | btree | is_read | não | sim |  | `CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read)` |
| idx_notifications_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id)` |
| notifications_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)` |
| ux_notifications_user_dedupe_key | btree | user_id, dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` | `CREATE UNIQUE INDEX ux_notifications_user_dedupe_key ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL)` |


## Policies (RLS)

### `Users can delete own notifications`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can insert own goal notifications`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((user_id = ( SELECT auth.uid() AS uid)) AND (type = 'goal'::text) AND (is_read IS FALSE) AND (read_at IS NULL) AND ((created_at >= (now() - '00:05:00'::interval)) AND (created_at <= (now() + '00:05:00'::interval))) AND ((length(title) >= 1) AND (length(title) <= 200)) AND ((length(message) >= 1) AND (length(message) <= 1000)) AND (dedupe_key ~ '^goal:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(daily\|weekly\|monthly):[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text) AND (jsonb_typeof(metadata) = 'object'::text) AND ((metadata ->> 'goal_id'::text) = split_part(dedupe_key, ':'::text, 3)) AND ((metadata ->> 'period'::text) = split_part(dedupe_key, ':'::text, 4)) AND ((metadata ->> 'goal_type'::text) = ANY (ARRAY['messages_sent'::text, 'conversations_resolved'::text, 'contacts_handled'::text, 'resolution_rate'::text, 'response_time'::text, 'satisfaction'::text])) AND (jsonb_typeof((metadata -> 'current'::text)) = 'number'::text) AND (jsonb_typeof((metadata -> 'target'::text)) = 'number'::text) AND (octet_length((metadata)::text) <= 2048) AND (metadata = jsonb_build_object('goal_id', (metadata -> 'goal_id'::text), 'goal_type', (metadata -> 'goal_type'::text), 'period', (metadata -> 'period'::text), 'current', (metadata -> 'current'::text), 'target', (metadata -> 'target'::text))) AND CASE     WHEN pg_input_is_valid(split_part(dedupe_key, ':'::text, 5), 'date'::text) THEN     CASE (metadata ->> 'period'::text)         WHEN 'daily'::text THEN (((split_part(dedupe_key, ':'::text, 5))::date >= (CURRENT_DATE - 1)) AND ((split_part(dedupe_key, ':'::text, 5))::date <= (CURRENT_DATE + 1)))         WHEN 'weekly'::text THEN ((EXTRACT(isodow FROM (split_part(dedupe_key, ':'::text, 5))::date) = (1)::numeric) AND (((split_part(dedupe_key, ':'::text, 5))::date >= (CURRENT_DATE - 8)) AND ((split_part(dedupe_key, ':'::text, 5))::date <= (CURRENT_DATE + 1))))         WHEN 'monthly'::text THEN ((EXTRACT(day FROM (split_part(dedupe_key, ':'::text, 5))::date) = (1)::numeric) AND (((split_part(dedupe_key, ':'::text, 5))::date >= ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval))::date) AND ((split_part(dedupe_key, ':'::text, 5))::date <= ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval))::date)))         ELSE false     END     ELSE false END AND (EXISTS ( SELECT 1    FROM goals_configurations goal   WHERE (((goal.id)::text = (notifications.metadata ->> 'goal_id'::text)) AND (goal.is_active IS TRUE) AND (goal.goal_type = (notifications.metadata ->> 'goal_type'::text)) AND ((goal.profile_id IN ( SELECT profile.id            FROM profiles profile           WHERE (profile.user_id = ( SELECT auth.uid() AS uid)))) OR ((goal.queue_id IS NOT NULL) AND (is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (goal.queue_id IN ( SELECT membership.queue_id            FROM (queue_members membership              JOIN profiles member_profile ON ((member_profile.id = membership.profile_id)))           WHERE (member_profile.user_id = ( SELECT auth.uid() AS uid))))))) AND ((notifications.metadata -> 'target'::text) = to_jsonb(         CASE (notifications.metadata ->> 'period'::text)             WHEN 'daily'::text THEN goal.daily_target             WHEN 'weekly'::text THEN goal.weekly_target             WHEN 'monthly'::text THEN goal.monthly_target             ELSE NULL::integer         END)) AND (((notifications.metadata ->> 'target'::text))::numeric > (0)::numeric)))) AND CASE     WHEN ((metadata ->> 'goal_type'::text) = 'response_time'::text) THEN ((((metadata ->> 'current'::text))::numeric > (0)::numeric) AND (((metadata ->> 'current'::text))::numeric <= ((metadata ->> 'target'::text))::numeric))     ELSE (((metadata ->> 'current'::text))::numeric >= ((metadata ->> 'target'::text))::numeric) END AND (abs(((metadata ->> 'current'::text))::numeric) <= ('1000000000000'::bigint)::numeric))` |

### `Users can mark own notifications as read`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK | `((user_id = ( SELECT auth.uid() AS uid)) AND (is_read IS TRUE) AND (read_at IS NOT NULL) AND (read_at >= (created_at - '00:05:00'::interval)) AND (read_at <= (now() + '00:05:00'::interval)))` |

### `Users can view own notifications`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
