# Infra de fila/jobs medida no Zapp_Web_V2 (referência concreta)

Medido no banco canônico do projeto. Para plano que pede "reaproveitar infraestrutura de fila ou justificar
extensão": é aqui que se confirma o que dá para reusar.

## O que existe
- Extensões: `pg_cron`, `pg_net`, `pgcrypto`, `pg_trgm`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`.
  **Não há `pgmq`.**
- Fila consolidada: `public.crm_sync_outbox`. **Não** são fila de job (apesar do nome): `queues`, `queue_members`,
  `queue_positions`, `queue_goals`, `queue_skill_requirements`, `whatsapp_connection_queues`.
- Funções do idioma: `enqueue_crm_sync_from_closure`, `enqueue_outbound_message`, `enqueue_rich_outbound_message`,
  `claim_crm_sync_outbox`, `claim_crm_sync_outbox_by_id`, `claim_talkx_campaign_worker`, `claim_multiplix_item`,
  `claim_multiplix_recipient`, `claim_outbound_message`, `claim_talkx_recipient`, `talk_me_claim`, e os
  `release_*` correspondentes.
- Agendamento: `cron.job` tem ticks de **1 minuto** em SQL direto (`trigger_talkx_engine_tick`,
  `trigger_pending_multiplix_dispatches`, `expire_stale_agent_presence`, `notify_due_tasks`) e também invoca edge
  function por **`net.http_post`** (crons de 5 min/1 h). Para worker de longa duração: tick → `net.http_post` na
  função. Siga o idioma de uma migration existente que já faz isso e nunca invente URL/chave.

## Colunas do padrão (`crm_sync_outbox`)
`id`; `idempotency_key` NOT NULL; `status` default `'pending'`; `payload jsonb`; `attempt_count` default 0;
`max_attempts` default 8; `available_at` default `now()`; `locked_at`; `locked_by text`; `lease_token uuid`;
`last_error_code text`; `completed_at`; `created_at`; `updated_at`.

## `claim_crm_sync_outbox(p_worker text, p_limit int default 10)` — o modelo
1. Reaper limitado: `status='processing' AND locked_at < now() - interval '5 minutes' AND attempt_count >=
   max_attempts` → `dead_letter` com `last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS'`, com `LIMIT 100` e
   `FOR UPDATE SKIP LOCKED` (o comentário no arquivo diz o porquê: evitar que uma transação atualize todo o
   backlog vencido).
2. Claim: `status IN ('pending','failed') AND available_at <= now() AND attempt_count < max_attempts`,
   `ORDER BY available_at, created_at` e `FOR UPDATE SKIP LOCKED`.

## `claim_talkx_campaign_worker(p_campaign_id, p_worker, p_lease_seconds default 90)` — lease e guardas
- `auth.role() <> 'service_role'` → `RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'`.
- Entrada inválida (`p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'` ou lease fora de `BETWEEN 30 AND 300`) →
  `invalid_*` com ERRCODE `'22023'`.
- Lease vivo de OUTRO worker recusa; do MESMO worker renova.
- `SELECT … FOR UPDATE` na linha do recurso.

## Vocabulário de estados
Padrão do repo quando o plano pede estados padronizados: `queued, running, partial, succeeded, failed, cancelled,
outcome_unknown`. Não-terminais: `queued`, `running`, `partial`. Terminais: `succeeded`, `failed`, `cancelled`,
`outcome_unknown`. O mesmo vocabulário aparece na migration (no `check`), no worker
(`supabase/functions/_shared/*.ts`) e na camada de interface (`src/lib/...`), com contrato que compara os três
arquivos como texto — o front não importa do `_shared` porque o runtime é outro.

## Harness de prova (PG descartável) que funcionou
- `create role anon|authenticated|service_role` + `create schema auth; create function auth.role() returns text`
  devolvendo `'service_role'` — sem isso `revoke`/`auth.role()` falham e o erro parece da migration.
- Prontidão por query em laço: `pg_isready` passa cedo e a conexão morre com
  `connection ... No such file or directory`.
- Corrida: 5 workers × 1 job em paralelo → 5 linhas, 5 ids distintos (prova o `SKIP LOCKED`).
- Expirado/esgotado: force `lease_expires_at` ao passado e chame o reaper; esgotado vira falha terminal com
  `last_error_code`.
- `NULL || …` esconde linha: cast explícito `::text` e comparação com `t`/`f`.
- Fecho: rode o `-- rollback:` (a tabela some), reaplique 2× (idempotência).
- **Não** deixe `.ts`/`.tsx` de rascunho dentro da árvore (`.tmp/`): o ratchet de lint acusa ocorrências novas do
  seu próprio rascunho. Guarde backup com `.bak`/`.orig` e apague antes de fechar.
