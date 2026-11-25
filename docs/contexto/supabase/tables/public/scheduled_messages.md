# public.scheduled_messages

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.scheduled_messages (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 content text NOT NULL
4 message_type text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 media_url text NULLABLE
6 scheduled_at timestamp with time zone NOT NULL
7 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 sent_at timestamp with time zone NULLABLE
9 error_message text NULLABLE
10 created_by uuid NULLABLE
11 whatsapp_connection_id uuid NULLABLE
12 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
14 message_id uuid NULLABLE — Id da mensagem enfileirada pelo despacho (dispatch_scheduled_messages); nulo até o envio concluir.
Constraints:
scheduled_messages_message_type_valid_check: CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'poll'::text, 'contact'::text])) NOT VALID
scheduled_messages_status_valid_check: CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])) NOT VALID
scheduled_messages_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
scheduled_messages_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id)
scheduled_messages_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)
scheduled_messages_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Users can create scheduled messages" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can delete their scheduled messages" [command=DELETE; roles=authenticated; PERMISSIVE]
"Users can update their scheduled messages" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can view their scheduled messages" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `content` | `text` | não |  |  |  |
| 4 | `message_type` | `text` | não | `'text'::text` |  |  |
| 5 | `media_url` | `text` | sim |  |  |  |
| 6 | `scheduled_at` | `timestamp with time zone` | não |  |  |  |
| 7 | `status` | `text` | não | `'pending'::text` |  |  |
| 8 | `sent_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `error_message` | `text` | sim |  |  |  |
| 10 | `created_by` | `uuid` | sim |  |  |  |
| 11 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `message_id` | `uuid` | sim |  |  | Id da mensagem enfileirada pelo despacho (dispatch_scheduled_messages); nulo até o envio concluir. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| scheduled_messages_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| scheduled_messages_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| scheduled_messages_message_type_valid_check | CHECK | `CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'poll'::text, 'contact'::text])) NOT VALID` |  |  | não |
| scheduled_messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| scheduled_messages_status_valid_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])) NOT VALID` |  |  | não |
| scheduled_messages_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_scheduled_messages_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_scheduled_messages_contact_id ON public.scheduled_messages USING btree (contact_id)` |
| idx_scheduled_messages_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_scheduled_messages_created_by ON public.scheduled_messages USING btree (created_by)` |
| idx_scheduled_messages_pending | btree | scheduled_at | não | sim | `(status = 'pending'::text)` | `CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_messages USING btree (scheduled_at) WHERE (status = 'pending'::text)` |
| idx_scheduled_messages_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_scheduled_messages_whatsapp_connection_id ON public.scheduled_messages USING btree (whatsapp_connection_id)` |
| scheduled_messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX scheduled_messages_pkey ON public.scheduled_messages USING btree (id)` |


## Policies (RLS)

### `Users can create scheduled messages`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR ((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)) AND user_has_permission(( SELECT auth.uid() AS uid), 'send_messages'::text)))` |

### `Users can delete their scheduled messages`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Users can update their scheduled messages`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR ((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)) AND user_has_permission(( SELECT auth.uid() AS uid), 'send_messages'::text)))` |

### `Users can view their scheduled messages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_scheduled_messages_state_machine | BEFORE | INSERT OR UPDATE | ROW | enabled | public.enforce_scheduled_message_state |
| update_scheduled_messages_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
