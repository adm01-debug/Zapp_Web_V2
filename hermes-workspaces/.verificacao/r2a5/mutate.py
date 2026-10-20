#!/usr/bin/env python3
import json, os, re, shutil, subprocess
REPO = "/home/joaquim_ataides/hermes-workspaces/.verificacao/r2a5/repo"
OUT  = "/home/joaquim_ataides/hermes-workspaces/.verificacao/r2a5/raw"
os.makedirs(OUT, exist_ok=True)
FILES = {
    "perms": REPO+"/src/components/contacts/contactPermissions.ts",
    "table": REPO+"/src/components/contacts/ContactsTable.tsx",
    "view":  REPO+"/src/components/contacts/ContactsView.tsx",
}
MUTATIONS = {
    "M1_canMerge_always_true": ("perms",
        "export function canMergeContacts(adminAccess: boolean | null | undefined): boolean {\n  return adminAccess !== false;\n}",
        "export function canMergeContacts(adminAccess: boolean | null | undefined): boolean {\n  return true;\n}",
        "ContactMergePermission.test.tsx: describe('canMergeContacts') + 'nao oferece Mesclar quando responde false'"),
    "M2_delete_item_gate_always_true": ("table",
        "{canDeleteContact(contact) && (",
        "{true && (",
        "ContactDeleteEntryPoints.test.tsx: 'nao oferece Excluir quando can_delete e false' (ContactsTable)"),
    "M3_merge_dialog_gate_inverted": ("view",
        "{canMerge && (\n        <ContactMergeDialog",
        "{!canMerge && (\n        <ContactMergeDialog",
        "(nenhum teste cobre ContactsView / montagem do ContactMergeDialog)"),
    "M4_canDeleteSelected_always_true": ("perms",
        "  if (selectedIds.length === 0) return undefined;\n  const conhecidos = contacts.filter(c => selectedIds.includes(c.id));\n  if (conhecidos.length === 0) return undefined;\n  return conhecidos.some(c => canDeleteContact(c));",
        "  return true;",
        "ContactDeleteEntryPoints.test.tsx: describe('canDeleteSelectedContacts')"),
}
def run_suite(tag):
    p = subprocess.run(["bun","run","vitest","run","src/components/contacts"],
        cwd=REPO, capture_output=True, text=True, timeout=900)
    raw = p.stdout + "\n" + p.stderr
    open(f"{OUT}/{tag}.txt","w").write(raw)
    m = re.search(r"Test Files\s+(.+)", raw)
    n = re.search(r"\s+Tests\s+(.+)", raw)
    failed = re.findall(r"FAIL\s+(src/\S+)", raw) or re.findall(r"❯\s+(src/\S+)", raw)
    names = re.findall(r"×\s+(.+?)(?:\s+\d+ms)?$", raw, re.M)[:20]
    return {"exit": p.returncode, "test_files": m.group(1).strip() if m else "?",
        "tests": n.group(1).strip() if n else "?", "red_files": sorted(set(failed)),
        "red_test_names": names}
def main():
    backups = {k: p+".r2a5.bak" for k,p in FILES.items()}
    for k,p in FILES.items(): shutil.copy2(p, backups[k])
    results = {}
    try:
        results["BASELINE"] = run_suite("baseline")
        for name,(fkey,old,new,covers) in MUTATIONS.items():
            path = FILES[fkey]
            src = open(path).read()
            if old not in src:
                results[name] = {"error":"PATTERN_NOT_FOUND","file":path}; continue
            open(path,"w").write(src.replace(old,new,1))
            r = run_suite(name)
            r["file"] = path.replace(REPO+"/","")
            r["should_be_covered_by"] = covers
            r["verdict"] = "MORTA" if r["exit"]!=0 else "SOBREVIVENTE"
            results[name] = r
            shutil.copy2(backups[fkey], path)
    finally:
        for k,p in FILES.items():
            if os.path.exists(backups[k]): shutil.copy2(backups[k], p); os.remove(backups[k])
    json.dump(results, open(f"{OUT}/mutation_results.json","w"), indent=2, ensure_ascii=False)
    print(json.dumps(results, indent=2, ensure_ascii=False))
main()
