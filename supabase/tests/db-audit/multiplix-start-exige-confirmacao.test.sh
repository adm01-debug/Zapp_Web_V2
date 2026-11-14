#!/usr/bin/env bash
# 20261114130000_multiplix_start_exige_confirmacao: iniciar rascunho / materializar fila exige o
# confirm (F51); retomar pausado COM fila continua um clique.
#
# Prova comportamental (PostgreSQL 17 descartavel, chamadas como service_role via
# request.jwt.claim.role, igual a edge):
#  A. ESTADO ANTERIOR (cadeia real f51c -> f59 -> mx01): 'start' de rascunho passa (o defeito)
#     e todo UPDATE de rascunho estoura 42703 (gatilho do F05 le NEW.template).
#  B. Migration aplicada 2x (idempotente) e:
#     1. 'start' de draft  -> multiplix_dispatch_confirm_required; nada muda.
#     2. 'start' de paused legado SEM fila -> confirm_required; nenhum item.
#     3. 'start' de paused COM fila -> 'sending' (retomar = um clique).
#     4. 'start' de scheduled sem fila (cron) continua permitido.
#     5. confirm de rascunho do composer (sem bloco, sem conexao): cria o bloco do template,
#        fixa a conexao conectada, gera 1 item por apto, 'sending', versao+1; 2o clique = no-op.
#     6. confirm de rascunho COM bloco funciona (o gatilho nao estoura mais).
#     7. confirm do legado pausado: so 'pending' vira item, total_recipients preservado,
#        pause_reason limpo, 'sending'.
#     8. template vazio e sem bloco -> multiplix_confirm_no_blocks.
#     9. editar rascunho (nome) sobe a versao.
#    10. sem service_role -> 42501 nas duas RPCs.
#  C. Rollback do cabecalho (reaplica f51c e f59) devolve o comportamento anterior; reaplicar a
#     migration volta a B.
#
# Schema: migrations REAIS onde aplicaveis (f51c, f59, mx01 e a nova); o resto e harness
# sintetico rotulado HARNESS (subconjunto das colunas reais das tabelas do Multiplix).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIG_DIR="$REPO_ROOT/supabase/migrations"
F_F51C="$MIG_DIR/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql"
F_F59="$MIG_DIR/20261002521230_f59_transition_dispatch_enum_cast.sql"
F_MX01="$MIG_DIR/20261005150259_mx01_legacy_queue_materialize.sql"
F_NEW="$MIG_DIR/20261114130000_multiplix_start_exige_confirmacao.sql"

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok()   { echo "[OK] $*"; }

for f in "$F_F51C" "$F_F59" "$F_MX01" "$F_NEW"; do
  [[ -f "$f" ]] || fail "migration real ausente: $f"
done
grep -q '^-- Rollback (SQL executavel' "$F_NEW" || fail 'cabecalho de rollback ausente na migration nova'

IMAGE="${MULTIPLIX_START_CONFIRM_TEST_POSTGRES_IMAGE:-${POSTGRES_TEST_IMAGE:-postgres:17-alpine}}"
CID="multiplix-start-confirm-test-$$"
cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker rm -f "$CID" >/dev/null 2>&1 || true
docker run -d --name "$CID" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null \
  || fail "subir postgres descartavel ($IMAGE)"
ready=false
for _ in $(seq 1 60); do
  if docker exec "$CID" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    sleep 1
    if docker exec "$CID" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'postgres descartavel nao ficou pronto'

