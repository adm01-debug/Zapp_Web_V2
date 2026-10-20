#!/usr/bin/env bash
# RLS de scheduled_messages e whisper_messages: agendar só com contato visível e permissão
# de envio; sussurrar só com contato visível.
#
# Cartão t_d3c1981f (auditoria de paridade V3->V2, achado chat-2, CONFIRMADO no banco vivo
# em 11/10/2026): as policies de INSERT/UPDATE de public.scheduled_messages só exigiam
# created_by = o perfil do chamador (ou admin/supervisor) e o UPDATE não tinha WITH CHECK;
# o INSERT de public.whisper_messages só exigia sender_id = perfil do chamador. Nenhum dos
# dois olhava a visibilidade do CONTATO; scheduled_messages também não olhava a permissão
# de envio. O job enviador de agendadas (AG2) roda com privilégio de serviço e entrega em
# contato que o agente não vê.
#
# Roda em PostgreSQL 17 descartável, com o estado VIGENTE das policies (as antigas) e os
# helpers REAIS (is_contact_visible_to_user, user_has_permission, is_admin_or_supervisor),
# aplica a migration de verdade e prova: RED antes (a brecha aceita o indevido) e GREEN
# depois (recusa contato invisível, recusa quem não tem send_messages, supervisor passa,
# anônimo não vê nada, linhas existentes intactas). Nenhuma credencial de produção entra aqui.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011154648_rls_scheduled_whisper_visibility.sql"
postgres_image="${SCHEDULED_WHISPER_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-sched-whisper-rls-$$"
tmp_parent="$repo_root/.tmp"
mkdir -p "$tmp_parent"
tmp_dir="$(mktemp -d "$tmp_parent/zapp-v2-sched-whisper-rls.XXXXXX")"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-sched-whisper-rls-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    "$repo_root"/.tmp/zapp-v2-sched-whisper-rls.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_script() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c 'SET search_path = public, auth' -f - < "$1"
}

extract_rollback_sql() {
  python3 - "$migration" "$tmp_dir/rollback.sql" <<'PY'
from pathlib import Path
import sys

migration = Path(sys.argv[1])
out = Path(sys.argv[2])
lines = migration.read_text(encoding="utf-8").splitlines()
in_block = False
sql = []
for line in lines:
    if line.startswith("-- Rollback (SQL executável"):
        in_block = True
        continue
    if not in_block:
        continue
    if not line.startswith("--   "):
        break
    sql.append(line.removeprefix("--   "))

if not sql:
    raise SystemExit("rollback SQL não encontrado na migration")
out.write_text("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;\n", encoding="utf-8")
PY
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_script "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

# Recusa pela RLS: a operação precisa falhar E o erro tem de ser de row-level security
# (evita falso-verde de "falhou por outro motivo").
expect_refused() {
  local label="$1" role_setup="$2" stmt="$3" out rc
  out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
          -c "$role_setup $stmt" 2>&1)" && rc=0 || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    fail "$label: a operação deveria ter sido recusada pela RLS (retornou: $out)"
  fi
  if ! grep -qi 'row-level security' <<<"$out"; then
    fail "$label: falhou, mas não por RLS: $out"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_script 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
-- Supabase resolve auth.uid() pela search_path da sessão; o harness precisa do mesmo.
SET search_path = public, auth;
ALTER ROLE anon SET search_path = public, auth;
ALTER ROLE authenticated SET search_path = public, auth;
ALTER ROLE service_role SET search_path = public, auth;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid
);

-- Helpers REAIS (mesmos corpos das migrations do repo).
-- As tabelas de papel/permissão vêm antes: o corpo SQL das funções é validado no CREATE.
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent'
);
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id)
);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id=_user_id AND role IN ('admin','supervisor')) $$;

CREATE FUNCTION public.is_contact_visible_to_user(_contact_id uuid, _user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.contacts c
       JOIN public.profiles p ON p.id = c.assigned_to
       WHERE c.id = _contact_id AND p.user_id = _user_id
     ) OR public.is_admin_or_supervisor(_user_id) $$;

CREATE FUNCTION public.user_has_permission(_user_id uuid, _permission_name text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       JOIN public.permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = _user_id AND p.name = _permission_name) $$;

CREATE TABLE public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_by uuid REFERENCES public.profiles(id),
  whatsapp_connection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whisper_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  target_agent_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whisper_messages ENABLE ROW LEVEL SECURITY;

-- Default grants do Supabase: as roles alcançam a tabela; a RLS é a única porteira.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whisper_messages TO anon, authenticated, service_role;
-- As policies leem public.profiles como o próprio usuário (não é SECURITY DEFINER).
GRANT SELECT ON public.profiles TO authenticated, service_role;

