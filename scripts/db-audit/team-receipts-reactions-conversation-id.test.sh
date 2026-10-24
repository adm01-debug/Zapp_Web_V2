#!/usr/bin/env bash
# Item 164 / TC-009 (P2) + R2-DB-011 — "Recibos e reações não forçam conversation_id derivado da mensagem"
# (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md:148-160).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canônico de 04/10:
#             * `team_receipts_fill_conversation_id` só preenche o cid quando ele chega NULL e só no INSERT.
#               Um cid NÃO nulo e errado, mandado pelo PostgREST (`useTeamMessages.ts` manda o
#               `conversationId` do painel), é gravado como veio; e o UPDATE que troca `message_id`
#               conserva o cid antigo. Como a leitura ("Conversation members can read receipts") e o
#               filtro de realtime usam a COLUNA, um recibo de mensagem do Time A passa a ser lido
#               dentro do Time B.
#             * `team_message_reactions` não tem trigger equivalente. `useTeamMessageReactions.ts`
#               insere direto com `conversation_id: conversationId`: a reação some da conversa real
#               (a agregação e o canal de realtime filtram por `conversation_id`).
#   BLOCO B — migration aplicada: o cid é derivado INCONDICIONALMENTE da mensagem (BEFORE INSERT OR UPDATE)
#             nas duas tabelas, mensagem inexistente é recusada, as linhas divergentes são reconciliadas
#             pelo backfill, o caminho legítimo (cid da própria conversa) segue intacto e as duas
#             funções de TRIGGER terminam sem EXECUTE para authenticated/anon/PUBLIC (B.15-B.17).
#
# TEAM_CID_PRESTATE=1 roda o bloco B SEM aplicar a migration — é assim que se prova o vermelho
# (bloco A passa pelo defeito, B.1 falha). Sem a variável, o roteiro é o normal: verde.
#
# Pre-estado fiel ao canônico de 04/10 (`pg_policies` + `pg_get_functiondef` + `pg_trigger`):
# INSERT de recibo estrito por vínculo (reconciliação 20261003272707), leitura de recibo por
# `conversation_id`, UPDATE do recibo próprio só para 'read', guarda de downgrade, dedup de reação,
# `conversation_id` NOT NULL nas duas tabelas e as FKs.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql"
postgres_image="${TEAM_CID_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-team-cid-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-cid-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error() {
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_ok() {
  local l="$1" s="$2" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) || { printf '%s\n' "$out" >&2; fail "$l: deveria ter sucesso"; }
  printf '[PASS] %s\n' "$l"
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

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Fiel ao canônico: `conversation_id` NOT NULL nas duas tabelas.
CREATE TABLE public.team_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'delivered',
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  UNIQUE (message_id, profile_id),
  CHECK (status IN ('delivered','read'))
);
CREATE TABLE public.team_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, profile_id, emoji),
  CONSTRAINT team_reactions_emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 8)
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
  $function$;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id
    )
  $function$;

-- ===== ESTADO ANTERIOR (defeito), fiel ao canônico de 04/10 =====
-- Recibos: só preenche o cid quando NULL e só no INSERT.
CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT tm.conversation_id INTO NEW.conversation_id FROM public.team_messages tm WHERE tm.id = NEW.message_id;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.team_receipts_no_own_sender() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_messages WHERE id = NEW.message_id AND sender_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'sender cannot create receipt for own message';
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.team_message_receipts_update_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF OLD.status = 'read' AND NEW.status <> 'read' THEN
    RAISE EXCEPTION 'Cannot downgrade receipt status from read';
  END IF;
  IF NEW.status = 'read' THEN
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  RETURN NEW;
END; $f$;
-- Reações: só a dedup. Nenhum trigger de conversation_id.
CREATE OR REPLACE FUNCTION public.team_reactions_dedup_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_message_reactions
     WHERE message_id = NEW.message_id AND profile_id = NEW.profile_id AND emoji = NEW.emoji
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END; $f$;

ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

-- Leitura de recibo pela COLUNA gravada (é o que dá alcance ao cid errado).
CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()) OR public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = team_message_receipts.profile_id
    )
  );
CREATE POLICY team_message_receipts_update_own ON public.team_message_receipts FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id() AND status = 'read');

