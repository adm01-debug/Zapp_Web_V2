#!/usr/bin/env python3
import sys, json
sys.path.insert(0, '/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp')
from mcp_call import call_tool
sql = open(sys.argv[1], encoding='utf-8').read()
res = call_tool('supabase_db_query', {'sql': sql})
print(json.dumps(res, ensure_ascii=False, indent=1))
