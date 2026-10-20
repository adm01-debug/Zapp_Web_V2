from pathlib import Path

p = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8/.tmp/gen_relato.py")
s = p.read_text(encoding="utf-8")
lines = s.splitlines(keepends=True)

# substitui as duas linhas que calculavam verm_top e acrescenta base_curto
assert lines[21].startswith("linhas_v = vermelho"), lines[21]
assert lines[22].startswith("verm_top ="), lines[22]
lines[21] = 'MARKS = ("\\u2714", "\\u2716", "\\u2139")\n'
lines[22] = 'verm_top = "\\n".join(l for l in vermelho.splitlines() if l[:1] in MARKS)\n'
lines.insert(23, 'base_curto = "\\n".join(l for l in base.splitlines() if l[:1] in MARKS)\n')
s = "".join(lines)

antes = s
s = s.replace("{base}\n\nD) AS QUATRO", "{base_curto}\n\nD) AS QUATRO")
assert s != antes, "troca de base falhou"
antes = s
s = s.replace(
    "(no vermelho os contadores são `pass 7` / `fail 4`)",
    "(no vermelho os contadores são `pass 7` / `fail 4`; as outras 2 falhas são as mesmas do bloco A)",
)
assert s != antes, "troca do vermelho falhou"
antes = s
s = s.replace(
    " (O aviso de `banco_local` é o normal do modo rápido, que não abre o banco.)",
    "",
)
assert s != antes, "troca do H falhou"

p.write_text(s, encoding="utf-8")
print("transformado")
