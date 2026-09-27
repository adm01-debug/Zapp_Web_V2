#!/usr/bin/env bash
# Contrato comportamental da Telefonia v2 (plano 100 etapas, Fase 2).
# Prova, em PostgreSQL descartável, que:
#   - a migration é aditiva e idempotente;
#   - o backfill de channel/talk_seconds acerta as contagens esperadas;
#   - search_my_calls/my_calls_kpi respeitam escopo (mine sempre, all só para admin/supervisor),
#     filtros, busca, contagem total e o teto de 50 linhas;
#   - upsert_my_call nunca escreve em chamada de outro agente e calcula talk_seconds;
#   - set_call_agent_notes separa anotação humana de metadado do provedor e barra terceiros;
#   - record_incoming_call_event não sobrescreve mais agent_id nem notes e calcula talk_seconds;
#   - anon não executa nenhuma RPC nova e `calls` entra na publicação supabase_realtime.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260926800000_calls_telefonia_v2.sql"
migration_fix_notes="$repo_root/supabase/migrations/20260926900000_fix_set_call_agent_notes_null_profile.sql"
postgres_image="${CALLS_TELEFONIA_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-calls-telefonia-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-calls-telefonia-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s (%s)\n' "$label" "$actual"
}

# atores
U_A='20000000-0000-0000-0000-000000000001'; P_A='10000000-0000-0000-0000-000000000001'
U_B='20000000-0000-0000-0000-000000000002'; P_B='10000000-0000-0000-0000-000000000002'
U_C='20000000-0000-0000-0000-000000000003'; P_C='10000000-0000-0000-0000-000000000003'
U_D='20000000-0000-0000-0000-000000000004'
W1='50000000-0000-0000-0000-000000000001'

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ---------------------------------------------------------------- pré-estado
# Espelha o schema REAL de public.calls medido no banco oficial (26/09/2026),
# com as colunas antigas, o CHECK de status estreito e as 3 policies existentes.
psql_sql "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \$\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
  CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \$\$ SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role IN ('admin','supervisor')) \$\$;

  CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.contacts (
    id uuid PRIMARY KEY,
    name text,
    phone text,
    avatar_url text,
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id)
  );
  CREATE TABLE public.notifications (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    type text,
    title text,
    message text,
    metadata jsonb
  );
  CREATE TABLE public.calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
    direction text NOT NULL CHECK (direction = ANY (ARRAY['inbound','outbound'])),
    status text NOT NULL DEFAULT 'ringing'
      CHECK (status = ANY (ARRAY['ringing','answered','ended','missed','busy','failed'])),
    started_at timestamptz NOT NULL DEFAULT now(),
    answered_at timestamptz,
    ended_at timestamptz,
    duration_seconds integer,
    recording_url text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    provider_event_id text,
    CONSTRAINT calls_provider_event_id_length
      CHECK (provider_event_id IS NULL OR char_length(provider_event_id) BETWEEN 1 AND 200)
  );
  CREATE UNIQUE INDEX calls_connection_provider_event_unique
    ON public.calls (whatsapp_connection_id, provider_event_id) WHERE provider_event_id IS NOT NULL;
  CREATE INDEX idx_calls_agent_id ON public.calls (agent_id);
  CREATE INDEX idx_calls_contact_id ON public.calls (contact_id);
  CREATE INDEX idx_calls_whatsapp_connection_id ON public.calls (whatsapp_connection_id);
  ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
  CREATE POLICY \"Users can view own calls\" ON public.calls FOR SELECT TO authenticated
    USING (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
           OR public.is_admin_or_supervisor(auth.uid()));
  CREATE POLICY \"Users can insert calls\" ON public.calls FOR INSERT TO authenticated
    WITH CHECK (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
                OR public.is_admin_or_supervisor(auth.uid()));
  CREATE POLICY \"Users can update their calls\" ON public.calls FOR UPDATE TO authenticated
    USING (agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
  CREATE PUBLICATION supabase_realtime;

  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
  GRANT SELECT ON public.contacts, public.profiles, public.whatsapp_connections TO authenticated,
    service_role;
  GRANT SELECT, INSERT ON public.notifications TO authenticated;
  GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated;

  INSERT INTO public.profiles (id, user_id) VALUES
    ('$P_A','$U_A'), ('$P_B','$U_B'), ('$P_C','$U_C');
  INSERT INTO public.user_roles (user_id, role) VALUES ('$U_C','admin');
  INSERT INTO public.whatsapp_connections (id, name) VALUES ('$W1','Promo Brindes WhatsApp');
  INSERT INTO public.contacts (id, name, phone, assigned_to, whatsapp_connection_id) VALUES
    ('30000000-0000-0000-0000-000000000001','Mariana Costa','+5511999992048','$P_A','$W1'),
    ('30000000-0000-0000-0000-000000000002','Rafael Martins','5511988887777','$P_B','$W1');

  -- c1: A saída atendida (2 dias atrás) | c2: A entrada perdida | c3: B saída atendida
  -- c4: sem agente, entrada perdida | c5: A entrada tocando, canal WhatsApp
  INSERT INTO public.calls
    (id, contact_id, agent_id, whatsapp_connection_id, direction, status,
     started_at, answered_at, ended_at, notes) VALUES
    ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','$P_A',NULL,'outbound','ended',
      now() - interval '2 days', now() - interval '2 days' + interval '10 seconds',
      now() - interval '2 days' + interval '130 seconds','Chamada de voz'),
    ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','$P_A',NULL,'inbound','missed',
      now() - interval '1 hour', NULL, now() - interval '1 hour' + interval '30 seconds', NULL),
    ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','$P_B',NULL,'outbound','ended',
      now() - interval '1 hour', now() - interval '1 hour' + interval '5 seconds',
      now() - interval '1 hour' + interval '65 seconds', NULL),
    ('40000000-0000-0000-0000-000000000004',NULL,NULL,NULL,'inbound','ended',
      now() - interval '1 hour', NULL, now() - interval '1 hour' + interval '45 seconds', NULL),
    ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','$P_A','$W1','inbound','ringing',
      now() - interval '30 minutes', NULL, NULL, 'Chamada de vídeo');
  UPDATE public.calls SET provider_event_id = 'seed-wa-1' WHERE id = '40000000-0000-0000-0000-000000000005';
