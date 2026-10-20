import subprocess
from pathlib import Path

W = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8")
R = W / ".tmp/relato.md"


def sh(cmd):
    return subprocess.run(cmd, cwd=W, shell=True, capture_output=True, text=True).stdout.strip()


def medir():
    ns = sh("git diff --numstat dia/2026-10-15...HEAD")
    chars = sh("git diff dia/2026-10-15...HEAD | wc -c")
    return ns, chars


s = R.read_text(encoding="utf-8")
extra = (" O `ESTADO.md` está no diff desde o trabalho anterior (FAIXA DO PAI) e o item 4 desta recusa o mantém no escopo, "
         "palavras do cartão: \"Manter a explicação de ESTADO.md. O cartão manda mover a linha dele, então ele está no escopo\".")
s = s.replace("A descrição antiga (\"o inventário não listava a edge\") saiu do relato.",
              "A descrição antiga (\"o inventário não listava a edge\") saiu do relato." + extra, 1)
R.write_text(s, encoding="utf-8")
sh("git add -f .tmp/relato.md && git commit --amend --no-edit -q")
ns, chars = medir()
print(ns)
print("chars=" + chars)
import re
m = re.search(r"— (\d+\.\d+) caracteres", s)
s = s.replace(m.group(1) + " caracteres", chars[0] + chars[1:] + " caracteres")
R.write_text(s, encoding="utf-8")
sh("git add -f .tmp/relato.md && git commit --amend --no-edit -q")
ns2, chars2 = medir()
print("depois:")
print(ns2)
print("chars=" + chars2)
print("linhas=" + str(len(R.read_text(encoding='utf-8').splitlines())))
print([l for l in s.splitlines() if "numstat" in l])
print(sh("git log --oneline -1"))
