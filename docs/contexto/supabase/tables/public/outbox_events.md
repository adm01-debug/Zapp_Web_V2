# public.outbox_events

> Outbox genérica de eventos de integração (item 090). Pendente = processed_at is null; a assinatura HMAC-SHA256 do payload é verificada na Edge Function antes de gravar.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.outbox_events (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 origem text NOT NULL — Produtor do evento (ex.: n8n, evolution-go, ai-proxy). Com event_id forma a chave de idempotência.
3 event_id text NOT NULL — Identificador estável do evento NA ORIGEM. Idempotência: unique (origem, event_id).
4 tipo text NOT NULL
5 payload jsonb NOT NULL
6 assinatura text NOT NULL — HMAC-SHA256 do payload, em hex minúsculo, com ou sem o prefixo sha256=. O formato é conferido por CHECK.
7 algoritmo text NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 tentativas integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 processed_at timestamp with time zone NULLABLE — NULL = evento ainda NÃO confirmado. Preenchido = baixa dada depois da confirmação.
Constraints:
outbox_events_algoritmo_sha256: CHECK (algoritmo = 'sha256'::text)
outbox_events_assinatura_hmac: CHECK (assinatura ~ '^(sha256=)?[0-9a-f]{64}$'::text)
outbox_events_event_id_nao_vazio: CHECK (btrim(event_id) <> ''::text)
outbox_events_origem_nao_vazia: CHECK (btrim(origem) <> ''::text)
outbox_events_payload_documento: CHECK (jsonb_typeof(payload) = ANY (ARRAY['object'::text, 'array'::text]))
outbox_events_tentativas_nao_negativas: CHECK (tentativas >= 0)
outbox_events_tipo_nao_vazio: CHECK (btrim(tipo) <> ''::text)
outbox_events_pkey: PRIMARY KEY (id)
outbox_events_origem_event_id_unico: UNIQUE (origem, event_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
outbox_events_service_role [command=ALL; roles=service_role; PERMISSIVE]

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
| 2 | `origem` | `text` | não |  |  | Produtor do evento (ex.: n8n, evolution-go, ai-proxy). Com event_id forma a chave de idempotência. |
| 3 | `event_id` | `text` | não |  |  | Identificador estável do evento NA ORIGEM. Idempotência: unique (origem, event_id). |
| 4 | `tipo` | `text` | não |  |  |  |
| 5 | `payload` | `jsonb` | não |  |  |  |
| 6 | `assinatura` | `text` | não |  |  | HMAC-SHA256 do payload, em hex minúsculo, com ou sem o prefixo sha256=. O formato é conferido por CHECK. |
| 7 | `algoritmo` | `text` | não | `'sha256'::text` |  |  |
| 8 | `tentativas` | `integer` | não | `0` |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `processed_at` | `timestamp with time zone` | sim |  |  | NULL = evento ainda NÃO confirmado. Preenchido = baixa dada depois da confirmação. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| outbox_events_algoritmo_sha256 | CHECK | `CHECK (algoritmo = 'sha256'::text)` |  |  | sim |
| outbox_events_assinatura_hmac | CHECK | `CHECK (assinatura ~ '^(sha256=)?[0-9a-f]{64}$'::text)` |  |  | sim |
| outbox_events_event_id_nao_vazio | CHECK | `CHECK (btrim(event_id) <> ''::text)` |  |  | sim |
| outbox_events_origem_event_id_unico | UNIQUE | `UNIQUE (origem, event_id)` |  |  | sim |
| outbox_events_origem_nao_vazia | CHECK | `CHECK (btrim(origem) <> ''::text)` |  |  | sim |
| outbox_events_payload_documento | CHECK | `CHECK (jsonb_typeof(payload) = ANY (ARRAY['object'::text, 'array'::text]))` |  |  | sim |
| outbox_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| outbox_events_tentativas_nao_negativas | CHECK | `CHECK (tentativas >= 0)` |  |  | sim |
| outbox_events_tipo_nao_vazio | CHECK | `CHECK (btrim(tipo) <> ''::text)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_outbox_events_pendentes | btree | created_at | não | sim | `(processed_at IS NULL)` | `CREATE INDEX idx_outbox_events_pendentes ON public.outbox_events USING btree (created_at) WHERE (processed_at IS NULL)` |
| outbox_events_origem_event_id_unico | btree | origem, event_id | sim | sim |  | `CREATE UNIQUE INDEX outbox_events_origem_event_id_unico ON public.outbox_events USING btree (origem, event_id)` |
| outbox_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX outbox_events_pkey ON public.outbox_events USING btree (id)` |


## Policies (RLS)

### `outbox_events_service_role`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
