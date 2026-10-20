#!/usr/bin/env python3
"""Prova de mutação local do refazer t_36119648 (estilo run-mapa.mjs).
Aplica cada mutante em CÓPIA DE TRABALHO, roda o E2E, restaura byte a byte.
Estados: morto = teste NOMEADO vermelho; sobrevivente = suite verde.
Baseline verde é obrigatório antes de medir."""
import re
import subprocess
import sys

HOOK = "src/hooks/chat/useRealtimeMessages.ts"
SUITE = ["src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx"]

MUTANTS = [
    {
        "id": "M-skip",
        "desc": "handler vira no-op (não atualiza a linha)",
        "frm": "updated[idx] = { ...updated[idx], contact: { ...updated[idx].contact, ...updatedContact } };",
        "to": "return prev; // MUTANTE M-skip: nenhuma atualização aplicada",
        "esperado": "morto",
        "teste": "atualiza nickname/job_title",
    },
    {
        "id": "M-replace",
        "desc": "merge vira replace (perde o embed conversation_sla)",
        "frm": "updated[idx] = { ...updated[idx], contact: { ...updated[idx].contact, ...updatedContact } };",
        "to": "updated[idx] = { ...updated[idx], contact: { ...updatedContact } }; // MUTANTE M-replace",
        "esperado": "morto",
        "teste": "atualiza nickname/job_title",
    },
    {
        "id": "M-append",
        "desc": "guarda idx<0 vira upsert (cria linha fantasma)",
        "frm": "if (idx < 0) return prev;",
        "to": "if (idx < 0) { updated.push({ ...prev[0], contact: updatedContact }); return updated; } // MUTANTE M-append",
        "esperado": "morto",
        "teste": "sem linha fantasma",
    },
    {
        "id": "M-guard",
        "desc": "guarda de id perde o ?. (crash com new nulo)",
        "frm": "if (!updatedContact?.id) return;",
        "to": "if (!updatedContact.id) return; // MUTANTE M-guard",
        "esperado": "morto",
        "teste": "new vazio",
    },
    {
        "id": "M-unwire",
        "desc": "desliga onUpdate do canal contacts",
        "frm": "onUpdate: handleContactUpdate,",
        "to": "onUpdate: undefined, // MUTANTE M-unwire",
        "esperado": "morto",
        "teste": "atualiza nickname/job_title",
    },
    {
        "id": "M-revision",
        "desc": "não incrementa liveRevision no UPDATE (race com fetch em voo)",
        "frm": "liveRevisionRef.current += 1;\n      commitConversations((prev) => {\n        const idx = prev.findIndex((c) => c.contact.id === updatedContact.id);",
        "to": "commitConversations((prev) => {\n        const idx = prev.findIndex((c) => c.contact.id === updatedContact.id); // MUTANTE M-revision: sem bump",
        "esperado": "sobrevivente",
        "teste": "-",
    },
    {
        "id": "M-control",
        "desc": "CONTROLE: troca texto de log que nenhum teste observa",
        "frm": "Incoming message received for unknown contact",
        "to": "Controle: mutacao que nenhum teste observa",
        "esperado": "sobrevivente",
        "teste": "-",
    },
]


def run_suite():
    p = subprocess.run(
        ["bun", "x", "vitest", "run", *SUITE],
        capture_output=True,
        text=True,
        timeout=240,
    )
    out = p.stdout + p.stderr
    m = re.search(r"Tests\s+(\d+) failed[^0-9]*(\d+) passed|Tests\s+(\d+) passed", out)
    failed_names = re.findall(r"FAIL\s+\S+\s*>\s*(.+)", out)
    return p.returncode, out, failed_names


def main():
    with open(HOOK, encoding="utf-8") as f:
        orig = f.read()
    print("== BASELINE (sem mutação) ==", flush=True)
    code, out, names = run_suite()
    print(out[-1500:], flush=True)
    if code != 0:
        print("BASELINE VERMELHO — medição inválida, abortando.", flush=True)
        return 2
    print("BASELINE VERDE — medindo mutantes.\n", flush=True)
    resultados = []
    try:
        for mt in MUTANTS:
            n = orig.count(mt["frm"])
            if n != 1:
                print(f"{mt['id']}: literal encontrado {n}x (esperado 1x) — PULADO", flush=True)
                resultados.append((mt["id"], "pulado", mt["esperado"]))
                continue
            with open(HOOK, "w", encoding="utf-8") as f:
                f.write(orig.replace(mt["frm"], mt["to"]))
            code, out, names = run_suite()
            morto = code != 0 and len(names) > 0
            estado = "morto" if morto else "sobrevivente"
            ok = "OK" if estado == mt["esperado"] else "DIVERGENTE"
            print(f"{mt['id']} [{ok}]: {estado} (esperado {mt['esperado']})", flush=True)
            print(f"  desc: {mt['desc']}", flush=True)
            print(f"  testes vermelhos: {names if names else '-'}", flush=True)
            tail = out.strip().splitlines()
            print("  cauda: " + " | ".join(tail[-4:]), flush=True)
            with open(f"/home/joaquim_ataides/t36119648-work/mut-{mt['id']}.log", "w", encoding="utf-8") as f:
                f.write(out)
            resultados.append((mt["id"], estado, mt["esperado"]))
    finally:
        with open(HOOK, "w", encoding="utf-8") as f:
            f.write(orig)
    with open(HOOK, encoding="utf-8") as f:
        print("RESTAURO:", "idêntico" if f.read() == orig else "DIVERGIU!", flush=True)
    print("\n== TABELA ==", flush=True)
    for rid, est, esp in resultados:
        print(f"{rid}: {est} (esperado {esp})", flush=True)
    ruins = [r for r in resultados if r[1] != r[2] or r[1] == "pulado"]
    return 1 if ruins else 0


sys.exit(main())
