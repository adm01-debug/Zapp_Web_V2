#!/usr/bin/env bash
# X176 (TL-164) — "Criar RPCs de leitura da supressão: listagem paginada, KPIs e atividade".
#
# Prova, em PostgreSQL 17 descartável, aplicando a MIGRATION REAL, as três funções
# SECURITY INVOKER de leitura da supressão:
#   * public.talkx_suppression_list(...)      -> {total, rows} paginado no servidor
#   * public.talkx_suppression_stats(p_days)  -> valor, valor anterior e série de 8 pontos
#   * public.talkx_suppression_activity(...)  -> eventos de entidade suppression*
# Executa como os papéis REAIS (authenticated com JWT, anon, service_role) — nunca como
# postgres nas asserções — com RLS ligada e as policies vivas reproduzidas no fixture.
# Roteiro (cada bloco tem o estado ANTERIOR e o estado com a migration):
#   BLOCO A — agente (sem papel) recebe 42501 nas três; anon não tem EXECUTE;
#   BLOCO B — KPIs: opt-outs do período = 3 (o de 40 dias fora), ativos não contam expirado
#             nem removido, proteção conta só campanha iniciada com respect_suppression;
#   BLOCO C — listagem: total constante entre páginas, limite/offset, filtro de status,
#             busca por e-mail, busca por dígitos de telefone e telefone avulso sem contato;
#   BLOCO D — entrada inválida (limite, offset, direção, ordenação, status, dias) = 22023;
#   BLOCO E — atividade recente lê os eventos suppression* com ator e contato;
#   BLOCO F — rollback executado a partir do PRÓPRIO arquivo da migration e reaplicação.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
postgres_image="${TALKX_SUPPRESSION_READ_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-suppression-read-test-$$"
test_password="talkx_suppression_read_test_only"

migration=$(grep -rlF 'talkx_suppression_read_rpcs' "$repo_root/supabase/migrations" 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

start_postgres() {
  # Runner hospedado pode reportar o PostgreSQL pronto um instante antes de o container
  # reiniciar. Exige duas sondas seguidas e repete SÓ o bootstrap descartável; falha de
  # SQL/assercao nunca é repetida.
  local attempt
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    local _
    for _ in $(seq 1 20); do
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

[ -n "$migration" ] || fail 'migration de X176 (talkx_suppression_read_rpcs) nao encontrada'
[ -f "$migration" ] || fail "migration nao encontrada: $migration"
printf '== migration sob teste: %s\n' "${migration#"$repo_root"/}"
printf '== container: %s (imagem %s)\n' "$container_name" "$postgres_image"

start_postgres || fail 'PostgreSQL de teste nao iniciou'

# ---------------------------------------------------------------------------
# Fixture = o que o Supabase entrega ANTES das migrations: schema auth, papéis,
# profiles/user_roles com is_admin_or_supervisor, e as tabelas vivas com a RLS e as
# policies de produção (admin-only em talkx_blacklist, admin/supervisor nas demais).
# A função SOB TESTE vem do arquivo real de supabase/migrations/.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(
       NULLIF(current_setting('request.jwt.claim.sub', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       current_user
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  email text,
  role text DEFAULT 'agent',
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);

-- Corpo vivo (20251215025014): SECURITY DEFINER, enumera user_roles.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid) TO authenticated, service_role;

CREATE TYPE public.talkx_blacklist_reason AS ENUM (
  'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  phone text,
  avatar_url text,
  assigned_to uuid,
  deleted_at timestamptz
);

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  status text NOT NULL DEFAULT 'draft',
  respect_suppression boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  created_by uuid
);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone text,
  origin text,
  reason text,
  reason_code public.talkx_blacklist_reason,
  campaign_id uuid REFERENCES public.talkx_campaigns(id),
  blocked_by uuid,
  removed_by uuid,
  removed_at timestamptz,
  expires_at timestamptz,
  source_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.talkx_campaigns(id),
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id),
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can view blacklist" ON public.talkx_blacklist
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT TO authenticated USING (
    public.is_admin_or_supervisor(auth.uid())
    OR assigned_to = public.get_profile_id_for_user(auth.uid())
    OR assigned_to IS NULL
  );

ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all campaigns" ON public.talkx_campaigns
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Users can view own campaigns" ON public.talkx_campaigns
  FOR SELECT TO authenticated
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE public.talkx_campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_campaign_events_select" ON public.talkx_campaign_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
      AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
           OR public.is_admin_or_supervisor(auth.uid())))
    OR (talkx_campaign_events.campaign_id IS NULL AND public.is_admin_or_supervisor(auth.uid()))
  );

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.contacts, public.talkx_blacklist, public.talkx_campaigns, public.talkx_campaign_events TO authenticated;
-- A policy viva "Users can view own campaigns" avalia uma subconsulta em profiles com os
-- privilégios do CHAMADOR; em produção authenticated lê profiles. Sem este grant o erro seria
-- "permission denied for table profiles" e mascararia o contrato das RPCs.
GRANT SELECT ON public.profiles TO authenticated;
SQL

