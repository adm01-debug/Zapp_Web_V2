# public.ai_providers

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.ai_providers (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 description text NULLABLE
4 provider_type ai_provider_type NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 api_endpoint text NULLABLE
6 api_key_secret_name text NULLABLE
7 model text NULLABLE
8 system_prompt text NULLABLE
9 config jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 is_active boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 is_default boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 use_for text[] NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 created_by uuid NULLABLE
14 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
15 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
ai_providers_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id)
ai_providers_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete AI providers" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can insert AI providers" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins can update AI providers" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Admins can view AI providers" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| ai_providers_api_endpoint_safe | CHECK | `CHECK (ai_provider_endpoint_is_safe(api_endpoint))` |  |  | sim |
| ai_providers_api_key_secret_name_safe | CHECK | `CHECK (ai_provider_secret_name_is_safe(api_key_secret_name))` |  |  | sim |
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
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can insert AI providers`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |

### `Admins can update AI providers`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can view AI providers`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| ensure_single_default_ai_provider | BEFORE | INSERT OR UPDATE | ROW | enabled | public.ensure_single_default_ai_provider |
| update_ai_providers_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
