# public.away_message_log

> Registro de envio da mensagem de ausência por contato+conexão (janela de 24 h consultada por should_send_away_message). Só service_role, via RPC.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.away_message_log (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 whatsapp_connection_id uuid NOT NULL
4 sent_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
away_message_log_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
away_message_log_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE
away_message_log_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
(RLS habilitada sem política; verificar se o acesso restrito é intencional)

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 4 | `sent_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| away_message_log_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| away_message_log_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| away_message_log_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| away_message_log_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX away_message_log_pkey ON public.away_message_log USING btree (id)` |
| idx_away_message_log_contato_conexao_sent_at | btree | contact_id, whatsapp_connection_id, sent_at | não | sim |  | `CREATE INDEX idx_away_message_log_contato_conexao_sent_at ON public.away_message_log USING btree (contact_id, whatsapp_connection_id, sent_at DESC)` |
| idx_away_message_log_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_away_message_log_whatsapp_connection_id ON public.away_message_log USING btree (whatsapp_connection_id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
