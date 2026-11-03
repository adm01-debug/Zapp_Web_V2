# public.ai_providers

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `provider_type` | `ai_provider_type` | não | `'lovable_ai'::ai_provider_type` |  |  |
| 5 | `api_endpoint` | `text` | sim |  |  |  |
| 6 | `api_key_secret_name` | `text` | sim |  |  |  |
| 7 | `model` | `text` | sim |  |  |  |
| 8 | `system_prompt` | `text` | sim |  |  |  |
| 9 | `config` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 10 | `is_active` | `boolean` | não | `true` |  |  |
| 11 | `is_default` | `boolean` | não | `false` |  |  |
| 12 | `use_for` | `text[]` | não | `ARRAY['copilot'::text]` |  |  |
| 13 | `created_by` | `uuid` | sim |  |  |  |
| 14 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_providers_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| ai_providers_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.ai_model_prices | ai_model_prices_provider_id_fkey | provider_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_providers_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_providers_pkey ON public.ai_providers USING btree (id)` |
| idx_ai_providers_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_ai_providers_created_by ON public.ai_providers USING btree (created_by)` |


## Policies (RLS)

### `Admins can delete AI providers`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can insert AI providers`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `has_role(auth.uid(), 'admin'::app_role)` |

### `Admins can update AI providers`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can view AI providers`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| ensure_single_default_ai_provider | BEFORE | INSERT OR UPDATE | ROW | enabled | public.ensure_single_default_ai_provider |
| update_ai_providers_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
