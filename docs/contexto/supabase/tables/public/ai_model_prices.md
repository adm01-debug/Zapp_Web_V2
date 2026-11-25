# public.ai_model_prices

> IA-055: tarifas versionadas por modelo/unidade. valid_from inclusivo, valid_to exclusivo (NULL = vigente). source separa tarifa interna de tarifa reconciliada com o extrato do provedor.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.ai_model_prices (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 provider_id uuid NULLABLE
3 model text NOT NULL
4 unit text NOT NULL
5 currency text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 unit_price numeric(18,8) NOT NULL
7 valid_from timestamp with time zone NOT NULL
8 valid_to timestamp with time zone NULLABLE
9 source text NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 notes text NULLABLE
11 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
ai_model_prices_currency_check: CHECK (char_length(currency) = 3)
ai_model_prices_price_check: CHECK (unit_price >= 0::numeric)
ai_model_prices_source_check: CHECK (source = ANY (ARRAY['internal'::text, 'provider_statement'::text]))
ai_model_prices_unit_check: CHECK (unit = ANY (ARRAY['token'::text, 'input_token'::text, 'output_token'::text, 'character'::text, 'second'::text, 'request'::text]))
ai_model_prices_vigencia_check: CHECK (valid_to IS NULL OR valid_to > valid_from)
ai_model_prices_provider_id_fkey: FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
ai_model_prices_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
authenticated_read_ai_model_prices [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `provider_id` | `uuid` | sim |  |  |  |
| 3 | `model` | `text` | não |  |  |  |
| 4 | `unit` | `text` | não |  |  |  |
| 5 | `currency` | `text` | não | `'USD'::text` |  |  |
| 6 | `unit_price` | `numeric(18,8)` | não |  |  |  |
| 7 | `valid_from` | `timestamp with time zone` | não |  |  |  |
| 8 | `valid_to` | `timestamp with time zone` | sim |  |  |  |
| 9 | `source` | `text` | não | `'internal'::text` |  |  |
| 10 | `notes` | `text` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_model_prices_currency_check | CHECK | `CHECK (char_length(currency) = 3)` |  |  | sim |
| ai_model_prices_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| ai_model_prices_price_check | CHECK | `CHECK (unit_price >= 0::numeric)` |  |  | sim |
| ai_model_prices_provider_id_fkey | FOREIGN KEY | `FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| ai_model_prices_source_check | CHECK | `CHECK (source = ANY (ARRAY['internal'::text, 'provider_statement'::text]))` |  |  | sim |
| ai_model_prices_unit_check | CHECK | `CHECK (unit = ANY (ARRAY['token'::text, 'input_token'::text, 'output_token'::text, 'character'::text, 'second'::text, 'request'::text]))` |  |  | sim |
| ai_model_prices_vigencia_check | CHECK | `CHECK (valid_to IS NULL OR valid_to > valid_from)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_model_prices_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_model_prices_pkey ON public.ai_model_prices USING btree (id)` |
| idx_ai_model_prices_provider_id | btree | provider_id | não | sim |  | `CREATE INDEX idx_ai_model_prices_provider_id ON public.ai_model_prices USING btree (provider_id)` |
| idx_ai_model_prices_vigencia | btree | model, unit, valid_from | não | sim |  | `CREATE INDEX idx_ai_model_prices_vigencia ON public.ai_model_prices USING btree (model, unit, valid_from DESC)` |
| uq_ai_model_prices_vigencia | btree | model, unit, valid_from, source | sim | sim |  | `CREATE UNIQUE INDEX uq_ai_model_prices_vigencia ON public.ai_model_prices USING btree (model, unit, valid_from, source)` |


## Policies (RLS)

### `authenticated_read_ai_model_prices`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