" >/dev/null

expect_eq 'pré-estado: calls na publicação Realtime' '0' \
  "$(psql_sql "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls'")"

# ------------------------------------------------------------- aplica migration
psql_file "$migration" >/dev/null
psql_file "$migration_fix_notes" >/dev/null

# --------------------------------------------------------- estrutura e backfill
expect_eq '9 colunas aditivas presentes' '9' \
  "$(psql_sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='calls' AND column_name IN ('channel','provider_call_id','peer_number','peer_name','answered_by','end_reason','agent_notes','recording_status','talk_seconds')")"
expect_eq 'backfill de channel: whatsapp' '1' \
  "$(psql_sql "SELECT count(*) FROM public.calls WHERE channel = 'whatsapp'")"
expect_eq 'backfill de channel: voip' '4' \
  "$(psql_sql "SELECT count(*) FROM public.calls WHERE channel = 'voip'")"
expect_eq 'backfill de talk_seconds (só onde há answered+ended)' '2' \
  "$(psql_sql "SELECT count(*) FROM public.calls WHERE talk_seconds IS NOT NULL")"
expect_eq 'talk_seconds da chamada atendida = 120' '120' \
  "$(psql_sql "SELECT talk_seconds FROM public.calls WHERE id='40000000-0000-0000-0000-000000000001'")"
expect_eq 'calls entrou na publicação Realtime' '1' \
  "$(psql_sql "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls'")"
expect_eq 'policies de calls inalteradas (3)' '3' \
  "$(psql_sql "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='calls'")"

# ------------------------------------------------------------------- escopo
expect_eq 'A vê só as próprias (default mine)' '3' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls();")"
expect_eq 'B vê só as próprias' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT count(*) FROM public.search_my_calls();")"
expect_eq 'A pedindo scope=all continua vendo só as próprias' '3' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_scope => 'all');")"
expect_eq 'admin com scope=all vê todas' '5' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT count(*) FROM public.search_my_calls(p_scope => 'all');")"
expect_eq 'admin com scope=mine vê nenhuma (não é agente)' '0' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT count(*) FROM public.search_my_calls(p_scope => 'mine');")"
expect_eq 'RLS crua: B só enxerga 1 linha de calls' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT count(*) FROM public.calls;")"
expect_eq 'RLS crua: admin enxerga as 5 (inclui a sem dono)' '5' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT count(*) FROM public.calls;")"
expect_eq 'chamada sem dono não vaza para agente' '0' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.calls WHERE id='40000000-0000-0000-0000-000000000004';")"

