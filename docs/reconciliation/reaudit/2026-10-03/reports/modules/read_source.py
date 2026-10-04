import sys, json, hashlib, time
from pathlib import Path
root=Path("/workspace/scratch/f8f9b9cbce53/reaudit/source")
out=Path("/workspace/scratch/f8f9b9cbce53/reaudit/reports/modules")
for spec in sys.argv[1:]:
 parts=spec.split("|")
 rel=parts[0]
 p=root/rel
 raw=p.read_bytes()
 lines=raw.decode().splitlines()
 start=int(parts[1]) if len(parts)>1 and parts[1] else 1
 end=int(parts[2]) if len(parts)>2 and parts[2] else len(lines)
 note=parts[3] if len(parts)>3 else "semantics"
 row={"path":rel,"line_start":start,"line_end":min(end,len(lines)),"total_lines":len(lines),"blob_sha":hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest(),"read_level":"semantic" if start==1 and end>=len(lines) else "targeted","symbols_or_purpose":note}
 with (out/"read-journal.jsonl").open("a") as f:f.write(json.dumps(row,ensure_ascii=False)+"\n")
 print(json.dumps(row,ensure_ascii=False))
 for n in range(start,min(end,len(lines))+1):print(f"{n:4} {lines[n-1]}")
