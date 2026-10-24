#!/usr/bin/env python3
"""Helper para chamar o Supabase MCP self-hosted do Zapp Web V3 (atomicabr).
Uso: python3 mcp_call.py <tool_name> '<json_args>'
"""
import sys, json, urllib.request

URL = "https://supabase-mcp.atomicabr.com.br/74335dcaa48c1b8d27522eb432ca8c0eda51b6beb2958cc3ce8ec2b1f319fedf/mcp"

def call(method, params, req_id=1):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode()
    return json.loads(raw)

def call_tool(name, args=None):
    return call("tools/call", {"name": name, "arguments": args or {}})

if __name__ == "__main__":
    tool = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    result = call_tool(tool, args)
    print(json.dumps(result, indent=2, ensure_ascii=False))
