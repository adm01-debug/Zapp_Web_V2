#!/usr/bin/env bash
# ONDA 2 - auditoria adversarial de SEGURANCA (Postgres) no cluster TEAM CHAT
# (migrations 20260929160000..20260929440000, E26..E51).
#
# 18 funcoes SECURITY DEFINER novas no dia, todas com EXECUTE para `authenticated`
# por RPC PostgREST. Em SECURITY DEFINER com dono = postgres, a RLS das tabelas
# team_* e ignorada dentro da funcao: o UNICO guard e o corpo da funcao.
# Este harness prova, por funcao, onde ha guard de fato e onde falta.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="zapp-w2-teamchat-seg-$$"
tmp_dir="$(mktemp -d /tmp/zapp-w2-teamchat-seg.XXXXXX)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-w2-teamchat-seg-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in /tmp/zapp-w2-teamchat-seg.*) rm -rf -- "$tmp_dir" ;; esac
}
trap cleanup EXIT INT TERM

docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=w2_fixture_only postgres:17-alpine >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || { echo 'FAIL: PostgreSQL de teste nao iniciou'; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
probe() {
  local label="$1" sql="$2" out st
  out="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; st=$?
  printf 'PROBE|%s|exit=%s|%s\n' "$label" "$st" "$(printf '%s' "$out" | tr '\n' '~' | cut -c1-4000)"
}

echo "### HARNESS ativo: cluster TEAM CHAT (E26..E51) - PostgreSQL 17 descartavel"

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'sem nome',
  email text, avatar_url text,
  role text DEFAULT 'agent' CHECK (role IN ('admin','supervisor','agent')),
  is_active boolean NOT NULL DEFAULT true,
  department_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct','group','department')),
  name text, avatar_url text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  department_id uuid REFERENCES public.departments(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  direct_member_a uuid REFERENCES public.profiles(id),
  direct_member_b uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_role text NOT NULL DEFAULT 'member',
  role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  reply_to_id uuid REFERENCES public.team_messages(id),
  media_url text, media_type text, media_bucket text, media_path text,
  is_edited boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'delivered' CHECK (status IN ('delivered','read')),
  delivered_at timestamptz DEFAULT now(), read_at timestamptz,
  conversation_id uuid REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  UNIQUE (message_id, profile_id)
);

-- Helpers vigentes antes do dia
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id=_user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT p.id FROM public.profiles p WHERE p.user_id=_user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_user_id AND p.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.team_conversation_members tcm JOIN public.profiles p ON p.id=tcm.profile_id
                       WHERE tcm.conversation_id=_conversation_id AND p.user_id=_user_id) $$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS
  $f$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $f$;

-- RLS: modelo de vinculo (espelha 20260402130912 + 20260928430000/480000/490000/570000/580000)
ALTER TABLE public.team_conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_receipts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tc_select_member ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id));
CREATE POLICY tc_insert_auth ON public.team_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY tc_update_own ON public.team_conversations FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id()) WITH CHECK (created_by = public.current_profile_id());
CREATE POLICY tc_delete_own_or_admin ON public.team_conversations FOR DELETE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id()
    OR EXISTS (SELECT 1 FROM public.team_conversation_members m2
               WHERE m2.conversation_id = team_conversation_members.conversation_id
                 AND m2.profile_id = public.current_profile_id()));
CREATE POLICY tcm_insert_member ON public.team_conversation_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_conversation_members m2
                      WHERE m2.conversation_id = team_conversation_members.conversation_id
                        AND m2.profile_id = public.current_profile_id())
           OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY tcm_update_own_prefs ON public.team_conversation_members FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY tcm_delete_own_or_admin ON public.team_conversation_members FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY tm_select_member ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY tm_insert_member ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_team_conversation_member(auth.uid(), conversation_id) AND sender_id = public.current_profile_id());
CREATE POLICY tm_update_own ON public.team_messages FOR UPDATE TO authenticated
  USING (sender_id = public.current_profile_id()) WITH CHECK (sender_id = public.current_profile_id());
CREATE POLICY tm_delete_own ON public.team_messages FOR DELETE TO authenticated
  USING (sender_id = public.current_profile_id());

