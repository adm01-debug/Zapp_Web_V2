# public.audio_memes

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.audio_memes (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 audio_url text NOT NULL
4 category text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 duration_seconds numeric(6,2) NULLABLE
6 is_favorite boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 use_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 uploaded_by uuid NULLABLE
9 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
audio_memes_uploaded_by_fkey: FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL
audio_memes_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Authenticated users can insert audio memes" [command=INSERT; roles=authenticated; PERMISSIVE]
"Authenticated users can read audio memes" [command=SELECT; roles=authenticated; PERMISSIVE]
"Authenticated users can update audio memes" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can delete own audio memes" [command=DELETE; roles=authenticated; PERMISSIVE]

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
| 3 | `audio_url` | `text` | não |  |  |  |
| 4 | `category` | `text` | não | `'outros'::text` |  |  |
| 5 | `duration_seconds` | `numeric(6,2)` | sim |  |  |  |
| 6 | `is_favorite` | `boolean` | não | `false` |  |  |
| 7 | `use_count` | `integer` | não | `0` |  |  |
| 8 | `uploaded_by` | `uuid` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| audio_memes_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| audio_memes_uploaded_by_fkey | FOREIGN KEY | `FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.audio_meme_favorites | audio_meme_favorites_meme_id_fkey | meme_id | CASCADE |
| public.messages | messages_audio_meme_id_fkey | audio_meme_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| audio_memes_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX audio_memes_pkey ON public.audio_memes USING btree (id)` |
| idx_audio_memes_uploaded_by | btree | uploaded_by | não | sim |  | `CREATE INDEX idx_audio_memes_uploaded_by ON public.audio_memes USING btree (uploaded_by)` |


## Policies (RLS)

### `Authenticated users can insert audio memes`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(uploaded_by = ( SELECT auth.uid() AS uid))` |

### `Authenticated users can read audio memes`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `Authenticated users can update audio memes`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK | `((uploaded_by = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `Users can delete own audio memes`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
