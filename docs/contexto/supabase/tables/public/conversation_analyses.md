# public.conversation_analyses

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `analyzed_by` | `uuid` | sim |  |  |  |
| 4 | `summary` | `text` | não |  |  |  |
| 5 | `status` | `text` | não | `'pendente'::text` |  |  |
| 6 | `key_points` | `text[]` | sim | `'{}'::text[]` |  |  |
| 7 | `next_steps` | `text[]` | sim | `'{}'::text[]` |  |  |
| 8 | `sentiment` | `text` | sim |  |  |  |
| 9 | `sentiment_score` | `integer` | sim |  |  |  |
| 10 | `topics` | `text[]` | sim | `'{}'::text[]` |  |  |
| 11 | `urgency` | `text` | sim |  |  |  |
| 12 | `customer_satisfaction` | `integer` | sim |  |  |  |
| 13 | `message_count` | `integer` | sim | `0` |  |  |
| 14 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 15 | `department` | `text` | sim | `'outros'::text` |  |  |
| 16 | `relationship_type` | `text` | sim |  |  |  |
| 17 | `agent_performance` | `jsonb` | sim |  |  | Desempenho estimado pelo modelo (empathy/clarity/efficiency/knowledge 1-10). Antes existia só na resposta viva e sumia ao recarregar. |
| 18 | `churn_risk` | `text` | sim |  |  |  |
| 19 | `sales_opportunity` | `text` | sim |  |  |  |
| 20 | `analysis_version` | `integer` | não | `2` |  | Versão do contrato de saída usado na análise (IA-025). |
| 21 | `period_days` | `integer` | sim |  |  |  |
| 22 | `coverage` | `jsonb` | sim |  |  | Evidência/cobertura da análise (quantas mensagens, recorte de período, valores recusados). Distingue medido de estimado. |
| 23 | `model` | `text` | sim |  |  |  |
| 24 | `analyzed_at` | `timestamp with time zone` | não | `now()` |  |  |
| 25 | `request_key` | `text` | sim |  |  | IA-047: chave idempotente do pedido de análise (ux_conversation_analyses_contact_request_key: contact_id+request_key único, parcial). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_analyses_analyzed_by_fkey | FOREIGN KEY | `FOREIGN KEY (analyzed_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| conversation_analyses_churn_risk_canonical | CHECK | `CHECK (ai_is_canonical_churn_risk(churn_risk))` |  |  | sim |
| conversation_analyses_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_analyses_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_analyses_sentiment_canonical | CHECK | `CHECK (ai_is_canonical_sentiment(sentiment))` |  |  | sim |
| conversation_analyses_urgency_canonical | CHECK | `CHECK (ai_is_canonical_urgency(urgency))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.contacts | contacts_ai_projection_analysis_id_fkey | ai_projection_analysis_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_analyses_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_analyses_pkey ON public.conversation_analyses USING btree (id)` |
| idx_conversation_analyses_analyzed_by | btree | analyzed_by | não | sim |  | `CREATE INDEX idx_conversation_analyses_analyzed_by ON public.conversation_analyses USING btree (analyzed_by)` |
| idx_conversation_analyses_contact_department | btree | contact_id, department | não | sim |  | `CREATE INDEX idx_conversation_analyses_contact_department ON public.conversation_analyses USING btree (contact_id, department)` |
| idx_conversation_analyses_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_conversation_analyses_contact_id ON public.conversation_analyses USING btree (contact_id)` |
| idx_conversation_analyses_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_conversation_analyses_created_at ON public.conversation_analyses USING btree (created_at DESC)` |
| idx_conversation_analyses_department | btree | department | não | sim |  | `CREATE INDEX idx_conversation_analyses_department ON public.conversation_analyses USING btree (department)` |
| ux_conversation_analyses_contact_request_key | btree | contact_id, request_key | sim | sim | `(request_key IS NOT NULL)` | `CREATE UNIQUE INDEX ux_conversation_analyses_contact_request_key ON public.conversation_analyses USING btree (contact_id, request_key) WHERE (request_key IS NOT NULL)` |


## Policies (RLS)

### `Authenticated users can view analyses`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, auth.uid())` |
| WITH CHECK |  |

### `Users can insert own analyses`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((analyzed_by = get_profile_id_for_user(auth.uid())) AND is_contact_visible_to_user(contact_id, auth.uid()))` |


## Triggers

_nenhum_


## Grants

_nenhum_