CREATE POLICY tmr_select_member ON public.team_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_conversation_members tcm JOIN public.team_messages tm ON tm.id = team_message_reactions.message_id
                 WHERE tcm.conversation_id = tm.conversation_id AND tcm.profile_id = public.current_profile_id()));
CREATE POLICY tmr_insert_own ON public.team_message_reactions FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY tmr_delete_own ON public.team_message_reactions FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id());

CREATE POLICY tmrpt_select_member ON public.team_message_receipts FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY tmrpt_insert_own ON public.team_message_receipts FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.current_profile_id());
CREATE POLICY tmrpt_update_own ON public.team_message_receipts FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY prof_select_all ON public.profiles FOR SELECT TO authenticated USING (true);

-- Stubs que as migrations do dia tocam (comentario de tabela / COMMENT ON FUNCTION de legado)
CREATE TABLE public.department_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.department_invites   (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.department_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE PUBLICATION supabase_realtime;
CREATE FUNCTION public.get_team_conversation_previews() RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;
CREATE FUNCTION public.get_team_unread_counts() RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.is_admin_or_supervisor(uuid), public.current_profile_id(), public.is_team_conversation_member(uuid,uuid)
  TO authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

CREATE TRIGGER update_team_conversations_updated_at BEFORE UPDATE ON public.team_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_messages_updated_at BEFORE UPDATE ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dados: dois times isolados. A == {A1,A2} na conversa A; B == {B1} na conversa B.
INSERT INTO public.profiles (id, user_id, name, role, department_id) VALUES
  ('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a1','A1','agent',    '90000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000a2','20000000-0000-0000-0000-0000000000a2','A2','agent',    '90000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000a9','20000000-0000-0000-0000-0000000000a9','A9','admin',    '90000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000b1','B1','agent',    '90000000-0000-0000-0000-00000000000b');
INSERT INTO public.departments VALUES ('90000000-0000-0000-0000-00000000000a','Depto A'),
                                      ('90000000-0000-0000-0000-00000000000b','Depto B');
INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('40000000-0000-0000-0000-00000000000a','group','Grupo A','10000000-0000-0000-0000-0000000000a1'),
  ('40000000-0000-0000-0000-00000000000b','group','Grupo B','10000000-0000-0000-0000-0000000000b1');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, role, member_role) VALUES
  ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','owner','owner'),
  ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','member','member'),
  ('40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','owner','owner');
INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('50000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','mensagem secreta do grupo A'),
  ('50000000-0000-0000-0000-0000000000a2','40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','segunda mensagem do grupo A'),
  ('50000000-0000-0000-0000-0000000000a3','40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','terceira mensagem do grupo A'),
  ('50000000-0000-0000-0000-0000000000a4','40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','quarta mensagem do grupo A'),
  ('50000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','mensagem secreta do grupo B');
INSERT INTO public.team_conversations (id, type, name, created_by, department_id) VALUES
  ('40000000-0000-0000-0000-00000000000c','department','Canal Depto A','10000000-0000-0000-0000-0000000000a9','90000000-0000-0000-0000-00000000000a');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, role, member_role) VALUES
  ('40000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-0000000000a9','owner','owner');
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null || { echo 'FAIL: fixture pre nao aplicou'; exit 1; }

# Aplicacao das migrations do dia (E26..E51). Ordem lexicografica = ordem de ledger.
for m in \
  20260929160000_team_chat_e26_message_type_media_constraint \
  20260929170000_team_chat_e27_reply_to_self_ref_check \
  20260929180000_team_chat_e28_edit_guard_trigger \
  20260929190000_team_chat_e29_conversations_constraints \
  20260929200000_team_chat_e30_dept_conversation_constraints \
  20260929210000_team_chat_e31_conversation_members_constraints \
  20260929220000_team_chat_e32_reactions_hardening \
  20260929230000_team_chat_e33_receipts_consistency_check \
  20260929240000_team_chat_e34_drift_mirror_metadata_realtime \
  20260929250000_team_chat_e35_comment_on_tables \
  20260929260000_team_chat_e37_get_team_inbox_rpc \
  20260929270000_team_chat_e38_get_team_messages_page_rpc \
  20260929280000_team_chat_e39_mark_team_conversation_read_rpc \
  20260929290000_team_chat_e40_search_team_messages_rpc \
  20260929300000_team_chat_e41_toggle_team_reaction_rpc \
  20260929310000_team_chat_e42_set_team_member_pref_rpc \
  20260929320000_team_chat_e43_leave_team_group_rpc \
  20260929330000_team_chat_e44_remove_team_member_rpc \
  20260929400000_team_chat_e45_transfer_conversation_department_rpc \
  20260929410000_team_chat_e47_e48_e49_replica_identity_deprecated_comments_drop_dup_indexes \
  20260929430000_team_chat_e46_leave_remove_last_owner_promotion \
  20260929440000_team_chat_e51_receipts_conversation_id_not_null_trigger ; do
  if out="$(psql_file "$repo_root/supabase/migrations/$m.sql" 2>&1)"; then
    echo "APPLY|OK|$m"
  else
    echo "APPLY|FAIL|$m|$(printf '%s' "$out" | tr '\n' '~' | cut -c1-260)"
  fi
