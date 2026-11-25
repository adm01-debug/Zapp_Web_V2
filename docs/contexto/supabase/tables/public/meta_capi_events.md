# public.meta_capi_events

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.meta_capi_events (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 event_name text NOT NULL
3 event_time timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 contact_id uuid NULLABLE
5 pixel_id text NULLABLE
6 event_source_url text NULLABLE
7 action_source text NULLABLE [DEFAULT/EXPRESSION DEFINED]
8 custom_data jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 sent_to_meta boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 meta_response jsonb NULLABLE
11 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
meta_capi_events_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
meta_capi_events_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage capi events" [command=ALL; roles=authenticated; PERMISSIVE]

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
| 2 | `event_name` | `text` | não |  |  |  |
| 3 | `event_time` | `timestamp with time zone` | sim | `now()` |  |  |
| 4 | `contact_id` | `uuid` | sim |  |  |  |
| 5 | `pixel_id` | `text` | sim |  |  |  |
| 6 | `event_source_url` | `text` | sim |  |  |  |
| 7 | `action_source` | `text` | sim | `'chat'::text` |  |  |
| 8 | `custom_data` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 9 | `sent_to_meta` | `boolean` | sim | `false` |  |  |
| 10 | `meta_response` | `jsonb` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| meta_capi_events_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| meta_capi_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_meta_capi_events_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_meta_capi_events_contact_id ON public.meta_capi_events USING btree (contact_id)` |
| meta_capi_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX meta_capi_events_pkey ON public.meta_capi_events USING btree (id)` |


## Policies (RLS)

### `Admins can manage capi events`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |


## Triggers

_nenhum_


## Grants

_nenhum_
