#!/usr/bin/env bash
# R2-MOD-052 / item 420 (P2) — "Reagendar alarme pelo Salvar nao rearma uma tarefa que ja foi
# notificada".
#
# CAMINHO: o cartao autoriza `tests/db-audit/...`, mas essa pasta NAO existe neste repo (tests/ so
# tem contracts/) e o canonico desta area e `scripts/db-audit/*.test.sh`: o E48 de
# scripts/ci/check-test-inventory.mjs e o db-guard.yml varrem SO `scripts/db-audit`, e as outras
# 192 provas de banco moram la. O arquivo fica no canonico (igual a rodada anterior do #420);
# o desvio do caminho escrito no cartao fica registrado no relato deste refazer.
#
# Roda o MESMO roteiro no mesmo Postgres descartavel, em dois blocos:
#
#   BLOCO A — estado ATUAL (o defeito), fiel ao canonico: com o gatilho de estado
#     trg_task_state_change (WHEN NEW.status IS DISTINCT FROM OLD.status), um UPDATE que lista
#     SO remind_at — a forma exata do Salvar da ficha da tarefa — nao passa por nenhum gatilho,
#     entao notified_at continua preenchido, o notify_due_tasks() nunca mais ve a linha e o
#     alarme novo nao dispara.
#
#   BLOCO B — migration aplicada (arquivo real em supabase/migrations/): mudar remind_at rearma
#     a tarefa (notified_at volta a NULL), e os caminhos vizinhos seguem intactos: Adiar
#     (notified_at explicito no patch), desfazer cancelamento/conclusao do R2-MOD-053 (que
#     reescreve remind_at E notified_at do snapshot), UPDATE que nao lista remind_at (titulo,
#     position/upsert de reordenacao) e o gatilho de estado — tudo com o gatilho de forja
#     (trg_prevent_conversation_task_field_forgery) ATIVO no replay e provado vivo em B.31/B.32.
#
# Aplicar o arquivo do bloco B na mao nao vale: ele e lido do repo e aplicado por psql.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# O nome carrega a versao da migration: acha pelo sufixo para o teste nao quebrar quando ela muda.
migration="$(ls "$repo_root"/supabase/migrations/*_tasks_rearm_on_remind_change.sql 2>/dev/null | head -1)"
postgres_image="${TASKS_REARM_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-tasks-rearm-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-tasks-rearm-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" actual
  actual="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok_as() {
  local label="$1" jwt="$2" sql="$3"
  as_user "$jwt" "$sql" >/dev/null || fail "$label: deveria ter sucesso (como authenticated)"
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------------------------------------
# Estado canonico ANTERIOR (espelha supabase/migrations/20260409014536, 20260924110946,
# 20260928140000, 20260930141000 e 20261003272707): tabela, auxiliares, RLS do dono, gatilhos de
# estado/assignee E o de prevencao de forja (trg_prevent_conversation_task_field_forgery, que
# dispara antes do rearme em UPDATE de authenticated), notify_due_tasks endurecido e o indice
# parcial do alarme pendente.
# ---------------------------------------------------------------------------------------------
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.conversation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'backlog',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  remind_at timestamptz,
  notified_at timestamptz,
  waiting_reason text,
  position integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_tasks_status_check
    CHECK (status IN ('backlog','todo','doing','waiting','done','cancelled')),
  CONSTRAINT conversation_tasks_waiting_reason_check
    CHECK (status <> 'waiting' OR waiting_reason IS NOT NULL)
);

CREATE TABLE public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  title text,
  message text,
  type text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_owner_remind_pending
  ON public.conversation_tasks (created_by, remind_at)
  WHERE remind_at IS NOT NULL AND notified_at IS NULL AND status NOT IN ('done','cancelled');

CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role IN ('admin','supervisor')) $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

CREATE FUNCTION public.is_privileged_contact_caller() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT coalesce(auth.role(), session_user) = ANY (ARRAY['service_role','postgres','supabase_admin']) $$;

