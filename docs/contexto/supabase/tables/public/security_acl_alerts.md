# public.security_acl_alerts

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.security_acl_alerts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id bigint NOT NULL IDENTITY
2 alert_type text NOT NULL
3 object_name text NOT NULL
4 role_name text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 privilege text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 severity text NOT NULL
7 details jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 detected_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 resolved_at timestamp with time zone NULLABLE
10 resolved_by text NULLABLE
Constraints:
security_acl_alerts_severity_check: CHECK (severity = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text]))
security_acl_alerts_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins veem alertas de ACL" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `id` | `bigint` | não |  | a |  |
| 2 | `alert_type` | `text` | não |  |  |  |
| 3 | `object_name` | `text` | não |  |  |  |
| 4 | `role_name` | `text` | não | `'-'::text` |  |  |
| 5 | `privilege` | `text` | não | `'-'::text` |  |  |
| 6 | `severity` | `text` | não |  |  |  |
| 7 | `details` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 8 | `detected_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `resolved_by` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| security_acl_alerts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| security_acl_alerts_severity_check | CHECK | `CHECK (severity = ANY (ARRAY['CRITICAL'::text, 'HIGH'::text, 'MEDIUM'::text, 'LOW'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| security_acl_alerts_aberto_uidx | btree | alert_type, object_name, role_name, privilege | sim | sim | `(resolved_at IS NULL)` | `CREATE UNIQUE INDEX security_acl_alerts_aberto_uidx ON public.security_acl_alerts USING btree (alert_type, object_name, role_name, privilege) WHERE (resolved_at IS NULL)` |
| security_acl_alerts_leitura_idx | btree | resolved_at, detected_at | não | sim |  | `CREATE INDEX security_acl_alerts_leitura_idx ON public.security_acl_alerts USING btree (resolved_at, detected_at DESC)` |
| security_acl_alerts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX security_acl_alerts_pkey ON public.security_acl_alerts USING btree (id)` |


## Policies (RLS)

### `Admins veem alertas de ACL`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
