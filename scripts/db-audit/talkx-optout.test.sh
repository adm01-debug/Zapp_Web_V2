#!/usr/bin/env bash
# X029 (Fase 3 · Tela 06/10/11/14 · banco): tornar o opt-out configuravel e ligado
# a campanha. Fecha CAP-023, CAP-024, CAP-026 e CAP-031.
#
# Contrato em PostgreSQL 17 descartavel, no mesmo formato dos testes irmaos
# (scripts/db-audit/talkx-audience-snapshot.test.sh, talkx-suppress-phone-axis.test.sh).
# Aplica a migration ANTERIOR REAL (20260930330000, assinatura de 6 argumentos) e a
# X029 REAL (20261002581230) sobre um schema minimo com os objetos que a migration
# toca, e prova:
#   (a) keywords semeadas (10, todas exact) e papeis: super/admin leem, agente nao;
#   (b) talkx_match_optout casa "PARE", "Páre!" e "remover" (exact) e NAO casa
#       "quero parar de receber" em exact; apos cadastrar "parar" como contains, casa
#       pela palavra; normalizacao de acento/caixa/pontuacao;
#   (c) opt-out sobre supressao EXPIRADA encerra a antiga e cria a nova na mesma
#       transacao (uuid != NULL); supressao vigente continua idempotente (NULL);
#   (d) p_campaign_id nulo com origem auto_optout herda a campanha do envio mais
#       recente; p_campaign_id explicito vence;
#   (e) assinatura antiga de 6 argumentos DROPada (sem ambiguidade 42725) e ACL
#       reaplicada (service_role executa, anon/authenticated nao);
#   (f) seed optout_autoreply trocado para o texto do webhook, mas so se ainda for o
#       original;
#   (g) view talkx_campaign_optouts e security_invoker e conta por campanha;
#   (h) migration replayavel (segunda aplicacao nao falha).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_prev="$repo_root/supabase/migrations/20260930330000_talkx_suppress_contact_phone_axis.sql"
migration="$repo_root/supabase/migrations/20261002581230_talkx_v4_x029_optout.sql"
postgres_image="${TALKX_OPTOUT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-optout-test-$$"
test_password="talkx_optout_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" message="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  pass "$label"
}

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 30); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL descartavel nao estabilizou (tentativa %s/3)\n' "$attempt" >&2
  done
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration_prev" ]] || fail "migration anterior ausente: $migration_prev"
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres || fail 'PostgreSQL de teste não iniciou'

# ---------------------------------------------------------------------------
# Schema minimo: os objetos que a X029 (e a migration anterior de 6 argumentos)
# referenciam. Espelha as colunas reais de talkx_blacklist/talkx_recipients.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  )
$$;

CREATE TYPE public.talkx_blacklist_reason AS ENUM (
  'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  reason_code public.talkx_blacklist_reason,
  origin text NOT NULL DEFAULT 'manual',
  source_message_id uuid,
  campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  removed_at timestamptz,
  CONSTRAINT talkx_blacklist_origin_check
    CHECK (origin IN ('manual','optout','system','lgpd','list','auto_optout'))
);
CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique
  ON public.talkx_blacklist (phone)
  WHERE phone IS NOT NULL AND removed_at IS NULL;
CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique
  ON public.talkx_blacklist (contact_id)
  WHERE contact_id IS NOT NULL AND removed_at IS NULL;
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY talkx_blacklist_select
  ON public.talkx_blacklist FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings (key, value, description) VALUES
  ('optout_autoreply', '"PARE para sair"', 'Mensagem automatica ao receber STOP/PARE');

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

INSERT INTO public.talkx_campaigns (id, name, created_by) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Campanha 1', '10000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'Campanha 2', '10000000-0000-0000-0000-000000000001');

INSERT INTO public.contacts (id, phone) VALUES
  ('30000000-0000-0000-0000-0000000000a1', '5511900000001'),
  ('30000000-0000-0000-0000-0000000000b1', '5511900000002'),
  ('30000000-0000-0000-0000-0000000000c1', '5511900000003'),
  ('30000000-0000-0000-0000-0000000000d1', '5511900000004');

-- ctB: envio mais recente veio da Campanha 2 (c2 > c1). ctC: ultimo envio da c1.
INSERT INTO public.talkx_recipients (campaign_id, contact_id, status, sent_at) VALUES
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', 'sent', now() - interval '2 days'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-0000000000b1', 'sent', now() - interval '1 hour'),
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000c1', 'sent', now() - interval '1 hour');

