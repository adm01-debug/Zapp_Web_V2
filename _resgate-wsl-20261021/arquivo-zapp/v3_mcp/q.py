#!/usr/bin/env python3
"""Run a read-only DO-block report against the Zapp V3 Postgres via the MCP gateway.

The gateway returns 0 rows for multi-statement input and blocks SET ROLE in some
contexts, so the report is assembled inside a single PL/pgSQL DO block and returned
through a RAISE EXCEPTION payload. The gateway double-escapes newlines/backslashes,
so the payload is unescaped here.

Usage:  python3 q.py < path/to/report.sql
        python3 q.py -f file.sql
        python3 q.py -e "SELECT ..."     # single simple statement, printed raw
"""
import json
import sys
import urllib.request

URL = ("https://supabase-mcp.atomicabr.com.br/"
       "74335dcaa48c1b8d27522eb432ca8c0eda51b6beb2958cc3ce8ec2b1f319fedf/mcp")


def call_tool(name, args, req_id=1):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id,
                       "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    })
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode()
    return json.loads(raw)


def unwrap(resp):
    """Return (ok, text). ok=False means the tool reported an error."""
    if "error" in resp:
        return False, json.dumps(resp["error"], ensure_ascii=False)
    res = resp.get("result", {})
    if res.get("isError"):
        return False, json.dumps(res, ensure_ascii=False)
    parts = [c.get("text", "") for c in res.get("content", [])]
    return True, "\n".join(parts)


def run(sql, raw=False):
    resp = call_tool("supabase_db_query", {"sql": sql})
    ok, text = unwrap(resp)
    if ok:
        try:
            payload = json.loads(text)
            rows = payload.get("rows", [])
            if raw:
                print(text)
            else:
                for r in rows:
                    print(json.dumps(r, ensure_ascii=False))
                print(f"[rowCount={payload.get('rowCount')} duration={payload.get('duration')}ms]")
        except Exception:
            print(text)
        return 0
    # The DO block signalled the report through an exception. Unescape one level
    # of the gateway's double escaping (\n -> newline) and print the payload.
    msg = text
    try:
        outer = json.loads(text)
        if isinstance(outer, dict):
            msg = outer.get("message", text)
    except Exception:
        pass
    # gateway emits literal backslash-n; turn into real newlines, but keep any
    # intentional backslashes visible as \\\\ -> \\
    msg = msg.replace("\\\\n", "\\n").replace("\\n", "\n")
    msg = msg.replace("\\\\", "\\")
    print(msg)
    return 1


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "-f":
        sql = open(sys.argv[2], encoding="utf-8").read()
        sys.exit(run(sql))
    if len(sys.argv) > 1 and sys.argv[1] == "-e":
        sys.exit(run(sys.argv[2]))
    sys.exit(run(sys.stdin.read()))
