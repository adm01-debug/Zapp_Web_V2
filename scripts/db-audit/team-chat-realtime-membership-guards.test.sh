#!/usr/bin/env bash
# Prova, em PostgreSQL descartável (docker), a correção do item `team-chat-realtime-politicas`
# (SLUG team-chat-realtime-politicas). Três defeitos confirmados por consulta ao banco local
# (pg_publication_tables / pg_class.relreplident / pg_policies) e aqui reproduzidos e fechados:
#   1) `team_message_reactions` NÃO estava na publicação `supabase_realtime` embora
#      `useTeamMessageReactions` assine `postgres_changes` com filtro `conversation_id=eq.<id>`.
#   2) `team_messages` e `team_message_reactions` estavam com REPLICA IDENTITY DEFAULT (`d`):
#      com DEFAULT o WAL do DELETE/UPDATE registra só a chave primária. FULL é o que o BLOCO D
#      prova — o WAL do DELETE passa a carregar a linha antiga com `conversation_id`.
#      LIMITE do Realtime (mesmo do relato, ponto 4), para nao prometer mais do que a correcao
#      entrega: com RLS ligada o Supabase Realtime manda no DELETE SOMENTE a chave primaria e
#      NAO filtra evento de DELETE — nenhuma REPLICA IDENTITY muda esse contrato. O painel
#      reage ao evento sem ler o payload: `src/hooks/team-chat/useTeamMessages.ts` e
#      `src/hooks/team-chat/useTeamMessageReactions.ts` so chamam `invalidateQueries` e refazem
#      a consulta por `conversationId` (no maximo um refetch a mais, nunca dado errado).
#   3) UPDATE (`team_messages_update_own`) e DELETE ("Senders can delete own messages") de
#      `team_messages` só checavam o remetente: um EX-MEMBRO continuava editando e apagando as
#      próprias mensagens na conversa de que saiu.
#   4) `team_message_reactions` tinha DUAS policies de SELECT e DUAS de DELETE somando por OR.
#
# Roteiro: BLOCO A reproduz o estado ANTERIOR (defeito), BLOCO B aplica a migration e prova o
# fechamento com controle positivo (membro segue editando/apagando o que é dele), e BLOCO C
# executa a própria linha `-- Rollback:` da migration e confirma que ela restaura o estado.
#
# Pre-estado fiel das policies de `team_messages` e `team_message_reactions` (as que a migration
# troca/remove), medido no banco local desta tarefa (2026-10-14). `team_conversations` entra como
# dependência de FK e com as QUATRO policies que ela tem no banco local desta tarefa, medidas por
# `pg_policies` em 2026-10-16 (SELECT de membro/criador, INSERT autenticado, DELETE do
# criador/admin e UPDATE do criador) — a migration não a toca. B.31–B.33 refinam essa fixture;
# quem mede team_conversations direto no banco é o relato (ponto 5 da recusa).
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261014101843_team_chat_realtime_reactions_membership_guards.sql"
postgres_image="${TEAM_REALTIME_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-realtime-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-realtime-test-[0-9]+$ && "${TEAM_REALTIME_TEST_KEEP:-0}" != "1" ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s
' "$1" >&2; exit 1; }

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
  printf '[PASS] %s
' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s
' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\
' "$l"; }
expect_grep_count() { local l="$1" e="$2" p="$3" f="$4" g; g="$(grep -c "$p" "$f" || true)"; [[ "$g" == "$e" ]] || fail "$l: esperado '$e', obtido '$g' (arquivo $f)"; printf '[PASS] %s\
' "$l"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==
' "$container_name" "$postgres_image"
# Ponto 3 da recusa: o container sobe com WAL logico para a prova do BLOCO D
# (slot test_decoding mostra o old tuple do DELETE antes e depois da migration).
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" \
  -c wal_level=logical >/dev/null

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
  member_role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'delivered',
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  UNIQUE (message_id, profile_id)
);
CREATE TABLE public.team_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  CONSTRAINT team_message_reactions_unique UNIQUE (message_id, profile_id, emoji),
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
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor'))
  $function$;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id
    );
  $function$;

