import re, pathlib
ws = pathlib.Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/aplicar-at-time-zone-window-fixes-2610130856a5b5")
base = (ws / ".tmp/base.sql").read_text().splitlines()
prev = base[457:531]  # linhas 458..531 (1-based)
assert prev[0].startswith("CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open"), prev[0]
assert prev[-1].strip() == "$function$;", prev[-1]
code = [ln.strip() for ln in prev if not ln.strip().startswith("--")]
stmt = " ".join(x for x in code if x)
stmt = re.sub(r"\s+", " ", stmt).strip()
assert "--" not in stmt, "comentario inline quebraria a linha do rollback"
assert stmt.endswith(";")
f = ws / "supabase/migrations/20261013230015_talkx_n102_window_fixes.sql"
txt = f.read_text()
assert "__ROLLBACK_STMT__" in txt
f.write_text(txt.replace("__ROLLBACK_STMT__", stmt))
print("ROLLBACK_STMT_CHARS=", len(stmt))
print(stmt[:160], "...", stmt[-80:])
