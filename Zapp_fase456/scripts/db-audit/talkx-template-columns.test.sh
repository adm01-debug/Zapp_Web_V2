#!/usr/bin/env bash
# N-126b (fonte X083, parte 2 de 2): prova por script as 8 colunas novas de
# public.talkx_templates criadas pela migration 20261011000020_talkx_templates_channel_media_archive.sql
# (cartao N-126a) — tipo, default, CHECK, o carater E SO ADITIVO e a PRESERVACAO DO RLS.
#
# NAO recria talkx_templates a mao (foi a recusa do revisor nas duas tentativas
# anteriores: "o teste faz CREATE TABLE talkx_templates a mao, o que e uma copia
# e nao o codigo real"). Aplica, EM ORDEM, os ARQUIVOS de migration reais de
# supabase/migrations/ — inclusive 20260908120000_talkx_segments_templates_events.sql,
# que e quem cria a tabela — e so entao a migration alvo. O pre-estado que o
# Supabase teria (schema auth, roles da API, profiles, helpers, contacts e
# whatsapp_connections) e stub, como nos harnesses irmaos: e infraestrutura da
# plataforma anterior as migrations do modulo, nao a tabela sob teste.
#
# RLS (recusa do revisor): a prova de RLS NAO compara authenticated com o dono.
# Semeia linhas ANTES da migration alvo, le-as como authenticated NESSE momento
# (BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub; COMMIT) e,
# DEPOIS da migration alvo, repete a MESMA leitura e compara: as colunas antigas
# vem identicas e as linhas pre-existentes recebem channel='whatsapp' e archived_at
# NULL (prova o NOT NULL DEFAULT sobre dados ja gravados). Alem disso compara a
# assinatura de pg_policies e as flags relrowsecurity/relforcerowsecurity de
# talkx_templates antes e depois da migration alvo.
#
# Vermelho->verde: sem o arquivo da migration alvo em supabase/migrations/ (base
# SEM o N-126a) a primeira assercao de coluna FALHA; com o arquivo presente PASSA.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
postgres_image="${TALKX_TEMPLATE_COLUMNS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="talkx-template-columns-test-$$"
test_password="talkx_template_columns_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_at() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

migration() {
  local file="$migrations_dir/$1"
  [[ -f "$file" ]] || fail "migration ausente: $1"
  printf '  · %s\n' "$1" >&2
  psql_test < "$file" >/dev/null
}

# Le como o papel authenticated REAL, com claim setada, num bloco explicito.
read_as_authenticated() {
  psql_at <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
$1;
COMMIT;
SQL
}

# ── PostgreSQL 17 descartavel LOCAL (nenhum ambiente real) ─────────────────────
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}
start_postgres || fail 'PostgreSQL de teste não iniciou'

# ── infraestrutura que o Supabase fornece ANTES das migrations do modulo ───────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin','supervisor','agent','special_agent');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = statement_timestamp(); RETURN NEW; END
$$;

-- Pre-requisitos das migrations reais do Talk X (FKs de contacts/whatsapp_connections);
-- nascem muito antes destas migrations, como o Supabase ja teria neste ponto.
CREATE TABLE public.contacts (id uuid PRIMARY KEY);
CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY);

CREATE PUBLICATION supabase_realtime;
SQL

# ── migrations REAIS, na ordem de version (a que cria talkx_templates inclusive) ─
migration "20260409000457_96ecc54a-a807-45af-8812-cea1f4a75df1.sql"
migration "20260409001622_42b0689d-5d9d-4ace-b7b7-ab3104ee54d5.sql"
migration "20260409013057_7a6fb7ad-d6f8-4517-a461-ef10c0123af1.sql"
migration "20260908120000_talkx_segments_templates_events.sql"
# Estado de producao das policies da tabela (TO authenticated), recuperado do
# proprio ledger (20260930142000). Sem ele o teste provaria contra um RLS que
# producao nao tem.
migration "20260930142000_scope_public_policies_to_authenticated.sql"

