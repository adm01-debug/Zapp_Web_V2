#!/usr/bin/env python3
"""Roda SQL via mcp_call.py supabase_db_query. Uso: qa.py <arquivo_sql>"""
import sys, json, subprocess

sql = open(sys.argv[1], encoding="utf-8").read()
args = json.dumps({"sql": sql})
p = subprocess.run(
    ["python3", "/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp/mcp_call.py",
     "supabase_db_query", args],
    capture_output=True, text=True, timeout=120,
)
print(p.stdout)
if p.returncode != 0:
    print("STDERR:", p.stderr[:2000])
