# public.nps_surveys

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.nps_surveys (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 agent_id uuid NULLABLE
4 score integer NOT NULL
5 feedback text NULLABLE
6 survey_type text NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
nps_surveys_score_check: CHECK (score >= 0 AND score <= 10)
nps_surveys_survey_type_check: CHECK (survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text]))
nps_surveys_agent_id_fkey: FOREIGN KEY (agent_id) REFERENCES profiles(id)
nps_surveys_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
nps_surveys_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins and own agents can view NPS surveys" [command=SELECT; roles=authenticated; PERMISSIVE]
"Admins can delete NPS surveys" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can update NPS surveys" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can create own NPS surveys" [command=INSERT; roles=authenticated; PERMISSIVE]

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `score` | `integer` | não |  |  |  |
| 5 | `feedback` | `text` | sim |  |  |  |
| 6 | `survey_type` | `text` | não | `'manual'::text` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| nps_surveys_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| nps_surveys_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| nps_surveys_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| nps_surveys_score_check | CHECK | `CHECK (score >= 0 AND score <= 10)` |  |  | sim |
| nps_surveys_survey_type_check | CHECK | `CHECK (survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_nps_surveys_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_nps_surveys_agent_id ON public.nps_surveys USING btree (agent_id)` |
| idx_nps_surveys_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys USING btree (contact_id)` |
| idx_nps_surveys_created | btree | created_at | não | sim |  | `CREATE INDEX idx_nps_surveys_created ON public.nps_surveys USING btree (created_at DESC)` |
| nps_surveys_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX nps_surveys_pkey ON public.nps_surveys USING btree (id)` |


## Policies (RLS)

### `Admins and own agents can view NPS surveys`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (agent_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)))` |
| WITH CHECK |  |

### `Admins can delete NPS surveys`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins can update NPS surveys`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can create own NPS surveys`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))` |


## Triggers

_nenhum_


## Grants

_nenhum_
