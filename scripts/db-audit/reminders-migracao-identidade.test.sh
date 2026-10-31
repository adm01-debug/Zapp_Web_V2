#!/usr/bin/env bash
# Item 293 do BACKLOG_VERIFICADO (R2-DB-005): a migração de lembretes associava
# tarefas por TÍTULO, sem preservar a identidade da origem.
#
# BLOCO A (antes): o algoritmo de produção, copiado de
#   supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql:169-192
#   (INSERT ... RETURNING id, title + UPDATE ... WHERE ins.title = r.title)
#   roda sobre um fixture com dois lembretes de MESMO título e donos/contatos
#   diferentes. Os vínculos cruzam (ou repetem a mesma tarefa) e NÃO existe
#   coluna nem função capaz de auditar/reparar a origem.
# BLOCO B (depois): aplica a migration real
#   20261006170742_fix_reminders_migrated_task_identity.sql e prova que cada
#   lembrete fica ligado à tarefa da SUA origem — com bijeção, origem imutável,
#   fidelidade temporal, idempotência sem recriar tarefa apagada e o helper NEGADO para anon/authenticated.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006170742_fix_reminders_migrated_task_identity.sql"
postgres_image="${REMINDERS_IDENTITY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-reminders-identity-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-reminders-identity-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

# expect_value <rótulo> <esperado> <sql>
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" 2>/dev/null | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_same() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Schema da cópia, no estado ANTERIOR à correção: reminders.migrated_task_id
#    existe (20260928140000:166-167) e NÃO existe origem nem função de reparo.
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.contacts (id uuid PRIMARY KEY);

CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  remind_at timestamptz,
  notified_at timestamptz,
  waiting_reason text,
  position integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  remind_at timestamptz NOT NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  migrated_task_id uuid REFERENCES public.conversation_tasks(id) ON DELETE SET NULL
);
SQL

# ── Fixture: A e B têm o MESMO título, mas donos e contatos DIFERENTES; C é o
#    caso simples (título único). O created_at de cada lembrete é o relógio da
#    origem que a correção precisa preservar.
cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.reminders;
DELETE FROM public.conversation_tasks;
DELETE FROM public.contacts;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id) VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.contacts (id) VALUES
  ('a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002');

INSERT INTO public.reminders (id, contact_id, profile_id, title, description, remind_at, created_at) VALUES
  ('aaa00000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Consulta medica', 'da Ana',
   '2026-10-10 09:00:00+00', '2026-09-20 08:00:00+00'),
  ('bbb00000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000002', 'Consulta medica', 'do Bruno',
   '2026-10-11 15:00:00+00', '2026-09-21 08:00:00+00'),
  ('ccc00000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Comprar cafe', NULL,
   '2026-10-12 08:00:00+00', '2026-09-22 08:00:00+00');
SQL

# ── Algoritmo de produção (o defeito): INSERT ... RETURNING id,title e UPDATE
#    casando por igualdade de título. Copiado de 20260928140000:169-192.
cat > "$tmp_dir/algoritmo-por-titulo.sql" <<'SQL'
WITH ins AS (
  INSERT INTO public.conversation_tasks
    (title, description, remind_at, notified_at, contact_id, created_by, assigned_to,
     status, priority, status_changed_at, position)
  SELECT
    r.title, r.description, r.remind_at, r.notified_at, r.contact_id,
    r.profile_id, r.profile_id,
    CASE WHEN r.is_dismissed THEN 'done' ELSE 'todo' END,
    'medium', COALESCE(r.created_at, now()), 0
  FROM public.reminders r
  WHERE r.migrated_task_id IS NULL
  RETURNING id, title
)
UPDATE public.reminders r
SET migrated_task_id = ins.id
FROM ins
WHERE ins.title = r.title AND r.migrated_task_id IS NULL;
SQL

psql_file "$tmp_dir/pre.sql"

echo '── BLOCO A: ANTES da correção (o defeito) ─────────────────────────────────────────'

expect_value 'A0 não existe coluna de origem imutável (migrated_from_reminder_id)' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_tasks' AND column_name='migrated_from_reminder_id'"
expect_value 'A0b não existe função de reparo por identidade' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname='backfill_reminders_to_conversation_tasks'"

