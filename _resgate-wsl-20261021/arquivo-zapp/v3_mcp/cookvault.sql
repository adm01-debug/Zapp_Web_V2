DO $do$
DECLARE r record; v_def text; v_out text:=''; v_n int:=0; v_cookie int:=0; v_vault int:=0; v_tot int:=0;
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args,
        pg_get_function_result(p.oid) AS ret,
        EXISTS(SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%') AS auth_exec,
        p.prosecdef AS sd
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public','evo','ops') AND p.prorettype <> 'trigger'::regtype
   ORDER BY 2,3
 LOOP
   v_def := pg_get_functiondef(r.oid);
   v_tot := v_tot+1;
   IF v_def ~* '(cookies_config|cookie_probe_log|linkedin_cookie)' THEN
     v_cookie := v_cookie+1;
     IF length(v_out) < 7000 THEN
       v_out := v_out || 'COOKIE ' || r.ns||'.'||r.fn||'('||r.args||') [SD='||CASE WHEN r.sd THEN '1' ELSE '0' END
         ||' AUTH='||CASE WHEN r.auth_exec THEN '1' ELSE '0' END||'] R:'||left(replace(r.ret,'|','/'),90)||chr(10);
     END IF;
   END IF;
   IF v_def ~* '(vault\.secrets|vault\.decrypted_secrets|decrypted_secrets)' THEN
     v_vault := v_vault+1;
     IF length(v_out) < 11000 THEN
       v_out := v_out || 'VAULT ' || r.ns||'.'||r.fn||'('||r.args||') [SD='||CASE WHEN r.sd THEN '1' ELSE '0' END
         ||' AUTH='||CASE WHEN r.auth_exec THEN '1' ELSE '0' END||'] R:'||left(replace(r.ret,'|','/'),90)||chr(10);
     END IF;
   END IF;
 END LOOP;
 RAISE EXCEPTION 'COOKIE_refs=% VAULT_refs=% FUNCS_total=% %', v_cookie, v_vault, v_tot, v_out;
END $do$;
