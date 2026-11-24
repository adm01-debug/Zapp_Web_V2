# public.sales_deals

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.sales_deals (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 title text NOT NULL
3 value numeric(12,2) NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 currency text NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 stage_id uuid NULLABLE
6 contact_id uuid NULLABLE
7 assigned_to uuid NULLABLE
8 priority text NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 expected_close_date date NULLABLE
10 notes text NULLABLE
11 tags text[] NULLABLE [DEFAULT/EXPRESSION DEFINED]
12 status text NULLABLE [DEFAULT/EXPRESSION DEFINED]
13 won_at timestamp with time zone NULLABLE
14 lost_at timestamp with time zone NULLABLE
15 lost_reason text NULLABLE
16 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
17 updated_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
sales_deals_assigned_to_fkey: FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL
sales_deals_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
sales_deals_stage_id_fkey: FOREIGN KEY (stage_id) REFERENCES sales_pipeline_stages(id) ON DELETE SET NULL
sales_deals_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete deals" [command=DELETE; roles=authenticated; PERMISSIVE]
"Users can insert deals" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can update assigned deals" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can view assigned or admin deals" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `title` | `text` | não |  |  |  |
| 3 | `value` | `numeric(12,2)` | sim | `0` |  |  |
| 4 | `currency` | `text` | sim | `'BRL'::text` |  |  |
| 5 | `stage_id` | `uuid` | sim |  |  |  |
| 6 | `contact_id` | `uuid` | sim |  |  |  |
| 7 | `assigned_to` | `uuid` | sim |  |  |  |
| 8 | `priority` | `text` | sim | `'medium'::text` |  |  |
| 9 | `expected_close_date` | `date` | sim |  |  |  |
| 10 | `notes` | `text` | sim |  |  |  |
| 11 | `tags` | `text[]` | sim | `'{}'::text[]` |  |  |
| 12 | `status` | `text` | sim | `'open'::text` |  |  |
| 13 | `won_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `lost_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `lost_reason` | `text` | sim |  |  |  |
| 16 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 17 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sales_deals_assigned_to_fkey | FOREIGN KEY | `FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| sales_deals_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| sales_deals_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| sales_deals_stage_id_fkey | FOREIGN KEY | `FOREIGN KEY (stage_id) REFERENCES sales_pipeline_stages(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.deal_activities | deal_activities_deal_id_fkey | deal_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_sales_deals_assigned_to | btree | assigned_to | não | sim |  | `CREATE INDEX idx_sales_deals_assigned_to ON public.sales_deals USING btree (assigned_to)` |
| idx_sales_deals_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_sales_deals_contact_id ON public.sales_deals USING btree (contact_id)` |
| idx_sales_deals_stage_id | btree | stage_id | não | sim |  | `CREATE INDEX idx_sales_deals_stage_id ON public.sales_deals USING btree (stage_id)` |
| sales_deals_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX sales_deals_pkey ON public.sales_deals USING btree (id)` |


## Policies (RLS)

### `Admins can delete deals`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can insert deals`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((assigned_to IS NULL) OR (assigned_to IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `Users can update assigned deals`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((assigned_to IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK | `((assigned_to IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `Users can view assigned or admin deals`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (assigned_to IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_sales_deals_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
