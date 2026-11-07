#!/usr/bin/env bash
# Harness descartável (Docker postgres:17-alpine) — X026.
# Fecha CAP-056, CAP-079, CAP-106, CAP-107, CAP-109.
#
# Prova, em PostgreSQL 17, o delta de X026:
#   RED (antes da migration):
#     - talkx_campaigns.skipped_count NÃO existe;
#     - a policy de INSERT de eventos aceita 'started' vindo de 'authenticated'.
#   GREEN (depois):
#     - UPDATE direto de replied_count/skipped_count como 'authenticated' -> 42501;
#     - 2 destinatários suprimidos no claim -> skipped_count=2;
#     - lançar com template -> use_count +1 exato e a RPC increment_talkx_template_use
#       não existe mais (nenhum segundo incremento);
#     - duplicate_talkx_campaign devolve rascunho com total_recipients=0 e sem agendamento,
#       copiando mensagem/mídia/segmento/limites/janela;
#     - delete_talkx_campaign aceita 'draft'/'scheduled' e recusa 'sending';
#     - log_talkx_campaign_checklist grava evento 'checklist' com ator;
#     - 'authenticated' inserindo evento 'started' é NEGADO; note/checklist passam.
#
# A migration é encontrada pelo marcador interno 'talkx_x026_rpcs_ausentes'
# (sobrevive ao rename do hermes-db-migrar --nova); fallback para .tmp/x026.sql.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

migration="$(grep -rlF 'talkx_x026_rpcs_ausentes' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
if [[ -z "$migration" ]]; then
  migration="$repo_root/.tmp/x026.sql"
fi
[[ -f "$migration" ]] || { printf '[FALHA] migration X026 nao encontrada (marcador talkx_x026_rpcs_ausentes)\n' >&2; exit 1; }

fail() { printf '[FALHA] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

cid="talkx-x026-$RANDOM$RANDOM"
cleanup() {
  if [[ "$cid" =~ ^talkx-x026-[0-9]+$ ]]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# psql estrito (setup/migration): qualquer erro aborta.
psql_exec() { docker exec -i "$cid" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
# psql permissivo (assert em query única): devolve stdout+stderr; nunca derruba o harness.
psql_raw() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }
# Query feliz: deve imprimir exatamente o esperado.
psql_val() { docker exec "$cid" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1" 2>&1; }
# Multi-statement em transação (SET LOCAL valendo para o passo seguinte); erros viram texto.
psql_script() { docker exec -i "$cid" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres 2>&1 || true; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label (= $actual)"
}
assert_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" == *"$pattern"* ]] || fail "$label: esperado conter '$pattern', obtido -> $actual"
  pass "$label ($pattern)"
}
assert_not_has() {
  local label="$1" pattern="$2" actual="$3"
  [[ "$actual" != *"$pattern"* ]] || fail "$label: NÃO deveria conter '$pattern' -> $actual"
  pass "$label (sem '$pattern')"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
pg_image="${TALKX_COUNTERS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
docker run --rm -d --name "$cid" -e POSTGRES_PASSWORD=talkx_x026_test_only "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$cid" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$cid" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── identificadores ───────────────────────────────────────────────────────────
user_owner='50000000-0000-0000-0000-00000000000a'
profile_owner='40000000-0000-0000-0000-00000000000a'
contact_1='60000000-0000-0000-0000-000000000001'
contact_2='60000000-0000-0000-0000-000000000002'
template_1='70000000-0000-0000-0000-000000000001'
segment_1='30000000-0000-0000-0000-000000000001'
c_draft='20000000-0000-0000-0000-0000000000d1'
c_sending='20000000-0000-0000-0000-0000000000e1'
c_scheduled='20000000-0000-0000-0000-0000000000f1'
c_launch='20000000-0000-0000-0000-0000000000a1'
r_1='21000000-0000-0000-0000-000000000001'
r_2='21000000-0000-0000-0000-000000000002'

# ── fixtures mínimos (o suficiente para o delta de X026 rodar) ────────────────
psql_exec >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
-- Stub de conveniência: o teste não exercita o papel em si (já coberto por X014).
CREATE FUNCTION public.is_admin_or_supervisor(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  removed_at timestamptz,
  expires_at timestamptz
);

CREATE TABLE public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  use_count integer NOT NULL DEFAULT 0
);

-- Espelha as colunas vivas de talkx_campaigns relevantes ao delta (sem skipped_count).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL DEFAULT '',
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  template_version_id uuid,
  whatsapp_connection_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate',
  typing_delay_min integer NOT NULL DEFAULT 1500,
  typing_delay_max integer NOT NULL DEFAULT 4000,
  send_interval_min integer NOT NULL DEFAULT 8000,
  send_interval_max integer NOT NULL DEFAULT 20000,
  respect_suppression boolean NOT NULL DEFAULT true,
  confirm_consent boolean NOT NULL DEFAULT false,
  draft_step smallint DEFAULT 1,
  owner uuid,
  responsible_id uuid,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  draft_creation_key uuid,
  revision bigint NOT NULL DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  worker_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX talkx_campaigns_creation_key_uniq
  ON public.talkx_campaigns (created_by, draft_creation_key)
  WHERE draft_creation_key IS NOT NULL;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  delivery_claim_expires_at timestamptz,
  delivery_claimed_by text,
  delivery_last_claim_token uuid,
  provider_dispatch_started_at timestamptz,
  delivery_attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  entity_type text,
  entity_id uuid
);
ALTER TABLE public.talkx_campaign_events ENABLE ROW LEVEL SECURITY;
-- Policy de INSERT VIVA antes de X026 (20260929730000): QUALQUER tipo para o dono.
CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
    AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()))));