-- supressao ATIVA mas EXPIRADA de ctA (o furo do indice unico que ignora expires_at)
INSERT INTO public.talkx_blacklist (contact_id, phone, reason, reason_code, origin, expires_at) VALUES
  ('30000000-0000-0000-0000-0000000000a1', '5511900000001', 'opt-out', 'opt_out', 'optout', now() - interval '1 hour');

-- linha historica com campanha mas OUTRO reason_code (a view deve ignora-la)
INSERT INTO public.talkx_blacklist (contact_id, reason, reason_code, origin, campaign_id) VALUES
  ('30000000-0000-0000-0000-0000000000d1', 'numero invalido', 'invalid_number', 'system', '50000000-0000-0000-0000-000000000001');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.talkx_blacklist TO authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# Aplicacao: assinatura anterior (6 args) -> X029 -> replay
# ---------------------------------------------------------------------------
psql_test < "$migration_prev" >/dev/null || fail 'migration anterior (6 args) nao aplicou'
pass '(0) migration anterior de 6 argumentos aplicada como estado inicial'

psql_test < "$migration" >/dev/null || fail 'X029 nao aplicou'
pass '(0) X029 aplicada sobre a assinatura anterior'

# ---------------------------------------------------------------------------
# (a) keywords semeadas + papeis
# ---------------------------------------------------------------------------
kw_total="$(psql_q "SELECT count(*) FROM public.talkx_optout_keywords")"
kw_exact="$(psql_q "SELECT count(*) FROM public.talkx_optout_keywords WHERE match_mode='exact' AND active")"
[[ "$kw_total" == '10' && "$kw_exact" == '10' ]] \
  || fail "(a) esperava 10 keywords exact ativas [obtido total=$kw_total exact=$kw_exact]"
expected_kw='cancelar,descadastrar,nao quero,optout,parar,pare,remover,sair,stop,unsubscribe'
got_kw="$(psql_q "SELECT string_agg(keyword, ',' ORDER BY keyword) FROM public.talkx_optout_keywords")"
[[ "$got_kw" == "$expected_kw" ]] \
  || fail "(a) conjunto de keywords divergente [obtido: $got_kw | esperado: $expected_kw]"
pass '(a) 10 palavras semeadas, todas exact e ativas'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000003';"

[[ "$(psql_q "$admin_session SELECT count(*) FROM public.talkx_optout_keywords")" == '10' ]] \
  || fail '(a) admin nao le as keywords'
[[ "$(psql_q "$supervisor_session SELECT count(*) FROM public.talkx_optout_keywords")" == '10' ]] \
  || fail '(a) supervisor nao le as keywords'
[[ "$(psql_q "$agent_session SELECT count(*) FROM public.talkx_optout_keywords")" == '0' ]] \
  || fail '(a) agente leu as keywords (RLS de leitura nao restringe a admin/supervisor)'
expect_error '(a) agente nao escreve keyword (RLS 42501)' 'row-level security' \
  "$agent_session INSERT INTO public.talkx_optout_keywords (keyword) VALUES ('pirata');"
pass '(a) leitura admin/supervisor, escrita restrita por RLS'

# ---------------------------------------------------------------------------
# (b) casamento de palavras
# ---------------------------------------------------------------------------
assert_match() {
  local text="$1" want="$2" label="$3"
  local got
  got="$(psql_q "SELECT coalesce(public.talkx_match_optout('$text'), '<null>');")"
  [[ "$got" == "$want" ]] || fail "(b) '$label': esperava '$want' [obtido: '$got']"
}
assert_match 'PARE' 'pare' 'PARE'
assert_match 'Páre!' 'pare' 'Páre! (acento + pontuacao)'
assert_match 'remover' 'remover' 'remover'
assert_match 'SAIR' 'sair' 'SAIR'
assert_match 'Não quero!' 'nao quero' 'Não quero! (multi-palavra)'
assert_match 'quero conversar' '<null>' 'sem palavra'
pass '(b) "PARE", "Páre!" e "remover" casam (com acento/caixa/pontuacao)'

[[ "$(psql_q "SELECT coalesce(public.talkx_match_optout('quero parar de receber'), '<null>');")" == '<null>' ]] \
  || fail '(b) "quero parar de receber" NAO deveria casar antes de existir palavra contains'
pass '(b) "quero parar de receber" nao casa em exact'

psql_q "UPDATE public.talkx_optout_keywords SET match_mode='contains' WHERE keyword='parar'" >/dev/null
[[ "$(psql_q "SELECT coalesce(public.talkx_match_optout('quero parar de receber'), '<null>');")" == 'parar' ]] \
  || fail '(b) "quero parar de receber" deveria casar com a palavra contains "parar"'