# --------------------------------------------------------------- filtros/busca
expect_eq 'filtro de período (últimas 24h) em A' '2' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_from => now() - interval '1 day');")"
expect_eq 'filtro de canal whatsapp em A' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_channel => 'whatsapp');")"
expect_eq 'filtro resultado=missed em A' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_result => 'missed');")"
expect_eq 'filtro resultado=completed em A' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_result => 'completed');")"
expect_eq 'filtro direção=outbound em A' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_direction => 'outbound');")"
expect_eq 'busca por nome do contato' '2' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_q => 'Mariana');")"
expect_eq 'busca por dígitos do número (telefone do contato; c5 cai no telefone do Rafael)' '2' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_q => '99992048');")"
expect_eq 'busca por dígitos acha a chamada pelo telefone do contato dela' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_q => '9888');")"
psql_sql "UPDATE public.calls SET peer_number='5511977770000' WHERE id='40000000-0000-0000-0000-000000000005';" >/dev/null
expect_eq 'peer_number do evento precede o telefone do contato na busca' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_q => '77770000');")"
expect_eq 'busca por dígitos cai no telefone do contato quando não há peer_number' '1' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT count(*) FROM public.search_my_calls(p_q => '9888');")"
expect_eq 'busca sem correspondência devolve vazio' '0' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT count(*) FROM public.search_my_calls(p_q => 'zzzz-nao-existe');")"
expect_eq 'total_count considera o universo, não a página' '5' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT total_count FROM public.search_my_calls(p_scope => 'all', p_limit => 1) LIMIT 1;")"
expect_eq 'ordem é started_at desc' '40000000-0000-0000-0000-000000000005' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT id FROM public.search_my_calls(p_limit => 1);")"

# ------------------------------------------------------------------ KPIs
expect_eq 'KPI de A (mine): total|realizadas|recebidas|perdidas_recebidas|atendidas|média' '3|1|2|1|1|120.0000000000000000' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT total || '|' || outbound || '|' || inbound || '|' || missed_inbound || '|' || answered || '|' || avg_talk_seconds FROM public.my_calls_kpi();")"
expect_eq 'KPI de admin (all): média entre as duas atendidas' '2|3|2|2|90.0000000000000000' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT outbound || '|' || inbound || '|' || missed_inbound || '|' || answered || '|' || avg_talk_seconds FROM public.my_calls_kpi(p_scope => 'all');")"
expect_eq 'KPI de agente pedindo scope=all cai para mine' '3|1|2|1|1|120.0000000000000000' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT total || '|' || outbound || '|' || inbound || '|' || missed_inbound || '|' || answered || '|' || avg_talk_seconds FROM public.my_calls_kpi(p_scope => 'all');")"
expect_eq 'KPI bate com a contagem da busca no mesmo filtro' 'true' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT ((SELECT total FROM public.my_calls_kpi()) = (SELECT count(*) FROM public.search_my_calls(p_limit => 50)))::text;")"

# ------------------------------------------------- persistência idempotente
NEW_CALL='40000000-0000-0000-0000-0000000000aa'
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT public.upsert_my_call('$NEW_CALL','outbound','ringing','voip','5511977776666',NULL,NULL,'callid-x');" >/dev/null
expect_eq 'upsert criou 1 linha ringing com provider_call_id' 'ringing|5511977776666|callid-x|voip|1' \
  "$(psql_sql "SELECT status || '|' || peer_number || '|' || provider_call_id || '|' || channel || '|' || (answered_by IS NULL)::int FROM public.calls WHERE id='$NEW_CALL'")"
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT public.upsert_my_call('$NEW_CALL','outbound','answered','voip',NULL,NULL,NULL,NULL,now());" >/dev/null
expect_eq 'upsert marcou answered e answered_by = agente' 'answered|true' \
  "$(psql_sql "SELECT status || '|' || (answered_by = '$P_A')::text FROM public.calls WHERE id='$NEW_CALL'")"
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT public.upsert_my_call('$NEW_CALL','outbound','ended','voip',NULL,NULL,NULL,NULL,NULL,now() + interval '42 seconds','completed');" >/dev/null
expect_eq 'upsert calculou talk_seconds no encerramento' 'ended|42|completed|1' \
  "$(psql_sql "SELECT status || '|' || talk_seconds || '|' || end_reason || '|' || (SELECT count(*) FROM public.calls WHERE id='$NEW_CALL')::text FROM public.calls WHERE id='$NEW_CALL'")"
