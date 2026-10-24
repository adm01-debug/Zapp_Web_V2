#!/usr/bin/env bash
# R2-DB-019 / item 302 do BACKLOG_VERIFICADO (P2) — "Reacoes do WhatsApp nao vinculam a
# autoria ao usuario que grava".
#
# Prova, em PostgreSQL 17 descartavel com os papeis da plataforma (authenticated /
# service_role), que public.message_reactions passou a impor a autoria nas escritas.
#
# Por que container descartavel: os testes de supabase/tests/*.sql rodam como service_role
# (BYPASSRLS) e nunca provam enforcement de RLS (a propria nota de rls_dashboard.sql diz
# isso). Aqui `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub` sao papeis REAIS sem
# BYPASSRLS, exatamente como no PostgREST.
#
# O pre-estado NAO e escrito a mao: e o replay verbatim, em ordem de versao, de todo
# statement sobre message_reactions das migrations ANTERIORES a correcao (CREATE TABLE,
# ENABLE ROW LEVEL SECURITY, CREATE/DROP POLICY). Se a cadeia de migrations mudar, o
# pre-estado muda com ela — o vermelho nao pode virar decorativo.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="${MR_AUTORIA_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
correcao="$(ls "$migrations_dir"/*_message_reactions_autoria.sql 2>/dev/null | head -1 || true)"
postgres_image="${MR_AUTORIA_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-message-reactions-autoria-$RANDOM-$$"

# Identidades sinteticas (nenhum dado real, nenhuma instancia, nenhum envio).
U_AGENTE='20000000-0000-0000-0000-0000000000a1'   # auth.users.id do atendente A
P_AGENTE='20000000-0000-0000-0000-0000000000f1'   # profiles.id do atendente A
U_COLEGA='20000000-0000-0000-0000-0000000000a2'   # auth.users.id do atendente B
P_COLEGA='20000000-0000-0000-0000-0000000000f2'   # profiles.id do atendente B
C_AGENTE='20000000-0000-0000-0000-0000000000c1'   # contato atribuido ao atendente A
C_COLEGA='20000000-0000-0000-0000-0000000000c2'   # contato atribuido ao atendente B
M_AGENTE='20000000-0000-0000-0000-0000000000d1'   # mensagem do contato C_AGENTE
M_COLEGA='20000000-0000-0000-0000-0000000000d2'   # mensagem do contato C_COLEGA (carteira do atendente B)

