#!/usr/bin/env python3
"""Resumo determinístico da auditoria de risco (render pesado + timeout padrão)."""
import re, glob

files = sorted(glob.glob("src/components/talkx/__tests__/*.test.tsx"))
top_import = re.compile(r"from ['\"]@/components/talkx/([A-Z][A-Za-z0-9]+)['\"]")
findby = re.compile(r"find(?:By|AllBy)[A-Za-z]+\(")
waitfor = re.compile(r"\bwaitFor\s*\(")
timeout_arg = re.compile(r"timeout\s*:")

total = len(files)
com_topo = 0
com_timeout = 0
risco_alto = []   # top real + >=7 esperas + sem timeout
risco_medio = []  # top real + 1..6 esperas + sem timeout
risco_baixo = []  # top real com filhos mockados OU com timeout explicito

for f in files:
    txt = open(f, encoding="utf-8").read()
    tops = set(top_import.findall(txt))
    if not tops:
        continue
    com_topo += 1
    nesp = len(findby.findall(txt)) + len(waitfor.findall(txt))
    nto = len(timeout_arg.findall(txt))
    if nto:
        com_timeout += 1
    filhos_mockados = len(set(re.findall(r"vi\.mock\(['\"]@/components/talkx/([A-Za-z0-9]+)['\"]", txt)))
    if nto:
        risco_baixo.append(f)
    elif filhos_mockados >= 5:
        risco_baixo.append(f)
    elif nesp >= 5:
        risco_alto.append(f)
    elif nesp >= 1:
        risco_medio.append(f)

print(f"AUDITORIA OK: {total} arquivos .test.tsx; {com_topo} importam componente de topo/pagina; "
      f"{com_timeout} tem timeout explicito; risco ALTO={len(risco_alto)} MEDIO={len(risco_medio)} BAIXO={len(risco_baixo)}")
for tag, lst in (("ALTO", risco_alto), ("MEDIO", risco_medio), ("BAIXO", risco_baixo)):
    for f in lst:
        print(f"  [{tag}] {f}")
