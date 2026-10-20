-- profiles_self_update_sensitive_columns
-- Rollback: recria prevent_profile_privilege_escalation com o corpo anterior (20260830161547), que vigiava so role/permissions/access_level; a ACL e o gatilho nao mudam e nenhum dado e tocado.
-- Rollback (SQL executável, na ordem):
--   CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $r$ BEGIN IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.permissions IS DISTINCT FROM NEW.permissions) OR (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN IF current_setting('app.internal_role_sync', true) = 'true' THEN RETURN NEW; END IF; IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level'; END IF; END IF; RETURN NEW; END; $r$;
--
-- ACHADO (self-update do proprio perfil): o gatilho BEFORE UPDATE de public.profiles
-- vigiava apenas role, permissions e access_level. As colunas de efeito operacional
-- can_download, max_chats, session_invalidated_at, department e department_id ficavam
-- livres para o proprio usuario: um PATCH /rest/v1/profiles?user_id=eq.<eu> como
-- `authenticated` (a policy permissiva "Users can update own profile" permite o UPDATE
-- da propria linha) mudava qualquer uma delas sem barreira. Ex.: `{"can_download":true}`
-- ligava o download de anexos para quem nao tem essa permissao.
--
-- CORRECAO (so o mecanismo de defesa em profundidade, sem tocar em policy/ACL):
-- o mesmo gatilho passa a vigiar tambem as 5 colunas e recusa a mudanca quando
-- NOT is_admin_or_supervisor(auth.uid()) e o flag interno de sync nao esta ligado.
-- Preserva os dois caminhos legitimos ja existentes:
--   (a) `app.internal_role_sync = 'true'` (sync_profile_role_from_user_roles, SECURITY DEFINER);
--   (b) auth.uid() IS NULL (service_role / jobs / migrations) — nesses casos nao existe
--       "usuario pedindo" e a barreira de linha (RLS) ja nao vale para service_role.
-- O bloco de role/permissions/access_level continua exigindo is_admin (F02: supervisor
-- NAO pode reescrever papel), inalterado.
--
-- Colunas que o proprio usuario PODE gravar (nao tocadas por este gatilho):
-- name, nickname, signature, job_title, phone, avatar_url, email, birthday — via a RPC
-- update_own_profile e/ou a policy "Users can update own profile" (avatar). Nenhum fluxo
-- legitimo do front escreve as 5 colunas como o proprio usuario: quem as escreve e a tela
-- de admin (src/components/admin/useAdminData.ts, admin/supervisor) e useDepartmentManagement
-- (aba de departamentos, so admin) — os dois passam a barreira.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- (1) Campos de autorizacao: inalterado desde 20260830161547 (so admin).
  IF (OLD.role IS DISTINCT FROM NEW.role)
    OR (OLD.permissions IS DISTINCT FROM NEW.permissions)
    OR (OLD.access_level IS DISTINCT FROM NEW.access_level)
  THEN
    IF current_setting('app.internal_role_sync', true) = 'true' THEN
      RETURN NEW;
    END IF;
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;

  -- (2) Campos operacionais do perfil: admin ou supervisor, salvo operacao interna.
  IF (OLD.can_download IS DISTINCT FROM NEW.can_download)
    OR (OLD.max_chats IS DISTINCT FROM NEW.max_chats)
    OR (OLD.session_invalidated_at IS DISTINCT FROM NEW.session_invalidated_at)
    OR (OLD.department IS DISTINCT FROM NEW.department)
    OR (OLD.department_id IS DISTINCT FROM NEW.department_id)
  THEN
    IF current_setting('app.internal_role_sync', true) = 'true' THEN
      RETURN NEW;
    END IF;
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators or supervisors can modify can_download, max_chats, session_invalidated_at, department, or department_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Guarda: o gatilho precisa continuar ligado a funcao (nao mexe em ACL nem no gatilho).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'prevent_privilege_escalation'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'gatilho prevent_privilege_escalation ausente ou desligado em public.profiles';
  END IF;
END;
$$;