-- Reações: INSERT estrito por vínculo com a MENSAGEM (#1265 removeu a policy fraca).
CREATE POLICY reactions_select ON public.team_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.team_messages tm ON tm.id = team_message_reactions.message_id
    WHERE tcm.conversation_id = tm.conversation_id AND tcm.profile_id = public.current_profile_id()));
CREATE POLICY team_message_reactions_insert ON public.team_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.team_messages tm
      WHERE tm.id = team_message_reactions.message_id
        AND public.is_team_conversation_member(auth.uid(), tm.conversation_id)
    )
  );
CREATE POLICY reactions_delete ON public.team_message_reactions FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id));

GRANT SELECT, INSERT, UPDATE ON public.team_message_receipts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_message_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

CREATE TRIGGER team_receipts_fill_conversation_id_trig BEFORE INSERT ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_fill_conversation_id();
CREATE TRIGGER team_receipts_no_own_sender_trig BEFORE INSERT ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_no_own_sender();
CREATE TRIGGER team_message_receipts_update_guard_trig BEFORE UPDATE ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_message_receipts_update_guard();
CREATE TRIGGER team_reactions_dedup_trig BEFORE INSERT ON public.team_message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.team_reactions_dedup_guard();
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_message_receipts;
DELETE FROM public.team_message_reactions;
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- ATILA (A): membro SO do Time A.  BETO (B): membro SO do Time B.  DORA (D): membro do Time A.
INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'agent', true),
  ('f0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'agent', true);

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Time B', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001');

