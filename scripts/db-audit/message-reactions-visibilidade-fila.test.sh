#!/usr/bin/env bash
# SEC-RLS — "visibilidade != escrita" em public.message_reactions.
#
# Reproduz o gap do e2e-logado (run 1518): um agente autenticado não-admin que é membro
# ATIVO de uma fila VÊ a mensagem (messages_select_policy libera via queue_members), mas as
# policies de escrita de message_reactions (20261011003021) só aceitavam contato atribuído
# ao próprio perfil, admin/supervisor ou contato sem dono -> HTTP 403 42501 ao reagir.
#
# Pre-estado REAL: replay verbatim das migrations anteriores à correção (o vermelho não pode
# ser decorativo). Depois aplica a correção 2x (prova de replay) e exige que o mesmo INSERT
# passe e persista. Também garante NÃO-regressões: reação em mensagem invisível continua
# barrada e a amarra de autoria (user_id próprio) segue valendo.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="${MR_VIS_FILA_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
correcao="$(ls "$migrations_dir"/*_fix_message_reactions_rls.sql 2>/dev/null | head -1 || true)"
postgres_image="${MR_VIS_FILA_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-mr-visibilidade-fila-$RANDOM-$$"

# Identidades sinteticas (nenhum dado real, nenhuma instancia, nenhum envio).
U_AGENTE_A='30000000-0000-0000-0000-0000000000a1'  # auth.users.id do dono do contato
P_AGENTE_A='30000000-0000-0000-0000-0000000000f1'  # profiles.id do dono do contato
U_AGENTE_B='30000000-0000-0000-0000-0000000000a2'  # auth.users.id do agente de fila (nao-admin)
P_AGENTE_B='30000000-0000-0000-0000-0000000000f2'  # profiles.id do agente de fila (nao-admin)
Q_FILA='30000000-0000-0000-0000-0000000000e1'      # fila compartilhada
C_DONO_A='30000000-0000-0000-0000-0000000000c1'    # contato atribuido ao agente A, na fila
C_VISIVEL_FILA='30000000-0000-0000-0000-0000000000c2' # contato atribuido ao agente A, na fila (visível a B)
C_FORA_FILA='30000000-0000-0000-0000-0000000000c3'    # contato de outro agente, FORA da fila de B
M_DONO_A='30000000-0000-0000-0000-0000000000d1'    # mensagem no contato C_VISIVEL_FILA (visível a B por fila)
M_FORA_FILA='30000000-0000-0000-0000-0000000000d2' # mensagem no contato C_FORA_FILA (invisível a B)

