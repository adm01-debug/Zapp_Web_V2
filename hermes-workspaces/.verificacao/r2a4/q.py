#!/usr/bin/env python3
import sys, json, os
sys.path.insert(0, "/home/joaquim_ataides/projetos/mcp-clone-bwwbey")
import zapp_db
sql = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
out = zapp_db.db_query(sql, max_rows=int(os.environ.get("MAXROWS","1000")))
print(json.dumps(out, ensure_ascii=False, indent=1) if not isinstance(out, str) else out)