# ---------------------------------------------------------------------------
# Semente: 12 registros, exatamente o cenário do aceite de X176.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Admin Um', 'admin'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Supervisor Dois', 'supervisor'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Agente Tres', 'agent');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

INSERT INTO public.contacts (id, name, email, phone) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Alice Souza',  'alice.souza@example.com',  '5511987650001'),
  ('30000000-0000-0000-0000-000000000002', 'Bruno Lima',   'bruno.lima@example.com',   '5511987650002'),
  ('30000000-0000-0000-0000-000000000003', 'Carla Dias',   'carla.dias@example.com',   '5511987650003'),
  ('30000000-0000-0000-0000-000000000004', 'Diego Alves',  'diego.alves@example.com',  '5511987650004'),
  ('30000000-0000-0000-0000-000000000005', 'Elisa Prado',  'elisa.prado@example.com',  '5511987650005'),
  ('30000000-0000-0000-0000-000000000006', 'Fabio Nunes',  'fabio.nunes@example.com',  '5511987650006'),
  ('30000000-0000-0000-0000-000000000007', 'Gilda Rocha',  'gilda.rocha@example.com',  '5511987650007'),
  ('30000000-0000-0000-0000-000000000008', 'Helio Matos',  'helio.matos@example.com',  '5511987650008'),
  ('30000000-0000-0000-0000-000000000009', 'Iara Freitas', 'iara.freitas@example.com', '5511987650009'),
  ('30000000-0000-0000-0000-000000000010', 'Joao Peixoto', 'joao.peixoto@example.com', '5511987650010'),
  ('30000000-0000-0000-0000-000000000011', 'Kelly Braga',  'kelly.braga@example.com',  '5511987650011');

INSERT INTO public.talkx_campaigns (id, name, status, respect_suppression, started_at) VALUES
  ('40000000-0000-0000-0000-000000000001', 'Campanha Protegida', 'running',  true,  now() - interval '2 days'),
  ('40000000-0000-0000-0000-000000000002', 'Campanha Solta',     'running',  false, now() - interval '1 day'),
  ('40000000-0000-0000-0000-000000000003', 'Campanha Rascunho',  'draft',    true,  NULL);

-- 3 auto_optout recentes (reason_code opt_out) + 1 opt_out de 40 dias atrás
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, created_at) VALUES
  ('30000000-0000-0000-0000-000000000001', 'auto_optout', 'Respondeu PARE', 'opt_out', now() - interval '5 days'),
  ('30000000-0000-0000-0000-000000000002', 'auto_optout', 'Respondeu PARE', 'opt_out', now() - interval '6 days'),
  ('30000000-0000-0000-0000-000000000003', 'auto_optout', 'Respondeu PARE', 'opt_out', now() - interval '7 days'),
  ('30000000-0000-0000-0000-000000000004', 'optout',      'Pediu por telefone', 'opt_out', now() - interval '40 days');
