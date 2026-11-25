# public.qr_attempts

> Historico de tentativas de conexao por QR Code. Escrita so pelo service_role (Edge Function); leitura por quem enxerga a conexao. Apagado aos 30 dias pelo job purge-qr-attempts.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.qr_attempts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 connection_id uuid NOT NULL — Conexao que gerou a tentativa. ON DELETE CASCADE: o historico nao sobrevive a conexao.
3 status text NOT NULL — pending (QR gerado), connected (pareado), expired (QR venceu sem leitura), error (falha do provedor).
4 error_message text NULLABLE — Mensagem de erro JA SANITIZADA (sem token, sem PII). Nula quando nao ha erro.
5 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
qr_attempts_error_message_len_check: CHECK (error_message IS NULL OR char_length(error_message) >= 1 AND char_length(error_message) <= 500)
qr_attempts_status_check: CHECK (status = ANY (ARRAY['pending'::text, 'connected'::text, 'expired'::text, 'error'::text]))
qr_attempts_connection_id_fkey: FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE
qr_attempts_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Quem enxerga a conexao enxerga as tentativas de QR" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `connection_id` | `uuid` | não |  |  | Conexao que gerou a tentativa. ON DELETE CASCADE: o historico nao sobrevive a conexao. |
| 3 | `status` | `text` | não |  |  | pending (QR gerado), connected (pareado), expired (QR venceu sem leitura), error (falha do provedor). |
| 4 | `error_message` | `text` | sim |  |  | Mensagem de erro JA SANITIZADA (sem token, sem PII). Nula quando nao ha erro. |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| qr_attempts_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| qr_attempts_error_message_len_check | CHECK | `CHECK (error_message IS NULL OR char_length(error_message) >= 1 AND char_length(error_message) <= 500)` |  |  | sim |
| qr_attempts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| qr_attempts_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'connected'::text, 'expired'::text, 'error'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| qr_attempts_connection_id_created_at_idx | btree | connection_id, created_at | não | sim |  | `CREATE INDEX qr_attempts_connection_id_created_at_idx ON public.qr_attempts USING btree (connection_id, created_at DESC)` |
| qr_attempts_created_at_idx | btree | created_at | não | sim |  | `CREATE INDEX qr_attempts_created_at_idx ON public.qr_attempts USING btree (created_at)` |
| qr_attempts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX qr_attempts_pkey ON public.qr_attempts USING btree (id)` |


## Policies (RLS)

### `Quem enxerga a conexao enxerga as tentativas de QR`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM whatsapp_connections c   WHERE (c.id = qr_attempts.connection_id)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
