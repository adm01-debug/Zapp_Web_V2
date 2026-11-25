# public.ai_usage_outbox

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.ai_usage_outbox (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 payload jsonb NOT NULL
3 motivo text NOT NULL
4 tentativas integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 processed_at timestamp with time zone NULLABLE
Constraints:
ai_usage_outbox_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
ai_usage_outbox_service_role [command=ALL; roles=service_role; PERMISSIVE]

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
| 2 | `payload` | `jsonb` | não |  |  |  |
| 3 | `motivo` | `text` | não |  |  |  |
| 4 | `tentativas` | `integer` | não | `0` |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `processed_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_usage_outbox_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_usage_outbox_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_usage_outbox_pkey ON public.ai_usage_outbox USING btree (id)` |
| idx_ai_usage_outbox_pendentes | btree | tentativas, created_at | não | sim | `(processed_at IS NULL)` | `CREATE INDEX idx_ai_usage_outbox_pendentes ON public.ai_usage_outbox USING btree (tentativas, created_at) WHERE (processed_at IS NULL)` |


## Policies (RLS)

### `ai_usage_outbox_service_role`

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