psql_f() { docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"; }
# Executa como a edge (service_role) e devolve a saida (inclusive o erro) sem abortar o script.
svc() { docker exec -i "$CID" psql -X -q -Atc "SET request.jwt.claim.role='service_role'; $1" -U postgres -d postgres 2>&1 || true; }
q() { docker exec -i "$CID" psql -X -v ON_ERROR_STOP=1 -Atqc "$1" -U postgres -d postgres; }

# ── HARNESS: infra Supabase + tabelas do Multiplix (subconjunto real) ──────────
psql_f >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;

CREATE TYPE public.multiplix_dispatch_status AS ENUM ('draft','scheduled','sending','paused','completed','completed_with_failures','failed','cancelled');
CREATE TYPE public.multiplix_recipient_status AS ENUM ('pending','sending','sent','delivered','read','failed','skipped','cancelled','outcome_unknown');
CREATE TYPE public.multiplix_item_status AS ENUM ('pending','sending','sent','delivered','read','failed','failed_transient','skipped','cancelled','outcome_unknown');
CREATE TYPE public.multiplix_eligibility AS ENUM ('eligible','no_destination','suppressed','out_of_scope','media_pending','connection_unavailable','requires_template');

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END $$;

CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.multiplix_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL DEFAULT '',
  status public.multiplix_dispatch_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  whatsapp_connection_id uuid,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  pause_reason text,
  dispatch_version integer NOT NULL DEFAULT 1,
  audience_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_multiplix_dispatches_updated_at BEFORE UPDATE ON public.multiplix_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.multiplix_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  company_id uuid,
  company_name_snapshot text,
  destino_e164 text,
  singu_contact_id uuid,
  status public.multiplix_recipient_status NOT NULL DEFAULT 'pending',
  eligibility public.multiplix_eligibility NOT NULL DEFAULT 'eligible',
  variables_snapshot jsonb,
  audience_version integer,
  inclusion_reason text,
  error_message text,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  retry_after timestamptz,
  provider_dispatch_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.multiplix_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  block_order smallint NOT NULL DEFAULT 0,
  block_type text NOT NULL,
  template_text text,
  content jsonb,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_blocks_dispatch_order UNIQUE (dispatch_id, block_order)
);

CREATE TABLE public.multiplix_delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.multiplix_recipients(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.multiplix_blocks(id) ON DELETE CASCADE,
  dispatch_version integer NOT NULL,
  status public.multiplix_item_status NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  worker_id text,
  provider_dispatch_started_at timestamptz,
  error_message text,
  idempotency_key text GENERATED ALWAYS AS (
    encode(extensions.digest(dispatch_id::text || ':' || dispatch_version::text || ':'
      || recipient_id::text || ':' || block_id::text, 'sha256'), 'hex')
  ) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplix_delivery_items_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE TABLE public.multiplix_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.multiplix_dispatches(id),
  kind text NOT NULL,
  payload jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
SQL

# ── cadeia real ─────────────────────────────────────────────────────────────────
psql_f < "$F_F51C" >/dev/null
psql_f < "$F_F59" >/dev/null
psql_f < "$F_MX01" >/dev/null
ok 'cadeia real aplicada (f51c, f59, mx01)'

A='10000000-0000-0000-0000-00000000000a'
CONN='70000000-0000-0000-0000-000000000001'

# Fixtures: cada caso tem o seu disparo (ids 3000...00NN).
seed() {
  psql_f >/dev/null <<SQL
INSERT INTO public.whatsapp_connections (id, status, created_at) VALUES
  ('$CONN', 'connected', now() - interval '1 day'),
  ('70000000-0000-0000-0000-000000000002', 'disconnected', now() - interval '2 days')
ON CONFLICT DO NOTHING;
-- 01: rascunho do composer (sem bloco, sem conexao), 2 aptos + 1 sem pessoa
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients)
VALUES ('30000000-0000-0000-0000-000000000001', 'Rascunho composer', 'Oi {{empresa}}', 'draft', '$A', 3);
INSERT INTO public.multiplix_recipients (dispatch_id, company_name_snapshot, destino_e164, status) VALUES
  ('30000000-0000-0000-0000-000000000001', 'E1', '+5511900000001', 'pending'),
  ('30000000-0000-0000-0000-000000000001', 'E2', '+5511900000002', 'pending'),
  ('30000000-0000-0000-0000-000000000001', 'E3', NULL, 'pending');
-- 02: legado pausado sem fila (1 ja enviado pela fila antiga, 2 pendentes)
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients,
  sent_count, whatsapp_connection_id, pause_reason, paused_at, started_at, scheduled_at)
