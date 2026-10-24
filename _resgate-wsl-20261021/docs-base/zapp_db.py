#!/usr/bin/env python3
"""Cliente mínimo do gateway Supabase MCP (Cloudflare Worker) — chamada stateless a db_query.
Lê gateway_url.txt e mcp_secret.txt do workspace (default ~/projetos/mcp-clone-bwwbey).
Uso: python3 zapp_db.py "select count(*) from ops.hermes_change_log"  (ou SQL via stdin)
"""
import json, os, subprocess, sys

WS = os.environ.get("MCP_GATEWAY_WS", os.path.expanduser("~/projetos/mcp-clone-bwwbey"))

def find_gateway():
    secret = open(os.path.join(WS, "mcp_secret.txt")).read().strip()
    url_file = os.path.join(WS, "gateway_url.txt")
    url = open(url_file).read().strip() if os.path.exists(url_file) else os.environ.get("ZAPP_MCP_URL", "")
    return url, secret

def db_query(sql, max_rows=200):
    url, secret = find_gateway()
    if not url:
        print("ERRO: URL do gateway não encontrada (gateway_url.txt ou ZAPP_MCP_URL)"); sys.exit(2)
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
               "params": {"name": "db_query", "arguments": {"sql": sql, "max_rows": max_rows}}}
    open("/tmp/payload.json", "w").write(json.dumps(payload))
    r = subprocess.run(["curl", "-sS", "-m", "60", "-X", "POST", url,
                        "-H", "Authorization: Bearer " + secret,
                        "-H", "Content-Type: application/json",
                        "-H", "Accept: application/json, text/event-stream",
                        "-H", "User-Agent: Mozilla/5.0 hermes/1.0",
                        "-d", "@/tmp/payload.json"], capture_output=True, text=True)
    out = r.stdout
    if out.startswith("event:") or "\ndata:" in out or out.startswith("data:"):
        out = "\n".join(l[5:].strip() for l in out.splitlines() if l.startswith("data:"))
    try:
        j = json.loads(out)
        txt = j["result"]["content"][0]["text"]
        try: return json.loads(txt)
        except Exception: return txt
    except Exception:
        return out

if __name__ == "__main__":
    sql = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(db_query(sql), ensure_ascii=False, indent=1)[:4000])