-- Mensagens do Time A são da DORA (ATILA não pode gerar recibo da própria mensagem).
INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'mensagem da DORA no Time A (1)'),
  ('d0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'mensagem da DORA no Time A (2)'),
  ('d0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do Time B');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
DORA='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
P_ATILA='a0000000-0000-0000-0000-000000000001'
CONV_A='e0000000-0000-0000-0000-00000000000a'
CONV_B='e0000000-0000-0000-0000-00000000000b'
MSG_A1='d0000000-0000-0000-0000-0000000000a1'
MSG_A2='d0000000-0000-0000-0000-0000000000a2'
MSG_B1='d0000000-0000-0000-0000-0000000000b1'
MSG_INEXISTENTE='99999999-9999-9999-9999-999999999999'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'
expect_value 'A.0 pre-condicao: ATILA NAO e membro do Time B (o cid que ele manda e de outra conversa)' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_B' AND profile_id='$P_ATILA';"

expect_ok_as 'A.1 (DEFEITO) ATILA grava recibo da mensagem do Time A declarando o cid do Time B' \
  "$ATILA" "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at, conversation_id) VALUES ('$MSG_A1','$P_ATILA','delivered',now(),NULL,'$CONV_B');"
expect_value 'A.2 (DEFEITO) a linha ficou com o cid DO CLIENTE (Time B), nao o da mensagem' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A1' AND profile_id='$P_ATILA' AND conversation_id='$CONV_B';"
expect_value_as 'A.3 (DEFEITO) BETO, membro SO do Time B, le o recibo de uma mensagem do Time A dentro do Time B' \
  "$MSG_A1" "$BETO" \
  "SELECT message_id::text FROM public.team_message_receipts WHERE conversation_id='$CONV_B';"

expect_value_as 'A.4 (DEFEITO, outro lado) o proprio ATILA NAO ve o recibo que acabou de gravar (a leitura e por cid)' \
  '0' "$ATILA" "SELECT count(*) FROM public.team_message_receipts;"

# Sem RLS: o UPDATE exercita o TRIGGER (que é o contrato em questão) e isola o barulho da leitura por cid
# — no estado anterior a linha nem é visível para o próprio autor.
expect_ok 'A.5 (DEFEITO) UPDATE trocando message_id passa e o trigger (so INSERT) nao re-deriva o cid' \
  "UPDATE public.team_message_receipts SET message_id='$MSG_A2', status='read', read_at=now() WHERE message_id='$MSG_A1' AND profile_id='$P_ATILA';"
expect_value 'A.6 (DEFEITO) depois do UPDATE o recibo aponta para outra mensagem e segue com o cid do cliente' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A2' AND profile_id='$P_ATILA' AND conversation_id='$CONV_B';"

expect_ok_as 'A.7 (DEFEITO) ATILA reage a mensagem do Time A declarando o cid do Time B (reacao nao tem trigger)' \
  "$ATILA" "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_A1','$P_ATILA',':+1:','$CONV_B');"
expect_value 'A.8 (DEFEITO) a reacao ficou no Time B' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE conversation_id='$CONV_B';"
expect_value 'A.9 (DEFEITO) e sumiu da conversa da propria mensagem (agregacao/realtime filtram por cid)' '0' \
  "SELECT count(*) FROM public.team_message_reactions WHERE conversation_id='$CONV_A';"

# Recusa do refazer: existe trigger BEFORE UPDATE em recibos que preencheria read_at quando status='read'.
# Este recibo legado divergente precisa ter APENAS o conversation_id reconciliado pelo backfill; read_at NULL
# deve continuar NULL para a migration nao alterar dado fora do objetivo do cartao.
expect_ok 'A.10 pre-condicao: prepara recibo legado divergente status=read com read_at NULL' \
  "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at, conversation_id) VALUES ('$MSG_B1','$P_ATILA','read',now(),NULL,'$CONV_A');"
expect_value 'A.11 pre-condicao: recibo legado diverge e read_at segue NULL antes da migration' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_B1' AND profile_id='$P_ATILA' AND status='read' AND read_at IS NULL AND conversation_id='$CONV_A';"

printf '\n============ BLOCO B — migration aplicada ============\n'
if [[ "${TEAM_CID_PRESTATE:-0}" = "1" ]]; then
  printf '>>> TEAM_CID_PRESTATE=1: bloco B roda SEM aplicar a migration (prova do vermelho)\n'
else
  psql_file "$migration" >/dev/null
fi

if [[ "${TEAM_CID_PRESTATE:-0}" = "1" ]]; then
  printf '>>> TEAM_CID_PRESTATE=1: bloco B roda SEM aplicar a migration (prova do vermelho); o backfill (B.0/B.0b) fica de fora porque e efeito da migration\n'
else
  expect_value 'B.0 o backfill da migration reconciliou as linhas divergentes do bloco A' '0' \
    "SELECT count(*) FROM (SELECT r.id FROM public.team_message_receipts r JOIN public.team_messages m ON m.id = r.message_id WHERE r.conversation_id IS DISTINCT FROM m.conversation_id UNION ALL SELECT r.id FROM public.team_message_reactions r JOIN public.team_messages m ON m.id = r.message_id WHERE r.conversation_id IS DISTINCT FROM m.conversation_id) x;"
  expect_value 'B.0b o recibo do Time A voltou para o Time A' '1' \
    "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A2' AND profile_id='$P_ATILA' AND conversation_id='$CONV_A';"
  expect_value 'B.0c o backfill preservou read_at NULL em recibo legado status=read' '1' \
    "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_B1' AND profile_id='$P_ATILA' AND conversation_id='$CONV_B' AND status='read' AND read_at IS NULL;"
fi

psql_file "$tmp_dir/seed.sql" >/dev/null

expect_ok_as 'B.1 (CORRIGIDO) o mesmo INSERT do A.1 passa e o cid vira o da MENSAGEM' \
  "$ATILA" "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at, conversation_id) VALUES ('$MSG_A1','$P_ATILA','delivered',now(),NULL,'$CONV_B');"
expect_value 'B.2 (CORRIGIDO) o cid gravado e o da conversa da mensagem, nao o que o cliente mandou' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A1' AND profile_id='$P_ATILA' AND conversation_id='$CONV_A';"
expect_value_as 'B.3 (CORRIGIDO) BETO nao ve mais recibo nenhum dentro do Time B' '0' "$BETO" \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B';"
expect_value_as 'B.4 caminho legitimo: DORA le o recibo dentro do Time A' '1' "$DORA" \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_A';"

expect_ok_as 'B.5 (CORRIGIDO) UPDATE que troca message_id E mente no cid e aceito com o cid re-derivado' \
  "$ATILA" "UPDATE public.team_message_receipts SET message_id='$MSG_A2', status='read', read_at=now(), conversation_id='$CONV_B' WHERE message_id='$MSG_A1' AND profile_id='$P_ATILA';"
expect_value 'B.6 (CORRIGIDO) o recibo segue a mensagem nova (Time A)' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A2' AND profile_id='$P_ATILA' AND conversation_id='$CONV_A';"

expect_ok_as 'B.7 (CORRIGIDO) reacao com cid errado passa e e gravada no Time A' \
  "$ATILA" "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_A1','$P_ATILA',':+1:','$CONV_B');"
expect_value 'B.8 (CORRIGIDO) a reacao esta na conversa da mensagem' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE conversation_id='$CONV_A';"
expect_value 'B.9 (CORRIGIDO) e nao na conversa que o cliente declarou' '0' \
  "SELECT count(*) FROM public.team_message_reactions WHERE conversation_id='$CONV_B';"

expect_ok_as 'B.10 caminho legitimo (hook): upsert do recibo com o cid da propria conversa' \
  "$ATILA" "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at, conversation_id) VALUES ('$MSG_A1','$P_ATILA','read',now(),now(),'$CONV_A') ON CONFLICT (message_id, profile_id) DO UPDATE SET status='read', read_at=now();"
expect_value 'B.11 o upsert nao duplicou nem mudou de conversa' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_A1' AND profile_id='$P_ATILA' AND conversation_id='$CONV_A' AND status='read';"

expect_error 'B.12 mensagem inexistente e RECUSADA em vez de gravar cid adivinhado (recibos)' \
  'conversation_id_required' \
  "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at, conversation_id) VALUES ('$MSG_INEXISTENTE','$P_ATILA','delivered',now(),NULL,'$CONV_A');"
expect_error_as 'B.13 o mesmo vale para reacao (a guarda vale para o caminho autenticado)' \
  'conversation_id_required' "$ATILA" \
  "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_INEXISTENTE','$P_ATILA',':+1:','$CONV_A');"
expect_value 'B.14 nada foi gravado com o cid adivinhado' '0' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='$MSG_INEXISTENTE';"

# Item 2 do critério de pronto (recusa do refazer): as duas são funções de TRIGGER, então nenhum
# papel de cliente (authenticated/anon/PUBLIC) tem EXECUTE DIRETO nelas — nem herdado de PUBLIC.
# `proacl` NULL significa "privilegio padrao do schema" (que inclui EXECUTE para PUBLIC), por isso
# o coalesce com acldefault('f', ...): sem ele um GRANT implicito passaria batido.
# A prova de que remover o EXECUTE NÃO quebra o disparo são os próprios B.1/B.5/B.7 acima, que
# inserem/atualizam como `authenticated` e têm o cid derivado pelo trigger.
expect_value 'B.15 (ACL) authenticated/anon/PUBLIC sem EXECUTE direto na funcao de trigger de recibos' '0' \
  "SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'team_receipts_fill_conversation_id' AND a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated'));"
expect_value 'B.16 (ACL) authenticated/anon/PUBLIC sem EXECUTE direto na funcao de trigger de reacoes' '0' \
  "SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'team_reactions_force_conversation_id' AND a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated'));"
# Nao-vacuidade: as duas funcoes existem e o dono continua com EXECUTE (o REVOKE nao as zerou).
expect_value 'B.17 (ACL) as duas funcoes existem e o dono mantem EXECUTE' '2' \
  "SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('team_receipts_fill_conversation_id','team_reactions_force_conversation_id') AND a.privilege_type = 'EXECUTE' AND pg_get_userbyid(a.grantee) = 'postgres';"

printf '\nPASS: item 164 / TC-009 — recibos e reacoes passam a derivar conversation_id da PROPRIA mensagem (INSERT e UPDATE), linha divergente e reconciliada pelo backfill, mensagem inexistente e recusada, o caminho legitimo (cid da conversa da mensagem) segue intacto e as duas funcoes de trigger seguem SEM EXECUTE para authenticated/anon/PUBLIC.%s\n' \
  "$([[ "${TEAM_CID_PRESTATE:-0}" = "1" ]] && printf ' [rodado com TEAM_CID_PRESTATE=1: o trecho acima NAO e o esperado sem a migration]' || true)"
