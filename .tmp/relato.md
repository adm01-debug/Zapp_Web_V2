Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013210004_outbound_post_started.sql` (novo, aditivo, com `-- Rollback:` na 1ª linha, `BEGIN/COMMIT`, `SET search_path`, GRANT/REVOKE explícitos):
  1. coluna durável `public.messages.delivery_post_started_at timestamptz` — carimbo do instante em que a Edge marcou que o POST ao provedor ia sair;
  2. RPC `mark_outbound_post_started(p_message_id uuid, p_claim_token uuid)` **só service_role** — fencing por (id, token) em `status='sending'` sem recibo, idempotente no mesmo token, e **recusa marcar sob lease vencido** (a Edge não dispara POST fora de lease);
  3. `claim_outbound_message` passa a **RECUSAR** linha com POST iniciado **E** lease vencido (resultado ambíguo → 'verificar', nunca reenvia sozinho). Sem marca, nada muda: lease vencido continua retomável;
  4. o mesmo `guard_message_delivery_internal_fields` estendido: `authenticated` não forja nem limpa o carimbo por INSERT/UPDATE direto.
- `scripts/db-audit/message-delivery-phase1-behavior.test.sh` e `...-runtime.sql`: prova do comportamento e cobertura do novo RPC no retrato canônico (ACL/definição da função + contrato da coluna).

Por que aqui e não em `supabase/tests/`: os `supabase/tests/*.sql` só rodam contra um projeto vivo via `mcp_exec` (não rodam no banco local). A prova executável de RPC/lease/RLS deste assunto é o harness `scripts/db-audit/message-delivery-phase1-behavior.test.sh` (já registrado no `db-guard.yml`), que sobe PostgreSQL 17 descartável, aplica as migrations REAIS e roda como os papéis reais. Estendi esse harness em vez de criar `.test.sh` novo (arquivo novo ficaria órfão no CI).

## Prova
- vermelho antes (cópia temporária do harness em `.tmp/`, sem aplicar a migration): `bash .tmp/red-before.test.sh` → `ERROR: function "public.mark_outbound_post_started(uuid,uuid)" does not exist` (EXIT=1).
- verde depois: `bash scripts/db-audit/message-delivery-phase1-behavior.test.sh` → `[OK] Message delivery phase 1: authz, structural contracts, token-bound replay, expired leases, concurrency, rollback and compatibility validated on PostgreSQL 17.` (EXIT=0). Cobre, com papel real: ACL (`service_role=true`, `authenticated=false`, `anon=false`), coluna criada, lease vencido ANTES do POST → `delivery_claim_expired` e retomada permitida, lease vencido DEPOIS do POST → `claim` devolve 0 (não reenvia) e o ambíguo vai a `failed` via `fail_outbound_message(retryable=false)`, token errado → `outbound_delivery_claim_conflict`, token nulo → `invalid_delivery_post_mark`, idempotência no mesmo token, `authenticated` não forja o carimbo (`message_delivery_internal_fields_forbidden`), e `complete` continua fechando a linha normalmente (sem efeito colateral).
- rollback de verdade: apliquei a migration no banco local (`hermes-db-migrar …` → `APLICADA no banco LOCAL`), executei as 4 linhas do `-- Rollback (SQL executável, na ordem):` → `CREATE FUNCTION / CREATE FUNCTION / DROP FUNCTION / ALTER TABLE`, EXIT=0, zero erro; reapliquei a migration (estado final conferido: `col=1`, `fn=1`, `svc=true`, `auth=false`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (banco local é o passo do fechar; tipos/lint/migrations/db_guard OK).

## O que NÃO fiz e por quê
- Não toquei `supabase/functions/message-delivery/index.ts`: a chamada `mark_outbound_post_started` antes do POST é da Edge (cartão filho t_ea8decbb). Contrato entregue: RPC `(p_message_id uuid, p_claim_token uuid)`, e claim vazio em linha ambígua = "não reenviar".
- Não toquei `src/**` nem `src/integrations/supabase/types.ts`: escopo do cartão é migration+prova; nenhum `RETURNS` de função existente mudou e `zapp-verify` passou em `tipos`.
- Sem DROP/DELETE/DML e sem GRANT/RLS fora do pedido; a única escrita é a DDL aditiva e o REVOKE/GRANT do próprio RPC novo.
