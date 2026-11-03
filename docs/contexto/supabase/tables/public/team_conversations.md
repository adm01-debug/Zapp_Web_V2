# public.team_conversations

> Chat conversations between team members (direct, group, department)

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
| 2 | `type` | `text` | não | `'direct'::text` |  |  |
| 3 | `name` | `text` | sim |  |  |  |
| 4 | `avatar_url` | `text` | sim |  |  |  |
| 5 | `created_by` | `uuid` | sim |  |  | profiles.id of creator |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `department_id` | `uuid` | sim |  |  |  |
| 9 | `metadata` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 10 | `direct_member_a` | `uuid` | sim |  |  |  |
| 11 | `direct_member_b` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_conversations_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| team_conversations_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED` | CASCADE | NO ACTION | sim |
| team_conversations_dept_required | CHECK | `CHECK (type <> 'department'::text OR department_id IS NOT NULL)` |  |  | sim |
| team_conversations_direct_member_a_fkey | FOREIGN KEY | `FOREIGN KEY (direct_member_a) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| team_conversations_direct_member_b_fkey | FOREIGN KEY | `FOREIGN KEY (direct_member_b) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| team_conversations_group_name_required | CHECK | `CHECK (type <> 'group'::text OR name IS NOT NULL)` |  |  | sim |
| team_conversations_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| team_conversations_type_check | CHECK | `CHECK (type = ANY (ARRAY['direct'::text, 'group'::text, 'department'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.team_conversation_members | team_conversation_members_conversation_id_fkey | conversation_id | CASCADE |
| public.team_message_reactions | team_message_reactions_conversation_id_fkey | conversation_id | CASCADE |
| public.team_message_receipts | team_message_receipts_conversation_id_fkey | conversation_id | CASCADE |
| public.team_messages | team_messages_conversation_id_fkey | conversation_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_team_conversations_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_team_conversations_created_by ON public.team_conversations USING btree (created_by)` |
| idx_team_conversations_dept_id | btree | department_id | não | sim | `(department_id IS NOT NULL)` | `CREATE INDEX idx_team_conversations_dept_id ON public.team_conversations USING btree (department_id) WHERE (department_id IS NOT NULL)` |
| idx_team_conversations_dept_unique | btree | department_id | sim | sim | `((type = 'department'::text) AND (department_id IS NOT NULL))` | `CREATE UNIQUE INDEX idx_team_conversations_dept_unique ON public.team_conversations USING btree (department_id) WHERE ((type = 'department'::text) AND (department_id IS NOT NULL))` |
| idx_team_conversations_direct_member_a | btree | direct_member_a | não | sim |  | `CREATE INDEX idx_team_conversations_direct_member_a ON public.team_conversations USING btree (direct_member_a)` |
| idx_team_conversations_direct_member_b | btree | direct_member_b | não | sim |  | `CREATE INDEX idx_team_conversations_direct_member_b ON public.team_conversations USING btree (direct_member_b)` |
| idx_team_conversations_direct_pair | btree | direct_member_a, direct_member_b | sim | sim | `(type = 'direct'::text)` | `CREATE UNIQUE INDEX idx_team_conversations_direct_pair ON public.team_conversations USING btree (direct_member_a, direct_member_b) WHERE (type = 'direct'::text)` |
| team_conversations_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX team_conversations_pkey ON public.team_conversations USING btree (id)` |


## Policies (RLS)

### `Authenticated users can create conversations`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid())  LIMIT 1))` |

### `Conversation creator or admin can delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = current_profile_id()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Members can view their conversations`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_team_conversation_member(auth.uid(), id) OR (created_by = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK |  |

### `team_conversations_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(created_by = current_profile_id())` |
| WITH CHECK | `(created_by = current_profile_id())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_team_conversations_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
