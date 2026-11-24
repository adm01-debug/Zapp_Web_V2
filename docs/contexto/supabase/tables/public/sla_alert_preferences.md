# public.sla_alert_preferences

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.sla_alert_preferences (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 user_id uuid NOT NULL
2 enabled boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 alert_first_response boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 alert_resolution boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 severity_warning boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 severity_breached boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
sla_alert_preferences_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
sla_alert_preferences_pkey: PRIMARY KEY (user_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
sla_alert_preferences_insert_policy [command=INSERT; roles=authenticated; PERMISSIVE]
sla_alert_preferences_select_policy [command=SELECT; roles=authenticated; PERMISSIVE]
sla_alert_preferences_update_policy [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 1 | `user_id` | `uuid` | não |  |  |  |
| 2 | `enabled` | `boolean` | não | `true` |  |  |
| 3 | `alert_first_response` | `boolean` | não | `true` |  |  |
| 4 | `alert_resolution` | `boolean` | não | `true` |  |  |
| 5 | `severity_warning` | `boolean` | não | `true` |  |  |
| 6 | `severity_breached` | `boolean` | não | `true` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sla_alert_preferences_pkey | PRIMARY KEY | `PRIMARY KEY (user_id)` |  |  | sim |
| sla_alert_preferences_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| sla_alert_preferences_pkey | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX sla_alert_preferences_pkey ON public.sla_alert_preferences USING btree (user_id)` |


## Policies (RLS)

### `sla_alert_preferences_insert_policy`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT auth.uid() AS uid))` |

### `sla_alert_preferences_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `sla_alert_preferences_update_policy`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK | `(user_id = ( SELECT auth.uid() AS uid))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| sla_alert_preferences_set_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
