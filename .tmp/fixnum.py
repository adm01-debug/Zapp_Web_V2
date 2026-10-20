from pathlib import Path

p = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8/.tmp/relato.md")
s = p.read_text(encoding="utf-8")
s = s.replace("166/0 .tmp/relato.md", "170/0 .tmp/relato.md")
s = s.replace("43.325 caracteres", "44.199 caracteres")
p.write_text(s, encoding="utf-8")
print([l for l in s.splitlines() if "numstat" in l])
