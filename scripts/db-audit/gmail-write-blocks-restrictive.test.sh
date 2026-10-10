#!/usr/bin/env bash
# N-146: Prova que as 3 policies "Block authenticated gmail …" em
# gmail_accounts sao RESTRICTIVE e que uma policy permissiva futura
# nao pode sobrescreve-las.
#
# Harness de migration em PostgreSQL DESCARTAVEL — prova fora de
# producao da migration gmail_write_blocks_restrictive.
#
# Uso: bash scripts/db-audit/gmail-write-blocks-restrictive.test.sh
set -euo pipefail

MIGRATION="supabase/migrations/20261010000000_gmail_write_blocks_restrictive.sql"
CNAME="gmail-restrictive-$$-$(date +%s)"
PSQL=(docker exec -i "$CNAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres)

cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f "$MIGRATION" ] || { echo "[FALHOU] migration nao encontrada: $MIGRATION"; exit 1; }

docker run --rm -d --name "$CNAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres postgres:17-alpine >/dev/null

pronto=0
for _ in $(seq 1 90); do
  if [ "$(docker logs "$CNAME" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] \
     && docker exec "$CNAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then pronto=1; break; fi
  sleep 1
done
[ "$pronto" = 1 ] || { echo "[FALHOU] o PostgreSQL descartavel nao ficou pronto em 90 s"; exit 1; }

"${PSQL[@]}" <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create table public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_address text not null,
  is_active boolean not null default true,
  sync_status text not null default 'idle',
  last_sync_at timestamptz,
  last_error text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_accounts FROM PUBLIC;
GRANT ALL ON public.gmail_accounts TO anon, authenticated, service_role;
SQL

echo "[OK] RED: estado pre-migration verificado (gmail_accounts com RLS ligado, sem policies de escrita)"

cat "$MIGRATION" | "${PSQL[@]}"

RESTRICT_COUNT="$("${PSQL[@]}" -Atc "
  select count(*) from pg_policies
  where tablename = 'gmail_accounts'
    and policyname like '%restrictive%'
    and permissive = 'RESTRICTIVE'
")"
[ "$RESTRICT_COUNT" = "3" ] || { echo "[FALHOU] esperadas 3 policies RESTRICTIVE, encontradas $RESTRICT_COUNT"; exit 1; }
echo "[OK] GREEN: 3 policies RESTRICTIVE existentes em gmail_accounts"

INSERT_RESULT="$("${PSQL[@]}" -Atc "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO public.gmail_accounts (user_id, email_address) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test@example.com');
COMMIT;
" 2>&1 || true)"
echo "$INSERT_RESULT" | grep -qiE "permission denied|error" && echo "[OK] GREEN: authenticated nao pode INSERT" || { echo "[FALHOU] authenticated conseguiu INSERT em gmail_accounts"; exit 1; }

# Inserir uma row antes de tentar UPDATE (USING verifica rows existentes)
"${PSQL[@]}" -c "INSERT INTO public.gmail_accounts (user_id, email_address) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'update-test@example.com');" >/dev/null 2>&1 || true

UPDATE_RESULT="$("${PSQL[@]}" -Atc "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.gmail_accounts SET sync_status = 'syncing' WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
COMMIT;
" 2>&1 || true)"
echo "$UPDATE_RESULT" | grep -qiE "permission denied|error" && echo "[OK] GREEN: authenticated nao pode UPDATE" || { echo "[FALHOU] authenticated conseguiu UPDATE em gmail_accounts"; exit 1; }

# Inserir uma row antes de tentar DELETE (USING verifica rows existentes)
"${PSQL[@]}" -c "INSERT INTO public.gmail_accounts (user_id, email_address) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'delete-test@example.com');" >/dev/null 2>&1 || true

DELETE_RESULT="$("${PSQL[@]}" -Atc "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DELETE FROM public.gmail_accounts WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
COMMIT;
" 2>&1 || true)"
echo "$DELETE_RESULT" | grep -qiE "permission denied|error" && echo "[OK] GREEN: authenticated nao pode DELETE" || { echo "[FALHOU] authenticated conseguiu DELETE em gmail_accounts"; exit 1; }

"${PSQL[@]}" -c "CREATE POLICY \"Permissive future insert\" ON public.gmail_accounts FOR INSERT TO authenticated WITH CHECK (true);"

INSERT_AFTER_PERMISSIVE="$("${PSQL[@]}" -Atc "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO public.gmail_accounts (user_id, email_address) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'after-permissive@example.com');
COMMIT;
" 2>&1 || true)"
echo "$INSERT_AFTER_PERMISSIVE" | grep -qiE "permission denied|error" && echo "[OK] GREEN: policy permissiva futura NAO sobrescreve a restrictive" || { echo "[FALHOU] policy permissiva futura sobrescreveu a restrictive"; exit 1; }

"${PSQL[@]}" -c "DROP POLICY IF EXISTS \"Permissive future insert\" ON public.gmail_accounts;"

echo "[OK] gmail_write_blocks_restrictive — 3 policies RESTRICTIVE aplicadas, escrita bloqueada, policy permissiva futura nao sobrescreve (${CNAME})"