-- 2 manuais
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, created_at) VALUES
  ('30000000-0000-0000-0000-000000000005', 'manual', 'Bloqueio do operador', 'manual', now() - interval '3 days'),
  ('30000000-0000-0000-0000-000000000006', 'manual', 'Bloqueio do operador', 'manual', now() - interval '10 days');
-- 1 expirado e 1 removido (não contam no KPI de ativos)
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, expires_at, created_at) VALUES
  ('30000000-0000-0000-0000-000000000007', 'system', 'Numero invalido', 'invalid_number', now() - interval '2 days', now() - interval '20 days');
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, removed_at, created_at) VALUES
  ('30000000-0000-0000-0000-000000000008', 'system', 'Numero invalido', 'invalid_number', now() - interval '1 day', now() - interval '15 days');
-- 1 telefone avulso (sem contato) e 1 com campanha
INSERT INTO public.talkx_blacklist (contact_id, phone, origin, reason, reason_code, created_at) VALUES
  (NULL, '5541999990000', 'list', 'Importado de lista', 'manual', now() - interval '2 days');
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, campaign_id, created_at) VALUES
  ('30000000-0000-0000-0000-000000000009', 'system', 'Pediu descadastro na campanha', 'no_commercial_permission',
   '40000000-0000-0000-0000-000000000001', now() - interval '1 day');
-- +2 suprimidos de outras origens (fecham os 12)
INSERT INTO public.talkx_blacklist (contact_id, origin, reason, reason_code, created_at) VALUES
  ('30000000-0000-0000-0000-000000000010', 'lgpd', 'Revogou consentimento', 'lgpd', now() - interval '4 days'),
  ('30000000-0000-0000-0000-000000000011', 'system', 'Mensagem devolvida', 'bounce', now() - interval '8 days');

-- atividade: 3 eventos de entidade (duas linhas + 1 lote), todos com campaign_id nulo
INSERT INTO public.talkx_campaign_events (event_type, message, actor_id, entity_type, entity_id, created_at)
SELECT 'suppression_add', 'Contato adicionado a lista', '10000000-0000-0000-0000-000000000001',
       'talkx_blacklist', b.id, now() - interval '1 hour'
  FROM public.talkx_blacklist b
 WHERE b.contact_id = '30000000-0000-0000-0000-000000000001';
INSERT INTO public.talkx_campaign_events (event_type, message, actor_id, entity_type, entity_id, created_at)
SELECT 'suppression_remove', 'Contato removido da lista', '10000000-0000-0000-0000-000000000002',
       'talkx_blacklist', b.id, now() - interval '3 hours'
  FROM public.talkx_blacklist b
 WHERE b.contact_id = '30000000-0000-0000-0000-000000000008';
INSERT INTO public.talkx_campaign_events (event_type, message, actor_id, entity_type, entity_id, created_at) VALUES
  ('suppression_import', '4 contatos importados', '10000000-0000-0000-0000-000000000001',
   'talkx_import_batch', '50000000-0000-0000-0000-000000000001', now() - interval '30 minutes');
SQL

ADMIN='{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}'
SUPERVISOR='{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}'
AGENTE='{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}'

