# public.talkx_template_versions

> Historico imutavel de templates Talk X; escrita somente pela RPC atomica canonica.

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
| 2 | `template_id` | `uuid` | não |  |  |  |
| 3 | `version_number` | `integer` | não |  |  |  |
| 4 | `name` | `text` | não |  |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `category` | `text` | não |  |  |  |
| 7 | `status` | `text` | não | `'draft'::text` |  |  |
| 8 | `media_url` | `text` | sim |  |  |  |
| 9 | `media_type` | `text` | sim |  |  |  |
| 10 | `tags` | `text[]` | não | `'{}'::text[]` |  |  |
| 11 | `custom_variables` | `text[]` | não | `'{}'::text[]` |  |  |
| 12 | `saved_by` | `uuid` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `statement_timestamp()` |  |  |
| 14 | `description` | `text` | sim |  |  |  |
| 15 | `note` | `text` | sim |  |  | Nota do usuario no momento de salvar o template (cartao t_a3551220). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_template_versions_media_type_check | CHECK | `CHECK (media_type IS NULL OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))` |  |  | sim |
| talkx_template_versions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_template_versions_saved_by_fkey | FOREIGN KEY | `FOREIGN KEY (saved_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_template_versions_status_check | CHECK | `CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text]))` |  |  | sim |
| talkx_template_versions_template_id_fkey | FOREIGN KEY | `FOREIGN KEY (template_id) REFERENCES talkx_templates(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_template_versions_template_id_version_number_key | UNIQUE | `UNIQUE (template_id, version_number)` |  |  | sim |
| talkx_template_versions_version_positive | CHECK | `CHECK (version_number > 0)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_campaigns | talkx_campaigns_template_version_id_fkey | template_version_id | SET NULL |
| public.talkx_templates | talkx_templates_current_version_id_fkey | current_version_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_template_versions_saved_by | btree | saved_by | não | sim |  | `CREATE INDEX idx_talkx_template_versions_saved_by ON public.talkx_template_versions USING btree (saved_by)` |
| idx_talkx_template_versions_template_id | btree | template_id | não | sim |  | `CREATE INDEX idx_talkx_template_versions_template_id ON public.talkx_template_versions USING btree (template_id)` |
| talkx_template_versions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_template_versions_pkey ON public.talkx_template_versions USING btree (id)` |
| talkx_template_versions_template_id_version_number_key | btree | template_id, version_number | sim | sim |  | `CREATE UNIQUE INDEX talkx_template_versions_template_id_version_number_key ON public.talkx_template_versions USING btree (template_id, version_number)` |


## Policies (RLS)

### `talkx_template_versions_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1    FROM talkx_templates template   WHERE (template.id = talkx_template_versions.template_id))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_guard_talkx_template_version_immutable | BEFORE | INSERT OR DELETE OR UPDATE | ROW | enabled | public.guard_talkx_template_version_immutable |


## Grants

_nenhum_
