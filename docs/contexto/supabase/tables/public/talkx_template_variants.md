# public.talkx_template_variants

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
| 2 | `template_id` | `uuid` | não |  |  |  |
| 3 | `label` | `text` | não |  |  |  |
| 4 | `content` | `text` | não |  |  |  |
| 5 | `media_url` | `text` | sim |  |  |  |
| 6 | `media_type` | `text` | sim |  |  |  |
| 7 | `weight` | `integer` | não | `50` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_template_variants_content_check | CHECK | `CHECK (length(content) >= 1 AND length(content) <= 65536)` |  |  | sim |
| talkx_template_variants_label_check | CHECK | `CHECK (label = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))` |  |  | sim |
| talkx_template_variants_media_type_check | CHECK | `CHECK (media_type IS NULL OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))` |  |  | sim |
| talkx_template_variants_media_url_check | CHECK | `CHECK (media_url IS NULL OR length(media_url) <= 8192 AND media_url ~ '^https://'::text)` |  |  | sim |
| talkx_template_variants_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_template_variants_template_id_fkey | FOREIGN KEY | `FOREIGN KEY (template_id) REFERENCES talkx_templates(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_template_variants_template_id_label_key | UNIQUE | `UNIQUE (template_id, label)` |  |  | sim |
| talkx_template_variants_weight_check | CHECK | `CHECK (weight > 0 AND weight <= 100)` |  |  | sim |
| talkx_template_variants_weight_sum | t | `TRIGGER DEFERRABLE INITIALLY DEFERRED` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_recipients | talkx_recipients_variant_id_fkey | variant_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_template_variants_template | btree | template_id | não | sim |  | `CREATE INDEX idx_talkx_template_variants_template ON public.talkx_template_variants USING btree (template_id)` |
| talkx_template_variants_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_template_variants_pkey ON public.talkx_template_variants USING btree (id)` |
| talkx_template_variants_template_id_label_key | btree | template_id, label | sim | sim |  | `CREATE UNIQUE INDEX talkx_template_variants_template_id_label_key ON public.talkx_template_variants USING btree (template_id, label)` |


## Policies (RLS)

### `talkx_template_variants_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_templates template   WHERE ((template.id = talkx_template_variants.template_id) AND ((template.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |

### `talkx_template_variants_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(EXISTS ( SELECT 1    FROM talkx_templates template   WHERE ((template.id = talkx_template_variants.template_id) AND ((template.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |

### `talkx_template_variants_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() IS NOT NULL)` |
| WITH CHECK |  |

### `talkx_template_variants_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_templates template   WHERE ((template.id = talkx_template_variants.template_id) AND ((template.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK | `(EXISTS ( SELECT 1    FROM talkx_templates template   WHERE ((template.id = talkx_template_variants.template_id) AND ((template.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| talkx_template_variants_weight_sum | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.talkx_validate_template_variant_weights |


## Grants

_nenhum_
