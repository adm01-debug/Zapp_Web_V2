# public.away_messages

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.away_messages (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 whatsapp_connection_id uuid NOT NULL
3 content text NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 is_enabled boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
away_messages_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE
away_messages_pkey: PRIMARY KEY (id)
away_messages_whatsapp_connection_id_key: UNIQUE (whatsapp_connection_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage away messages" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated users can view away messages" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 3 | `content` | `text` | sim | `'Estamos fora do horário de atendimento. Retornaremos em breve!'::text` |  |  |
| 4 | `is_enabled` | `boolean` | sim | `true` |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| away_messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| away_messages_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| away_messages_whatsapp_connection_id_key | UNIQUE | `UNIQUE (whatsapp_connection_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| away_messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX away_messages_pkey ON public.away_messages USING btree (id)` |
| away_messages_whatsapp_connection_id_key | btree | whatsapp_connection_id | sim | sim |  | `CREATE UNIQUE INDEX away_messages_whatsapp_connection_id_key ON public.away_messages USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage away messages`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated users can view away messages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_away_messages_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