VALUES ('30000000-0000-0000-0000-000000000002', 'Legado', 'Oi legado', 'paused', '$A', 3, 1, '$CONN',
  'legacy_queue_unmaterialized', now(), now() - interval '40 days', now() - interval '40 days');
INSERT INTO public.multiplix_recipients (dispatch_id, company_name_snapshot, destino_e164, status) VALUES
  ('30000000-0000-0000-0000-000000000002', 'L1', '+5511900000011', 'sent'),
  ('30000000-0000-0000-0000-000000000002', 'L2', '+5511900000012', 'pending'),
  ('30000000-0000-0000-0000-000000000002', 'L3', '+5511900000013', 'pending');
-- 03: pausado pelo operador COM fila (confirmado antes)
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients,
  whatsapp_connection_id, pause_reason, dispatch_version)
VALUES ('30000000-0000-0000-0000-000000000003', 'Pausado com fila', 'Oi', 'paused', '$A', 1, '$CONN', 'connection_lost', 2);
INSERT INTO public.multiplix_recipients (id, dispatch_id, destino_e164) VALUES
  ('40000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000003', '+5511900000031');
INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, content) VALUES
  ('60000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000003', 1, 'text', '{"text":"Oi"}');
INSERT INTO public.multiplix_delivery_items (dispatch_id, recipient_id, block_id, dispatch_version) VALUES
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000031', 2);
-- 04: agendado sem fila (caminho do cron)
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, scheduled_at)
VALUES ('30000000-0000-0000-0000-000000000004', 'Agendado', 'Oi', 'scheduled', '$A', 1, now() - interval '1 minute');
INSERT INTO public.multiplix_recipients (dispatch_id, destino_e164) VALUES
  ('30000000-0000-0000-0000-000000000004', '+5511900000041');
-- 05: rascunho sem texto e sem bloco
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients)
VALUES ('30000000-0000-0000-0000-000000000005', 'Vazio', '   ', 'draft', '$A', 1);
INSERT INTO public.multiplix_recipients (dispatch_id, destino_e164) VALUES
  ('30000000-0000-0000-0000-000000000005', '+5511900000051');
SQL
}

# ── A. estado anterior: o defeito existe ────────────────────────────────────────
seed
out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000001','start');")"
[[ "$out" == 'sending' ]] || fail "A: esperava reproduzir o defeito ('start' de rascunho passa) — veio: $out"
out="$(svc "UPDATE public.multiplix_dispatches SET name='x' WHERE id='30000000-0000-0000-0000-000000000005';")"
[[ "$out" == *'has no field "template"'* ]] || fail "A: esperava reproduzir o 42703 do gatilho do F05 — veio: $out"
ok 'A: defeitos reproduzidos na cadeia anterior (start de rascunho passa; gatilho 42703)'

reset_data() {
  psql_f >/dev/null <<'SQL'
TRUNCATE public.multiplix_events, public.multiplix_delivery_items, public.multiplix_blocks,
         public.multiplix_recipients, public.multiplix_dispatches, public.whatsapp_connections CASCADE;
SQL
  seed
}

# ── B. migration nova (2x) ──────────────────────────────────────────────────────
psql_f < "$F_NEW" >/dev/null
psql_f < "$F_NEW" >/dev/null
ok 'B: migration aplicada 2x (idempotente)'