-- Gatilhos reais de team_message_reactions (e32 + 20261006222024).
CREATE OR REPLACE FUNCTION public.team_reactions_dedup_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_message_reactions
              WHERE message_id = NEW.message_id AND profile_id = NEW.profile_id AND emoji = NEW.emoji) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.team_reactions_force_conversation_id() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
BEGIN
  SELECT tm.conversation_id INTO NEW.conversation_id FROM public.team_messages tm WHERE tm.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Publicação de Realtime com o ESTADO ANTERIOR: 4 membros, `team_message_reactions` de fora.
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.team_conversations,
  public.team_conversation_members,
  public.team_messages,
  public.team_message_receipts;

ALTER TABLE public.team_conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_receipts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_reactions     ENABLE ROW LEVEL SECURITY;

-- team_conversations (dependencia) — as 4 policies vigentes, medidas no banco local
-- desta tarefa por pg_policies em 2026-10-16.
CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "Conversation creator or admin can delete" ON public.team_conversations FOR DELETE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY team_conversations_update_own ON public.team_conversations FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id())
  WITH CHECK (created_by = public.current_profile_id());

-- team_conversation_members (dependencia): as 4 policies vigentes. A de SELECT importa — a policy de
-- SELECT de team_message_reactions faz um JOIN em team_conversation_members, e esse subselect TAMBEM
-- passa pela RLS da tabela: sem policy aqui, o membro nao enxergaria reacao nenhuma.
CREATE POLICY "Members and admins can view conversation members" ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Members and admins can add conversation members" ON public.team_conversation_members FOR INSERT TO authenticated
  WITH CHECK (public.is_team_conversation_member(auth.uid(), conversation_id) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Members can leave or admins can remove" ON public.team_conversation_members FOR DELETE TO authenticated
  USING (profile_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
         OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Members can update own row admins can update any" ON public.team_conversation_members FOR UPDATE TO authenticated
  USING (profile_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
         OR public.is_admin_or_supervisor(auth.uid()));

-- team_messages — as 4 policies vigentes (medidas em pg_policies, 2026-10-14).
CREATE POLICY "Members can view conversation messages" ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY "Members can send messages" ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_conversation_member(auth.uid(), conversation_id)
    AND sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1)
  );
CREATE POLICY team_messages_update_own ON public.team_messages FOR UPDATE TO authenticated
  USING (sender_id = public.current_profile_id())
  WITH CHECK (sender_id = public.current_profile_id());
CREATE POLICY "Senders can delete own messages" ON public.team_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));

-- team_message_reactions — as 5 policies vigentes, com as DUAS duplicatas de SELECT e de DELETE.
CREATE POLICY team_message_reactions_select ON public.team_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_messages tm
    JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tm.id = team_message_reactions.message_id AND p.user_id = auth.uid()));
CREATE POLICY reactions_select ON public.team_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.team_messages tm ON tm.id = team_message_reactions.message_id
    WHERE tcm.conversation_id = tm.conversation_id AND tcm.profile_id = public.current_profile_id()));
CREATE POLICY team_message_reactions_insert ON public.team_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.team_messages tm
                 WHERE tm.id = team_message_reactions.message_id
                   AND public.is_team_conversation_member(auth.uid(), tm.conversation_id))
  );