psql_file "$tmp_dir/seed.sql"
psql_file "$tmp_dir/algoritmo-por-titulo.sql"

expect_value 'A1 o vínculo por título aponta para tarefa de OUTRO dono/contato' 'true' \
  "SELECT (count(*) > 0)::text FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id WHERE t.created_by IS DISTINCT FROM r.profile_id OR t.contact_id IS DISTINCT FROM r.contact_id"
expect_value 'A2 o vínculo por título NÃO é bijetivo (tarefa repetida ou órfã)' 'true' \
  "SELECT (count(DISTINCT migrated_task_id) < count(*))::text FROM public.reminders WHERE migrated_task_id IS NOT NULL"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS da correção ────────────────────────────────────────────────────'

RA='aaa00000-0000-0000-0000-00000000000a'
RB='bbb00000-0000-0000-0000-00000000000b'

expect_value 'B0 a coluna de origem imutável passou a existir' '1' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_tasks' AND column_name='migrated_from_reminder_id'"

expect_value 'B1 os 3 lembretes ficaram ligados à PRÓPRIA origem' '3' \
  "SELECT count(*) FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id AND t.migrated_from_reminder_id = r.id"

expect_value 'B2 todo vínculo preserva título+dono+contato+horários+descrição da origem' 'true' \
  "SELECT (count(*) = 0)::text FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id WHERE t.title IS DISTINCT FROM r.title OR t.created_by IS DISTINCT FROM r.profile_id OR t.contact_id IS DISTINCT FROM r.contact_id OR t.remind_at IS DISTINCT FROM r.remind_at OR t.notified_at IS DISTINCT FROM r.notified_at OR t.description IS DISTINCT FROM r.description"

expect_value 'B3 a associação é bijetiva (uma tarefa por lembrete)' 'true' \
  "SELECT (count(DISTINCT migrated_task_id) = count(*))::text FROM public.reminders WHERE migrated_task_id IS NOT NULL"

expect_value 'B4 fidelidade temporal: status_changed_at carrega o created_at da origem' 'true' \
  "SELECT (count(*) = 0)::text FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id WHERE t.status_changed_at IS DISTINCT FROM COALESCE(r.created_at, t.status_changed_at)"

expect_value 'B5 os dois lembretes de MESMO título apontam para tarefas DIFERENTES' 'true' \
  "SELECT (count(DISTINCT migrated_task_id) = 2)::text FROM public.reminders WHERE title = 'Consulta medica'"

expect_value 'B5b cada um deles é a tarefa do SEU dono/contato' 'true' \
  "SELECT (count(*) = 2)::text FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id WHERE r.title = 'Consulta medica' AND t.created_by = r.profile_id AND t.contact_id = r.contact_id"

# Caminho cruzado à mão: o estrago que a associação por título produzia.
psql_sql "UPDATE public.reminders SET migrated_task_id = (SELECT migrated_task_id FROM public.reminders WHERE id='$RB') WHERE id='$RA'" >/dev/null
psql_sql "SELECT public.backfill_reminders_to_conversation_tasks()" >/dev/null

expect_value 'B6 vínculo cruzado é reparado para a tarefa da origem correta' 'true' \
  "SELECT (t.created_by = r.profile_id AND t.contact_id = r.contact_id AND t.remind_at = r.remind_at)::text FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id WHERE r.id = '$RA'"

antes="$(psql_sql 'SELECT count(*) FROM public.conversation_tasks')"
psql_sql "SELECT public.backfill_reminders_to_conversation_tasks()" >/dev/null
depois="$(psql_sql 'SELECT count(*) FROM public.conversation_tasks')"
expect_same 'B7 idempotente: reexecutar não cria tarefa nova' "$antes" "$depois"

expect_value 'B7b todo vínculo segue correto depois de rodar de novo' '3' \
  "SELECT count(*) FROM public.reminders r JOIN public.conversation_tasks t ON t.id = r.migrated_task_id AND t.migrated_from_reminder_id = r.id"