as_user() { # as_user <jwt> <sql>
  local jwt="$1" sql="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql" | tail -n1
}
as_role() { # as_role <papel> <sql>
  local papel="$1" sql="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE $papel; $sql" 2>&1 | tail -n1
}
as_admin() { # saída crua (sem tail) da chamada como admin, para o erro aparecer no rótulo
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$ADMIN', false); $1"
}
expect_value() { # expect_value <rótulo> <esperado> <sql>
  local l="$1" e="$2" s="$3" raw a
  raw="$(as_admin "$s" 2>&1 || true)"
  a="$(printf '%s\n' "$raw" | tail -n1)"
  if [ "$a" != "$e" ]; then
    printf '%s\n' "$raw" | tr '\n' ' ' >&2; printf '\n' >&2
    fail "$l: esperado '$e', obtido '$a'"
  fi
  printf '[PASS] %s\n' "$l"
}
expect_error() { # expect_error <rótulo> <trecho> <jwt|papel> <sql>
  local l="$1" needle="$2" quem="$3" s="$4" out st
  set +e
  case "$quem" in
    admin)      out="$(as_user "$ADMIN" "$s" 2>&1)"; st=$? ;;
    supervisor) out="$(as_user "$SUPERVISOR" "$s" 2>&1)"; st=$? ;;
    agente)     out="$(as_user "$AGENTE" "$s" 2>&1)"; st=$? ;;
    *)          out="$(as_role "$quem" "$s")"; st=$? ;;
  esac
  set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

LIST='public.talkx_suppression_list'
LIST_SIG='text, text[], text[], uuid, date, date, text, text, text, integer, integer'

# ---------------------------------------------------------------------------
# BLOCO 0 (VERMELHO ANTES): a lacuna existe no banco ANTES da migration — nenhuma das
# três funções existe e a chamada do admin falha com 42883. É o estado apontado por X176.
# ---------------------------------------------------------------------------
printf '\n-- BLOCO 0: a lacuna existe antes da migration\n'
expect_ausente() { # expect_ausente <rótulo> <assinatura>
  local l="$1" sig="$2" a
  a="$(docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
        -c "SELECT COALESCE(to_regprocedure('$sig')::text, 'ausente')" 2>&1 || true)"
  [ "$a" = 'ausente' ] || fail "$l: '$sig' ja existe antes da migration (obtido '$a')"
  printf '[PASS] %s\n' "$l"
}
expect_ausente 'antes: listagem nao existe'  "public.talkx_suppression_list($LIST_SIG)"
expect_ausente 'antes: KPIs nao existem'     'public.talkx_suppression_stats(integer)'
expect_ausente 'antes: atividade nao existe' 'public.talkx_suppression_activity(integer, integer)'
expect_error 'antes: admin chama a listagem e recebe does not exist' 'does not exist' admin "SELECT $LIST()"

# ---------------------------------------------------------------------------
# Aplica a MIGRATION REAL
# ---------------------------------------------------------------------------
psql_test < "$migration" >/dev/null
printf '== migration aplicada\n'

printf '\n-- BLOCO A: barreira por papel e ACL\n'
expect_value 'anon NAO tem EXECUTE na listagem'    'f' "SELECT has_function_privilege('anon', '$LIST($LIST_SIG)', 'EXECUTE')"
expect_value 'authenticated tem EXECUTE na listagem' 't' "SELECT has_function_privilege('authenticated', '$LIST($LIST_SIG)', 'EXECUTE')"
expect_value 'service_role tem EXECUTE na listagem'  't' "SELECT has_function_privilege('service_role', '$LIST($LIST_SIG)', 'EXECUTE')"
expect_value 'anon NAO tem EXECUTE nos KPIs'         'f' "SELECT has_function_privilege('anon', 'public.talkx_suppression_stats(integer)', 'EXECUTE')"
expect_value 'anon NAO tem EXECUTE na atividade'     'f' "SELECT has_function_privilege('anon', 'public.talkx_suppression_activity(integer, integer)', 'EXECUTE')"
expect_error 'anon recebe permission denied na listagem' 'permission denied' anon "SELECT $LIST()"
expect_error 'agente recebe 42501 na listagem'  'talkx_suppression_read_role_required' agente "SELECT $LIST()"
expect_error 'agente recebe 42501 nos KPIs'     'talkx_suppression_read_role_required' agente "SELECT public.talkx_suppression_stats(30)"
expect_error 'agente recebe 42501 na atividade' 'talkx_suppression_read_role_required' agente "SELECT public.talkx_suppression_activity(5, 0)"
expect_value 'supervisor tambem lê a listagem'  '10' "SELECT public.talkx_suppression_list() ->> 'total'"
expect_value 'service_role lê os KPIs'          '3'  "SELECT public.talkx_suppression_stats(30) -> 'optouts' ->> 'value'"

