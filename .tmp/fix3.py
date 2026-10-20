import re
import subprocess
from pathlib import Path

W = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8")
R = W / ".tmp/relato.md"


def sh(cmd):
    return subprocess.run(cmd, cwd=W, shell=True, capture_output=True, text=True).stdout.strip()


def total_chars():
    return int(sh("git diff dia/2026-10-15...HEAD | wc -c"))


def num(n):
    return format(n, ",").replace(",", ".")


s = R.read_text(encoding="utf-8")
extra = (" O `ESTADO.md` está no diff desde o trabalho anterior (FAIXA DO PAI) e o item 4 desta recusa o mantém no escopo, "
         "palavras do cartão: \"Manter a explicação de ESTADO.md. O cartão manda mover a linha dele, então ele está no escopo\".")
alvo = "A descrição antiga (\"o inventário não listava a edge\") saiu do relato."
assert alvo in s
s = s.replace(alvo, alvo + extra, 1)
R.write_text(s, encoding="utf-8")
sh("git add -f .tmp/relato.md && git commit --amend --no-edit -q")
a = total_chars()
m = re.search(r"(\d{2}\.\d{3}) caracteres", s)
s = s.replace(m.group(1) + " caracteres", num(a) + " caracteres")
R.write_text(s, encoding="utf-8")
sh("git add -f .tmp/relato.md && git commit --amend --no-edit -q")
b = total_chars()
print("chars antes/depois:", a, b)
print(sh("git diff --numstat dia/2026-10-15...HEAD"))
print([l for l in s.splitlines() if "numstat" in l][0][:200])
print([l for l in s.splitlines() if "caracteres" in l][0][:200])
print("linhas:", len(s.splitlines()))
print(sh("git log --oneline -1"))