run_b() {
  reset_data
  local out

  # 1. start de rascunho recusado, nada muda
  out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000001','start');")"
  [[ "$out" == *multiplix_dispatch_confirm_required* ]] || fail "B1: start de rascunho devia exigir confirmacao — veio: $out"
  [[ "$(q "SELECT status||'/'||dispatch_version FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000001'")" == 'draft/1' ]] \
    || fail 'B1: o rascunho mudou depois da recusa'
  ok 'B1: start de rascunho -> multiplix_dispatch_confirm_required'

  # 2. legado pausado sem fila: Retomar (start) recusado
  out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000002','start');")"
  [[ "$out" == *multiplix_dispatch_confirm_required* ]] || fail "B2: retomar legado sem fila devia exigir confirmacao — veio: $out"
  [[ "$(q "SELECT count(*) FROM public.multiplix_delivery_items WHERE dispatch_id='30000000-0000-0000-0000-000000000002'")" == '0' ]] \
    || fail 'B2: fila do legado materializada sem confirmacao'
  ok 'B2: start de legado pausado sem fila -> confirm_required'

  # 3. pausado COM fila: um clique
  out="$(svc "SELECT previous_status||'>'||current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000003','start');")"
  [[ "$out" == 'paused>sending' ]] || fail "B3: retomar pausado com fila devia passar — veio: $out"
  [[ "$(q "SELECT coalesce(pause_reason,'null') FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000003'")" == 'null' ]] \
    || fail 'B3: pause_reason nao foi limpo na retomada'
  ok 'B3: retomar pausado com fila = um clique (paused -> sending)'

  # 4. agendado sem fila (cron) continua permitido
  out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000004','start');")"
  [[ "$out" == 'sending' ]] || fail "B4: start do cron sobre 'scheduled' devia passar — veio: $out"
  ok "B4: start de 'scheduled' (cron) intacto"

  # 5. confirm do rascunho do composer
  out="$(svc "SELECT items_created||'/'||items_total||'/'||status||'/'||dispatch_version||'/'||block_count||'/'||created FROM public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000001','$A',false,1);")"
  [[ "$out" == '2/2/sending/2/1/true' ]] || fail "B5: confirm do rascunho do composer — veio: $out"
  [[ "$(q "SELECT whatsapp_connection_id||'/'||total_recipients||'/'||(started_at IS NOT NULL) FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000001'")" == "$CONN/2/true" ]] \
    || fail 'B5: conexao/total/started_at errados depois do confirm'
  [[ "$(q "SELECT content->>'text' FROM public.multiplix_blocks WHERE dispatch_id='30000000-0000-0000-0000-000000000001'")" == 'Oi {{empresa}}' ]] \
    || fail 'B5: o bloco nao saiu do message_template'
  [[ "$(q "SELECT count(*) FROM public.multiplix_blocks WHERE dispatch_id='30000000-0000-0000-0000-000000000001' AND content_hash IS NOT NULL")" == '1' ]] \
    || fail 'B5: o bloco criado nao foi congelado (content_hash)'
  out="$(svc "SELECT items_created||'/'||created FROM public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000001','$A',false,1);")"
  [[ "$out" == '0/false' ]] || fail "B5: 2o clique devia ser idempotente — veio: $out"
  [[ "$(q "SELECT count(*) FROM public.multiplix_blocks WHERE dispatch_id='30000000-0000-0000-0000-000000000001'")" == '1' ]] \
    || fail 'B5: 2o clique duplicou o bloco'
  ok 'B5: confirm do rascunho do composer (bloco do template, conexao fixada, 2 itens, idempotente)'

  # 6. rascunho COM bloco confirma (o gatilho nao estoura) e 9. editar rascunho versiona
  psql_f >/dev/null <<SQL
SET request.jwt.claim.role='service_role';
INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by, total_recipients, whatsapp_connection_id)
VALUES ('30000000-0000-0000-0000-000000000006', 'Com bloco', 'Oi', 'draft', '$A', 1, '$CONN');
INSERT INTO public.multiplix_recipients (dispatch_id, destino_e164) VALUES ('30000000-0000-0000-0000-000000000006', '+5511900000061');
INSERT INTO public.multiplix_blocks (dispatch_id, block_order, block_type, content) VALUES
  ('30000000-0000-0000-0000-000000000006', 1, 'text', '{"text":"bloco A"}'),
  ('30000000-0000-0000-0000-000000000006', 2, 'text', '{"text":"bloco B"}');
UPDATE public.multiplix_dispatches SET name = 'Com bloco (editado)' WHERE id='30000000-0000-0000-0000-000000000006';
SQL
  local v
  v="$(q "SELECT dispatch_version FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000006'")"
  [[ "$v" == '4' ]] || fail "B9: 2 blocos + 1 edicao deviam levar a versao de 1 a 4 — veio: $v"
  ok 'B9: editar rascunho e mexer em bloco versionam (gatilho do F05 sem 42703)'
  out="$(svc "SELECT items_created||'/'||status||'/'||dispatch_version FROM public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000006','$A',false,$v);")"
  [[ "$out" == "2/sending/$((v + 1))" ]] || fail "B6: confirm de rascunho com bloco — veio: $out"
  ok 'B6: confirm de rascunho com 2 blocos (2 itens)'

  # 7. confirm do legado pausado
  out="$(svc "SELECT items_created||'/'||status||'/'||coalesce(scheduled_at::text,'null') FROM public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000002','$A',false,1,(SELECT scheduled_at FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000002'));")"
  [[ "$out" == '2/sending/null' ]] || fail "B7: confirm do legado devia gerar 2 itens (so pendentes), 'sending' e sem agendamento vencido — veio: $out"
  [[ "$(q "SELECT total_recipients||'/'||coalesce(pause_reason,'null')||'/'||(started_at < now() - interval '30 days') FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000002'")" == '3/null/true' ]] \
    || fail 'B7: legado perdeu total_recipients/started_at ou manteve pause_reason'
  [[ "$(q "SELECT count(*) FROM public.multiplix_delivery_items i JOIN public.multiplix_recipients r ON r.id=i.recipient_id WHERE i.dispatch_id='30000000-0000-0000-0000-000000000002' AND r.status='sent'")" == '0' ]] \
    || fail 'B7: destinatario ja enviado pela fila antiga voltou para a fila'
  ok 'B7: confirm do legado pausado (so pendentes, total preservado, pause_reason limpo)'

  # depois do confirm, o legado pausa e retoma em um clique
  svc "SELECT 1 FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000002','pause','connection_lost');" >/dev/null
  out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000002','start');")"
  [[ "$out" == 'sending' ]] || fail "B7: legado confirmado devia retomar em um clique — veio: $out"

  # 8. sem texto e sem bloco
  out="$(svc "SELECT public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000005','$A',false,1);")"
  [[ "$out" == *multiplix_confirm_no_blocks* ]] || fail "B8: rascunho sem texto devia recusar com no_blocks — veio: $out"
  [[ "$(q "SELECT status FROM public.multiplix_dispatches WHERE id='30000000-0000-0000-0000-000000000005'")" == 'draft' ]] \
    || fail 'B8: recusa deixou o rascunho fora de draft'
  ok 'B8: rascunho sem texto/sem bloco -> multiplix_confirm_no_blocks (nada muda)'

  # 10. sem service_role
  out="$(docker exec -i "$CID" psql -X -q -Atc "SELECT public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000005','start');" -U postgres -d postgres 2>&1 || true)"
  [[ "$out" == *service_role_required* ]] || fail "B10: transition sem service_role devia recusar — veio: $out"
  out="$(docker exec -i "$CID" psql -X -q -Atc "SELECT public.multiplix_confirm_dispatch('30000000-0000-0000-0000-000000000005','$A',false,1);" -U postgres -d postgres 2>&1 || true)"
  [[ "$out" == *service_role_required* ]] || fail "B10: confirm sem service_role devia recusar — veio: $out"
  [[ "$(q "SELECT has_function_privilege('authenticated','public.transition_multiplix_dispatch(uuid,text,text)','EXECUTE')")" == 'f' ]] \
    || fail 'B10: authenticated nao pode executar a transicao'
  ok 'B10: as duas RPCs continuam service_role-only'
}
run_b

# ── C. rollback do cabecalho e reaplicacao ──────────────────────────────────────
psql_f < "$F_F51C" >/dev/null
psql_f < "$F_F59" >/dev/null
reset_data
out="$(svc "SELECT current_status FROM public.transition_multiplix_dispatch('30000000-0000-0000-0000-000000000001','start');")"
[[ "$out" == 'sending' ]] || fail "C: rollback devia devolver o comportamento anterior — veio: $out"
ok 'C: rollback do cabecalho executa e devolve o comportamento anterior'
psql_f < "$F_NEW" >/dev/null
run_b
ok 'C: reaplicar a migration depois do rollback volta a B'

echo 'multiplix-start-exige-confirmacao: todos os casos verdes'
