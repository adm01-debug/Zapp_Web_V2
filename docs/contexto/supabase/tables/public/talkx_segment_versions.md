# public.talkx_segment_versions

> Talk X (X101): revisoes PUBLICADAS de um segmento (uma linha por publicacao). O gatilho talkx_segment_versions_trim mantem as 20 ultimas; reconstruir uma revisao antiga e o restore da etapa de publicacao.

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
| 2 | `segment_id` | `uuid` | não |  |  |  |
| 3 | `version_no` | `integer` | não |  |  |  |
| 4 | `rules` | `jsonb` | não |  |  |  |
| 5 | `estimated_count` | `integer` | não | `0` |  | Talk X (X101): publico estimado NO MOMENTO da publicacao (o numero de entao, nao o de hoje). |
| 6 | `note` | `text` | sim |  |  |  |
| 7 | `created_by` | `uuid` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_segment_versions_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_segment_versions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_segment_versions_segment_id_fkey | FOREIGN KEY | `FOREIGN KEY (segment_id) REFERENCES talkx_segments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_segment_versions_segment_version_key | UNIQUE | `UNIQUE (segment_id, version_no)` |  |  | sim |
| talkx_segment_versions_version_no_check | CHECK | `CHECK (version_no > 0)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_segment_versions_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_segment_versions_created_by ON public.talkx_segment_versions USING btree (created_by)` |
| talkx_segment_versions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_segment_versions_pkey ON public.talkx_segment_versions USING btree (id)` |
| talkx_segment_versions_segment_version_key | btree | segment_id, version_no | sim | sim |  | `CREATE UNIQUE INDEX talkx_segment_versions_segment_version_key ON public.talkx_segment_versions USING btree (segment_id, version_no)` |


## Policies (RLS)

### `talkx_segment_versions_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_segments s   WHERE ((s.id = talkx_segment_versions.segment_id) AND ((s.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| talkx_segment_versions_trim | AFTER | INSERT | ROW | enabled | public.talkx_segment_versions_trim |


## Grants

_nenhum_