-- DUPLO DE TESTE DO REPLAY: a canonica is_contact_visible_to_user (20260909200000) consulta
-- contacts, queue_members, get_visible_agent_ids e get_profile_id_for_user — tabelas que este
-- replay NAO tem. A assinatura e a mesma; devolver `false` ja basta para o gatilho de forja
-- abaixo exercitar o ramo do contact_id de verdade (a excecao so sai se a funcao negar a
-- visibilidade — provado em B.31).
CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT false $$;

-- Corpo CANONICO do gatilho de forja (20260924110946, forma canonicalizada em
-- 20261003272707:1126-1132). Replica fiel: e o gatilho que dispara antes do rearme em UPDATE
-- de authenticated e precisa existir neste replay para que B.3-B.5 e B.15-B.17 valham com ele
-- ativo; os dois ramos sao provados vivos em B.31/B.32.
CREATE OR REPLACE FUNCTION public.prevent_conversation_task_field_forgery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
BEGIN
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id
     AND NEW.contact_id IS NOT NULL
     AND NOT public.is_contact_visible_to_user(NEW.contact_id, auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para atribuir este contato a task';
  END IF;
  IF (
    NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  )
  AND NOT public.is_admin_or_supervisor(auth.uid())
  THEN
    RAISE EXCEPTION 'Sem permissao para alterar responsavel ou criador da task';
  END IF;
  RETURN NEW;
END;
$f$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- Corpo CANONICO do gatilho de estado (20260928140000 / 20261003272707), sem nenhum ramo de alarme.
CREATE FUNCTION public.conversation_task_state_trigger() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    IF NEW.status = 'doing' AND OLD.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;
    IF NEW.status IN ('done', 'cancelled') THEN
      NEW.completed_at := COALESCE(OLD.completed_at, now());
      NEW.remind_at    := NULL;
      NEW.notified_at  := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.conversation_task_set_assignee() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
  AS $function$ BEGIN NEW.assigned_to := NEW.created_by; RETURN NEW; END; $function$;

-- Corpo CANONICO endurecido do notify_due_tasks (20260930141000).
CREATE FUNCTION public.notify_due_tasks() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE v_count integer := 0; v_task record;
BEGIN
  IF NOT public.is_privileged_contact_caller() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  FOR v_task IN
    SELECT t.id, t.title, t.created_by, t.contact_id, t.remind_at, p.user_id
    FROM public.conversation_tasks t
    JOIN public.profiles p ON p.id = t.created_by
    WHERE t.remind_at <= now() AND t.notified_at IS NULL AND t.status NOT IN ('done','cancelled')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (v_task.user_id, 'Lembrete: ' || v_task.title, 'x', 'reminder_due',
            jsonb_build_object('task_id', v_task.id));
    UPDATE public.conversation_tasks SET notified_at = now() WHERE id = v_task.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

ALTER TABLE public.conversation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_own ON public.conversation_tasks FOR SELECT TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY tasks_insert_own ON public.conversation_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_profile_id());
CREATE POLICY tasks_update_own ON public.conversation_tasks FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY tasks_delete_own ON public.conversation_tasks FOR DELETE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_tasks TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_due_tasks() TO service_role;

-- Gatilhos canonicos da tabela (a ordem de disparo e alfabetica pelo nome, nao esta).
CREATE TRIGGER trg_prevent_conversation_task_field_forgery
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (
    NEW.contact_id IS DISTINCT FROM OLD.contact_id
    OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  )
  EXECUTE FUNCTION public.prevent_conversation_task_field_forgery();
CREATE TRIGGER update_conversation_tasks_updated_at
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_task_state_change
  BEFORE UPDATE ON public.conversation_tasks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.conversation_task_state_trigger();