# FK ON DELETE SET NULL: se o usuário apagou uma tarefa migrada, reexecutar o
# reparo NÃO pode ressuscitar a tarefa nem religar o lembrete apagado.
apagada="$(psql_sql "SELECT migrated_task_id FROM public.reminders WHERE id='$RA'")"
psql_sql "DELETE FROM public.conversation_tasks WHERE id='$apagada'" >/dev/null
apos_delete="$(psql_sql 'SELECT count(*) FROM public.conversation_tasks')"
psql_sql "SELECT public.backfill_reminders_to_conversation_tasks()" >/dev/null
apos_reexec_delete="$(psql_sql 'SELECT count(*) FROM public.conversation_tasks')"
expect_same 'B8 tarefa apagada não é recriada ao reexecutar' "$apos_delete" "$apos_reexec_delete"

expect_value 'B8b lembrete da tarefa apagada continua sem migrated_task_id' 'true' \
  "SELECT (migrated_task_id IS NULL)::text FROM public.reminders WHERE id='$RA'"

# Dois lembretes de identidade idêntica: se o usuário apagar uma das tarefas,
# migrated_task_id fica NULL por FK ON DELETE SET NULL e a reexecução deve
# preservar esse NULL, sem religar o lembrete à tarefa gêmea remanescente.
RD='ddd00000-0000-0000-0000-00000000000d'
RE='eee00000-0000-0000-0000-00000000000e'
psql_sql "
  INSERT INTO public.reminders (id, contact_id, profile_id, title, description, remind_at, notified_at, created_at) VALUES
    ('$RD', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     'Identidade duplicada', 'mesmos campos', '2026-10-20 09:00:00+00', '2026-10-19 09:00:00+00', '2026-10-01 08:00:00+00'),
    ('$RE', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     'Identidade duplicada', 'mesmos campos', '2026-10-20 09:00:00+00', '2026-10-19 09:00:00+00', '2026-10-01 08:00:00+00');
  INSERT INTO public.conversation_tasks
    (id, contact_id, title, description, created_by, assigned_to, remind_at, notified_at, status_changed_at, migrated_from_reminder_id)
  VALUES
    ('ddd10000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000001',
     'Identidade duplicada', 'mesmos campos', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     '2026-10-20 09:00:00+00', '2026-10-19 09:00:00+00', '2026-10-01 08:00:00+00', '$RD'),
    ('eee10000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000001',
     'Identidade duplicada', 'mesmos campos', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     '2026-10-20 09:00:00+00', '2026-10-19 09:00:00+00', '2026-10-01 08:00:00+00', '$RE');
  UPDATE public.reminders SET migrated_task_id = CASE id WHEN '$RD' THEN 'ddd10000-0000-0000-0000-00000000000d'::uuid ELSE 'eee10000-0000-0000-0000-00000000000e'::uuid END
   WHERE id IN ('$RD', '$RE');
" >/dev/null
psql_sql "DELETE FROM public.conversation_tasks WHERE id='ddd10000-0000-0000-0000-00000000000d'" >/dev/null
qtd_apos_delete_duplicada="$(psql_sql "SELECT count(*) FROM public.conversation_tasks")"
psql_sql "SELECT public.backfill_reminders_to_conversation_tasks()" >/dev/null
qtd_apos_reexec_duplicada="$(psql_sql "SELECT count(*) FROM public.conversation_tasks")"
expect_same 'B8c identidade idêntica: reexecutar não muda a contagem de tarefas' "$qtd_apos_delete_duplicada" "$qtd_apos_reexec_duplicada"
expect_value 'B8d identidade idêntica: lembrete da tarefa apagada continua NULL' 'true' \
  "SELECT (migrated_task_id IS NULL)::text FROM public.reminders WHERE id='$RD'"
expect_value 'B8e identidade idêntica: nenhuma tarefa fica ligada a dois lembretes' 'true' \
  "SELECT COALESCE((SELECT max(qtd) <= 1 FROM (SELECT migrated_task_id, count(*) AS qtd FROM public.reminders WHERE migrated_task_id IS NOT NULL GROUP BY migrated_task_id) s), true)::text"