done

CONV_A='40000000-0000-0000-0000-00000000000a'
CONV_B='40000000-0000-0000-0000-00000000000b'
CONV_C='40000000-0000-0000-0000-00000000000c'
MSG_A='50000000-0000-0000-0000-00000000000a'
MSG_A2='50000000-0000-0000-0000-0000000000a2'
MSG_A3='50000000-0000-0000-0000-0000000000a3'
MSG_A4='50000000-0000-0000-0000-0000000000a4'
MSG_B='50000000-0000-0000-0000-00000000000b'
B1='20000000-0000-0000-0000-0000000000b1'
A1='20000000-0000-0000-0000-0000000000a1'
A9='20000000-0000-0000-0000-0000000000a9'
CLAIMS_B="SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$B1\"}';"
CLAIMS_A1="SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$A1\"}';"
CLAIMS_A9="SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"$A9\"}';"

echo "### [T1] INVENTARIO: SECURITY DEFINER / search_path / ACL das funcoes do dia"
probe 'acl_team_dia' "
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') definer=' || p.prosecdef ||
       ' cfg=' || COALESCE(array_to_string(p.proconfig,','),'<NULL>') ||
       ' acl=' || COALESCE(array_to_string(p.proacl::text[],'|'),'<NULL=default: PUBLIC EXECUTE>') ||
       ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') ||
       ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'team_messages_validate_reply_to','team_messages_edit_guard','team_reactions_dedup_guard',
 'team_receipts_no_own_sender','team_receipts_fill_conversation_id','find_or_create_direct_conversation',
 'get_team_inbox','get_team_messages_page','mark_team_conversation_read','search_team_messages',
 'toggle_team_reaction','set_team_member_pref','leave_team_group','remove_team_member',
 'transfer_team_conversation_department')
ORDER BY p.proname, 1"
probe 'acl_team_dia_resumo' "
SELECT count(*) || ' funcoes do dia; com anon=' || count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')) ||
       '; com proacl NULL=' || count(*) FILTER (WHERE p.proacl IS NULL) ||
       '; sem EXECUTE p/ anon e sem proacl NULL: nomes=' ||
       COALESCE(string_agg(p.proname, ',' ORDER BY p.proname) FILTER (WHERE NOT has_function_privilege('anon',p.oid,'EXECUTE') AND p.proacl IS NOT NULL), '-')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'team_messages_validate_reply_to','team_messages_edit_guard','team_reactions_dedup_guard',
 'team_receipts_no_own_sender','team_receipts_fill_conversation_id','find_or_create_direct_conversation',
 'get_team_inbox','get_team_messages_page','mark_team_conversation_read','search_team_messages',
 'toggle_team_reaction','set_team_member_pref','leave_team_group','remove_team_member',
 'transfer_team_conversation_department')"