CREATE TRIGGER trg_task_set_assignee
  BEFORE INSERT ON public.conversation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.conversation_task_set_assignee();
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.notifications;
DELETE FROM public.conversation_tasks;
DELETE FROM public.profiles;
INSERT INTO public.profiles (id, user_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ALICE='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
SERVICE='{"role":"service_role"}'
P_ALICE='a0000000-0000-0000-0000-000000000001'
T1='c0000000-0000-0000-0000-000000000001'
T2='c0000000-0000-0000-0000-000000000002'
T3='c0000000-0000-0000-0000-000000000003'
T4='c0000000-0000-0000-0000-000000000004'

printf '\n============ BLOCO A — estado ATUAL (o defeito) ============\n'

# Tarefa de ALICE com o alarme vencido e ainda nao notificado.
psql_sql "INSERT INTO public.conversation_tasks (id, title, created_by, status, remind_at)
          VALUES ('$T1','Ligar para o cliente','$P_ALICE','todo', now() - interval '1 hour');" >/dev/null

expect_value 'A.1 controle: o cron notifica a tarefa vencida (1 aviso)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'A.2 ...e o carimbo do disparo ficou gravado (notified_at preenchido)' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T1';"
expect_value 'A.3 controle: e criou 1 notificacao para ALICE' '1' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

# O Salvar da ficha da tarefa: patch com remind_at novo e NADA de notified_at.
expect_ok_as 'A.4 ALICE reagenda o alarme pelo Salvar (patch so com remind_at)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() + interval '1 hour' WHERE id='$T1';"
expect_value 'A.5 (DEFEITO) o alarme novo foi gravado' '1' \
  "SELECT (remind_at > now())::int FROM public.conversation_tasks WHERE id='$T1';"
expect_value 'A.6 (DEFEITO) mas notified_at CONTINUA preenchido: a tarefa nao rearmou' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T1';"
expect_value 'A.7 (DEFEITO) a linha esta fora do conjunto do cron (mesmo filtro do indice parcial)' '0' \
  "SELECT count(*) FROM public.conversation_tasks
    WHERE created_by='$P_ALICE' AND remind_at IS NOT NULL AND notified_at IS NULL
      AND status NOT IN ('done','cancelled');"

# Consequencia no cron, sem depender do relogio: mesma forma de UPDATE (so remind_at) com a hora
# ja vencida, para o aviso novo estar vencido quando o cron passar.
expect_ok_as 'A.8 (DEFEITO) reagenda de novo (so remind_at) com a hora ja vencida' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() - interval '1 minute' WHERE id='$T1';"
expect_value 'A.9 (DEFEITO) o cron passa e NAO rearma: nenhum aviso novo' '0' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'A.10 (DEFEITO) segue 1 notificacao: ALICE nao foi avisada do alarme novo' '1' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

# Controle: o cron funciona quando notified_at esta limpo — a A.9 nao e um cron quebrado.
psql_sql "UPDATE public.conversation_tasks SET notified_at = NULL WHERE id='$T1';" >/dev/null
expect_value 'A.11 controle: com notified_at limpo o cron rearma (1 aviso)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'A.12 controle: e a 2a notificacao chegou para ALICE' '2' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

printf '\n============ Aplicando a migration (arquivo real do repo) ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

printf '\n============ BLOCO B — depois da migration ============\n'

psql_sql "INSERT INTO public.conversation_tasks (id, title, created_by, status, remind_at)
          VALUES ('$T2','Enviar proposta','$P_ALICE','todo', now() - interval '1 hour');" >/dev/null
expect_value 'B.1 o cron notifica a tarefa vencida (1 aviso)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'B.2 carimbo do disparo gravado' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T2';"

expect_ok_as 'B.3 ALICE reagenda o alarme pelo Salvar (patch so com remind_at)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() + interval '1 hour' WHERE id='$T2';"
expect_value 'B.4 CORRIGIDO: notified_at voltou a NULL — o alarme novo rearmou' '1' \
  "SELECT (notified_at IS NULL)::int FROM public.conversation_tasks WHERE id='$T2';"
expect_value 'B.5 ...e a linha volta a ser candidata do cron (filtro do indice parcial)' '1' \
  "SELECT count(*) FROM public.conversation_tasks
    WHERE created_by='$P_ALICE' AND remind_at IS NOT NULL AND notified_at IS NULL
      AND status NOT IN ('done','cancelled');"

expect_ok_as 'B.6 reagenda com a hora ja vencida (mesma forma, para o cron vencer agora)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() - interval '1 minute' WHERE id='$T2';"
expect_value 'B.7 CORRIGIDO: o cron rearma de verdade (1 aviso novo)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'B.8 ...e ALICE recebeu a 2a notificacao da MESMA tarefa' '2' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

# ---- Caminho vizinho 1: Adiar/soneca (useWorkItemNotifications) manda notified_at explicito NULL.
expect_ok_as 'B.9 Adiar/soneca: patch com remind_at novo + notified_at NULL explicito' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() - interval '1 minute', notified_at = NULL WHERE id='$T2';"
expect_value 'B.10 Adiar segue rearmando (3o aviso)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'B.11 Adiar: ALICE foi avisada de novo' '3' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

# ---- Caminho vizinho 2: desfazer cancelamento/conclusao (R2-MOD-053) reescreve o snapshot inteiro.
psql_sql "INSERT INTO public.conversation_tasks (id, title, created_by, status, remind_at, notified_at)
          VALUES ('$T3','Conferir nota fiscal','$P_ALICE','todo', now() - interval '2 hours', now() - interval '2 hours');" >/dev/null
expect_value 'B.12 preparo: a tarefa esta notificada (carimbo presente)' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T3';"

CARIMBO="$(psql_sql "SELECT notified_at FROM public.conversation_tasks WHERE id='$T3';" | tail -n1)"
ALARME="$(psql_sql "SELECT remind_at FROM public.conversation_tasks WHERE id='$T3';" | tail -n1)"

expect_ok_as 'B.13 ALICE conclui a tarefa (patch do move: so status+completed_at — UPDATE NAO lista remind_at nem notified_at)' "$ALICE" \
  "UPDATE public.conversation_tasks
      SET status='done', completed_at=now() WHERE id='$T3';"
expect_value 'B.14 o gatilho de estado zerou o alarme ao concluir (as duas colunas NULL por efeito DELE, nao do patch)' '2' \
  "SELECT (remind_at IS NULL)::int + (notified_at IS NULL)::int FROM public.conversation_tasks WHERE id='$T3';"

expect_ok_as 'B.15 desfazer (R2-MOD-053) reescreve status+completed_at+remind_at+notified_at do snapshot' "$ALICE" \
  "UPDATE public.conversation_tasks
      SET status='todo', completed_at=NULL, remind_at='$ALARME', notified_at='$CARIMBO' WHERE id='$T3';"
expect_value 'B.16 EF. COLATERAL: o carimbo RESTAURADO do desfazer foi respeitado (nao rearmou)' '1' \
  "SELECT (notified_at = '$CARIMBO'::timestamptz)::int FROM public.conversation_tasks WHERE id='$T3';"
expect_value 'B.17 ...e o alarme restaurado tambem esta la' '1' \
  "SELECT (remind_at = '$ALARME'::timestamptz)::int FROM public.conversation_tasks WHERE id='$T3';"

# ---- Caminho vizinho 3: UPDATE que NAO lista remind_at nao pode rearmar.
psql_sql "INSERT INTO public.conversation_tasks (id, title, created_by, status, remind_at, notified_at)
          VALUES ('$T4','Renomear contrato','$P_ALICE','todo', now() - interval '3 hours', now() - interval '3 hours');" >/dev/null
expect_value 'B.18 preparo: T4 esta notificada' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T4';"
expect_ok_as 'B.19 ALICE so troca o titulo (patch sem remind_at)' "$ALICE" \
  "UPDATE public.conversation_tasks SET title='Renomear contrato v2' WHERE id='$T4';"
expect_value 'B.20 sem mudanca de alarme, o carimbo segue intacto (sem rearme espurio)' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T4';"
expect_ok_as 'B.21 ALICE grava remind_at com o MESMO valor (nada mudou)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = remind_at WHERE id='$T4';"
expect_value 'B.22 mesmo valor de remind_at nao rearma' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T4';"
expect_ok_as 'B.23 reordenacao (persistPositions): upsert ON CONFLICT so com position/title/created_by' "$ALICE" \
  "INSERT INTO public.conversation_tasks (id, position, title, created_by)
   VALUES ('$T4', 7, 'Renomear contrato v2', '$P_ALICE')
   ON CONFLICT (id) DO UPDATE SET position = 7, title = 'Renomear contrato v2', created_by = '$P_ALICE';"
expect_value 'B.24 o upsert de reordenacao tambem nao rearma' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T4';"

# ---- Borda: limpar o alarme limpa o carimbo (estado consistente) e a linha sai do cron.
expect_ok_as 'B.25 ALICE apaga o alarme (remind_at = NULL)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = NULL WHERE id='$T4';"
expect_value 'B.26 sem alarme nao sobra carimbo de disparo' '1' \
  "SELECT (notified_at IS NULL)::int FROM public.conversation_tasks WHERE id='$T4';"
expect_value 'B.27 ...e a linha nao e candidata do cron' '0' \
  "SELECT count(*) FROM public.conversation_tasks WHERE id='$T4' AND remind_at IS NOT NULL AND notified_at IS NULL;"

# ---- Contrato/ACL: funcao de gatilho, fora do anon/authenticated/service_role, nao vira RPC.
expect_value 'B.28 a funcao nova nao tem EXECUTE para anon' 'false' \
  "SELECT has_function_privilege('anon', 'public.conversation_task_rearm_on_remind_change()', 'EXECUTE')::text;"
expect_value 'B.28b nem para authenticated (funcao de gatilho nao e RPC)' 'false' \
  "SELECT has_function_privilege('authenticated', 'public.conversation_task_rearm_on_remind_change()', 'EXECUTE')::text;"
expect_value 'B.28c nem para service_role' 'false' \
  "SELECT has_function_privilege('service_role', 'public.conversation_task_rearm_on_remind_change()', 'EXECUTE')::text;"
expect_error 'B.29 nao e chamavel fora de gatilho (nao vira RPC)' \
  'trigger functions can only be called as triggers' \
  "SELECT public.conversation_task_rearm_on_remind_change();"
expect_value 'B.30 o gatilho de rearme so olha a coluna remind_at e e BEFORE FOR EACH ROW' '1' \
  "SELECT count(*) FROM pg_trigger t
      JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr)
     WHERE t.tgrelid = 'public.conversation_tasks'::regclass
       AND t.tgname = 'trg_task_rearm_on_remind_change'
       AND NOT t.tgisinternal
       AND (t.tgtype & 2) = 2 AND (t.tgtype & 1) = 1 AND (t.tgtype & 16) = 16
       AND a.attname = 'remind_at';"

