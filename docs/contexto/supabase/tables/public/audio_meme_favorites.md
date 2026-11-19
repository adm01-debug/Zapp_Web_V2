# public.audio_meme_favorites

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `meme_id` | `uuid` | não |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| audio_meme_favorites_meme_id_fkey | FOREIGN KEY | `FOREIGN KEY (meme_id) REFERENCES audio_memes(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| audio_meme_favorites_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| audio_meme_favorites_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| audio_meme_favorites_user_id_meme_id_key | UNIQUE | `UNIQUE (user_id, meme_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| audio_meme_favorites_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX audio_meme_favorites_pkey ON public.audio_meme_favorites USING btree (id)` |
| audio_meme_favorites_user_id_meme_id_key | btree | user_id, meme_id | sim | sim |  | `CREATE UNIQUE INDEX audio_meme_favorites_user_id_meme_id_key ON public.audio_meme_favorites USING btree (user_id, meme_id)` |
| idx_audio_meme_favorites_meme | btree | meme_id | não | sim |  | `CREATE INDEX idx_audio_meme_favorites_meme ON public.audio_meme_favorites USING btree (meme_id)` |
| idx_audio_meme_favorites_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_audio_meme_favorites_user_id ON public.audio_meme_favorites USING btree (user_id)` |


## Policies (RLS)

### `Users manage own meme favorites`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK | `(user_id = auth.uid())` |


## Triggers

_nenhum_


## Grants

_nenhum_
