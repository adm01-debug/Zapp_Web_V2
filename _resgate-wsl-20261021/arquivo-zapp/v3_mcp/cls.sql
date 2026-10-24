DO $do$
DECLARE
  r record; v_def text; v_ret text; v_sens text;
  n_all int:=0; n_auth int:=0; n_strong int:=0; n_weak int:=0; n_none int:=0;
  n_reader int:=0; n_reader_none int:=0; n_reader_weak int:=0; n_reader_strong int:=0;
  n_sens int:=0; n_sens_none int:=0; n_sens_weak int:=0;
  n_revoke int:=0;
  c_strong text := '(is_admin|is_supervisor|is_admin_painel|is_admin_or_supervisor|is_privileged|current_user_is_privileged|has_role|can_supervise|is_staff|is_owner|is_gestor|is_coordenador|fn_require_privileged|service_role|fn_is_admin)';
  c_weak   text := '(fn_require_app_user|auth\.uid|auth\.jwt|request\.jwt)';
  v_list text := '';
BEGIN
  SELECT '\y(' || string_agg(DISTINCT t.t, '|') || ')\y' INTO v_sens FROM (
    SELECT c.table_name AS t FROM information_schema.columns c
    WHERE c.table_schema IN ('zapp','public','vault')
      AND c.column_name ~* '(phone|telefone|celular|whatsapp|email|cpf|cnpj|documento|token|api_?key|secret|senha|password)'
    UNION
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema IN ('zapp','public','vault')
      AND c.table_name ~* '(evolution_contacts|evolution_messages|evolution_instance_credentials|cookies_config|cookie_probe_log|evolution_notifications|conta|pagament|financeir|secret|cookie)'
  ) t;
  FOR r IN
    SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args,
           pg_get_function_result(p.oid) ret,
           EXISTS(SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%') aexec
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','public') AND p.prosecdef
    ORDER BY 2,3
  LOOP
    n_all := n_all+1;
    IF NOT r.aexec THEN n_revoke := n_revoke+1; CONTINUE; END IF;
    n_auth := n_auth+1;
    v_def := pg_get_functiondef(r.oid);
    v_ret := r.ret;
    IF v_def ~* c_strong THEN n_strong := n_strong+1;
    ELSIF v_def ~* c_weak THEN n_weak := n_weak+1;
    ELSE n_none := n_none+1;
      IF v_ret LIKE 'TABLE(%' OR v_ret LIKE 'SETOF %' OR v_ret LIKE 'json%' OR v_ret='record' THEN
        v_list := v_list || r.ns||'.'||r.fn||'('||r.args||') R:'||replace(v_ret, chr(10),' ')||chr(10);
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'TOTAL=% AUTH_EXEC=% REVOGADAS=% strong_role=% weak_auth_only=% SEM_GUARDA=% || SEM_GUARDA_READERS: %',
    n_all, n_auth, n_revoke, n_strong, n_weak, n_none, v_list;
END $do$;
