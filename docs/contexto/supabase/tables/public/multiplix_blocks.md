# public.multiplix_blocks

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `dispatch_id` | `uuid` | não |  |  |  |
| 3 | `block_order` | `smallint` | não | `0` |  |  |
| 4 | `block_type` | `multiplix_block_type` | não |  |  |  |
| 5 | `template_text` | `text` | sim |  |  | LEGADO/DEPRECATED (F33): migrado para content->>'text'. Mantida; remover em passo posterior, apos o worker (F56) ler apenas `content`. |
| 6 | `voice_script` | `text` | sim |  |  | LEGADO/DEPRECATED (F33): migrado para content->'voice'->>'script'. Mantida; remover em passo posterior. |
| 7 | `voice_id` | `text` | sim |  |  |  |
| 8 | `media_url` | `text` | sim |  |  | LEGADO/DEPRECATED (F33): migrado para content->'media'->>'url'. Mantida; remover em passo posterior. |
| 9 | `media_caption` | `text` | sim |  |  | LEGADO/DEPRECATED (F33): migrado para content->'media'->>'caption'. Mantida; remover em passo posterior. |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `content` | `jsonb` | não | `'{}'::jsonb` |  | Payload do bloco (F33). JSONB; so as chaves presentes aparecem. Forma: {"text":string, "voice":{"script":string,"voice_id":string}, "media":{"url":string,"caption":string}, "asset":{"asset_id":uuid}}. Substitui template_text/voice_script/voice_id/media_url/media_caption. |
| 13 | `content_version` | `integer` | não | `1` |  | Versao do payload em `content` (incrementada a cada edicao relevante; default 1). |
| 14 | `content_hash` | `text` | sim |  |  | Hash do payload renderizado de `content` para o worker (F56) detectar conteudo desatualizado. |
| 15 | `asset_id` | `uuid` | sim |  |  | Referencia autoritativa do ativo de midia do bloco (quando houver). Espelhada em content.asset.asset_id. |
| 16 | `personalization_mode` | `text` | sim |  |  | Modo de personalizacao: same_audio (mesmo audio para todos) \| personalized (audio por destinatario). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_blocks_dispatch_id_fkey | FOREIGN KEY | `FOREIGN KEY (dispatch_id) REFERENCES multiplix_dispatches(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_blocks_dispatch_order | UNIQUE | `UNIQUE (dispatch_id, block_order)` |  |  | sim |
| multiplix_blocks_personalization_mode_check | CHECK | `CHECK (personalization_mode IS NULL OR (personalization_mode = ANY (ARRAY['same_audio'::text, 'personalized'::text])))` |  |  | sim |
| multiplix_blocks_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.multiplix_delivery_items | multiplix_delivery_items_block_id_fkey | block_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_blocks_dispatch_id | btree | dispatch_id | não | sim |  | `CREATE INDEX idx_multiplix_blocks_dispatch_id ON public.multiplix_blocks USING btree (dispatch_id)` |
| multiplix_blocks_dispatch_order | btree | dispatch_id, block_order | sim | sim |  | `CREATE UNIQUE INDEX multiplix_blocks_dispatch_order ON public.multiplix_blocks USING btree (dispatch_id, block_order)` |
| multiplix_blocks_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_blocks_pkey ON public.multiplix_blocks USING btree (id)` |


## Policies (RLS)

### `Users can delete blocks of own draft dispatches`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_blocks.dispatch_id) AND (md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (md.status = 'draft'::multiplix_dispatch_status)))))` |
| WITH CHECK |  |

### `Users can insert blocks into own draft dispatches`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_blocks.dispatch_id) AND (md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (md.status = 'draft'::multiplix_dispatch_status)))))` |

### `Users can update blocks of own draft dispatches`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_blocks.dispatch_id) AND (md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (md.status = 'draft'::multiplix_dispatch_status)))))` |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_blocks.dispatch_id) AND (md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (md.status = 'draft'::multiplix_dispatch_status)))))` |

### `Users can view blocks of accessible dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_blocks.dispatch_id) AND ((md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_multiplix_bump_version_on_block_change | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.multiplix_bump_version_on_block_change |
| update_multiplix_blocks_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
