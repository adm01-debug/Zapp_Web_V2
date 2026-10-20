"""Prova de mutacao (criterio 4 do cartao TL-150), revisao 2: a mutacao da JANELA
foi corrigida (a versao 1 so trocava o inicio e o `&&` do fim mascarava o efeito).

Roda o baseline, derruba um ponto por vez, exige VERMELHO e reverte.
Uso: python3 .tmp/mut-provas2.py
"""
import subprocess
import sys
import pathlib

WS = pathlib.Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/tl-150-calendario-timeline-26101520290454")
SCHED = WS / "src/components/talkx/TalkXCampaignScheduled.tsx"
TIMELINE = WS / "src/components/talkx/TalkXScheduleTimeline.tsx"
TESTS = [
    "src/components/talkx/__tests__/TalkXCampaignScheduled.calendario.test.tsx",
    "src/components/talkx/__tests__/TalkXScheduleTimeline.test.tsx",
]

MUTACOES = [
    ("A14-piso-do-navegador", SCHED,
     "const calendarFloor = todayInCampaignTimezone(localTz);",
     "const calendarFloor = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());"),
    ("A14-parse-sem-T00:00:00", SCHED,
     "? new Date(`${localDate}T00:00:00`)",
     "? new Date(`${localDate}`)"),
    ("A9-sem-guarda-de-publico-zero", TIMELINE,
     "if (Number.isFinite(estimate) && estimate > 0) {",
     "if (Number.isFinite(estimate)) {"),
    ("A11-inicio-do-gravado-e-nao-da-edicao", TIMELINE,
     "const startIso = editedStart ?? savedStart;",
     "const startIso = savedStart;"),
    ("A11-janela-sempre-visivel", TIMELINE,
     "const windowStart = windowClock(editing.windowEnabled ? editing.windowStart : null);\n"
     "  const windowEnd = windowClock(editing.windowEnabled ? editing.windowEnd : null);",
     "const windowStart = windowClock(editing.windowStart);\n"
     "  const windowEnd = windowClock(editing.windowEnd);"),
    ("A11-nao-distingue-gravado-de-editado", TIMELINE,
     "Date.parse(editedStart) !== Date.parse(savedStart)",
     "false"),
]


def aplica(path, old, new):
    txt = path.read_text(encoding="utf-8")
    if txt.count(old) != 1:
        raise SystemExit("ancora nao unica (%d) em %s: %s" % (txt.count(old), path.name, old[:60]))
    path.write_text(txt.replace(old, new), encoding="utf-8")


def roda():
    proc = subprocess.run(["npx", "vitest", "run", *TESTS], cwd=WS, capture_output=True, text=True)
    saida = proc.stdout + proc.stderr
    linhas = [ln.strip() for ln in saida.splitlines()
              if ln.strip().startswith(("Test Files", "Tests ")) or ln.strip().startswith("×") or ln.strip().startswith("✓")]
    return proc.returncode, linhas


def main():
    print("== baseline (sem mutacao) ==")
    rc, linhas = roda()
    for ln in linhas:
        print("   ", ln)
    if rc != 0:
        raise SystemExit("baseline VERMELHO: nao ha o que provar")

    resultados = []
    for nome, path, old, new in MUTACOES:
        aplica(path, old, new)
        try:
            rc, linhas = roda()
        finally:
            subprocess.run(["git", "checkout", "--", str(path)], cwd=WS, check=True)
        vermelhos = [ln for ln in linhas if ln.startswith("×")]
        print("== %s == exit=%d" % (nome, rc))
        for ln in linhas:
            print("   ", ln)
        resultados.append((nome, rc, vermelhos))

    print("\n===== RESUMO =====")
    ok = True
    for nome, rc, vermelhos in resultados:
        mordeu = rc != 0 and len(vermelhos) > 0
        ok = ok and mordeu
        print("%-38s mordeu=%s (%d teste(s) vermelho(s))" % (nome, "SIM" if mordeu else "NAO", len(vermelhos)))
    print("TODAS AS MUTACOES MORRERAM:", "SIM" if ok else "NAO")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