printf '\n-- BLOCO B: KPIs (valor, período anterior e série de 8 pontos)\n'
expect_value 'opt-outs do período = 3 (o de 40 dias fica fora)' '3'  "SELECT public.talkx_suppression_stats(30) -> 'optouts' ->> 'value'"
expect_value 'suprimidos ativos = 10 (sem expirado nem removido)' '10' "SELECT public.talkx_suppression_stats(30) -> 'active' ->> 'value'"
expect_value 'bloqueios manuais = 2'                             '2'  "SELECT public.talkx_suppression_stats(30) -> 'manual' ->> 'value'"
expect_value 'campanhas protegidas = 1 (só a iniciada com respect_suppression)' '1' "SELECT public.talkx_suppression_stats(30) -> 'protected' ->> 'value'"
expect_value 'total de campanhas iniciadas = 2'                  '2'  "SELECT public.talkx_suppression_stats(30) ->> 'total_campaigns'"
expect_value 'lista de campanhas com supressao = 1'              '1'  "SELECT jsonb_array_length(public.talkx_suppression_stats(30) -> 'campaigns')"
expect_value 'campanha do filtro tem nome'                       'Campanha Protegida' "SELECT public.talkx_suppression_stats(30) -> 'campaigns' -> 0 ->> 'name'"
expect_value 'serie de ativos tem 8 pontos'  '8' "SELECT jsonb_array_length(public.talkx_suppression_stats(30) -> 'active' -> 'series')"
expect_value 'serie de opt-outs tem 8 pontos' '8' "SELECT jsonb_array_length(public.talkx_suppression_stats(30) -> 'optouts' -> 'series')"
expect_value 'opt-outs do período anterior = 1 (o de 40 dias)' '1' "SELECT public.talkx_suppression_stats(30) -> 'optouts' ->> 'previous'"
expect_value 'janela do período devolvida'    '30' "SELECT public.talkx_suppression_stats(30) ->> 'period_days'"

