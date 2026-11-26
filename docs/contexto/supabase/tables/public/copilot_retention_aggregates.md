# public.copilot_retention_aggregates

> CV-143 — agregados diários de uso do copiloto RADAR por atendente.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_retention_aggregates (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 profile_id uuid NOT NULL
3 agg_date date NOT NULL
4 sessions_opened integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 ticks_processed integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 insights_gen integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 brinde_complete integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 avg_temperature numeric(5,2) NULLABLE
9 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_retention_aggregates_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES auth.users(id) ON DELETE CASCADE
copilot_retention_aggregates_pkey: PRIMARY KEY (id)
copilot_retention_aggregates_profile_id_agg_date_key: UNIQUE (profile_id, agg_date)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
own_retention [command=SELECT; roles=authenticated; PERMISSIVE]
service_role_retention [command=ALL; roles=service_role; PERMISSIVE]

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
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `agg_date` | `date` | não |  |  |  |
| 4 | `sessions_opened` | `integer` | não | `0` |  |  |
| 5 | `ticks_processed` | `integer` | não | `0` |  |  |
| 6 | `insights_gen` | `integer` | não | `0` |  |  |
| 7 | `brinde_complete` | `integer` | não | `0` |  |  |
| 8 | `avg_temperature` | `numeric(5,2)` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_retention_aggregates_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_retention_aggregates_profile_id_agg_date_key | UNIQUE | `UNIQUE (profile_id, agg_date)` |  |  | sim |
| copilot_retention_aggregates_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_retention_aggregates_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_retention_aggregates_pkey ON public.copilot_retention_aggregates USING btree (id)` |
| copilot_retention_aggregates_profile_id_agg_date_key | btree | profile_id, agg_date | sim | sim |  | `CREATE UNIQUE INDEX copilot_retention_aggregates_profile_id_agg_date_key ON public.copilot_retention_aggregates USING btree (profile_id, agg_date)` |
| idx_copilot_retention_profile_date | btree | profile_id, agg_date | não | sim |  | `CREATE INDEX idx_copilot_retention_profile_date ON public.copilot_retention_aggregates USING btree (profile_id, agg_date DESC)` |


## Policies (RLS)

### `admin_supervisor_retention`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `own_retention`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `service_role_retention`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
