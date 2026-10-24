import re
import subprocess

raw = subprocess.run(
    ["python3", "q.py", "-e",
     "SELECT schemaname||'.'||tablename AS t FROM pg_publication_tables "
     "WHERE pubname='supabase_realtime' ORDER BY 1"],
    cwd="/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp",
    capture_output=True, text=True).stdout
live = re.findall(r'\{"t": "([^"]+)"\}', raw)

man = "/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V3/views-security-invoker-26092814221805/scripts/sql/realtime-publication.manifest"
mani = [l.strip() for l in open(man) if l.strip() and not l.strip().startswith("#")]

print("manifest=%d live=%d" % (len(mani), len(live)))
missing = sorted(set(mani) - set(live))
extra = sorted(set(live) - set(mani))
print("FALTANDO (manifesto -> ausente no catalogo) = %d" % len(missing))
for m in missing:
    print("  -", m)
print("EXTRA (catalogo -> fora do manifesto) = %d" % len(extra))
for e in extra:
    print("  +", e)
from collections import Counter
print("faltando por schema:", dict(Counter(x.split('.')[0] for x in missing)))
print("live por schema:", dict(Counter(x.split('.')[0] for x in live)))
