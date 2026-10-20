#!/usr/bin/env python3
"""Dump the exact ledger row for a version to JSON (uses the read-only gateway)."""
import sys, json
sys.path.insert(0, "/home/joaquim_ataides/projetos/mcp-clone-bwwbey")
import zapp_db

version = sys.argv[1]
out_path = sys.argv[2]
sql = ("SELECT json_build_object('version', version, 'name', name, 'statements', statements) "
       "FROM supabase_migrations.schema_migrations WHERE version = '" + version + "';")
res = zapp_db.db_query(sql)
rows = res["rows"] if isinstance(res, dict) else json.loads(res)["rows"]
assert len(rows) == 1, rows
# db_query returns column json_build_object as a JSON value already
row = rows[0]
val = row.get("json_build_object") or list(row.values())[0]
if isinstance(val, str):
    val = json.loads(val)
with open(out_path, "w") as f:
    json.dump(val, f, ensure_ascii=False)
print("wrote", out_path, "version=", val["version"], "name=", val["name"],
      "statements=", len(val["statements"]))
