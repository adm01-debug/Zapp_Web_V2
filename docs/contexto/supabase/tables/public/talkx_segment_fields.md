# public.talkx_segment_fields

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_segment_fields (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 field text NOT NULL
2 category text NOT NULL
3 source text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 expr text NOT NULL
5 kind text NOT NULL
6 ops text[] NOT NULL
7 enabled boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
talkx_segment_fields_kind_check: CHECK (kind = ANY (ARRAY['text'::text, 'array'::text, 'number'::text, 'date'::text, 'enum'::text, 'uuid'::text]))
talkx_segment_fields_pkey: PRIMARY KEY (field)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
talkx_segment_fields_select [command=SELECT; roles=authenticated; PERMISSIVE]
talkx_segment_fields_service_role_write [command=ALL; roles=service_role; PERMISSIVE]

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
| 1 | `field` | `text` | não |  |  |  |
| 2 | `category` | `text` | não |  |  |  |
| 3 | `source` | `text` | não | `'contacts'::text` |  |  |
| 4 | `expr` | `text` | não |  |  |  |
| 5 | `kind` | `text` | não |  |  |  |
| 6 | `ops` | `text[]` | não |  |  |  |
| 7 | `enabled` | `boolean` | não | `true` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_segment_fields_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['text'::text, 'array'::text, 'number'::text, 'date'::text, 'enum'::text, 'uuid'::text]))` |  |  | sim |
| talkx_segment_fields_pkey | PRIMARY KEY | `PRIMARY KEY (field)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_segment_fields_pkey | btree | field | sim | sim |  | `CREATE UNIQUE INDEX talkx_segment_fields_pkey ON public.talkx_segment_fields USING btree (field)` |


## Policies (RLS)

### `talkx_segment_fields_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `talkx_segment_fields_service_role_write`

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
