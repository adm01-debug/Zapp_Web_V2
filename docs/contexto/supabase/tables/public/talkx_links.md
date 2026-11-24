# public.talkx_links

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_links (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 campaign_id uuid NOT NULL
3 label text NOT NULL
4 target_url text NOT NULL
5 slug text NOT NULL
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 utm_source text NULLABLE
8 utm_medium text NULLABLE
9 utm_campaign text NULLABLE
10 utm_content text NULLABLE
11 utm_term text NULLABLE
12 created_by uuid NULLABLE
Constraints:
talkx_links_label_format_check: CHECK (label ~ '^[a-z0-9][a-z0-9_-]{0,39}$'::text)
talkx_links_target_url_check: CHECK (target_url ~ '^https://'::text)
talkx_links_campaign_id_fkey: FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE
talkx_links_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
talkx_links_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view all links" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can view links of own campaigns" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `campaign_id` | `uuid` | não |  |  |  |
| 3 | `label` | `text` | não |  |  |  |
| 4 | `target_url` | `text` | não |  |  |  |
| 5 | `slug` | `text` | não |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `utm_source` | `text` | sim |  |  |  |
| 8 | `utm_medium` | `text` | sim |  |  |  |
| 9 | `utm_campaign` | `text` | sim |  |  |  |
| 10 | `utm_content` | `text` | sim |  |  |  |
| 11 | `utm_term` | `text` | sim |  |  |  |
| 12 | `created_by` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_links_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_links_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_links_label_format_check | CHECK | `CHECK (label ~ '^[a-z0-9][a-z0-9_-]{0,39}$'::text)` |  |  | sim |
| talkx_links_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_links_target_url_check | CHECK | `CHECK (target_url ~ '^https://'::text)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_conversions | talkx_conversions_link_id_fkey | link_id | SET NULL |
| public.talkx_link_clicks | talkx_link_clicks_link_id_fkey | link_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_links_campaign | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_links_campaign ON public.talkx_links USING btree (campaign_id)` |
| idx_talkx_links_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_links_created_by ON public.talkx_links USING btree (created_by)` |
| talkx_links_campaign_label_lower_key | btree | campaign_id | sim | sim |  | `CREATE UNIQUE INDEX talkx_links_campaign_label_lower_key ON public.talkx_links USING btree (campaign_id, lower(label))` |
| talkx_links_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_links_pkey ON public.talkx_links USING btree (id)` |
| talkx_links_slug_lower_key | btree |  | sim | sim |  | `CREATE UNIQUE INDEX talkx_links_slug_lower_key ON public.talkx_links USING btree (lower(slug))` |


## Policies (RLS)

### `Admins can view all links`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can view links of own campaigns`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(campaign_id IN ( SELECT tc.id    FROM talkx_campaigns tc   WHERE (tc.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = ( SELECT auth.uid() AS uid))          LIMIT 1))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