expect_eq 'upsert não altera agent_id no update' "$P_A" \
  "$(psql_sql "SELECT agent_id FROM public.calls WHERE id='$NEW_CALL'")"
expect_failure 'upsert de B na chamada de A' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT public.upsert_my_call('$NEW_CALL','outbound','ringing','voip');"
expect_failure 'upsert de B tentando sobrescrever a chamada de seed de A' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT public.upsert_my_call('40000000-0000-0000-0000-000000000002','outbound','ringing','voip');"

# ------------------------------------------------------------ anotação humana
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT public.set_call_agent_notes('40000000-0000-0000-0000-000000000001','nota do dono');" >/dev/null
expect_eq 'nota do dono gravada e notes do provedor intocado' 'nota do dono|Chamada de voz' \
  "$(psql_sql "SELECT agent_notes || '|' || notes FROM public.calls WHERE id='40000000-0000-0000-0000-000000000001'")"
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_C'; SELECT public.set_call_agent_notes('40000000-0000-0000-0000-000000000001','nota do admin');" >/dev/null
expect_eq 'admin também pode anotar' 'nota do admin' \
  "$(psql_sql "SELECT agent_notes FROM public.calls WHERE id='40000000-0000-0000-0000-000000000001'")"
expect_failure 'terceiro não anota chamada alheia' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT public.set_call_agent_notes('40000000-0000-0000-0000-000000000001','invasao');"
# U_D é authenticated mas NÃO tem linha em public.profiles (v_profile ficaria NULL).
# Regressão do bug de bypass por NULL em PL/pgSQL: 'not (v_owner = NULL or ...)' avalia
# para NULL (não TRUE), então o IF era pulado sem levantar exceção e caía direto no UPDATE.
expect_failure 'authenticated sem linha em profiles não anota chamada alheia' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='$U_D'; SELECT public.set_call_agent_notes('40000000-0000-0000-0000-000000000001','sem-perfil');"
expect_failure 'anon não executa search_my_calls' \
  "SET ROLE anon; SELECT count(*) FROM public.search_my_calls();"
expect_failure 'anon não executa my_calls_kpi' \
  "SET ROLE anon; SELECT * FROM public.my_calls_kpi();"
expect_failure 'anon não executa upsert_my_call' \
  "SET ROLE anon; SELECT public.upsert_my_call('40000000-0000-0000-0000-0000000000bb','outbound');"
expect_failure 'anon não executa set_call_agent_notes' \
  "SET ROLE anon; SELECT public.set_call_agent_notes('40000000-0000-0000-0000-000000000001','x');"

# ------------------------------------------- eventos de chamada do WhatsApp
EV1="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT call_id FROM public.record_incoming_call_event('30000000-0000-0000-0000-000000000001','$W1','ringing',false,'evt-1',true);")"
[[ -n "$EV1" ]] || fail 'evento ringing não devolveu call_id'
expect_eq 'evento gravou canal, peer e identidade do provedor' 'whatsapp|Mariana Costa|+5511999992048|evt-1|Chamada de voz' \
  "$(psql_sql "SELECT channel || '|' || peer_name || '|' || peer_number || '|' || provider_call_id || '|' || notes FROM public.calls WHERE id='$EV1'")"
expect_eq 'notificação incoming_call aponta para o call_id' '1' \
  "$(psql_sql "SELECT count(*) FROM public.notifications WHERE type='incoming_call' AND metadata->>'call_id' = '$EV1'")"