CREATE POLICY team_message_reactions_delete ON public.team_message_reactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid()));
CREATE POLICY reactions_delete ON public.team_message_reactions FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE TRIGGER team_reactions_dedup_trig BEFORE INSERT ON public.team_message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.team_reactions_dedup_guard();
CREATE TRIGGER team_reactions_force_conversation_id_trig BEFORE INSERT OR UPDATE ON public.team_message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.team_reactions_force_conversation_id();

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_message_reactions TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_message_reactions;
DELETE FROM public.team_message_receipts;
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- ANA: membro do Time A e autora da propria mensagem (caminho legitimo).
-- PEDRO: membro do Time A, autor de outra mensagem, e DEPOIS removido (vira EX-MEMBRO).
-- BETO: nao participa de conversa nenhuma (controle externo).
-- MARIA: ADMIN (user_roles) que NAO participa do Time A (ponto 1 da recusa).
INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'agent', true),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'agent', true),
  ('f0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'agent', true);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('44444444-4444-4444-4444-444444444444', 'admin');

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'mensagem da ANA'),
  ('d0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'mensagem do PEDRO');

INSERT INTO public.team_message_reactions (message_id, profile_id, emoji) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'joinha'),
  ('d0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'coracao');

-- PEDRO sai do Time A: passa a ser EX-MEMBRO com mensagem antiga na conversa.
DELETE FROM public.team_conversation_members
 WHERE conversation_id = 'e0000000-0000-0000-0000-00000000000a'
   AND profile_id = 'b0000000-0000-0000-0000-000000000001';
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

JWT_ANA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
JWT_PEDRO='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
JWT_BETO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
JWT_MARIA='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
PERFIL_ANA='a0000000-0000-0000-0000-000000000001'
PERFIL_PEDRO='b0000000-0000-0000-0000-000000000001'
CONV_A='e0000000-0000-0000-0000-00000000000a'
MSG_ANA='d0000000-0000-0000-0000-00000000000a'
MSG_PEDRO='d0000000-0000-0000-0000-00000000000b'

printf '
============ BLOCO A — estado ANTERIOR (defeitos) ============
'
expect_value 'A.0 pre-condicao: PEDRO NAO e mais membro do Time A' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_PEDRO';"
expect_value 'A.1 (DEFEITO) team_message_reactions fora da publicacao supabase_realtime' '0' \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='team_message_reactions';"
expect_value 'A.2 (DEFEITO) REPLICA IDENTITY DEFAULT nas duas tabelas' '2' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('team_messages','team_message_reactions') AND c.relreplident='d';"
expect_value 'A.3 (DEFEITO) duas policies de SELECT em team_message_reactions' '2' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='SELECT';"
expect_value 'A.4 (DEFEITO) duas policies de DELETE em team_message_reactions' '2' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='DELETE';"

expect_value 'A.5 pre-condicao: so existe UMA policy de SELECT em team_messages' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND cmd='SELECT';"

# DEFEITO LATENTE (item 3 do cartao). O UPDATE/DELETE de team_messages nao checa vinculo nenhum:
# hoje o ex-membro e barrado de fato apenas porque a policy de SELECT esconde a linha. Basta uma
# leitura mais ampla (simulada aqui por `tmp_leitura_ampliada`) para o ex-membro voltar a mexer na
# mensagem antiga — os dois comandos nao tem trava propria.
psql_sql "CREATE POLICY tmp_leitura_ampliada ON public.team_messages FOR SELECT TO authenticated USING (id = '$MSG_PEDRO');" >/dev/null
expect_ok_as 'A.6 (DEFEITO LATENTE) com a leitura ampliada, EX-MEMBRO PEDRO edita a propria mensagem antiga' \
  "$JWT_PEDRO" "UPDATE public.team_messages SET content='editada pelo ex-membro' WHERE id='$MSG_PEDRO';"
expect_value 'A.7 (DEFEITO LATENTE) e a edicao passou — o UPDATE nao tem trava de vinculo propria' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo ex-membro';"
expect_ok_as 'A.8 (DEFEITO LATENTE) com a leitura ampliada, EX-MEMBRO PEDRO apaga a propria mensagem antiga' \
  "$JWT_PEDRO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'A.9 (DEFEITO LATENTE) e a mensagem sumiu — o DELETE tambem nao tem trava propria' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"
psql_sql "DROP POLICY tmp_leitura_ampliada ON public.team_messages;" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# Com a leitura canonica (a vigente), o ex-membro nem ve a linha: por isso nao edita nem apaga.
expect_ok_as 'A.10 hoje o EX-MEMBRO nao edita (a linha nem aparece para ele)' \
  "$JWT_PEDRO" "UPDATE public.team_messages SET content='editada pelo ex-membro' WHERE id='$MSG_PEDRO';"
expect_value 'A.11 e nada mudou sob a leitura canonica' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo ex-membro';"
expect_ok_as 'A.12 hoje o EX-MEMBRO nao apaga (idem)' \
  "$JWT_PEDRO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'A.13 e a mensagem continua la sob a leitura canonica' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"

# Ponto 1 da recusa (ANTES): ADMIN nao-membro e outro usuario nao editam nem apagam.
expect_ok_as 'A.14 (ANTES) ADMIN MARIA nao-membro tenta editar mensagem alheia' \
  "$JWT_MARIA" "UPDATE public.team_messages SET content='editada pela admin' WHERE id='$MSG_PEDRO';"
expect_value 'A.15 (ANTES) nada mudou — a RLS barrou a admin nao-membro' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pela admin';"
expect_ok_as 'A.16 (ANTES) ADMIN MARIA nao-membro tenta apagar mensagem alheia' \
  "$JWT_MARIA" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'A.17 (ANTES) a mensagem continua la — a admin nao-membro nao apagou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_ok_as 'A.18 (ANTES) BETO (outro usuario) tenta editar mensagem alheia' \
  "$JWT_BETO" "UPDATE public.team_messages SET content='editada pelo beto' WHERE id='$MSG_PEDRO';"
expect_value 'A.19 (ANTES) nada mudou — a RLS barrou o outro usuario' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo beto';"
expect_ok_as 'A.20 (ANTES) BETO (outro usuario) tenta apagar mensagem alheia' \
  "$JWT_BETO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'A.21 (ANTES) a mensagem continua la — o outro usuario nao apagou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"

# Ponto 2 da recusa (ANTES, policies duplicadas): comportamento da policy de DELETE
# de reacao — serve de linha de base para provar mesma semantica no BLOCO B.
# Mecanismo medido (EXPLAIN do DELETE): o Postgres avalia as policies de SELECT
# para achar a linha E as de USING para apagar; sem leitura o ex-membro nao apaga.
expect_ok_as 'A.22 (ANTES) ANA apaga a PROPRIA reacao' \
  "$JWT_ANA" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_ANA' AND profile_id='$PERFIL_ANA' AND emoji='joinha';"
expect_value 'A.23 (ANTES) a reacao propria da ANA sumiu' '0' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_ANA' AND profile_id='$PERFIL_ANA' AND emoji='joinha';"
expect_ok_as 'A.24 (ANTES) ANA tenta apagar a reacao do PEDRO' \
  "$JWT_ANA" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_value 'A.25 (ANTES) a reacao do PEDRO continua la — dona nao apaga a alheia' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_ok_as 'A.26 (ANTES) EX-MEMBRO PEDRO tenta apagar a propria reacao antiga' \
  "$JWT_PEDRO" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_value 'A.27 (ANTES) a reacao antiga continua la — sem leitura via SELECT o ex-membro nao apaga nem a propria' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"

printf '
============ BLOCO B — migration aplicada ============
'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_value 'B.1 (CORRIGIDO) team_message_reactions entrou na publicacao supabase_realtime' '1' \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='team_message_reactions';"
expect_value 'B.2 (CORRIGIDO) REPLICA IDENTITY FULL nas duas tabelas' '2' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('team_messages','team_message_reactions') AND c.relreplident='f';"
expect_value 'B.3 (CORRIGIDO) uma policy por comando em team_message_reactions: SELECT' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='SELECT';"
expect_value 'B.4 (CORRIGIDO) uma policy por comando em team_message_reactions: DELETE' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='DELETE';"
expect_value 'B.5 (CORRIGIDO) a policy de INSERT da reacao segue existindo (nao foi tocada)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='INSERT';"

expect_ok_as 'B.6 (CORRIGIDO) EX-MEMBRO PEDRO tenta editar a propria mensagem antiga' \
  "$JWT_PEDRO" "UPDATE public.team_messages SET content='editada pelo ex-membro' WHERE id='$MSG_PEDRO';"
expect_value 'B.7 (CORRIGIDO) nada foi editado — a RLS barrou o EX-MEMBRO' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo ex-membro';"
expect_ok_as 'B.8 (CORRIGIDO) EX-MEMBRO PEDRO tenta apagar a propria mensagem antiga' \
  "$JWT_PEDRO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'B.9 (CORRIGIDO) a mensagem continua la — o EX-MEMBRO nao apagou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"

# A trava agora mora no proprio UPDATE/DELETE: nem com a leitura ampliada (mesmo cenario do A.6) o
# ex-membro passa. Antes da migration, esse mesmo cenario editava e apagava (A.7/A.9).
psql_sql "CREATE POLICY tmp_leitura_ampliada ON public.team_messages FOR SELECT TO authenticated USING (id = '$MSG_PEDRO');" >/dev/null
expect_ok_as 'B.10 (CORRIGIDO) mesmo com a leitura ampliada, EX-MEMBRO PEDRO nao edita' \
  "$JWT_PEDRO" "UPDATE public.team_messages SET content='editada pelo ex-membro' WHERE id='$MSG_PEDRO';"
expect_value 'B.11 (CORRIGIDO) o UPDATE agora tem trava de vinculo propria — nao editou' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo ex-membro';"
expect_ok_as 'B.12 (CORRIGIDO) mesmo com a leitura ampliada, EX-MEMBRO PEDRO nao apaga' \
  "$JWT_PEDRO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'B.13 (CORRIGIDO) o DELETE agora tem trava de vinculo propria — a mensagem continua' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"
psql_sql "DROP POLICY tmp_leitura_ampliada ON public.team_messages;" >/dev/null

expect_value_as 'B.14 membro ANA ve as DUAS reacoes da conversa' '2' "$JWT_ANA" \
  "SELECT count(*) FROM public.team_message_reactions;"
expect_value_as 'B.15 de fora, BETO nao ve reacao nenhuma (RLS segue barrando)' '0' "$JWT_BETO" \
  "SELECT count(*) FROM public.team_message_reactions;"
expect_ok_as 'B.16 membro ANA ainda reage (a dedupe e a forca de conversation_id seguem de pe)' \
  "$JWT_ANA" "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji) VALUES ('$MSG_PEDRO','$PERFIL_ANA','nova');"
expect_value 'B.17 a reacao da ANA foi gravada com conversation_id preenchido pelo gatilho' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_ANA' AND conversation_id='$CONV_A';"
expect_value_as 'B.18 ex-membro PEDRO nao ve reacao nenhuma (mesma trava de vinculo)' '0' "$JWT_PEDRO" \
  "SELECT count(*) FROM public.team_message_reactions;"

expect_ok_as 'B.19 controle positivo: membro ANA edita a PROPRIA mensagem' \
  "$JWT_ANA" "UPDATE public.team_messages SET content='editada pela propria autora' WHERE id='$MSG_ANA';"
expect_value 'B.20 a edicao legitima da autora gravou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_ANA' AND content='editada pela propria autora';"
expect_ok_as 'B.21 controle positivo: membro ANA apaga a PROPRIA mensagem' \
  "$JWT_ANA" "DELETE FROM public.team_messages WHERE id='$MSG_ANA';"
expect_value 'B.22 a exclusao legitima da autora efetivou' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_ANA';"

# Ponto 1 da recusa (DEPOIS): ADMIN nao-membro e outro usuario seguem sem editar nem
# apagar mensagem alheia (a migration nao deu poder a ninguem — so tirou do ex-membro).
expect_ok_as 'B.23 (DEPOIS) ADMIN MARIA nao-membro tenta editar mensagem alheia' \
  "$JWT_MARIA" "UPDATE public.team_messages SET content='editada pela admin' WHERE id='$MSG_PEDRO';"
expect_value 'B.24 (DEPOIS) nada mudou — a RLS barrou a admin nao-membro' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pela admin';"
expect_ok_as 'B.25 (DEPOIS) ADMIN MARIA nao-membro tenta apagar mensagem alheia' \
  "$JWT_MARIA" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'B.26 (DEPOIS) a mensagem continua la — a admin nao-membro nao apagou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_ok_as 'B.27 (DEPOIS) BETO (outro usuario) tenta editar mensagem alheia' \
  "$JWT_BETO" "UPDATE public.team_messages SET content='editada pelo beto' WHERE id='$MSG_PEDRO';"
expect_value 'B.28 (DEPOIS) nada mudou — a RLS barrou o outro usuario' '0' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO' AND content='editada pelo beto';"
expect_ok_as 'B.29 (DEPOIS) BETO (outro usuario) tenta apagar mensagem alheia' \
  "$JWT_BETO" "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
expect_value 'B.30 (DEPOIS) a mensagem continua la — o outro usuario nao apagou' '1' \
  "SELECT count(*) FROM public.team_messages WHERE id='$MSG_PEDRO';"

# Ponto 5 da recusa (so relato, medido aqui): team_conversations nao e tocada pela
# migration — publicacao, REPLICA IDENTITY e policies seguem as vigentes.
expect_value 'B.31 team_conversations esta na publicacao supabase_realtime' '1' \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='team_conversations';"
expect_value 'B.32 team_conversations segue com REPLICA IDENTITY DEFAULT (a migration nao a toca)' '1' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='team_conversations' AND c.relreplident='d';"
expect_value 'B.33 team_conversations tem 4 policies (SELECT de membro/criador, INSERT autenticado, DELETE do criador/admin e UPDATE do criador)' '4' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_conversations';"

# Ponto 2 da recusa (DEPOIS, policy unica): mesma semantica do A.22-A.27 — a dona
# apaga a propria, nao apaga a do outro, e o ex-membro nao apaga nem a propria
# antiga (sem leitura via SELECT a linha nem chega ao USING). Reseed para voltar
# ao estado da semente.
psql_file "$tmp_dir/seed.sql" >/dev/null
expect_ok_as 'B.34 (DEPOIS) ANA apaga a PROPRIA reacao' \
  "$JWT_ANA" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_ANA' AND profile_id='$PERFIL_ANA' AND emoji='joinha';"
expect_value 'B.35 (DEPOIS) a reacao propria da ANA sumiu' '0' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_ANA' AND profile_id='$PERFIL_ANA' AND emoji='joinha';"
expect_ok_as 'B.36 (DEPOIS) ANA tenta apagar a reacao do PEDRO' \
  "$JWT_ANA" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_value 'B.37 (DEPOIS) a reacao do PEDRO continua la — dona nao apaga a alheia' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_ok_as 'B.38 (DEPOIS) EX-MEMBRO PEDRO tenta apagar a propria reacao antiga' \
  "$JWT_PEDRO" "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
expect_value 'B.39 (DEPOIS) a reacao antiga continua la — sem leitura o ex-membro nao apaga nem a propria (igual ao ANTES)' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"

printf '
============ BLOCO C — rollback da propria migration ============
'
rollback_sql="$(grep -Ei '^--[[:space:]]+(create|drop|alter) ' "$migration" | sed -E 's/^--[[:space:]]+//')"
[[ -n "$rollback_sql" ]] || fail 'o cabecalho -- Rollback: da migration nao tem SQL executavel'
printf '%s
' "$rollback_sql" | docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null \
  || fail 'as instrucoes de -- Rollback: nao rodaram'

expect_value 'C.1 rollback tirou team_message_reactions da publicacao' '0' \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='team_message_reactions';"
expect_value 'C.2 rollback devolveu REPLICA IDENTITY DEFAULT nas duas tabelas' '2' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('team_messages','team_message_reactions') AND c.relreplident='d';"
expect_value 'C.3 rollback recriou as duas policies de SELECT duplicadas' '2' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='SELECT';"
expect_value 'C.4 rollback recriou as duas policies de DELETE duplicadas' '2' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='DELETE';"
expect_value 'C.5 rollback restaurou a policy de UPDATE de team_messages (so o remetente)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_messages' AND policyname='team_messages_update_own' AND qual='(sender_id = current_profile_id())';"

printf '
============ BLOCO D — WAL logico: old tuple do DELETE (ponto 3) ============
'

# O container subiu com wal_level=logical: o slot test_decoding enxerga o old tuple
# do DELETE. ANTES (pos-rollback = REPLICA IDENTITY DEFAULT) so vem a PK;
# DEPOIS (migration = FULL) vem a linha antiga com conversation_id.
# test_decoding e output plugin de decodificacao logica (nao aparece em
# pg_available_extensions): a prova de disponibilidade e criar e remover um slot.
psql_sql "SELECT pg_create_logical_replication_slot('wal_probe','test_decoding');" >/dev/null \
  || fail 'D.0 plugin test_decoding indisponivel no postgres do teste'
psql_sql "SELECT pg_drop_replication_slot('wal_probe');" >/dev/null
printf '[PASS] D.0 plugin test_decoding disponivel (slot de prova criado e removido)
'

slot_dump() { # $1 slot | descarrega e consome as mudancas do slot (stdout)
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SELECT pg_logical_slot_get_changes('$1', NULL, NULL);"
}

# --- ANTES: estado pos-rollback (DEFAULT), reseed, slot, deletes como superuser.
psql_file "$tmp_dir/seed.sql" >/dev/null
psql_sql "SELECT pg_create_logical_replication_slot('wal_antes','test_decoding');" >/dev/null
psql_sql "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
psql_sql "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
slot_dump wal_antes > "$tmp_dir/wal_antes.txt"
psql_sql "SELECT pg_drop_replication_slot('wal_antes');" >/dev/null
expect_grep_count 'D.1 (ANTES) DELETE de team_messages capturado no slot' '1' \
  'table public.team_messages: DELETE:' "$tmp_dir/wal_antes.txt"
expect_grep_count 'D.2 (ANTES) DELETE de team_messages traz SO a PK (sem conversation_id)' '0' \
  'table public.team_messages: DELETE:.*conversation_id' "$tmp_dir/wal_antes.txt"
expect_grep_count 'D.3 (ANTES) DELETE de team_message_reactions traz SO a PK (sem conversation_id)' '0' \
  'table public.team_message_reactions: DELETE:.*conversation_id' "$tmp_dir/wal_antes.txt"

# --- DEPOIS: reaplica a migration (FULL), reseed, slot, mesmos deletes.
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null
psql_sql "SELECT pg_create_logical_replication_slot('wal_depois','test_decoding');" >/dev/null
psql_sql "DELETE FROM public.team_message_reactions WHERE message_id='$MSG_PEDRO' AND profile_id='$PERFIL_PEDRO' AND emoji='coracao';"
psql_sql "DELETE FROM public.team_messages WHERE id='$MSG_PEDRO';"
slot_dump wal_depois > "$tmp_dir/wal_depois.txt"
psql_sql "SELECT pg_drop_replication_slot('wal_depois');" >/dev/null
expect_grep_count 'D.4 (DEPOIS) DELETE de team_messages traz o old tuple COM conversation_id' '1' \
  'table public.team_messages: DELETE:.*conversation_id' "$tmp_dir/wal_depois.txt"
expect_grep_count 'D.5 (DEPOIS) DELETE de team_message_reactions traz o old tuple COM conversation_id' '1' \
  'table public.team_message_reactions: DELETE:.*conversation_id' "$tmp_dir/wal_depois.txt"
grep 'table public.team_messages: DELETE:' "$tmp_dir/wal_depois.txt"
grep 'table public.team_message_reactions: DELETE:' "$tmp_dir/wal_depois.txt"

printf '
PASS: team chat — realtime e politicas de participacao. team_message_reactions entra na publicacao `supabase_realtime` e as duas tabelas do painel recebem REPLICA IDENTITY FULL (o WAL do DELETE passa a carregar a linha antiga com conversation_id — provado no BLOCO D via slot logico; limite registrado no relato: o Supabase Realtime com RLS entrega no DELETE so a PK e nao filtra evento de DELETE, e os hooks do painel tratam isso com invalidate+refetch sem ler o payload); UPDATE/DELETE de team_messages ganham trava de vinculo propria (antes so a policy de SELECT barrava o ex-membro — provado nos dois cenarios, com e sem leitura ampliada, e contra admin nao-membro e outro usuario); as policies duplicadas de reacao viram uma por comando (dona apaga a propria, nao apaga a do outro, e o ex-membro nao apaga nem a propria antiga — sem leitura via SELECT, mesma semantica antes e depois); e a linha -- Rollback: da migration roda e restaura o estado anterior.
'
