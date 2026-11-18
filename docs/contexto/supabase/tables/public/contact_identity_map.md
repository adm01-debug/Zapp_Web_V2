# public.contact_identity_map

> Mapa LID -> JID do WhatsApp (identidade anonima vs numero) para reconciliar contatos.

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
| 1 | `lid` | `text` | não |  |  | Linked-Device ID — 14-18 dígitos sem DDI E.164 válido |
| 2 | `jid` | `text` | não |  |  | JID real — phone E.164 válido (ex: 5511999999999) |
| 3 | `first_seen` | `timestamp with time zone` | não | `now()` |  |  |
| 4 | `last_seen` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `source` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_identity_map_pkey | PRIMARY KEY | `PRIMARY KEY (lid)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_identity_map_pkey | btree | lid | sim | sim |  | `CREATE UNIQUE INDEX contact_identity_map_pkey ON public.contact_identity_map USING btree (lid)` |
| idx_contact_identity_map_jid | btree | jid | não | sim |  | `CREATE INDEX idx_contact_identity_map_jid ON public.contact_identity_map USING btree (jid)` |


## Policies (RLS)

### `supervisor_read`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