# reatribui o contato a outro agente e reenvia o MESMO evento, agora encerrado e em vídeo
psql_sql "UPDATE public.contacts SET assigned_to = '$P_B' WHERE id='30000000-0000-0000-0000-000000000001';" >/dev/null
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT call_id FROM public.record_incoming_call_event('30000000-0000-0000-0000-000000000001','$W1','ended',true,'evt-1',false);" >/dev/null
expect_eq 'segundo evento não regrava agent_id nem notes' "$P_A|Chamada de voz|ended" \
  "$(psql_sql "SELECT agent_id || '|' || notes || '|' || status FROM public.calls WHERE id='$EV1'")"
EV2="$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT call_id FROM public.record_incoming_call_event('30000000-0000-0000-0000-000000000001','$W1','answered',false,'evt-2',false);")"
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; SELECT call_id FROM public.record_incoming_call_event('30000000-0000-0000-0000-000000000001','$W1','ended',false,'evt-2',false);" >/dev/null
expect_eq 'evento answered→ended calcula talk_seconds (não nulo)' 'true' \
  "$(psql_sql "SELECT (talk_seconds IS NOT NULL)::text FROM public.calls WHERE id='$EV2'")"

# --------------------------------------------------------- CHECKs ampliados
psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_A'; INSERT INTO public.calls (id, agent_id, direction, status, channel, end_reason) VALUES ('40000000-0000-0000-0000-0000000000cc','$P_A','outbound','declined','voip','declined');" >/dev/null
expect_eq 'status declined aceito depois da ampliação' 'declined' \
  "$(psql_sql "SELECT status FROM public.calls WHERE id='40000000-0000-0000-0000-0000000000cc'")"
expect_failure 'status fora do domínio continua rejeitado' \
  "INSERT INTO public.calls (id, agent_id, direction, status) VALUES ('40000000-0000-0000-0000-0000000000cd','$P_A','outbound','teleportou');"
expect_failure 'end_reason fora do domínio é rejeitado' \
  "INSERT INTO public.calls (id, agent_id, direction, status, end_reason) VALUES ('40000000-0000-0000-0000-0000000000ce','$P_A','outbound','ended','porque-sim');"

# ------------------------------------------------------------ teto de 50 linhas
psql_sql "INSERT INTO public.calls (agent_id, direction, status, channel, started_at)
          SELECT '$P_B','outbound','ended','voip', now() - (g || ' minutes')::interval
          FROM generate_series(1, 55) AS g;" >/dev/null
expect_eq 'p_limit é limitado a 50' '50' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT count(*) FROM public.search_my_calls(p_limit => 999);")"
expect_eq 'total_count continua contando tudo (55 inseridas + 1 de seed + 1 do evento evt-2)' '57' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT total_count FROM public.search_my_calls(p_limit => 999) LIMIT 1;")"
expect_eq 'paginação não repete linha' '0' \
  "$(psql_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$U_B'; SELECT count(*) FROM (SELECT id FROM public.search_my_calls(p_limit => 8, p_offset => 0) INTERSECT SELECT id FROM public.search_my_calls(p_limit => 8, p_offset => 8)) x;")"

# --------------------------------------------------------- ACL e idempotência
expect_eq 'anon/PUBLIC sem EXECUTE nas 4 RPCs novas' '0' \
  "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('search_my_calls','my_calls_kpi','upsert_my_call','set_call_agent_notes') AND grantee IN ('PUBLIC','anon')")"
expect_eq 'authenticated com EXECUTE nas 4 RPCs novas' '4' \
  "$(psql_sql "SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('search_my_calls','my_calls_kpi','upsert_my_call','set_call_agent_notes') AND grantee='authenticated'")"

psql_file "$migration" >/dev/null
expect_eq 'segunda aplicação é idempotente (colunas novas seguem 9)' '9' \
  "$(psql_sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='calls' AND column_name IN ('channel','provider_call_id','peer_number','peer_name','answered_by','end_reason','agent_notes','recording_status','talk_seconds')")"
expect_eq 'segunda aplicação não duplica índices novos' '2' \
  "$(psql_sql "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('calls_agent_started_idx','calls_channel_provider_call_unique')")"
expect_eq 'segunda aplicação preserva as anotações' 'nota do admin' \
  "$(psql_sql "SELECT agent_notes FROM public.calls WHERE id='40000000-0000-0000-0000-000000000001'")"

printf 'Telefonia v2 data contract (PostgreSQL 17): PASS\n'