[[ "$(psql_q "SELECT coalesce(public.talkx_match_optout('PARE'), '<null>');")" == 'pare' ]] \
  || fail '(b) exact deve vencer contains'
[[ "$(psql_q "SELECT public.talkx_normalize_optout_text('   Páre!!!  ');")" == 'pare' ]] \
  || fail '(b) normalizacao de acento/caixa/pontuacao incorreta'
pass '(b) palavra contains casa "quero parar de receber"; exact mantem prioridade'

# ---------------------------------------------------------------------------
# (c) supressao expirada -> encerra e cria nova na MESMA transacao
# ---------------------------------------------------------------------------
service_session="SET LOCAL request.jwt.claim.role = 'service_role';"
ctA='30000000-0000-0000-0000-0000000000a1'

new_id="$(psql_q "BEGIN; $service_session SELECT public.talkx_suppress_contact('$ctA', '5511900000001', 'Opt-out via mensagem: PARE', 'opt_out', 'auto_optout', NULL); COMMIT;")"
[[ "$new_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
  || fail "(c) opt-out sobre supressao expirada deveria criar linha nova [obtido: '$new_id']"
active_a="$(psql_q "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$ctA' AND removed_at IS NULL")"
[[ "$active_a" == '1' ]] || fail "(c) deveria haver 1 supressao ativa apos o opt-out [obtido: $active_a]"
new_exp="$(psql_q "SELECT expires_at IS NULL FROM public.talkx_blacklist WHERE contact_id='$ctA' AND removed_at IS NULL")"
[[ "$new_exp" == 't' ]] || fail '(c) a supressao nova deveria ser permanente (expires_at NULL)'
closed_old="$(psql_q "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$ctA' AND removed_at IS NOT NULL")"
[[ "$closed_old" == '1' ]] || fail "(c) a supressao expirada deveria ter sido encerrada [obtido: $closed_old]"
pass '(c) supressao expirada encerrada e supressao nova ativa criada na mesma transacao'

# supressao vigente continua idempotente
again="$(psql_q "BEGIN; $service_session SELECT public.talkx_suppress_contact('$ctA', '5511900000001', 'de novo', 'opt_out', 'auto_optout', NULL); COMMIT;")"
[[ -z "$again" ]] || fail "(c) supressao vigente deveria ser idempotente (NULL) [obtido: '$again']"
[[ "$(psql_q "SELECT count(*) FROM public.talkx_blacklist WHERE contact_id='$ctA' AND removed_at IS NULL")" == '1' ]] \
  || fail '(c) repeticao duplicou a supressao ativa'
pass '(c) supressao vigente segue idempotente (NULL, sem duplicar)'

# ---------------------------------------------------------------------------
# (d) campanha: herda o ultimo envio; explicito vence
# ---------------------------------------------------------------------------
ctB='30000000-0000-0000-0000-0000000000b1'
ctC='30000000-0000-0000-0000-0000000000c1'
c1='50000000-0000-0000-0000-000000000001'
c2='50000000-0000-0000-0000-000000000002'

psql_q "BEGIN; $service_session SELECT public.talkx_suppress_contact('$ctB', '5511900000002', 'Opt-out via mensagem: SAIR', 'opt_out', 'auto_optout', NULL); COMMIT;" >/dev/null
camp_b="$(psql_q "SELECT campaign_id FROM public.talkx_blacklist WHERE contact_id='$ctB' AND removed_at IS NULL")"
[[ "$camp_b" == "$c2" ]] || fail "(d) opt-out deveria herdar a campanha do ultimo envio ($c2) [obtido: $camp_b]"
pass '(d) p_campaign_id nulo herda a campanha do envio mais recente'

psql_q "BEGIN; $service_session SELECT public.talkx_suppress_contact('$ctC', '5511900000003', 'Opt-out via mensagem: PARE', 'opt_out', 'auto_optout', NULL, '$c2'); COMMIT;" >/dev/null
camp_c="$(psql_q "SELECT campaign_id FROM public.talkx_blacklist WHERE contact_id='$ctC' AND removed_at IS NULL")"
[[ "$camp_c" == "$c2" ]] || fail "(d) p_campaign_id explicito deveria vencer ($c2) [obtido: $camp_c]"
pass '(d) p_campaign_id explicito vence o ultimo envio'

# ---------------------------------------------------------------------------
# (e) assinatura antiga DROPada + ACL
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid)') IS NULL")" == 't' ]] \
  || fail '(e) a assinatura antiga de 6 argumentos sobreviveu (ambiguidade 42725)'
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_suppress_contact'")" == '1' ]] \
  || fail '(e) deveria existir exatamente 1 talkx_suppress_contact'
[[ "$(psql_q "SELECT to_regprocedure('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid,uuid)') IS NOT NULL")" == 't' ]] \
  || fail '(e) a assinatura nova de 7 argumentos nao existe'
new7='public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid,uuid)'
[[ "$(psql_q "SELECT has_function_privilege('service_role','$new7','EXECUTE')")" == 't' ]] || fail '(e) service_role sem EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','$new7','EXECUTE')")" == 'f' ]] || fail '(e) authenticated com EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('anon','$new7','EXECUTE')")" == 'f' ]] || fail '(e) anon com EXECUTE'
[[ "$(psql_q "SELECT has_function_privilege('service_role','public.talkx_match_optout(text)','EXECUTE')")" == 't' ]] || fail '(e) service_role sem EXECUTE em talkx_match_optout'
[[ "$(psql_q "SELECT has_function_privilege('authenticated','public.talkx_match_optout(text)','EXECUTE')")" == 'f' ]] || fail '(e) authenticated com EXECUTE em talkx_match_optout'
pass '(e) assinatura antiga removida e ACL reaplicada (service_role apenas)'