# ---- trg_prevent_conversation_task_field_forgery ESTA ATIVO neste replay (criado no pre.sql):
# todos os UPDATEs de authenticated acima ja passaram com ele ligado (o WHEN dele e falso para
# quem nao toca contact_id/assigned_to/created_by). Aqui se prova que os DOIS ramos do corpo
# canonico disparam de verdade — a excecao so sai se o gatilho existir e a funcao rodar.
expect_error 'B.31 forja ATIVA: ALICE (agent) nao troca contact_id — ramo is_contact_visible_to_user disparou' \
  'Sem permissao para atribuir este contato a task' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false);
   UPDATE public.conversation_tasks SET contact_id='d0000000-0000-0000-0000-000000000001' WHERE id='$T2';"
expect_error 'B.32 forja ATIVA: ALICE (agent) nao troca created_by — ramo is_admin_or_supervisor disparou' \
  'Sem permissao para alterar responsavel ou criador da task' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false);
   UPDATE public.conversation_tasks SET created_by='a0000000-0000-0000-0000-000000000002' WHERE id='$T2';"

# ---- BLOCO C: o bloco de rollback do proprio arquivo e executado e o estado volta.
printf '\n============ BLOCO C — rollback (bloco extraido da migration) ============\n'
awk '
  /^-- Rollback:/ { sub(/^--[[:space:]]*Rollback:[[:space:]]*/, ""); print; f=1; next }
  f && /^--[[:space:]]*$/ { exit }
  f { sub(/^--[[:space:]]*/, ""); print }
' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'nao extrai o bloco de rollback do arquivo da migration'
grep -q '^DROP TRIGGER IF EXISTS trg_task_rearm_on_remind_change' "$tmp_dir/rollback.sql" \
  || { cat "$tmp_dir/rollback.sql" >&2; fail 'o rollback extraido nao derruba o gatilho'; }
grep -q '^DROP FUNCTION IF EXISTS public.conversation_task_rearm_on_remind_change' "$tmp_dir/rollback.sql" \
  || { cat "$tmp_dir/rollback.sql" >&2; fail 'o rollback extraido nao derruba a funcao'; }
printf '[INFO] rollback extraido:\n'
sed 's/^/       /' "$tmp_dir/rollback.sql"

expect_value 'C.1 estado de partida: T2 notificada e com alarme vencido' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T2';"
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'C.2 o gatilho sumiu' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.conversation_tasks'::regclass AND tgname='trg_task_rearm_on_remind_change';"
expect_value 'C.3 a funcao sumiu' '0' \
  "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('public.conversation_task_rearm_on_remind_change()');"
expect_ok_as 'C.4 o Salvar volta a gravar o alarme novo (sem gatilho, caminho do banco)' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() - interval '1 minute' WHERE id='$T2';"
expect_value 'C.5 e o defeito VOLTA: notified_at segue preenchido' '1' \
  "SELECT (notified_at IS NOT NULL)::int FROM public.conversation_tasks WHERE id='$T2';"
