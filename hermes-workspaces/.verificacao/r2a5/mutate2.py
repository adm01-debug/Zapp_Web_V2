#!/usr/bin/env python3
import json, os, re, shutil, subprocess
REPO="/home/joaquim_ataides/hermes-workspaces/.verificacao/r2a5/repo"
OUT="/home/joaquim_ataides/hermes-workspaces/.verificacao/r2a5/raw"
FILES={
 "perms":REPO+"/src/components/contacts/contactPermissions.ts",
 "item":REPO+"/src/components/contacts/ContactListItem.tsx",
 "card":REPO+"/src/components/contacts/ContactCard.tsx",
 "bulk":REPO+"/src/components/contacts/BulkActionsBar.tsx",
}
M={
 "M5_ListItem_gate_true":("item","{canDeleteContact(contact) && (","{true && ("),
 "M6_Card_gate_true":("card","{canDeleteContact(contact) && (","{true && ("),
 "M7_bulk_button_always_enabled":("bulk","disabled={isProcessing || !canDeleteSelection}","disabled={isProcessing}"),
 "M8_canDeleteContact_always_true":("perms","export function canDeleteContact(contact: Pick<Contact, 'can_delete'>): boolean {\n  return contact.can_delete !== false;\n}","export function canDeleteContact(contact: Pick<Contact, 'can_delete'>): boolean {\n  return true;\n}"),
}
def run(tag):
    p=subprocess.run(["bun","run","vitest","run","src/components/contacts"],cwd=REPO,capture_output=True,text=True,timeout=900)
    raw=p.stdout+"\n"+p.stderr; open(f"{OUT}/{tag}.txt","w").write(raw)
    m=re.search(r"Test Files\s+(.+)",raw); n=re.search(r"\s+Tests\s+(.+)",raw)
    f=re.findall(r"FAIL\s+(src/\S+)",raw)
    names=re.findall(r"×\s+(.+?)(?:\s+\d+ms)?$",raw,re.M)[:20]
    return {"exit":p.returncode,"test_files":m.group(1).strip() if m else "?","tests":n.group(1).strip() if n else "?","red_files":sorted(set(f)),"red_test_names":names}
def main():
    b={k:p+".bak2" for k,p in FILES.items()}
    for k,p in FILES.items(): shutil.copy2(p,b[k])
    res={}
    try:
        for name,(fk,old,new) in M.items():
            p=FILES[fk]; src=open(p).read()
            if old not in src: res[name]={"error":"NOT_FOUND","file":p}; continue
            open(p,"w").write(src.replace(old,new,1))
            r=run(name); r["file"]=p.replace(REPO+"/",""); r["verdict"]="MORTA" if r["exit"]!=0 else "SOBREVIVENTE"; res[name]=r
            shutil.copy2(b[fk],p)
    finally:
        for k,p in FILES.items():
            if os.path.exists(b[k]): shutil.copy2(b[k],p); os.remove(b[k])
    json.dump(res,open(f"{OUT}/mutation_results2.json","w"),indent=2,ensure_ascii=False)
    print(json.dumps(res,indent=2,ensure_ascii=False))
main()