# ---------------------------------------------------------------------------
# (f) seed optout_autoreply: troca so se ainda for o original
# ---------------------------------------------------------------------------
seed="$(psql_q "SELECT value::text FROM public.talkx_settings WHERE key='optout_autoreply'")"
expected_seed='"Você foi removido da lista de comunicações da Promo Brindes. Não receberemos mais mensagens para este número. Em caso de dúvidas, entre em contato pelo nosso site."'
[[ "$seed" == "$expected_seed" ]] || fail "(f) seed nao virou o texto do webhook [obtido: $seed]"
pass '(f) seed optout_autoreply trocado para o texto de confirmacao'

# guarda: um texto ja customizado NAO e sobrescrito por uma reaplicacao
psql_q "UPDATE public.talkx_settings SET value = '\"texto customizado\"'::jsonb WHERE key='optout_autoreply'" >/dev/null

# ---------------------------------------------------------------------------
# (g) view security_invoker + contagem por campanha
# ---------------------------------------------------------------------------
view_opt="$(psql_q "SELECT array_to_string(reloptions, ',') FROM pg_class WHERE relname='talkx_campaign_optouts'")"
[[ "$view_opt" == *'security_invoker=true'* || "$view_opt" == *'security_invoker=on'* ]] \
  || fail "(g) view sem security_invoker [obtido: $view_opt]"

opt_c2="$(psql_q "SELECT optout_count FROM public.talkx_campaign_optouts WHERE campaign_id='$c2'")"
[[ "$opt_c2" == '2' ]] || fail "(g) view deveria contar 2 opt-outs na Campanha 2 [obtido: ${opt_c2:-<vazio>}]"
[[ "$(psql_q "SELECT count(*) FROM public.talkx_campaign_optouts WHERE campaign_id='$c1'")" == '0' ]] \
  || fail '(g) a linha de invalid_number nao deveria entrar na contagem de opt-outs'
pass '(g) view conta opt-outs por campanha e ignora outros reason_code'

# security_invoker: a RLS de talkx_blacklist vale para quem consulta a view
[[ "$(psql_q "$admin_session SELECT count(*) FROM public.talkx_campaign_optouts")" -ge 1 ]] \
  || fail '(g) admin deveria ver linhas na view'
[[ "$(psql_q "$agent_session SELECT count(*) FROM public.talkx_campaign_optouts")" == '0' ]] \
  || fail '(g) agente viu linhas na view (security_invoker/RLS nao valeu)'
pass '(g) view e security_invoker: admin ve, agente nao'

# ---------------------------------------------------------------------------
# (h) replay: segunda aplicacao nao falha e nao sobrescreve o texto customizado
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null || fail '(h) X029 nao e replayavel (segunda aplicacao falhou)'
[[ "$(psql_q "SELECT value::text FROM public.talkx_settings WHERE key='optout_autoreply'")" == '"texto customizado"' ]] \
  || fail '(h) reaplicacao sobrescreveu um texto de autoresposta ja customizado'
[[ "$(psql_q "SELECT count(*) FROM public.talkx_optout_keywords WHERE keyword='parar' AND match_mode='contains'")" == '1' ]] \
  || fail '(h) reaplicacao rebaixou a palavra contains cadastrada'
pass '(h) X029 replayavel; seed so troca o valor original'

printf 'PASS: X029 opt-out configuravel — palavras, normalizacao, supressao expirada, campanha do ultimo envio, ACL e view por campanha\n'