probe 'search_path_de_cada_funcao_do_dia' "
SELECT string_agg(p.proname || '=>' || COALESCE(array_to_string(p.proconfig,','),'<NENHUM>'), ' ; ' ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'team_%' OR (n.nspname='public' AND p.proname IN
 ('find_or_create_direct_conversation','get_team_inbox','get_team_messages_page','mark_team_conversation_read',
  'search_team_messages','toggle_team_reaction','set_team_member_pref','leave_team_group','remove_team_member',
  'transfer_team_conversation_department','current_profile_id'))"

echo "### [T2] Baseline RLS: o que B1 (fora do grupo A) consegue ler direto"
probe 'b1_le_mensagens_grupo_a_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT count(*) FROM public.team_messages WHERE conversation_id='$CONV_A'"
probe 'b1_le_conversa_a_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT count(*) FROM public.team_conversations WHERE id='$CONV_A'"
probe 'b1_le_membros_a_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A'"

echo "### [T3] RPCs com guard de vinculo (deveriam recusar)"
probe 'get_team_messages_page_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT * FROM public.get_team_messages_page('$CONV_A')"
probe 'search_team_messages_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT * FROM public.search_team_messages('$CONV_A','secreta')"
probe 'set_team_member_pref_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.set_team_member_pref('$CONV_A', true)"
probe 'leave_team_group_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.leave_team_group('$CONV_A')"
probe 'remove_team_member_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.remove_team_member('$CONV_A','10000000-0000-0000-0000-0000000000a2')"
probe 'get_team_inbox_propria' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT conversation_id||'/'||conversation_name||'/membros='||member_count FROM public.get_team_inbox()"
probe 'get_team_inbox_nao_vaza_A' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT count(*) FROM public.get_team_inbox() WHERE conversation_id='$CONV_A'"

echo "### [T4] toggle_team_reaction: SEM guard de vinculo (IDOR de escrita)"
probe 'toggle_reaction_msg_alheia_B1' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.toggle_team_reaction('$MSG_A','x')"
probe 'reaction_gravada_por_B1' "SELECT count(*)||' reacao(es) em $MSG_A' FROM public.team_message_reactions WHERE message_id='$MSG_A'"
probe 'reaction_visivel_para_A1' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_A'"

echo "### [T5] toggle_team_reaction com message_id inexistente (oraculo de existencia)"
probe 'toggle_reaction_uuid_inexistente' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.toggle_team_reaction('50000000-0000-0000-0000-0000000000ff','x')"

echo "### [T6] mark_team_conversation_read: SEM guard de vinculo (roda por ultimo: cria receipts em massa)"

echo "### [T7] escrita DIRETA em tabela (RLS como authenticated) - simetria"
probe 'insert_receipt_direto_msg_alheio' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B INSERT INTO public.team_message_receipts (message_id, profile_id, status, conversation_id) VALUES ('$MSG_A4','10000000-0000-0000-0000-0000000000b1','delivered','$CONV_A')"
probe 'conferir_receipt_landed' "SELECT count(*)||' receipt(s) de B1 na conversa A (lido como postgres)' FROM public.team_message_receipts WHERE profile_id='10000000-0000-0000-0000-0000000000b1' AND conversation_id='$CONV_A'"
probe 'insert_reaction_direto_msg_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B INSERT INTO public.team_message_reactions (message_id, profile_id, emoji) VALUES ('$MSG_A','10000000-0000-0000-0000-0000000000b1','z')"
probe 'insert_msg_direto_conversa_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B INSERT INTO public.team_messages (conversation_id, sender_id, content) VALUES ('$CONV_A','10000000-0000-0000-0000-0000000000b1','invadindo')"

echo "### [T8] find_or_create_direct_conversation: cria DM sem consentimento"
probe 'fcdc_com_B1' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT public.find_or_create_direct_conversation('10000000-0000-0000-0000-0000000000b1')"
probe 'fcdc_perfil_inexistente' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT public.find_or_create_direct_conversation('10000000-0000-0000-0000-0000000000ff')"
probe 'fcdc_consigo_mesmo' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT public.find_or_create_direct_conversation('10000000-0000-0000-0000-0000000000a1')"

echo "### [T9] transfer_team_conversation_department: papel"
probe 'transfer_como_agent' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT public.transfer_team_conversation_department('$CONV_A','90000000-0000-0000-0000-00000000000b')"
probe 'transfer_como_admin_canal_depto' "SET ROLE authenticated; SET request.jwt.claim.sub='$A9'; $CLAIMS_A9 SELECT public.transfer_team_conversation_department('$CONV_C','90000000-0000-0000-0000-00000000000b')"

echo "### [T10] anon e EXECUTE das RPCs do dia"
probe 'anon_rpcs' "SELECT
  has_function_privilege('anon','public.get_team_inbox()','EXECUTE')||'|'||
  has_function_privilege('anon','public.get_team_messages_page(uuid,uuid,integer)','EXECUTE')||'|'||
  has_function_privilege('anon','public.toggle_team_reaction(uuid,text)','EXECUTE')||'|'||
  has_function_privilege('anon','public.mark_team_conversation_read(uuid)','EXECUTE')||'|'||
  has_function_privilege('anon','public.find_or_create_direct_conversation(uuid)','EXECUTE')||'|'||
  has_function_privilege('anon','public.team_messages_edit_guard()','EXECUTE')"
probe 'anon_chama_toggle_reaction' "SET ROLE anon; SELECT public.toggle_team_reaction('$MSG_B','x')"
probe 'anon_chama_get_team_inbox' "SET ROLE anon; SELECT * FROM public.get_team_inbox()"
probe 'auth_chama_guard_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; SELECT public.team_reactions_dedup_guard()"
probe 'auth_chama_fill_conv_id_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; SELECT public.team_receipts_fill_conversation_id()"

echo "### [T10b] residuo de ACL: funcoes do dia SEM REVOKE (proacl NULL = PUBLIC tem EXECUTE)"
probe 'acl_residuo_public' "
SELECT p.proname || ' rettype=trigger? ' || (p.prorettype = 'trigger'::regtype)::text ||
       ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') ||
       ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proacl IS NULL AND p.prokind='f'
  AND p.proname IN ('team_messages_edit_guard','team_messages_validate_reply_to',
     'team_reactions_dedup_guard','team_receipts_no_own_sender','team_receipts_fill_conversation_id')
ORDER BY 1"
probe 'anon_exec_trigger_fns' "SET ROLE anon; SELECT public.team_receipts_fill_conversation_id()"

echo "### [T11] edit_guard e RLS de UPDATE: alcance real"
probe 'b1_edita_msg_DE_A1' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B UPDATE public.team_messages SET content='tampered' WHERE id='$MSG_A' RETURNING 'ALTEROU-MSG-DE-A1'"
probe 'a1_edita_msg_de_B1' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 UPDATE public.team_messages SET content='tampered' WHERE id='$MSG_B' RETURNING 'ALTEROU-MSG-DE-B1'"
probe 'a1_edita_msg_propria_via_rpc_direto' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 UPDATE public.team_messages SET content='editada por A1' WHERE id='$MSG_A' RETURNING is_edited||'/updated_at!=created_at='||(updated_at<>created_at)::text"

echo "### [T12] trigger de receipt preenche conversation_id sem checar vinculo"
probe 'receipt_novo_sem_conversation_id' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B INSERT INTO public.team_message_receipts (message_id, profile_id, status, read_at) VALUES ('$MSG_A3','10000000-0000-0000-0000-0000000000b1','read', now())"
probe 'receipt_A3_conversation_id' "SELECT COALESCE(conversation_id::text,'NULL')||' <- preenchido pelo trigger em '||status FROM public.team_message_receipts WHERE message_id='$MSG_A3' AND profile_id='10000000-0000-0000-0000-0000000000b1'"

echo "### [T6] mark_team_conversation_read: SEM guard de vinculo"
probe 'mark_read_conversa_alheia' "SET ROLE authenticated; SET request.jwt.claim.sub='$B1'; $CLAIMS_B SELECT public.mark_team_conversation_read('$CONV_A')"
probe 'receipts_criados_por_B1_em_A' "SELECT count(*)||' receipt(s) de B1 em mensagens da conversa A' FROM public.team_message_receipts r JOIN public.team_messages m ON m.id=r.message_id WHERE m.conversation_id='$CONV_A' AND r.profile_id='10000000-0000-0000-0000-0000000000b1'"

echo "### [T13] defectuosidade independente de vinculo (nao e questao de permissao)"
probe 'get_team_messages_page_MEMBRO' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT count(*) FROM public.get_team_messages_page('$CONV_A')"
probe 'search_team_messages_MEMBRO' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT count(*) FROM public.search_team_messages('$CONV_A','mensagem')"
probe 'select_direto_membros_MEMBRO' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A'"
probe 'get_team_inbox_MEMBRO' "SET ROLE authenticated; SET request.jwt.claim.sub='$A1'; $CLAIMS_A1 SELECT conversation_id||'/'||conversation_name FROM public.get_team_inbox() ORDER BY 1"

printf 'HARNESS-END|cluster=teamchat\n'
