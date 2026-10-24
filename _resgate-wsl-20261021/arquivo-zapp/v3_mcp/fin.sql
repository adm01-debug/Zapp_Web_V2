DO $do$
DECLARE r record; v_def text; v_tags text; v_out text:=''; v_n int:=0;
BEGIN
 FOR r IN SELECT p.oid, n.nspname ns, p.proname fn, pg_get_function_identity_arguments(p.oid) args,
        EXISTS(SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%') AS auth_exec,
        pg_get_function_result(p.oid) AS ret
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('zapp','public') AND p.prosecdef AND pg_get_function_result(p.oid) <> 'trigger'
   ORDER BY 2,3
 LOOP
   v_def := pg_get_functiondef(r.oid);
   SELECT string_agg(DISTINCT m[1],',') INTO v_tags FROM regexp_matches(v_def,
     '\y(evolution_notifications|evolution_notification_config|evolution_conversations_financeiro|contact_purchases|ordens_compra|sicoob_contact_mapping|encargos|vendas|recebiveis)\y','gi') m;
   CONTINUE WHEN v_tags IS NULL;
   v_n := v_n+1;
   IF length(v_out) < 9000 THEN
     v_out := v_out || r.ns||'.'||r.fn||'('||r.args||') [AUTH='||CASE WHEN r.auth_exec THEN '1' ELSE '0' END
       ||'] T:'||v_tags||' R:'||replace(r.ret, chr(10),' ')||chr(10);
   END IF;
 END LOOP;
 RAISE EXCEPTION 'FIN_NOTIF_total=% %', v_n, v_out;
END $do$;