# Supabase concede por default ALL nas tabelas novas a anon/authenticated; sem o
# grant o teste falharia com "permission denied" em vez de exercitar a RLS.
psql_test >/dev/null <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_templates TO authenticated, anon;
SQL

# ── linhas PRE-EXISTENTES (semeadas ANTES da migration alvo) ───────────────────
# A prova de RLS exige comparar a leitura ANTES x DEPOIS da migration alvo sobre
# os MESMOS dados: o backfill do DEFAULT NOT NULL so fica provado com linhas ja
# gravadas. media_type='image' e media_url preenchidos para conferir que colunas
# antigas com valor continuam identicas.
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_templates (id, name, content, media_url, media_type) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Padrao',    'Oi', NULL,                      NULL),
  ('a0000000-0000-0000-0000-000000000002', 'Com midia', 'Ola', 'https://exemplo/img.png', 'image');
SQL

# ── assinaturas do estado BASE, capturadas ANTES da migration alvo ─────────────
capture_columns() {
  psql_at -c "SELECT column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'∅')
              FROM information_schema.columns
              WHERE table_schema='public' AND table_name='talkx_templates'
              ORDER BY column_name"
}
capture_constraints() {
  psql_at -c "SELECT conname||':'||pg_get_constraintdef(oid)
              FROM pg_constraint
              WHERE conrelid='public.talkx_templates'::regclass
              ORDER BY conname"
}
capture_policies() {
  psql_at -c "SELECT polname||':'||polcmd::text||':'||polroles::text||':'||coalesce(pg_get_expr(polqual, polrelid),'∅')||':'||coalesce(pg_get_expr(polwithcheck, polrelid),'∅')
              FROM pg_policy
              WHERE polrelid='public.talkx_templates'::regclass
              ORDER BY polname"
}
capture_rls_flags() {
  psql_at -c "SELECT relrowsecurity::text||'|'||relforcerowsecurity::text
              FROM pg_class WHERE oid='public.talkx_templates'::regclass"
}
# Colunas ANTIGAS (as que existem antes da migration alvo) — mesma leitura antes
# e depois, para provar que a migration nao as toca.
old_rows_sql="SELECT id||'|'||name||'|'||coalesce(description,'∅')||'|'||category||'|'||content||'|'||
                     coalesce(media_url,'∅')||'|'||coalesce(media_type,'∅')||'|'||status||'|'||use_count
              FROM public.talkx_templates ORDER BY id"

base_columns="$(capture_columns)"
base_constraints="$(capture_constraints)"
base_policies="$(capture_policies)"
base_rls_flags="$(capture_rls_flags)"
base_media_type_def="$(psql_at -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_templates'::regclass AND conname='talkx_templates_media_type_check'")"
[[ -n "$base_media_type_def" ]] || fail 'pre-condicao: talkx_templates_media_type_check deveria existir antes da migration alvo'
[[ -n "$base_policies" ]] || fail 'pre-condicao: talkx_templates deveria ter policies antes da migration alvo'
[[ "$(printf '%s\n' "$base_rls_flags" | cut -d'|' -f1)" == 'true' ]] || fail 'pre-condicao: RLS deveria estar habilitado antes da migration alvo'

# Leitura dos MESMOS dados como authenticated, ANTES da migration alvo.
base_auth_read="$(read_as_authenticated "$old_rows_sql")"
[[ "$(printf '%s\n' "$base_auth_read" | wc -l)" == '2' ]] \
  || fail "pre-condicao: authenticated deveria ler as 2 linhas semeadas antes da migration, leu: '$base_auth_read'"

