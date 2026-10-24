#!/usr/bin/env python3
"""Inventario de funcoes SECURITY DEFINER executaveis por authenticated.
Uso: python3 inv_scan.py <off> <lim>
     python3 inv_scan.py --sqlfile F
"""
import sys, json, subprocess

HERE = "/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp"

def run(sql):
    r = subprocess.run(["python3", HERE + "/mcp_call.py", "supabase_db_query",
                        json.dumps({"sql": sql})], capture_output=True, text=True)
    try:
        j = json.loads(r.stdout)
        return j["result"]["content"][0]["text"]
    except Exception:
        return "RAW:" + r.stdout[:4000] + "\nERR:" + r.stderr[:500]

LIST_SQL = r"""
DO $do$
DECLARE
  r record; v_def text; v_ret text; v_tabs text; v_sens text;
  v_out text := ''; v_n int := 0; v_off int := __OFF__; v_lim int := __LIM__;
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
    SELECT p.oid, n.nspname AS ns, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.provolatile AS vol
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','public') AND p.prosecdef
      AND EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE 'authenticated=X%')
    ORDER BY n.nspname, p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_ret := pg_get_function_result(r.oid);
    v_tabs := NULL;
    SELECT string_agg(DISTINCT m[1], ',') INTO v_tabs FROM regexp_matches(v_def, v_sens, 'gi') m;
    IF v_tabs IS NOT NULL OR v_ret ~* '(phone|telefone|celular|email|cpf|cnpj|documento|token|api_?key|secret|senha|password)' THEN
      v_n := v_n + 1;
      IF v_n > v_off AND v_n <= v_off + v_lim THEN
        v_out := v_out || v_n::text || '|' || r.ns || '.' || r.fn || '(' || r.args || ')'
          || '|T:' || coalesce(v_tabs, '-')
          || '|G:' || CASE WHEN v_def ~* '(auth\.uid|auth\.jwt|is_admin|is_supervisor|current_user_is_privileged|is_privileged)\y' THEN '1'
                           WHEN v_def ~* 'RAISE (EXCEPTION|WARNING)' THEN '2' ELSE '0' END
          || '|W:' || CASE WHEN v_def ~* '(insert into|update [a-z_]|delete from|truncate)' THEN 'w' ELSE '-' END
          || '|V:' || r.vol::text
          || '|R:' || replace(replace(v_ret, chr(10), ' '), '|', '/')
          || chr(10);
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'TOTAL=% OFF=% LIM=% LEN=% %', v_n, v_off, v_lim, length(v_out), v_out;
END $do$;
"""

def main():
    if sys.argv[1] == "--sqlfile":
        print(run(open(sys.argv[2]).read()))
        return
    off, lim = int(sys.argv[1]), int(sys.argv[2])
    print(run(LIST_SQL.replace("__OFF__", str(off)).replace("__LIM__", str(lim))))

main()