GRANT SELECT, INSERT ON public.talkx_campaign_events TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
-- Em produção 'authenticated' lê talkx_campaigns (RLS de SELECT) — a policy de
-- eventos faz EXISTS nessa tabela, então o grant é pré-requisito do fixture.
GRANT SELECT ON public.talkx_campaigns TO authenticated;

-- E86 (fonte: 20260916130000): o único escritor de use_count após a V15.
CREATE FUNCTION public.trg_talkx_increment_template_use_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.template_id IS NOT NULL AND NEW.status <> 'draft' THEN
    UPDATE public.talkx_templates SET use_count = COALESCE(use_count, 0) + 1 WHERE id = NEW.template_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.template_id IS NOT NULL
        AND COALESCE(OLD.status, '') = 'draft' AND NEW.status <> 'draft' THEN
    UPDATE public.talkx_templates SET use_count = COALESCE(use_count, 0) + 1 WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_talkx_template_use_count
  AFTER INSERT OR UPDATE OF status ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_talkx_increment_template_use_count();
SQL

psql_exec >/dev/null <<SQL
INSERT INTO public.profiles (id, user_id, is_active) VALUES ('$profile_owner', '$user_owner', true);
INSERT INTO public.contacts (id, phone) VALUES ('$contact_1', '5511900000001'), ('$contact_2', '5511900000002');
INSERT INTO public.talkx_templates (id, name, use_count) VALUES ('$template_1', 'Template X026', 0);

-- Fonte para duplicar/eventos: rascunho com mensagem, mídia, segmento, limites e janela.
INSERT INTO public.talkx_campaigns (
  id, name, message_template, description, objective, audience_source, audience_filters,
  segment_id, template_id, whatsapp_connection_id, media_url, media_type,
  schedule_timezone, send_window_start, send_window_end, business_hours_only, speed_profile,
  typing_delay_min, typing_delay_max, send_interval_min, send_interval_max,
  respect_suppression, confirm_consent, draft_step, owner, responsible_id,
  status, created_by
) VALUES (
  '$c_draft', 'Campanha Fonte', 'Oi {{nome}}', 'desc', 'vendas', 'segment', '{"city":"Recife"}'::jsonb,
  '$segment_1', '$template_1', NULL, 'https://cdn.example.com/x.png', 'image',
  'America/Sao_Paulo', '08:00', '18:00', true, 'fast',
  1000, 2000, 9000, 12000,
  true, true, 2, '$profile_owner', '$profile_owner',
  'draft', '$profile_owner'
);

-- Campanha em envio (claim + recusa de excluir).
INSERT INTO public.talkx_campaigns (id, name, message_template, status, created_by)
  VALUES ('$c_sending', 'Em envio', 'Oi', 'sending', '$profile_owner');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status)
  VALUES ('$r_1', '$c_sending', '$contact_1', 'pending'),
         ('$r_2', '$c_sending', '$contact_2', 'pending');

-- Ambos os contatos suprimidos (opt-out ativo).
INSERT INTO public.talkx_blacklist (contact_id, removed_at) VALUES ('$contact_1', NULL), ('$contact_2', NULL);

-- Campanha agendada (exclusão permitida) e rascunho para lançar com template.
INSERT INTO public.talkx_campaigns (id, name, message_template, status, scheduled_at, total_recipients, created_by)
  VALUES ('$c_scheduled', 'Agendada', 'Oi', 'scheduled', statement_timestamp() + interval '2 days', 1, '$profile_owner');
