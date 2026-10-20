from pathlib import Path

p = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8/.tmp/gen_relato.py")
s = p.read_text(encoding="utf-8")

anchor = 'MARKS = ("\\u2714", "\\u2716", "\\u2139")'
assert anchor in s, "ancora MARKS nao encontrada"
add = (
    anchor
    + "\n"
    + 'guarda_curto = "\\n".join(l for l in guarda.splitlines() if l[:1] in MARKS or "AssertionError" in l)'
)
s = s.replace(anchor, add, 1)
assert "{guarda}\n\nA guarda fecha" in s
s = s.replace("{guarda}\n\nA guarda fecha", "{guarda_curto}\n\nA guarda fecha", 1)
p.write_text(s, encoding="utf-8")
print("ok")