cleanup() {
  if [[ "$container_name" =~ ^zapp-message-reactions-autoria-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; [[ -n "${last_err:-}" ]] && printf 'ultimo erro do banco: %s\n' "$last_err" >&2; exit 1; }

[[ -n "$correcao" ]] || fail 'migration da correcao (supabase/migrations/*_message_reactions_autoria.sql) nao existe'
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
    """Quebra em statements respeitando string simples e dollar-quote (DO $$ ... $$)."""
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
        # \b evita casar team_message_reactions (tabela distinta, do Team Chat)
        if not re.search(r'\bmessage_reactions\b', low):
            continue
        # a publicacao de realtime nao existe no container descartavel
        if re.search(r'\balter\s+publication\b', low):
            continue
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
  if docker run -d --name "$container_name" -e POSTGRES_PASSWORD=autoria_test_only "$postgres_image" >/dev/null 2>&1; then
    ready=false
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
      sleep 1
    done
    [[ "$ready" == true ]] && break
  fi
  printf 'WARN: container falhou (%s/3)\n' "$attempt" >&2
done
[[ "${ready:-false}" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ── schema minimo: papeis, auth.uid(), helpers canonicos e as tabelas que as policies tocam ──
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;   -- caminho confiavel do provedor (webhook)

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, name text NOT NULL, role text);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role text NOT NULL, UNIQUE (user_id, role));
CREATE TABLE public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id LIMIT 1
$$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT profile.id FROM public.profiles AS profile
   WHERE _user_id = auth.uid() AND profile.user_id = _user_id
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.messages (id uuid PRIMARY KEY, contact_id uuid, external_id text, sender text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.message_reactions_placeholder (id int);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.is_admin_or_supervisor(uuid) TO authenticated, service_role;
GRANT SELECT ON public.profiles, public.user_roles, public.contacts, public.messages TO authenticated, service_role;

INSERT INTO public.profiles(id, user_id, name, role) VALUES
  ('20000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000a1', 'Atendente A', 'agent'),
  ('20000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000a2', 'Atendente B', 'agent');
INSERT INTO public.contacts(id, assigned_to) VALUES
  ('20000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000f1'),
  ('20000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-0000000000f2');
INSERT INTO public.messages(id, contact_id, external_id, sender) VALUES
  ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000c1', 'EXT-D1', 'contact'),
  ('20000000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-0000000000c2', 'EXT-D2', 'contact');
DROP TABLE public.message_reactions_placeholder;
SQL

PRE="$(pre_estado)"
for p in \
  'CREATE TABLE public.message_reactions' \
  'message_reactions_insert_policy' \
  'Users can insert reactions for assigned contacts' \
  'message_reactions_update_policy' \
  'message_reactions_delete_policy' \
  'Users can delete their own reactions'; do
  printf '%s' "$PRE" | grep -q "$p" || fail "pre-estado incompleto (replay das migrations perdeu '$p')"
done
printf '%s' "$PRE" | psql_test >/dev/null || fail 'pre-estado nao aplicou no container'
psql_test -q >/dev/null <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated, service_role;
SQL

# Reacao do colega e reacao do CLIENTE (gravacao do provedor) ja existentes na mensagem de A.
psql_test -q >/dev/null <<SQL
INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES
  ('$M_AGENTE', '$P_COLEGA', NULL, '😀'),
  ('$M_AGENTE', NULL, '$C_AGENTE', '❤️');
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

tenta_afeta() { # $1 = auth uid, $2 = statement com CTE (DELETE/UPDATE ... RETURNING) que devolve
  # count(*) das linhas afetadas. Imprime o numero; 'rc=N' se o statement deu erro.
  # Necessario porque DELETE/UPDATE barrados pela RLS saem com rc 0 sem tocar linha:
  # so o RETURNING conta quantas linhas a escrita realmente atingiu.
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

# ── red-first: o pre-estado reproduz o defeito ────────────────────────────────────────
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_COLEGA',NULL,'🐍');")" == 0 ]] \
  || fail 'harness invalido: antes da correcao o INSERT com user_id de um colega deveria passar'
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE',NULL,'$C_AGENTE','😡');")" == 0 ]] \
  || fail 'harness invalido: antes da correcao o INSERT com user_id NULL (reacao de Cliente) deveria passar'
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_AGENTE','$C_COLEGA','🔥');")" == 0 ]] \
  || fail 'harness invalido: antes da correcao o INSERT gravando em contato alheio deveria passar'
# DELETE/UPDATE sob RLS saem com rc 0 mesmo sem afetar linha: o vermelho so vale se provar
# que a escrita do pre-estado realmente atingiu a reacao alheia (RETURNING conta 1).
[[ "$(tenta "$U_AGENTE" "DELETE FROM public.message_reactions WHERE message_id = '$M_AGENTE' AND emoji = '😀';")" == 0 ]] \
  || fail 'harness invalido: antes da correcao o DELETE da reacao de outro autor deveria passar'
[[ "$(tenta_afeta "$U_AGENTE" "WITH d AS (DELETE FROM public.message_reactions WHERE message_id = '$M_AGENTE' AND emoji = '😀' RETURNING 1) SELECT count(*) FROM d;")" == 1 ]] \
  || fail 'harness invalido: antes da correcao o DELETE da reacao do colega deveria afetar 1 linha'
[[ "$(tenta "$U_AGENTE" "UPDATE public.message_reactions SET emoji = '💀' WHERE message_id = '$M_AGENTE' AND emoji = '❤️';")" == 0 ]] \
  || fail 'harness invalido: antes da correcao o UPDATE da reacao de outro autor deveria passar'
[[ "$(tenta_afeta "$U_AGENTE" "WITH u AS (UPDATE public.message_reactions SET emoji = '💀' WHERE message_id = '$M_AGENTE' AND emoji = '❤️' RETURNING 1) SELECT count(*) FROM u;")" == 1 ]] \
  || fail 'harness invalido: antes da correcao o UPDATE da reacao do Cliente deveria afetar 1 linha'
printf '[OK] red-first: o pre-estado (replay das migrations) deixa um atendente personificar colega/Cliente e mexer na reacao alheia.\n'

# ── aplica a correcao (duas vezes: prova idempotencia/replay) ─────────────────────────
psql_test < "$correcao" >/dev/null || fail 'a correcao nao aplicou'
psql_test < "$correcao" >/dev/null || fail 'a correcao nao e replayavel (segunda aplicacao falhou)'

# ── verde: so a propria autoria passa ────────────────────────────────────────────────
# G1 - caminho legitimo do app (src/hooks/reactions/useReactionMutations.ts): proprio perfil
#      e o contato DA MENSAGEM.
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_AGENTE','$C_AGENTE','👍');")" == 0 ]] \
  || fail 'G1: a reacao legitima do proprio atendente foi barrada'
# G1b - o mesmo caminho legitimo, agora efetivado (a escrita real persiste)
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE';
INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_AGENTE','$C_AGENTE','👍');
COMMIT;
SQL
[[ "$(conta "message_id = '$M_AGENTE' AND user_id = '$P_AGENTE' AND emoji = '👍'")" == 1 ]] \
  || fail 'G1b: a reacao legitima do atendente nao persistiu'
# G2 - personificar colega
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_COLEGA',NULL,'😀');")" != 0 ]] \
  || fail 'G2: INSERT com user_id de outro profile passou'
# G3 - falsificar reacao de Cliente (user_id nulo em chamada de agente)
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE',NULL,'$C_AGENTE','😡');")" != 0 ]] \
  || fail 'G3: INSERT com user_id NULL passou'
# G4 - autorizar por um contato e gravar em outro
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_AGENTE','$C_COLEGA','🔥');")" != 0 ]] \
  || fail 'G4: INSERT com contact_id diferente do contato da mensagem passou'
# G4b - contact_id NULO nao abre caminho: a reacao de agente (modelo do item 303 grava contact_id
#       nulo) so vale na carteira do proprio atendente. Em mensagem de contato alheio continua barrado.
[[ "$(tenta "$U_AGENTE" "INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_COLEGA','$P_AGENTE',NULL,'🔥');")" != 0 ]] \
  || fail 'G4b: INSERT com contact_id nulo em mensagem de contato alheio passou'
# G1c - reacao de agente com contact_id NULO na propria carteira passa (RETURNING conta 1 linha gravada,
#       dentro de BEGIN/ROLLBACK): e o formato que o gatilho message_reactions_normalize_author
#       (item 303) grava depois de zerar contact_id.
[[ "$(tenta_afeta "$U_AGENTE" "WITH i AS (INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE','$P_AGENTE',NULL,'🙏') RETURNING 1) SELECT count(*) FROM i;")" == 1 ]] \
  || fail 'G1c: a reacao do atendente com contact_id nulo (modelo de autoria do item 303) foi barrada'
# G5 - DELETE da reacao alheia (colega e Cliente) nao pode mais acontecer
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE';
DELETE FROM public.message_reactions WHERE message_id = '$M_AGENTE' AND emoji = '😀';
DELETE FROM public.message_reactions WHERE message_id = '$M_AGENTE' AND emoji = '❤️';
COMMIT;
SQL
[[ "$(conta "message_id = '$M_AGENTE' AND emoji IN ('😀','❤️')")" == 2 ]] \
  || fail 'G5: o atendente apagou reacao de outro autor'
# G6 - UPDATE da reacao alheia nao pode mais acontecer; o proprio emoji continua editavel
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE';
UPDATE public.message_reactions SET emoji = '💀' WHERE message_id = '$M_AGENTE' AND emoji = '❤️';
UPDATE public.message_reactions SET emoji = '🎉' WHERE message_id = '$M_AGENTE' AND emoji = '👍';
COMMIT;
SQL
[[ "$(conta "message_id = '$M_AGENTE' AND emoji = '❤️'")" == 1 ]] || fail 'G6a: o atendente alterou reacao do Cliente'
[[ "$(conta "message_id = '$M_AGENTE' AND emoji = '🎉'")" == 1 ]] || fail 'G6b: o atendente nao conseguiu editar a propria reacao'
# G7 - UPDATE tentando trocar o autor (WITH CHECK)
[[ "$(tenta "$U_AGENTE" "UPDATE public.message_reactions SET user_id = '$P_COLEGA' WHERE message_id = '$M_AGENTE' AND emoji = '🎉';")" != 0 ]] \
  || fail 'G7: UPDATE trocou o user_id da propria reacao'
# G8 - a ingestao do provedor (service_role/BYPASSRLS) segue gravando a reacao do CONTATO
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.message_reactions(message_id, user_id, contact_id, emoji) VALUES ('$M_AGENTE',NULL,'$C_AGENTE','🍀');
COMMIT;
SQL
[[ "$(conta "message_id = '$M_AGENTE' AND emoji = '🍀' AND user_id IS NULL")" == 1 ]] \
  || fail 'G8: a origem confiavel do provedor perdeu a ingestao da reacao do cliente'

# G9 - caminho de LEITURA intacto: o SELECT continua visivel para o dono da carteira.
leitura="$(psql_test -Atq <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE';
SELECT count(*) FROM public.message_reactions WHERE message_id = '$M_AGENTE';
COMMIT;
SQL
)"
[[ "$leitura" == 4 ]] || fail "G9: leitura da carteira mudou (esperado 4, veio '$leitura')"

# G10 - DELETE legitimo da propria reacao: a policy de delete nao pode bloquear o dono.
# Prova por contagem antes/depois (RETURNING do proprio DELETE tambem confirmaria).
reacoes_antes="$(conta "message_id = '$M_AGENTE'")"
psql_test -q >/dev/null <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$U_AGENTE';
DELETE FROM public.message_reactions WHERE message_id = '$M_AGENTE' AND emoji = '🎉';
COMMIT;
SQL
[[ "$(conta "message_id = '$M_AGENTE' AND emoji = '🎉' AND user_id = '$P_AGENTE'")" == 0 ]] \
  || fail 'G10a: o atendente nao conseguiu apagar a propria reacao'
[[ "$(conta "message_id = '$M_AGENTE'")" == $((reacoes_antes - 1)) ]] \
  || fail 'G10b: a contagem nao caiu de 1 apos o DELETE da propria reacao'

printf '[OK] verde: message_reactions so aceita a propria autoria; provedor (service_role) intacto.\n'
printf 'PROVA_OK=1\n'