INSERT INTO public.talkx_campaigns (id, name, message_template, template_id, status, created_by)
  VALUES ('$c_launch', 'Vai lancar', 'Oi {{nome}}', '$template_1', 'draft', '$profile_owner');
SQL

# ═════════════════════════════════════════════════════════════════════════════
# RED — o estado antes da migration reproduz as lacunas do X026
# ═════════════════════════════════════════════════════════════════════════════
red_col="$(psql_raw "SELECT skipped_count FROM public.talkx_campaigns LIMIT 1")"
assert_has 'RED: skipped_count nao existe antes da X026' 'does not exist' "$red_col"

red_event="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
INSERT INTO public.talkx_campaign_events (campaign_id, event_type) VALUES ('$c_draft', 'started');
COMMIT;
SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_draft' AND event_type='started';
SQL
)"
assert_has 'RED: authenticated inseria evento started antes da X026' '1' "$red_event"

# ═════════════════════════════════════════════════════════════════════════════
# GREEN — aplica a migration X026
# ═════════════════════════════════════════════════════════════════════════════
psql_exec < "$migration" >/dev/null || fail 'migration X026 nao aplicou (GREEN)'
pass "migration X026 aplicada ($(basename "$migration"))"

# ── 1) replied_count / skipped_count no guard (authenticated direto) ─────────
guard_replied="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
UPDATE public.talkx_campaigns SET replied_count = replied_count + 1 WHERE id='$c_draft';
COMMIT;
SQL
)"
assert_has 'GREEN: UPDATE direto de replied_count como authenticated -> 42501' 'talkx_delivery_state_managed_by_worker' "$guard_replied"

guard_skipped="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
UPDATE public.talkx_campaigns SET skipped_count = skipped_count + 1 WHERE id='$c_draft';
COMMIT;
SQL
)"
assert_has 'GREEN: UPDATE direto de skipped_count como authenticated -> 42501' 'talkx_delivery_state_managed_by_worker' "$guard_skipped"

# ── 2) 2 suprimidos no claim -> skipped_count = 2 ────────────────────────────
claim_out="$(psql_script <<SQL
BEGIN;
SET LOCAL request.jwt.claim.role='service_role';
SELECT count(*) FROM public.claim_talkx_recipient('$c_sending', '$r_1', 'worker-x026', 90);
SELECT count(*) FROM public.claim_talkx_recipient('$c_sending', '$r_2', 'worker-x026', 90);
COMMIT;
SQL
)"
claim_skipped="$(psql_val "SELECT skipped_count FROM public.talkx_campaigns WHERE id='$c_sending'")"
assert_eq 'GREEN: 2 suprimidos no claim -> skipped_count=2' '2' "$claim_skipped"
claim_recipients="$(psql_val "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$c_sending' AND status='skipped'")"
assert_eq 'GREEN: os 2 destinatarios ficam com status skipped' '2' "$claim_recipients"

# ── 3) lançar com template -> use_count +1 exato ──────────────────────────────
use_count_before="$(psql_val "SELECT COALESCE(use_count,0) FROM public.talkx_templates WHERE id='$template_1'")"
psql_exec >/dev/null <<SQL
UPDATE public.talkx_campaigns SET status='sending' WHERE id='$c_launch';
SQL
use_count_after="$(psql_val "SELECT COALESCE(use_count,0) FROM public.talkx_templates WHERE id='$template_1'")"
assert_eq 'GREEN: lancar com template incrementa use_count exatamente +1' "$(( use_count_before + 1 ))" "$use_count_after"
rpc_gone="$(psql_val "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='increment_talkx_template_use'")"
assert_eq 'GREEN: increment_talkx_template_use nao existe (sem 2o incremento)' '0' "$rpc_gone"

# ── 4) duplicar devolve rascunho com total_recipients=0 ──────────────────────
dup="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT id::text || '|' || status || '|' || total_recipients::text || '|' ||
       COALESCE(scheduled_at::text,'NULL') || '|' || message_template || '|' ||
       COALESCE(media_url,'NULL') || '|' || COALESCE(segment_id::text,'NULL') || '|' ||
       speed_profile || '|' || COALESCE(send_window_start::text,'NULL')
  FROM public.duplicate_talkx_campaign('$c_draft');