cleanup() {
  if [[ "$container_name" =~ ^zapp-mr-visibilidade-fila-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; [[ -n "${last_err:-}" ]] && printf 'ultimo erro do banco: %s\n' "$last_err" >&2; exit 1; }

[[ -n "$correcao" ]] || fail 'migration da correcao (supabase/migrations/*_fix_message_reactions_rls.sql) nao existe'
corte="$(basename "$correcao" | cut -d_ -f1)"
[[ "$corte" =~ ^[0-9]{14}$ ]] || fail "versao ilegivel na migration da correcao: $corte"

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
conta() { psql_test -Atqc "SELECT count(*) FROM public.message_reactions WHERE $1"; }

# ── pre-estado: replay dos statements reais sobre message_reactions anteriores a correcao ──
pre_estado() {
  python3 - "$migrations_dir" "$corte" <<'PY'
import glob, os, re, sys

mig_dir, corte = sys.argv[1], sys.argv[2]


def statements(sql):
    out, buf, i, n = [], '', 0, len(sql)
    while i < n:
        c = sql[i]
        if c == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            buf += sql[i:j + 1]; i = j + 1; continue
        if c == '$':
            tag = re.match(r'\$[A-Za-z_]*\$', sql[i:])
            if tag:
                t = tag.group(0)
                end = sql.find(t, i + len(t))
                end = n - len(t) if end == -1 else end
                buf += sql[i:end + len(t)]; i = end + len(t); continue
        if c == '-' and sql[i:i + 2] == '--':
            j = sql.find('\n', i)
            j = n if j == -1 else j
            buf += sql[i:j]; i = j; continue
        if c == ';':
            out.append(buf); buf = ''; i += 1; continue
        buf += c; i += 1
    if buf.strip():
        out.append(buf)
    return out


for path in sorted(glob.glob(os.path.join(mig_dir, '*.sql'))):
    nome = os.path.basename(path)
    if nome.split('_')[0] >= corte:
        continue
    for st in statements(open(path, encoding='utf-8', errors='ignore').read()):
        low = st.lower()
        if not re.search(r'\bmessage_reactions\b', low):
            continue
        if re.search(r'\balter\s+publication\b', low):
            continue  # realtime nao existe no container descartavel
        alvo = (
            re.search(r'\b(create|drop)\s+policy\b', low)
            or re.search(r'\bcreate\s+table\s+(public\.)?message_reactions\b', low)
            or re.search(r'\balter\s+table\s+(public\.)?message_reactions\b', low)
            or re.search(r'\bcreate\s+(unique\s+)?index\b.*message_reactions', low)
            or re.search(r'\bdo\s+\$', low)
        )
        if alvo:
            print(st.strip() + ';\n')
PY
}

# ── container descartavel ─────────────────────────────────────────────────────────────
for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if docker run -d --name "$container_name" -e POSTGRES_PASSWORD=visibilidade_test_only "$postgres_image" >/dev/null 2>&1; then
    ready=false
    ready_checks=0
    for _ in $(seq 1 90); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        ready_checks=$((ready_checks + 1))
        if (( ready_checks >= 2 )); then ready=true; break; fi
      else
        ready_checks=0
      fi
      sleep 1
    done
    [[ "$ready" == true ]] && break
  fi
  printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2
done
[[ "${ready:-false}" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── schema minimo: papeis, auth.uid(), helpers canonicos, filas e tabelas que as policies tocam ──
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, name text NOT NULL, role text);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role text NOT NULL, UNIQUE (user_id, role));
CREATE TABLE public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1
$$;

-- versao real de 20260909200000_harden_inbox_contact_authorization.sql
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id FROM public.agent_visibility_grants AS visibility
   JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
   WHERE _user_id = auth.uid() AND viewer.user_id = _user_id
     AND EXISTS (SELECT 1 FROM public.user_roles AS role_assignment
                  WHERE role_assignment.user_id = _user_id
                    AND role_assignment.role = 'special_agent')
$$;

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  UNIQUE (queue_id, profile_id)
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid, queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL);
CREATE TABLE public.messages (id uuid PRIMARY KEY, contact_id uuid, external_id text, sender text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.message_reactions_placeholder (id int);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.is_admin_or_supervisor(uuid) TO authenticated, service_role;
GRANT SELECT ON public.profiles, public.user_roles, public.contacts, public.messages,
  public.queues, public.queue_members TO authenticated, service_role;

INSERT INTO public.profiles(id, user_id, name, role) VALUES
  ('30000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000a1', 'Atendente A', 'agent'),
  ('30000000-0000-0000-0000-0000000000f2', '30000000-0000-0000-0000-0000000000a2', 'Atendente B', 'agent');
INSERT INTO public.queues(id, name) VALUES ('30000000-0000-0000-0000-0000000000e1', 'Fila Geral');
-- B (atendente de fila) é membro ATIVO da fila compartilhada
INSERT INTO public.queue_members(queue_id, profile_id, is_active) VALUES
  ('30000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000f2', true);
INSERT INTO public.contacts(id, assigned_to, queue_id) VALUES
  ('30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000e1'),
  ('30000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-0000000000e1'),
  ('30000000-0000-0000-0000-0000000000c3', '30000000-0000-0000-0000-0000000000f1', NULL);
INSERT INTO public.messages(id, contact_id, external_id, sender) VALUES
  ('30000000-0000-0000-0000-0000000000d1', '30000000-0000-0000-0000-0000000000c2', 'EXT-D1', 'contact'),
  ('30000000-0000-0000-0000-0000000000d2', '30000000-0000-0000-0000-0000000000c3', 'EXT-D2', 'contact');
DROP TABLE public.message_reactions_placeholder;
SQL

PRE="$(pre_estado)"
for p in \
  'CREATE TABLE public.message_reactions' \
  'message_reactions_insert_policy' \
  'message_reactions_update_policy' \
  'message_reactions_delete_policy'; do
  # [[ ]] com substring: evita pipe + pipefail (grep -q fecha o pipe e quebra via SIGPIPE)
  [[ "$PRE" == *"$p"* ]] || fail "pre-estado incompleto (replay das migrations perdeu '$p')"
done
printf '%s' "$PRE" | psql_test >/dev/null || fail 'pre-estado nao aplicou no container'
psql_test -q >/dev/null <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated, service_role;
SQL

tenta() { # $1 = auth uid, $2 = SQL: rc 0 = passou pela RLS
  local rc=0 err
  err="$(mktemp)"
  psql_test -v ON_ERROR_STOP=1 -q -At >/dev/null 2>"$err" <<SQL || rc=$?
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
$2
ROLLBACK;
SQL
  last_err="$(tr -d '\r' <"$err" | grep -v '^NOTICE' | tr '\n' ' ')"
  rm -f "$err"
  printf '%s' "$rc"
}

tenta_afeta() { # $1 = auth uid, $2 = statement com CTE (DELETE/UPDATE/INSERT ... RETURNING) que devolve
  # count(*) das linhas afetadas. Imprime o numero; 'rc=N' se o statement deu erro.
  local rc=0 err out
  err="$(mktemp)"; out="$(mktemp)"
  psql_test -v ON_ERROR_STOP=1 -q -At >"$out" 2>"$err" <<SQL || rc=$?
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
$2
ROLLBACK;
SQL
  last_err="$(tr -d '\r' <"$err" | grep -v '^NOTICE' | tr '\n' ' ')"
  if [[ "$rc" == 0 ]]; then
    grep -E '^[0-9]+$' "$out" | tail -1 || true
  else
    printf 'rc=%s' "$rc"
  fi
  rm -f "$err" "$out"
}

# ── red-first: o pre-estado reproduz o gap do e2e (run 1518) ─────────────────────────
# B vê a mensagem M_DONO_A (contato na fila de B via queue_members ativo), mas a policy
# atual de escrita exige assigned_to = perfil de B (não é: é do A), admin (não é) ou
# assigned_to IS NULL (não é) -> INSERT deve FALHAR (rc != 0) = 403 42501 real.
if [[ "$(tenta "$U_AGENTE_B" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A','$P_AGENTE_B',NULL,'👍');")" == 0 ]]; then
  fail 'harness invalido: no pre-estado o INSERT de B (agente de fila, sem ser dono/admin) deveria ser barrado (403)'
fi
printf '[OK] red-first: o pre-estado reproduz o 403 42501 do e2e - agente de fila que vê a mensagem não consegue reagir.\n'

# ── aplica a correcao (duas vezes: prova idempotencia/replay) ─────────────────────────
psql_test < "$correcao" >/dev/null || fail 'a correcao nao aplicou'
psql_test < "$correcao" >/dev/null || fail 'a correcao nao e replayavel (segunda aplicacao falhou)'

# ── verde: o mesmo caminho do app agora passa e persiste ─────────────────────────────
# G1 - INSERT do agente de fila em mensagem visível (mesma condição do SELECT) passa
[[ "$(tenta "$U_AGENTE_B" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A','$P_AGENTE_B',NULL,'👍');")" == 0 ]] \
  || fail 'G1: agente de fila ainda nao consegue reagir a mensagem visivel (gap do e2e persiste)'
# G1b - mesma escrita efetivada (persiste de verdade)
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE_B';
INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A','$P_AGENTE_B',NULL,'👍');
COMMIT;
SQL
[[ "$(conta "message_id = '$M_DONO_A' AND user_id = '$P_AGENTE_B' AND emoji = '👍'")" == 1 ]] \
  || fail 'G1b: a reacao do agente de fila nao persistiu'
# G2 - o dono do contato continua reagindo normalmente
[[ "$(tenta_afeta "$U_AGENTE_A" "WITH i AS (INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A','$P_AGENTE_A',NULL,'❤️') RETURNING 1) SELECT count(*) FROM i;")" == 1 ]] \
  || fail 'G2: o dono do contato nao consegue mais reagir (regressao)'
# G3 - UPDATE da PRÓPRIA reação em mensagem visível passa (upsert do cliente usa ON CONFLICT)
[[ "$(tenta_afeta "$U_AGENTE_B" "WITH u AS (UPDATE public.message_reactions SET emoji = '😄' WHERE message_id = '$M_DONO_A' AND user_id = '$P_AGENTE_B' RETURNING 1) SELECT count(*) FROM u;")" == 1 ]] \
  || fail 'G3: agente de fila nao consegue editar a propria reacao em mensagem visivel'
# G4 - DELETE da PRÓPRIA reação em mensagem visível passa
[[ "$(tenta_afeta "$U_AGENTE_B" "WITH d AS (DELETE FROM public.message_reactions WHERE message_id = '$M_DONO_A' AND user_id = '$P_AGENTE_B' RETURNING 1) SELECT count(*) FROM d;")" == 1 ]] \
  || fail 'G4: agente de fila nao consegue apagar a propria reacao em mensagem visivel'

# ── não-regressões ────────────────────────────────────────────────────────────────────
# G5 - mensagem INvisível (contato fora da fila de B, sem grant) continua barrada
[[ "$(tenta "$U_AGENTE_B" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_FORA_FILA','$P_AGENTE_B',NULL,'🔥');")" != 0 ]] \
  || fail 'G5: reagiu a mensagem de contato invisivel (regressao de visibilidade)'
# G6 - amarra de autoria: B não pode gravar reação com user_id alheio
[[ "$(tenta "$U_AGENTE_B" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A','$P_AGENTE_A',NULL,'💀');")" != 0 ]] \
  || fail 'G6: gravou reacao com user_id de outro profile (amarra de autoria quebrada)'
# G7 - ingestao do provedor (service_role/BYPASSRLS) segue intacta
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_DONO_A',NULL,'$C_VISIVEL_FILA','🍀');
COMMIT;
SQL
[[ "$(conta "message_id = '$M_DONO_A' AND emoji = '🍀' AND user_id IS NULL")" == 1 ]] \
  || fail 'G7: a origem confiavel do provedor perdeu a ingestao da reacao do cliente'
# G8 - caminho de LEITURA intacto: SELECT continua visível ao agente de fila
leitura="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE_B';
SELECT count(*) FROM public.message_reactions WHERE message_id = '$M_DONO_A' AND user_id = '$P_AGENTE_B';
COMMIT;
SQL
)"
[[ "${leitura:-0}" == 1 ]] || fail 'G8: o agente de fila perdeu a leitura da propria reacao'

printf '[OK] verde: agente de fila que vê a mensagem agora reage/edit/apaga a própria reação; invisibilidade e autoria seguem protegidas.\n'
printf 'PROVA_OK=1\n'