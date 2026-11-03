# public.instance_pauses

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
| 2 | `instance` | `text` | não |  |  | Identificador da conexao de WhatsApp (public.whatsapp_connections.instance_id). |
| 3 | `paused_until` | `timestamp with time zone` | não |  |  |  |
| 4 | `reason` | `text` | não |  |  |  |
| 5 | `paused_by` | `uuid` | sim |  |  |  |
| 6 | `auto` | `boolean` | não | `false` |  |  |
| 7 | `resumed_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `resumed_by` | `uuid` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| instance_pauses_autor_obrigatorio | CHECK | `CHECK (auto OR paused_by IS NOT NULL)` |  |  | sim |
| instance_pauses_paused_by_fkey | FOREIGN KEY | `FOREIGN KEY (paused_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| instance_pauses_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| instance_pauses_reason_nao_vazio | CHECK | `CHECK (btrim(reason) <> ''::text)` |  |  | sim |
| instance_pauses_resume_consistente | CHECK | `CHECK (resumed_at IS NOT NULL OR resumed_by IS NULL)` |  |  | sim |
| instance_pauses_resumed_by_fkey | FOREIGN KEY | `FOREIGN KEY (resumed_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_instance_pauses_paused_by | btree | paused_by | não | sim |  | `CREATE INDEX idx_instance_pauses_paused_by ON public.instance_pauses USING btree (paused_by)` |
| idx_instance_pauses_resumed_by | btree | resumed_by | não | sim |  | `CREATE INDEX idx_instance_pauses_resumed_by ON public.instance_pauses USING btree (resumed_by)` |
| instance_pauses_abertas_unicas | btree | instance | sim | sim | `(resumed_at IS NULL)` | `CREATE UNIQUE INDEX instance_pauses_abertas_unicas ON public.instance_pauses USING btree (instance) WHERE (resumed_at IS NULL)` |
| instance_pauses_instance_idx | btree | instance | não | sim |  | `CREATE INDEX instance_pauses_instance_idx ON public.instance_pauses USING btree (instance)` |
| instance_pauses_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX instance_pauses_pkey ON public.instance_pauses USING btree (id)` |


## Policies (RLS)

### `instance_pauses_select_staff`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
