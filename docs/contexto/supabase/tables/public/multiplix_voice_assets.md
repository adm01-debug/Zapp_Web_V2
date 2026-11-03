# public.multiplix_voice_assets

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `hash` | `text` | não |  |  |  |
| 3 | `caminho` | `text` | não |  |  |  |
| 4 | `voice_id` | `text` | não |  |  |  |
| 5 | `modelo` | `text` | sim |  |  |  |
| 6 | `caracteres` | `integer` | sim |  |  |  |
| 7 | `duracao_ms` | `integer` | sim |  |  |  |
| 8 | `created_by` | `uuid` | sim |  |  |  |
| 9 | `invalidated_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_voice_assets_caracteres_nao_negativo | CHECK | `CHECK (caracteres IS NULL OR caracteres >= 0)` |  |  | sim |
| multiplix_voice_assets_duracao_nao_negativa | CHECK | `CHECK (duracao_ms IS NULL OR duracao_ms >= 0)` |  |  | sim |
| multiplix_voice_assets_hash_key | UNIQUE | `UNIQUE (hash)` |  |  | sim |
| multiplix_voice_assets_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.multiplix_delivery_items | multiplix_delivery_items_voice_asset_id_fkey | voice_asset_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_voice_assets_validos | btree | created_at | não | sim | `(invalidated_at IS NULL)` | `CREATE INDEX idx_multiplix_voice_assets_validos ON public.multiplix_voice_assets USING btree (created_at DESC) WHERE (invalidated_at IS NULL)` |
| idx_multiplix_voice_assets_voice_id | btree | voice_id | não | sim |  | `CREATE INDEX idx_multiplix_voice_assets_voice_id ON public.multiplix_voice_assets USING btree (voice_id)` |
| multiplix_voice_assets_hash_key | btree | hash | sim | sim |  | `CREATE UNIQUE INDEX multiplix_voice_assets_hash_key ON public.multiplix_voice_assets USING btree (hash)` |
| multiplix_voice_assets_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_voice_assets_pkey ON public.multiplix_voice_assets USING btree (id)` |


## Policies (RLS)

### `Granted callers can read voice assets`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((EXISTS ( SELECT 1    FROM multiplix_voice_grants g   WHERE ((g.voice_id = multiplix_voice_assets.voice_id) AND (g.revoked_at IS NULL) AND (((g.roles IS NOT NULL) AND (EXISTS ( SELECT 1            FROM unnest(g.roles) r(r)           WHERE has_role(auth.uid(), r.r)))) OR ((g.perfis IS NOT NULL) AND (EXISTS ( SELECT 1            FROM profiles p           WHERE ((p.user_id = auth.uid()) AND (p.id = ANY (g.perfis)))))))))) OR (created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
