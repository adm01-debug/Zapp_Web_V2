# public.talkx_templates

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_templates (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 description text NULLABLE
4 category text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 content text NOT NULL
6 media_url text NULLABLE
7 media_type text NULLABLE
8 tags text[] NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 use_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 created_by uuid NULLABLE
12 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
14 custom_variables text[] NOT NULL [DEFAULT/EXPRESSION DEFINED]
15 current_version_id uuid NULLABLE — Versao (talkx_template_versions.id) que corresponde ao conteudo VIVO do template. Mantida por update_talkx_template_with_snapshot.
16 channel text NOT NULL [DEFAULT/EXPRESSION DEFINED]
17 icon text NULLABLE
18 interactive jsonb NULLABLE
19 media_file_name text NULLABLE
20 media_size_bytes bigint NULLABLE
21 media_width integer NULLABLE
22 media_height integer NULLABLE
23 archived_at timestamp with time zone NULLABLE
Constraints:
talkx_templates_channel_check: CHECK (channel = 'whatsapp'::text)
talkx_templates_icon_check: CHECK (icon IS NULL OR char_length(icon) <= 16)
talkx_templates_media_type_check: CHECK (media_type IS NULL OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))
talkx_templates_status_check: CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text]))
talkx_templates_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
talkx_templates_current_version_id_fkey: FOREIGN KEY (current_version_id) REFERENCES talkx_template_versions(id) ON DELETE SET NULL
talkx_templates_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
talkx_templates_delete [command=DELETE; roles=authenticated; PERMISSIVE]
talkx_templates_insert [command=INSERT; roles=authenticated; PERMISSIVE]
talkx_templates_select [command=SELECT; roles=authenticated; PERMISSIVE]
talkx_templates_update [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 4 | `category` | `text` | não | `'geral'::text` |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `media_url` | `text` | sim |  |  |  |
| 7 | `media_type` | `text` | sim |  |  |  |
| 8 | `tags` | `text[]` | não | `'{}'::text[]` |  |  |
| 9 | `status` | `text` | não | `'approved'::text` |  |  |
| 10 | `use_count` | `integer` | não | `0` |  |  |
| 11 | `created_by` | `uuid` | sim |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `custom_variables` | `text[]` | não | `'{}'::text[]` |  |  |
| 15 | `current_version_id` | `uuid` | sim |  |  | Versao (talkx_template_versions.id) que corresponde ao conteudo VIVO do template. Mantida por update_talkx_template_with_snapshot. |
| 16 | `channel` | `text` | não | `'whatsapp'::text` |  |  |
| 17 | `icon` | `text` | sim |  |  |  |
| 18 | `interactive` | `jsonb` | sim |  |  |  |
| 19 | `media_file_name` | `text` | sim |  |  |  |
| 20 | `media_size_bytes` | `bigint` | sim |  |  |  |
| 21 | `media_width` | `integer` | sim |  |  |  |
| 22 | `media_height` | `integer` | sim |  |  |  |
| 23 | `archived_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_templates_channel_check | CHECK | `CHECK (channel = 'whatsapp'::text)` |  |  | sim |
| talkx_templates_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_templates_current_version_id_fkey | FOREIGN KEY | `FOREIGN KEY (current_version_id) REFERENCES talkx_template_versions(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_templates_icon_check | CHECK | `CHECK (icon IS NULL OR char_length(icon) <= 16)` |  |  | sim |
| talkx_templates_media_type_check | CHECK | `CHECK (media_type IS NULL OR (media_type = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))` |  |  | sim |
| talkx_templates_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_templates_status_check | CHECK | `CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'approved'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_campaigns | talkx_campaigns_template_id_fkey | template_id | SET NULL |
| public.talkx_template_variants | talkx_template_variants_template_id_fkey | template_id | CASCADE |
| public.talkx_template_versions | talkx_template_versions_template_id_fkey | template_id | CASCADE |
| public.talkx_test_sends | talkx_test_sends_template_id_fkey | template_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_templates_category | btree | category | não | sim |  | `CREATE INDEX idx_talkx_templates_category ON public.talkx_templates USING btree (category)` |
| idx_talkx_templates_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_templates_created_by ON public.talkx_templates USING btree (created_by)` |
| idx_talkx_templates_current_version_id | btree | current_version_id | não | sim |  | `CREATE INDEX idx_talkx_templates_current_version_id ON public.talkx_templates USING btree (current_version_id)` |
| talkx_templates_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_templates_pkey ON public.talkx_templates USING btree (id)` |


## Policies (RLS)

### `talkx_templates_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `talkx_templates_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1))` |

### `talkx_templates_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(( SELECT auth.uid() AS uid) IS NOT NULL)` |
| WITH CHECK |  |

### `talkx_templates_update`

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
| trg_guard_talkx_template_update | BEFORE | UPDATE | ROW | enabled | public.guard_talkx_template_update |
| trg_validate_talkx_template_input | BEFORE | INSERT OR UPDATE | ROW | enabled | public.validate_talkx_template_input |
| update_talkx_templates_updated_at | BEFORE | UPDATE | ROW | enabled | public.set_talkx_template_updated_at |


## Grants

_nenhum_