-- ===== Estado VIGENTE (policies ANTIGAS, as do dia/2026-10-11) =====
-- scheduled_messages
CREATE POLICY "Users can view their scheduled messages" ON public.scheduled_messages
  FOR SELECT TO authenticated
  USING (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Users can create scheduled messages" ON public.scheduled_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Users can update their scheduled messages" ON public.scheduled_messages
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Users can delete their scheduled messages" ON public.scheduled_messages
  FOR DELETE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
-- whisper_messages
CREATE POLICY "Users can view own whisper messages" ON public.whisper_messages
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR target_agent_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY "Users can delete own whisper messages" ON public.whisper_messages
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- ===== Dados =====
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'), -- agente com send_messages
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'), -- autenticado SEM papel/permissão
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009'); -- supervisor

INSERT INTO public.contacts (id, assigned_to) VALUES
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'), -- C1: visível ao agente 1
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002'); -- C2: invisível ao agente 1

INSERT INTO public.permissions (id, name) VALUES
  ('60000000-0000-0000-0000-000000000001','send_messages');
INSERT INTO public.role_permissions (role, permission_id) VALUES
  ('agent','60000000-0000-0000-0000-000000000001');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001','agent'),
  ('20000000-0000-0000-0000-000000000009','supervisor');
-- user 2 fica SEM papel: user_has_permission=false e is_admin_or_supervisor=false

-- Linhas EXISTENTES (semeadas por privilégio de serviço) que a migration NÃO pode alterar.
INSERT INTO public.scheduled_messages (id, contact_id, content, scheduled_at, status, created_by) VALUES
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','seed-visivel','2026-12-01T10:00:00Z','pending','10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','seed-de-outro','2026-12-01T11:00:00Z','pending','10000000-0000-0000-0000-000000000002');
INSERT INTO public.whisper_messages (id, contact_id, sender_id, target_agent_id, content) VALUES
  ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','seed-sussurro');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

U1='20000000-0000-0000-0000-000000000001'   # agente, send_messages, contato C1
U2='20000000-0000-0000-0000-000000000002'   # autenticado sem papel/permissão
U9='20000000-0000-0000-0000-000000000009'   # supervisor
P1='10000000-0000-0000-0000-000000000001'
P2='10000000-0000-0000-0000-000000000002'
C1='30000000-0000-0000-0000-000000000001'
C2='30000000-0000-0000-0000-000000000002'
as_u1="SET ROLE authenticated; SET request.jwt.claim.sub='$U1';"
as_u2="SET ROLE authenticated; SET request.jwt.claim.sub='$U2';"
as_u9="SET ROLE authenticated; SET request.jwt.claim.sub='$U9';"
as_anon="SET ROLE anon;"

# ── RED: antes da migration a brecha aceita o indevido ──────────────────────────────────
psql_script "$as_u1 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C2','red-agendou-invisivel', now(), '$P1')" >/dev/null
expect_value 'RED: agente agenda para contato INVISÍVEL (a policy antiga aceita)' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='red-agendou-invisivel'"

psql_script "$as_u2 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','red-sem-permissao', now(), '$P2')" >/dev/null
expect_value 'RED: usuário SEM send_messages agenda (a policy antiga aceita)' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='red-sem-permissao'"

psql_script "$as_u1 INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C2','$P1','$P1','red-sussurro-invisivel')" >/dev/null
expect_value 'RED: sussurro em contato INVISÍVEL (a policy antiga aceita)' '1' \
  "SELECT count(*) FROM public.whisper_messages WHERE content='red-sussurro-invisivel'"

# ── Aplica a migration REAL ─────────────────────────────────────────────────────────────
psql_file "$migration" >/dev/null

# ── GREEN: quem PODE continua podendo ───────────────────────────────────────────────────
psql_script "$as_u1 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','ok-agente-visivel', now(), '$P1')" >/dev/null
expect_value 'agente com send_messages e contato visível agenda' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='ok-agente-visivel'"

psql_script "$as_u9 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C2','ok-supervisor', now(), '$P2')" >/dev/null
expect_value 'supervisor agenda em contato de outro e com created_by de outro' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='ok-supervisor'"

psql_script "$as_u1 INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C1','$P1','$P1','ok-sussurro-visivel')" >/dev/null
expect_value 'agente sussurra em contato visível' '1' \
  "SELECT count(*) FROM public.whisper_messages WHERE content='ok-sussurro-visivel'"

psql_script "$as_u9 INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C2','$P2','$P2','ok-sussurro-supervisor')" >/dev/null
expect_value 'supervisor sussurra em contato de outro' '1' \
  "SELECT count(*) FROM public.whisper_messages WHERE content='ok-sussurro-supervisor'"

# ── GREEN: quem NÃO pode é recusado pela RLS ────────────────────────────────────────────
expect_refused 'agente NÃO agenda para contato invisível' "$as_u1" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C2','x', now(), '$P1')"
expect_refused 'usuário SEM send_messages NÃO agenda para contato visível' "$as_u2" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','x', now(), '$P2')"
expect_refused 'agente NÃO agenda com created_by de outro usuário' "$as_u1" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','x', now(), '$P2')"
expect_refused 'UPDATE trocando contact_id para contato INVISÍVEL é recusado' "$as_u1" \
  "UPDATE public.scheduled_messages SET contact_id='$C2' WHERE content='ok-agente-visivel'"
expect_refused 'UPDATE trocando created_by para outro usuário é recusado' "$as_u1" \
  "UPDATE public.scheduled_messages SET created_by='$P2' WHERE content='ok-agente-visivel'"
expect_refused 'agente NÃO sussurra em contato invisível' "$as_u1" \
  "INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C2','$P1','$P1','x')"
expect_refused 'agente NÃO sussurra como outro remetente' "$as_u1" \
  "INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C1','$P2','$P1','x')"

# UPDATE legítimo (mesmo contato visível, só o conteúdo) continua passando.
psql_script "$as_u1 UPDATE public.scheduled_messages SET content='ok-agente-editado' WHERE content='ok-agente-visivel'" >/dev/null
expect_value 'UPDATE legítimo (conteúdo) do próprio agendamento passa' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='ok-agente-editado'"

# ── GREEN: leitura intacta ──────────────────────────────────────────────────────────────
expect_value 'agente vê só os próprios agendamentos (não vê o de outro)' '0' \
  "$as_u1 SELECT count(*) FROM public.scheduled_messages WHERE created_by='$P2'"
expect_value 'supervisor vê os agendamentos de outros usuários' '3' \
  "$as_u9 SELECT count(*) FROM public.scheduled_messages WHERE created_by='$P2'"
expect_value 'agente vê só o próprio sussurro (não vê o de outro remetente)' '0' \
  "$as_u1 SELECT count(*) FROM public.whisper_messages WHERE content='ok-sussurro-supervisor'"

# ── GREEN: anônimo nada ─────────────────────────────────────────────────────────────────
expect_value 'anon não vê nenhum agendamento' '0' "$as_anon SELECT count(*) FROM public.scheduled_messages"
expect_refused 'anon não agenda' "$as_anon" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','x', now(), '$P1')"
expect_refused 'anon não sussurra' "$as_anon" \
  "INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C1','$P1','$P1','x')"

# ── GREEN: nenhuma linha EXISTENTE foi apagada nem alterada pela migration ──────────────
expect_value 'linhas existentes intactas (conteúdo/status/horário/dono)' \
  'seed-de-outro|pending|2026-12-01 11:00:00+00|10000000-0000-0000-0000-000000000002|seed-visivel|pending|2026-12-01 10:00:00+00|10000000-0000-0000-0000-000000000001' \
  "SELECT string_agg(content||'|'||status||'|'||scheduled_at||'|'||created_by, '|' ORDER BY content) FROM public.scheduled_messages WHERE content LIKE 'seed-%'"
expect_value 'sussurro existente intacto' '1' \
  "SELECT count(*) FROM public.whisper_messages WHERE content='seed-sussurro'"
expect_value 'as linhas da brecha (RED) continuam no banco, sem alteração pela migration' '2' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content IN ('red-agendou-invisivel','red-sem-permissao')"

# ── ROLLBACK: o bloco do cabeçalho é executável e restaura as policies antigas ────────
extract_rollback_sql
psql_file "$tmp_dir/rollback.sql" >/dev/null

psql_script "$as_u1 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C2','rollback-agendou-invisivel', now(), '$P1')" >/dev/null
expect_value 'rollback restaura INSERT antigo de agendamento para contato invisível' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='rollback-agendou-invisivel'"
psql_script "$as_u2 INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','rollback-sem-permissao', now(), '$P2')" >/dev/null
expect_value 'rollback restaura INSERT antigo sem send_messages' '1' \
  "SELECT count(*) FROM public.scheduled_messages WHERE content='rollback-sem-permissao'"
psql_script "$as_u1 INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C2','$P1','$P1','rollback-sussurro-invisivel')" >/dev/null
expect_value 'rollback restaura INSERT antigo de sussurro para contato invisível' '1' \
  "SELECT count(*) FROM public.whisper_messages WHERE content='rollback-sussurro-invisivel'"

# Reaplica a migration para provar idempotência do DROP/CREATE POLICY e voltar ao estado protegido.
psql_file "$migration" >/dev/null
expect_refused 'reapós rollback: agente NÃO agenda para contato invisível' "$as_u1" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C2','x', now(), '$P1')"
expect_refused 'reapós rollback: usuário SEM send_messages NÃO agenda para contato visível' "$as_u2" \
  "INSERT INTO public.scheduled_messages (contact_id, content, scheduled_at, created_by) VALUES ('$C1','x', now(), '$P2')"
expect_refused 'reapós rollback: agente NÃO sussurra em contato invisível' "$as_u1" \
  "INSERT INTO public.whisper_messages (contact_id, sender_id, target_agent_id, content) VALUES ('$C2','$P1','$P1','x')"

printf 'OK: agendar exige contato visível e permissão; sussurrar exige contato visível; supervisor passa; anônimo não vê nada; linhas existentes intactas; rollback executável\n'