printf '\n-- BLOCO C: listagem paginada\n'
expect_value 'total da página 1 = 10'          '10' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'data', 'desc', 5, 0) ->> 'total'"
expect_value 'página 1 traz 5 linhas'          '5'  "SELECT jsonb_array_length(public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'data', 'desc', 5, 0) -> 'rows')"
expect_value 'total da página 2 continua 10'   '10' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'data', 'desc', 5, 5) ->> 'total'"
expect_value 'página 2 traz as linhas 6 a 10'  '5'  "SELECT jsonb_array_length(public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'data', 'desc', 5, 5) -> 'rows')"
expect_value 'linha 6 é o 6º mais recente'     'Bruno Lima' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'data', 'desc', 5, 5) -> 'rows' -> 0 ->> 'contact_name'"
expect_value 'filtro status=expirado = 1'      '1'  "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, 'expirado', NULL, NULL, 25, 0) ->> 'total'"
expect_value 'filtro status=removido = 1'      '1'  "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, 'removido', NULL, NULL, 25, 0) ->> 'total'"
expect_value 'status do expirado derivado'     'expirado' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, 'expirado', NULL, NULL, 25, 0) -> 'rows' -> 0 ->> 'status'"
expect_value 'status=todos traz os 12'         '12' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, 'todos', NULL, NULL, 25, 0) ->> 'total'"
expect_value 'busca por e-mail acha 1'         '1'  "SELECT public.talkx_suppression_list('bruno.lima@example.com') ->> 'total'"
expect_value 'busca por nome acha 1'           '1'  "SELECT public.talkx_suppression_list('Carla Dias') ->> 'total'"
expect_value 'busca por dígitos de telefone acha 1' '1' "SELECT public.talkx_suppression_list('987650003') ->> 'total'"
expect_value 'telefone avulso: sem contato'    't'  "SELECT public.talkx_suppression_list('5541999990000') -> 'rows' -> 0 ->> 'contact_name' IS NULL"
expect_value 'telefone avulso: telefone gravado preenchido' '5541999990000' "SELECT public.talkx_suppression_list('5541999990000') -> 'rows' -> 0 ->> 'phone'"
expect_value 'motivo vem com codigo, rotulo e tom' 'opt_out|Opt-out solicitado|destructive' "SELECT (public.talkx_suppression_list('alice.souza@example.com') -> 'rows' -> 0 ->> 'reason_code') || '|' || (public.talkx_suppression_list('alice.souza@example.com') -> 'rows' -> 0 ->> 'reason_label') || '|' || (public.talkx_suppression_list('alice.souza@example.com') -> 'rows' -> 0 ->> 'reason_tone')"
expect_value 'observacao vem no campo reason'  'Respondeu PARE' "SELECT public.talkx_suppression_list('alice.souza@example.com') -> 'rows' -> 0 ->> 'reason'"
expect_value 'nome da campanha na linha'       'Campanha Protegida' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, '40000000-0000-0000-0000-000000000001') -> 'rows' -> 0 ->> 'campaign_name'"
expect_value 'filtro por origem'               '3' "SELECT public.talkx_suppression_list(NULL, ARRAY['auto_optout']) ->> 'total'"
expect_value 'filtro por motivo'               '4' "SELECT public.talkx_suppression_list(NULL, NULL, ARRAY['opt_out'], NULL, NULL, NULL, 'todos') ->> 'total'"
expect_value 'ordenacao por contato (asc)'     'Alice Souza' "SELECT public.talkx_suppression_list(NULL, NULL, NULL, NULL, NULL, NULL, 'todos', 'contato', 'asc', 1, 0) -> 'rows' -> 0 ->> 'contact_name'"
expect_value 'busca com curinga NAO vira curinga' '0' "SELECT public.talkx_suppression_list('%', NULL, NULL, NULL, NULL, NULL, 'todos') ->> 'total'"

printf '\n-- BLOCO D: entrada invalida (22023)\n'
expect_error 'limite 0 recusado'            'invalid_talkx_suppression_limit'     admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0)"
expect_error 'limite 201 recusado'          'invalid_talkx_suppression_limit'     admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,201,0)"
expect_error 'offset negativo recusado'     'invalid_talkx_suppression_offset'    admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,10,-1)"
expect_error 'direcao invalida recusada'    'invalid_talkx_suppression_direction' admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'lado',10,0)"
expect_error 'ordenacao invalida recusada'  'invalid_talkx_suppression_sort'      admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,NULL,'1;drop table x',NULL,10,0)"
expect_error 'status invalido recusado'     'invalid_talkx_suppression_status'    admin "SELECT $LIST(NULL,NULL,NULL,NULL,NULL,NULL,'sei la',NULL,NULL,10,0)"
expect_error 'p_days 0 recusado'            'invalid_talkx_suppression_days'      admin "SELECT public.talkx_suppression_stats(0)"
expect_error 'p_days 366 recusado'          'invalid_talkx_suppression_days'      admin "SELECT public.talkx_suppression_stats(366)"
expect_error 'atividade com limite 0'       'invalid_talkx_suppression_limit'     admin "SELECT public.talkx_suppression_activity(0, 0)"
expect_error 'atividade com offset negativo' 'invalid_talkx_suppression_offset'   admin "SELECT public.talkx_suppression_activity(5, -3)"

