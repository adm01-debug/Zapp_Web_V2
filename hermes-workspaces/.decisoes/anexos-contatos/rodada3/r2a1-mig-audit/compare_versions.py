#!/usr/bin/env python3
"""Full set comparison: repo migration versions vs ledger versions, plus order facts."""
import sys, json, os, re, subprocess
sys.path.insert(0, "/home/joaquim_ataides/projetos/mcp-clone-bwwbey")
import zapp_db

REPO_DIR = "/home/joaquim_ataides/hermes-workspaces/.verificacao/r2a1/mig-audit/repo/supabase/migrations"
FILE_RE = re.compile(r"^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$")

# --- repo side ---
repo_files = [f for f in os.listdir(REPO_DIR) if os.path.isfile(os.path.join(REPO_DIR, f))]
repo = {}
bad_names = []
for f in repo_files:
    m = FILE_RE.match(f)
    if not m:
        bad_names.append(f); continue
    repo.setdefault(m.group(1), []).append(m.group(2))
repo_dups = {v: n for v, n in repo.items() if len(n) > 1}
repo_versions = set(repo.keys())

# --- ledger side ---
res = zapp_db.db_query(
    "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version",
    max_rows=5000)
rows = res["rows"] if isinstance(res, dict) else json.loads(res)["rows"]
if isinstance(rows, str):
    rows = json.loads(rows)
ledger = {}
for r in rows:
    ledger.setdefault(r["version"], []).append(r.get("name"))
ledger_dups = {v: n for v, n in ledger.items() if len(n) > 1}
ledger_versions = set(ledger.keys())

only_repo = sorted(repo_versions - ledger_versions)
only_ledger = sorted(ledger_versions - repo_versions)

out = {
    "repo_files_total": len(repo_files),
    "repo_valid_named": len(repo_versions),
    "repo_duplicate_versions": repo_dups,
    "repo_invalid_filenames": bad_names,
    "ledger_rows": len(rows),
    "ledger_unique_versions": len(ledger_versions),
    "ledger_duplicate_versions": ledger_dups,
    "versions_only_in_repo_not_in_ledger": only_repo,
    "versions_only_in_ledger_not_in_repo": [
        {"version": v, "names": ledger[v]} for v in only_ledger
    ],
    "sets_equal": repo_versions == ledger_versions,
    "ledger_max_version": max(ledger_versions),
    "ledger_min_version": min(ledger_versions),
    "repo_max_version": max(repo_versions),
    "last_5_ledger": sorted(ledger_versions, reverse=True)[:5],
    "target_is_max": max(ledger_versions) == "20260930370000",
}
print(json.dumps(out, indent=2, ensure_ascii=False))