COMMIT;
SQL
)"
dup_line="$(printf '%s\n' "$dup" | grep -E '^[0-9a-f-]{36}\|' | tail -1 || true)"
[[ -n "$dup_line" ]] || fail "GREEN: duplicate nao devolveu linha valida -> $dup"
IFS='|' read -r dup_id dup_status dup_total dup_sched dup_msg dup_media dup_segment dup_speed dup_window <<< "$dup_line"
[[ "$dup_id" =~ ^[0-9a-f-]{36}$ ]] || fail "GREEN: duplicate nao devolveu id valido (got '$dup_line')"
assert_eq 'GREEN: duplicar devolve status draft' 'draft' "$dup_status"
assert_eq 'GREEN: duplicar devolve total_recipients=0' '0' "$dup_total"
assert_eq 'GREEN: duplicar nao copia agendamento' 'NULL' "$dup_sched"
assert_eq 'GREEN: duplicar copia a mensagem' 'Oi {{nome}}' "$dup_msg"
assert_eq 'GREEN: duplicar copia a midia' 'https://cdn.example.com/x.png' "$dup_media"
assert_eq 'GREEN: duplicar copia o segmento' "$segment_1" "$dup_segment"
assert_eq 'GREEN: duplicar copia os limites (speed_profile)' 'fast' "$dup_speed"
assert_eq 'GREEN: duplicar copia a janela de envio' '08:00:00' "$dup_window"
dup_recipients="$(psql_val "SELECT count(*) FROM public.talkx_recipients WHERE campaign_id='$dup_id'")"
assert_eq 'GREEN: rascunho duplicado nao tem destinatarios' '0' "$dup_recipients"

# ── 5) excluir: sending recusado; draft e scheduled aceitos ──────────────────
del_sending="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT public.delete_talkx_campaign('$c_sending');
COMMIT;
SQL
)"
assert_has 'GREEN: excluir campanha sending -> erro' 'talkx_campaign_not_deletable' "$del_sending"

del_scheduled="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT public.delete_talkx_campaign('$c_scheduled');
COMMIT;
SQL
)"
assert_has 'GREEN: excluir campanha scheduled -> aceito' "$c_scheduled" "$del_scheduled"
scheduled_gone="$(psql_val "SELECT count(*) FROM public.talkx_campaigns WHERE id='$c_scheduled'")"
assert_eq 'GREEN: campanha scheduled foi removida' '0' "$scheduled_gone"

del_draft="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT public.delete_talkx_campaign('$dup_id');
COMMIT;
SQL
)"
assert_has 'GREEN: excluir rascunho -> aceito' "$dup_id" "$del_draft"

# ── 6) checklist com ator ─────────────────────────────────────────────────────
checklist="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT public.log_talkx_campaign_checklist('$c_draft', '[{"id":"passo1","done":true},{"id":"passo2","done":false}]'::jsonb)::text;
COMMIT;
SELECT event_type || '|' || COALESCE(actor_id::text,'NULL') FROM public.talkx_campaign_events
 WHERE campaign_id='$c_draft' AND event_type='checklist' ORDER BY created_at DESC LIMIT 1;
SQL
)"
assert_has 'GREEN: log_talkx_campaign_checklist grava checklist com ator' "$profile_owner" "$checklist"
checklist_bad="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
SELECT public.log_talkx_campaign_checklist('$c_draft', '{"nao":"array"}'::jsonb);
COMMIT;
SQL
)"
assert_has 'GREEN: checklist com payload nao-array -> 22023' 'invalid_talkx_checklist_payload' "$checklist_bad"

# ── 7) policy de INSERT de eventos limitada a note|checklist|segments_reviewed ─
denied="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
INSERT INTO public.talkx_campaign_events (campaign_id, event_type) VALUES ('$c_draft', 'started');
COMMIT;
SQL
)"
assert_has 'GREEN: authenticated inserindo evento started -> negado (RLS)' 'row-level security' "$denied"

allowed="$(psql_script <<SQL
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='$user_owner';
INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message) VALUES ('$c_draft', 'note', 'x026-note-ok');
INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message) VALUES ('$c_draft', 'segments_reviewed', 'x026-seg-ok');
COMMIT;
SELECT count(*) FROM public.talkx_campaign_events WHERE campaign_id='$c_draft' AND message IN ('x026-note-ok','x026-seg-ok');
SQL
)"
assert_has 'GREEN: note/segments_reviewed continuam aceitos para o dono' '2' "$allowed"

# ── 8) idempotência: reaplicar a migration não quebra nem duplica policy ──────
psql_exec < "$migration" >/dev/null || fail 'migration X026 nao reaplicou (idempotencia)'
policies="$(psql_val "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='talkx_campaign_events' AND policyname='talkx_campaign_events_insert'")"
assert_eq 'GREEN: reaplicar nao duplica a policy de INSERT' '1' "$policies"

echo '[OK] Talk X X026: contadores integros, checklist com ator, duplicar/excluir no banco e policy de eventos limitada.'