printf '\n-- BLOCO E: atividade recente\n'
expect_value 'atividade lista os 3 eventos'   '3' "SELECT public.talkx_suppression_activity() ->> 'total'"
expect_value 'item mais recente é a importacao' 'suppression_import|importacao' "SELECT (public.talkx_suppression_activity() -> 'rows' -> 0 ->> 'event_type') || '|' || (public.talkx_suppression_activity() -> 'rows' -> 0 ->> 'kind')"
expect_value 'importacao traz a contagem no message' '4 contatos importados' "SELECT public.talkx_suppression_activity() -> 'rows' -> 0 ->> 'message'"
expect_value 'evento de remocao mapeia kind'  'removido' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 2 ->> 'kind'"
expect_value 'atividade traz o ator'          'Supervisor Dois' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 2 ->> 'actor_name'"
expect_value 'atividade traz o contato do evento' 'Helio Matos' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 2 ->> 'contact_name'"
expect_value 'atividade traz o e-mail do contato' 'helio.matos@example.com' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 2 ->> 'contact_email'"
expect_value 'evento de adicao mapeia kind'   'adicionado' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 1 ->> 'kind'"
expect_value 'adicao traz o e-mail do contato' 'alice.souza@example.com' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 1 ->> 'contact_email'"
expect_value 'atividade pagina com limite 2'  '2' "SELECT jsonb_array_length(public.talkx_suppression_activity(2, 0) -> 'rows')"
expect_value 'atividade mantem total na pagina 2' '3' "SELECT public.talkx_suppression_activity(2, 2) ->> 'total'"
expect_value 'atividade traz o telefone do contato' '5511987650008' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 2 ->> 'contact_phone'"
expect_value 'lote sem contato vinculado'      't' "SELECT public.talkx_suppression_activity(5, 0) -> 'rows' -> 0 ->> 'contact_name' IS NULL"

printf '\n-- BLOCO F: rollback executado a partir do proprio arquivo + reaplicacao\n'
rollback_sql="$(awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f && /^--   /{sub(/^--   /,"");print;next} f{exit}' "$migration")"
[ -n "$rollback_sql" ] || fail 'bloco de rollback nao encontrado na migration'
printf '%s\n' "$rollback_sql" | psql_test >/dev/null
expect_value 'rollback removeu a listagem'  'ausente' "SELECT COALESCE(to_regprocedure('public.talkx_suppression_list(text, text[], text[], uuid, date, date, text, text, text, integer, integer)')::text, 'ausente')"
expect_value 'rollback removeu os KPIs'     'ausente' "SELECT COALESCE(to_regprocedure('public.talkx_suppression_stats(integer)')::text, 'ausente')"
expect_value 'rollback removeu a atividade' 'ausente' "SELECT COALESCE(to_regprocedure('public.talkx_suppression_activity(integer, integer)')::text, 'ausente')"
expect_value 'rollback removeu o indice'    'ausente' "SELECT COALESCE(to_regclass('public.idx_talkx_blacklist_created_at_desc')::text, 'ausente')"
psql_test < "$migration" >/dev/null
expect_value 'reaplicacao devolve a listagem' 't' "SELECT to_regprocedure('public.talkx_suppression_list(text, text[], text[], uuid, date, date, text, text, text, integer, integer)') IS NOT NULL"
expect_value 'reaplicacao devolve os KPIs'    't' "SELECT to_regprocedure('public.talkx_suppression_stats(integer)') IS NOT NULL"
expect_value 'reaplicacao devolve a atividade' 't' "SELECT to_regprocedure('public.talkx_suppression_activity(integer, integer)') IS NOT NULL"
expect_value 'reaplicacao devolve o indice'   't' "SELECT to_regclass('public.idx_talkx_blacklist_created_at_desc') IS NOT NULL"

printf '\nOK: X176 provado em PostgreSQL 17 descartavel com a migration real.\n'