# Origem já gravada prevalece sobre campos editáveis: título/remind_at podem ser
# alterados na tarefa pelo usuário sem a reexecução mover o vínculo para outra
# tarefa que ainda bate com os campos antigos do lembrete.
RF='fff00000-0000-0000-0000-00000000000f'
TF='fff10000-0000-0000-0000-00000000000f'
TG='fff20000-0000-0000-0000-00000000000f'
psql_sql "
  INSERT INTO public.reminders (id, contact_id, profile_id, title, description, remind_at, notified_at, created_at) VALUES
    ('$RF', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
     'Titulo original editavel', 'origem gravada', '2026-10-21 09:00:00+00', NULL, '2026-10-02 08:00:00+00');
  INSERT INTO public.conversation_tasks
    (id, contact_id, title, description, created_by, assigned_to, remind_at, notified_at, status_changed_at, migrated_from_reminder_id)
  VALUES
    ('$TF', 'a0000000-0000-0000-0000-000000000001', 'Titulo editado pelo usuario', 'origem gravada',
     '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10-21 09:00:00+00', NULL, '2026-10-02 08:00:00+00', '$RF'),
    ('$TG', 'a0000000-0000-0000-0000-000000000001', 'Titulo original editavel', 'origem gravada',
     '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10-21 09:00:00+00', NULL, '2026-10-02 08:00:00+00', NULL);
  UPDATE public.reminders SET migrated_task_id = '$TF' WHERE id = '$RF';
" >/dev/null
psql_sql "SELECT public.backfill_reminders_to_conversation_tasks()" >/dev/null
expect_value 'B8f origem gravada: reexecução após editar título mantém o vínculo sem erro' 'true' \
  "SELECT (migrated_task_id = '$TF')::text FROM public.reminders WHERE id='$RF'"
expect_value 'B8g origem gravada: tarefa editada preserva migrated_from_reminder_id' 'true' \
  "SELECT (migrated_from_reminder_id = '$RF')::text FROM public.conversation_tasks WHERE id='$TF'"

expect_value 'B9 anon NÃO pode executar o helper de reparo' 'false' \
  "SELECT has_function_privilege('anon', 'public.backfill_reminders_to_conversation_tasks()', 'EXECUTE')::text"
expect_value 'B10 authenticated NÃO pode executar o helper de reparo' 'false' \
  "SELECT has_function_privilege('authenticated', 'public.backfill_reminders_to_conversation_tasks()', 'EXECUTE')::text"
expect_error 'B11 anon chamando o helper é recusado (permission denied)' 'permission denied' \
  "SET ROLE anon; SELECT public.backfill_reminders_to_conversation_tasks();"

expect_error 'B12 índice único recusa duas tarefas com a MESMA origem' 'duplicate key' \
  "INSERT INTO public.conversation_tasks (title, created_by, status_changed_at, migrated_from_reminder_id) SELECT title, created_by, now(), migrated_from_reminder_id FROM public.conversation_tasks WHERE migrated_from_reminder_id IS NOT NULL LIMIT 1;"

qtd_antes_rollback="$(psql_sql 'SELECT count(*) FROM public.conversation_tasks')"
rollback_sql="$(awk 'NR == 2 { sub(/^-- Rollback: /, ""); print }' "$migration")"
psql_sql "$rollback_sql" >/dev/null
expect_value 'B13 rollback remove o helper de reparo' '0' \
  "SELECT count(*) FROM pg_proc WHERE proname='backfill_reminders_to_conversation_tasks'"
expect_value 'B14 rollback remove a coluna de origem imutável' '0' \
  "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='conversation_tasks' AND column_name='migrated_from_reminder_id'"
psql_file "$migration" >/dev/null
expect_value 'B15 migration reaplica depois do rollback' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='backfill_reminders_to_conversation_tasks'"
expect_value 'B16 reaplicada sem recriar tarefa apagada nem alterar a contagem' "$qtd_antes_rollback" \
  "SELECT count(*) FROM public.conversation_tasks"

printf '\n[OK] associação de lembretes preserva a identidade da origem (item 293 / R2-DB-005)\n'