# ── a migration ALVO (N-126a): so aplica se o arquivo existir ──────────────────
shopt -s nullglob
target_migrations=("$migrations_dir"/*_talkx_templates_channel_media_archive.sql)
shopt -u nullglob
if (( ${#target_migrations[@]} > 0 )); then
  migration "$(basename "${target_migrations[0]}")"
  printf '  · N-126a aplicada (%s)\n' "$(basename "${target_migrations[0]}")" >&2
else
  printf '  · N-126a AUSENTE em supabase/migrations/ — estado base (o teste deve FALHAR)\n' >&2
fi

# ── 1. as 8 colunas novas existem com tipo, nulabilidade e default esperados ───
col_signature() {
  psql_at -c "SELECT coalesce((SELECT data_type||'|'||is_nullable||'|'||coalesce(column_default,'∅')
              FROM information_schema.columns
              WHERE table_schema='public' AND table_name='talkx_templates' AND column_name='$1'),'AUSENTE')"
}
expect_col() {
  local actual
  actual="$(col_signature "$1")"
  [[ "$actual" == "$2" ]] || fail "coluna $1: esperado '$2', obtido '$actual'"
  printf '[PASS] coluna %s = %s\n' "$1" "$2"
}
expect_col channel          "text|NO|'whatsapp'::text"
expect_col icon             "text|YES|∅"
expect_col interactive      "jsonb|YES|∅"
expect_col media_file_name  "text|YES|∅"
expect_col media_size_bytes "bigint|YES|∅"
expect_col media_width      "integer|YES|∅"
expect_col media_height     "integer|YES|∅"
expect_col archived_at      "timestamp with time zone|YES|∅"

# ── 2. RLS: a MESMA leitura authenticated volta identica nas colunas antigas e a
#        migration backfillou channel/archived_at nas linhas pre-existentes ─────
after_auth_read="$(read_as_authenticated "$old_rows_sql")"
[[ "$after_auth_read" == "$base_auth_read" ]] \
  || fail "as colunas antigas mudaram pela migration alvo: antes='$base_auth_read' depois='$after_auth_read'"
printf '[PASS] authenticated le as colunas antigas identicas antes e depois da migration alvo\n'

backfilled="$(read_as_authenticated "SELECT id||'|'||channel||'|'||(archived_at IS NULL)::text FROM public.talkx_templates ORDER BY id")"
[[ "$backfilled" == "$(printf '%s\n' "$base_auth_read" | cut -d'|' -f1 | sed 's/$/|whatsapp|true/')" ]] \
  || fail "linhas pre-existentes nao receberam channel='whatsapp' e archived_at NULL: $backfilled"
printf '[PASS] linhas pre-existentes receberam channel=whatsapp e archived_at NULL (DEFAULT NOT NULL sobre dados gravados)\n'

# ── 3. RLS: assinatura das policies e flags de RLS inalteradas ─────────────────
after_policies="$(capture_policies)"
[[ "$after_policies" == "$base_policies" ]] \
  || fail "o RLS da tabela mudou: policies antes='$base_policies' depois='$after_policies'"
printf '[PASS] assinatura de pg_policies (nome/cmd/roles/qual/with_check) inalterada\n'
after_rls_flags="$(capture_rls_flags)"
[[ "$after_rls_flags" == "$base_rls_flags" ]] \
  || fail "relrowsecurity/relforcerowsecurity mudaram: '$base_rls_flags' -> '$after_rls_flags'"
printf '[PASS] relrowsecurity/relforcerowsecurity inalterados (%s)\n' "$after_rls_flags"

# ── 4. comportamento: default grava whatsapp, archived_at nasce NULL ──────────
seeded="$(psql_at -c "INSERT INTO public.talkx_templates (id, name, content)
  VALUES ('a0000000-0000-0000-0000-000000000003','Padrao','Oi')
  RETURNING channel||'|'||(archived_at IS NULL)::text")"
[[ "$seeded" == 'whatsapp|true' ]] || fail "insert padrao divergiu: $seeded (esperado 'whatsapp|true')"
printf '[PASS] insert padrao grava channel=whatsapp e archived_at NULL\n'

# ── 5. o CHECK de channel recusa outro valor (exit negado, stderr preservado) ──
if out="$(psql_test -c "INSERT INTO public.talkx_templates (id, name, content, channel)
  VALUES ('a0000000-0000-0000-0000-000000000004','Canal invalido','Oi','sms')" 2>&1)"; then
  fail 'o CHECK de channel aceitou sms'
fi
[[ "$out" == *talkx_templates_channel_check* ]] || fail "esperava talkx_templates_channel_check na recusa, veio: $out"
printf '[PASS] CHECK de channel recusa sms\n'

# ── 6. o CHECK de icon recusa mais de 16 caracteres ────────────────────────────
if out="$(psql_test -c "INSERT INTO public.talkx_templates (id, name, content, icon)
  VALUES ('a0000000-0000-0000-0000-000000000005','Icone longo','Oi','12345678901234567')" 2>&1)"; then
  fail 'o CHECK de icon aceitou 17 caracteres'
fi
[[ "$out" == *talkx_templates_icon_check* ]] || fail "esperava talkx_templates_icon_check na recusa, veio: $out"
printf '[PASS] CHECK de icon recusa mais de 16 caracteres\n'

# ── 7. so aditiva: nenhuma coluna antiga mudou; exatamente as 8 novas entraram ─
after_columns="$(capture_columns)"
removed="$(comm -23 <(printf '%s\n' "$base_columns") <(printf '%s\n' "$after_columns"))"
added="$(comm -13 <(printf '%s\n' "$base_columns") <(printf '%s\n' "$after_columns"))"
[[ -z "$removed" ]] || fail "coluna antiga removida ou alterada pela migration: $removed"
added_names="$(printf '%s\n' "$added" | cut -d: -f1 | tr '\n' ' ')"
[[ "$added_names" == 'archived_at channel icon interactive media_file_name media_height media_size_bytes media_width ' ]] \
  || fail "as colunas adicionadas nao sao exatamente as 8 esperadas: $added_names"
[[ "$(printf '%s\n' "$after_columns" | wc -l)" == "$(( $(printf '%s\n' "$base_columns" | wc -l) + 8 ))" ]] \
  || fail 'a tabela ganhou um numero de colunas diferente de 8'
printf '[PASS] so aditiva: nenhuma coluna antiga mudou, entraram exatamente as 8 novas\n'

# ── 8. media_type NAO foi recriada: mesmo CHECK, sem duplicata ─────────────────
after_media_type_def="$(psql_at -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.talkx_templates'::regclass AND conname='talkx_templates_media_type_check'")"
[[ "$after_media_type_def" == "$base_media_type_def" ]] \
  || fail "o CHECK de media_type foi recriado/alterado: '$base_media_type_def' -> '$after_media_type_def'"
[[ "$(psql_at -c "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_templates'::regclass AND pg_get_constraintdef(oid) ILIKE '%media_type%'")" == '1' ]] \
  || fail 'ha mais de um CHECK tocando media_type (recriada)'
after_constraints="$(capture_constraints)"
c_removed="$(comm -23 <(printf '%s\n' "$base_constraints") <(printf '%s\n' "$after_constraints"))"
[[ -z "$c_removed" ]] || fail "constraint antiga removida/alterada: $c_removed"
c_added_names="$(comm -13 <(printf '%s\n' "$base_constraints") <(printf '%s\n' "$after_constraints") | cut -d: -f1 | tr '\n' ' ')"
[[ "$c_added_names" == 'talkx_templates_channel_check talkx_templates_icon_check ' ]] \
  || fail "constraints novas diferentes das 2 esperadas: $c_added_names"
printf '[PASS] media_type intacta e so os 2 CHECKs novos entraram\n'

# ── 9. anon continua barrado pela RLS ──────────────────────────────────────────
anon_read="$(psql_at <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) FROM public.talkx_templates;
COMMIT;
SQL
)"
[[ "$anon_read" == '0' ]] || fail "anon leu $anon_read linhas de talkx_templates (RLS deveria barrar)"
printf '[PASS] anon continua lendo 0 linhas (RLS intacto)\n'

printf 'PASS: as 8 colunas novas de public.talkx_templates existem com tipo/default/CHECK certos, a migration e so aditiva (media_type intacta) e o RLS da tabela nao mudou — provado sobre as migrations reais, comparando a leitura authenticated ANTES x DEPOIS e a assinatura de pg_policies/relrowsecurity (N-126a)\n'
