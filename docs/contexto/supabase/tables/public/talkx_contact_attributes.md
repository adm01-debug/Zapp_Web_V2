# public.talkx_contact_attributes

> Talk X · projeção de atributos comerciais por contato (X037). Nesta leva só as colunas de compra/RFM (X040); as colunas de CRM entram por ALTER nas ondas de banco.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_contact_attributes (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 contact_id uuid NOT NULL
2 last_purchase_at timestamp with time zone NULLABLE
3 orders_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 total_spent numeric(14,2) NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 avg_ticket numeric(14,2) NULLABLE
6 rfm_recency_days integer NULLABLE
7 rfm_frequency integer NULLABLE
8 rfm_monetary integer NULLABLE
9 rfm_segment text NULLABLE
10 purchases_synced_at timestamp with time zone NULLABLE
11 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
talkx_contact_attributes_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
talkx_contact_attributes_pkey: PRIMARY KEY (contact_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
talkx_contact_attributes_select [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `contact_id` | `uuid` | não |  |  |  |
| 2 | `last_purchase_at` | `timestamp with time zone` | sim |  |  |  |
| 3 | `orders_count` | `integer` | não | `0` |  |  |
| 4 | `total_spent` | `numeric(14,2)` | não | `0` |  |  |
| 5 | `avg_ticket` | `numeric(14,2)` | sim |  |  |  |
| 6 | `rfm_recency_days` | `integer` | sim |  |  |  |
| 7 | `rfm_frequency` | `integer` | sim |  |  |  |
| 8 | `rfm_monetary` | `integer` | sim |  |  |  |
| 9 | `rfm_segment` | `text` | sim |  |  |  |
| 10 | `purchases_synced_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_contact_attributes_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_contact_attributes_pkey | PRIMARY KEY | `PRIMARY KEY (contact_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_contact_attributes_last_purchase_idx | btree | last_purchase_at | não | sim |  | `CREATE INDEX talkx_contact_attributes_last_purchase_idx ON public.talkx_contact_attributes USING btree (last_purchase_at)` |
| talkx_contact_attributes_pkey | btree | contact_id | sim | sim |  | `CREATE UNIQUE INDEX talkx_contact_attributes_pkey ON public.talkx_contact_attributes USING btree (contact_id)` |
| talkx_contact_attributes_purchases_synced_idx | btree | purchases_synced_at | não | sim |  | `CREATE INDEX talkx_contact_attributes_purchases_synced_idx ON public.talkx_contact_attributes USING btree (purchases_synced_at)` |
| talkx_contact_attributes_rfm_segment_idx | btree | rfm_segment | não | sim |  | `CREATE INDEX talkx_contact_attributes_rfm_segment_idx ON public.talkx_contact_attributes USING btree (rfm_segment)` |


## Policies (RLS)

### `talkx_contact_attributes_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
