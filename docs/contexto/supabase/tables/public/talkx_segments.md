# public.talkx_segments

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_segments (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 description text NULLABLE
4 origin text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 is_favorite boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 rules jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 estimated_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 last_used_at timestamp with time zone NULLABLE
10 created_by uuid NULLABLE
11 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 tags text[] NOT NULL [DEFAULT/EXPRESSION DEFINED] — Talk X (X101): etiquetas do segmento, buscaveis (indice GIN idx_talkx_segments_tags).
14 icon text NULLABLE — Talk X (X101): icone do cartao do segmento (lista do kit validada no front).
15 color text NULLABLE — Talk X (X101): cor do cartao do segmento (lista do kit validada no front).
16 details text NULLABLE — Talk X (X101): descricao longa do segmento (a "description" segue sendo a curta).
17 revision integer NOT NULL [DEFAULT/EXPRESSION DEFINED] — Talk X (X101): revisao publicada do segmento. Sobe a cada publicacao; o cliente manda a revisao que leu e a publicacao recusa revisao divergente (conflito entre abas).
18 draft_rules jsonb NULLABLE — Talk X (X101): rascunho das regras AINDA NAO publicadas. Nao altera "rules" (a revisao publicada) enquanto nao for publicada.
19 draft_saved_at timestamp with time zone NULLABLE — Talk X (X101): quando o rascunho foi gravado pela ultima vez (salvamento automatico).
20 published_at timestamp with time zone NULLABLE — Talk X (X101): quando a revisao atual de "rules" foi publicada.
21 published_by uuid NULLABLE — Talk X (X101): quem publicou a revisao atual de "rules".
22 archived_at timestamp with time zone NULLABLE — Talk X (X101): arquivado nesta data (decisao N22: sair de cena e ARQUIVAR, e o segmento some do filtro archived_at is null).
Constraints:
talkx_segments_origin_check: CHECK (origin = ANY (ARRAY['zapp'::text, 'crm360'::text, 'custom'::text]))
talkx_segments_status_check: CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text]))
talkx_segments_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
talkx_segments_published_by_fkey: FOREIGN KEY (published_by) REFERENCES profiles(id) ON DELETE SET NULL
talkx_segments_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
talkx_segments_delete [command=DELETE; roles=authenticated; PERMISSIVE]
talkx_segments_insert [command=INSERT; roles=authenticated; PERMISSIVE]
talkx_segments_select [command=SELECT; roles=authenticated; PERMISSIVE]
talkx_segments_update [command=UPDATE; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `origin` | `text` | não | `'zapp'::text` |  |  |
| 5 | `status` | `text` | não | `'active'::text` |  |  |
| 6 | `is_favorite` | `boolean` | não | `false` |  |  |
| 7 | `rules` | `jsonb` | não | `'{"groups": []}'::jsonb` |  |  |
| 8 | `estimated_count` | `integer` | não | `0` |  |  |
| 9 | `last_used_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `created_by` | `uuid` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `tags` | `text[]` | não | `'{}'::text[]` |  | Talk X (X101): etiquetas do segmento, buscaveis (indice GIN idx_talkx_segments_tags). |
| 14 | `icon` | `text` | sim |  |  | Talk X (X101): icone do cartao do segmento (lista do kit validada no front). |
| 15 | `color` | `text` | sim |  |  | Talk X (X101): cor do cartao do segmento (lista do kit validada no front). |
| 16 | `details` | `text` | sim |  |  | Talk X (X101): descricao longa do segmento (a "description" segue sendo a curta). |
| 17 | `revision` | `integer` | não | `0` |  | Talk X (X101): revisao publicada do segmento. Sobe a cada publicacao; o cliente manda a revisao que leu e a publicacao recusa revisao divergente (conflito entre abas). |
| 18 | `draft_rules` | `jsonb` | sim |  |  | Talk X (X101): rascunho das regras AINDA NAO publicadas. Nao altera "rules" (a revisao publicada) enquanto nao for publicada. |
| 19 | `draft_saved_at` | `timestamp with time zone` | sim |  |  | Talk X (X101): quando o rascunho foi gravado pela ultima vez (salvamento automatico). |
| 20 | `published_at` | `timestamp with time zone` | sim |  |  | Talk X (X101): quando a revisao atual de "rules" foi publicada. |
| 21 | `published_by` | `uuid` | sim |  |  | Talk X (X101): quem publicou a revisao atual de "rules". |
| 22 | `archived_at` | `timestamp with time zone` | sim |  |  | Talk X (X101): arquivado nesta data (decisao N22: sair de cena e ARQUIVAR, e o segmento some do filtro archived_at is null). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_segments_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_segments_origin_check | CHECK | `CHECK (origin = ANY (ARRAY['zapp'::text, 'crm360'::text, 'custom'::text]))` |  |  | sim |
| talkx_segments_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_segments_published_by_fkey | FOREIGN KEY | `FOREIGN KEY (published_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_segments_status_check | CHECK | `CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_campaign_segments | talkx_campaign_segments_segment_id_fkey | segment_id | CASCADE |
| public.talkx_campaigns | talkx_campaigns_segment_id_fkey | segment_id | SET NULL |
| public.talkx_segment_versions | talkx_segment_versions_segment_id_fkey | segment_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_segments_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_segments_created_by ON public.talkx_segments USING btree (created_by)` |
| idx_talkx_segments_published_by | btree | published_by | não | sim |  | `CREATE INDEX idx_talkx_segments_published_by ON public.talkx_segments USING btree (published_by)` |
| idx_talkx_segments_tags | gin | tags | não | sim |  | `CREATE INDEX idx_talkx_segments_tags ON public.talkx_segments USING gin (tags)` |
| talkx_segments_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_segments_pkey ON public.talkx_segments USING btree (id)` |


## Policies (RLS)

### `talkx_segments_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `talkx_segments_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1))` |

### `talkx_segments_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `talkx_segments_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK | `((created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| talkx_segments_usage_guard | BEFORE | DELETE OR UPDATE | ROW | enabled | public.talkx_segment_block_in_use |
| update_talkx_segments_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