expect_value 'C.6 ...e o cron nao rearma (nenhum aviso novo)' '0' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"

printf '\n============ Reaplicando a migration (idempotencia) ============\n'
psql_file "$migration" >/dev/null
expect_value 'C.7 a migration reaplicada recria o gatilho' '1' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.conversation_tasks'::regclass AND tgname='trg_task_rearm_on_remind_change' AND NOT tgisinternal;"
expect_ok_as 'C.8 o Salvar com hora nova rearma de novo' "$ALICE" \
  "UPDATE public.conversation_tasks SET remind_at = now() - interval '1 minute' WHERE id='$T2';"
expect_value 'C.9 CORRIGIDO de novo: notified_at zerado' '1' \
  "SELECT (notified_at IS NULL)::int FROM public.conversation_tasks WHERE id='$T2';"
expect_value 'C.10 ...e o cron volta a avisar ALICE (4o aviso)' '1' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','$SERVICE',false); SELECT public.notify_due_tasks();"
expect_value 'C.11 4 notificacoes no total' '4' \
  "SELECT count(*) FROM public.notifications WHERE user_id='11111111-1111-1111-1111-111111111111';"

printf '\nPASS: R2-MOD-052/item 420 — reagendar pelo Salvar rearma a tarefa ja notificada (notified_at volta a NULL e o cron reavisa), sem quebrar o Adiar, o desfazer do R2-MOD-053, o gatilho de estado nem os UPDATE que nao mexem no alarme.\n'
