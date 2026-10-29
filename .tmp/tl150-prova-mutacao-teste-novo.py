"""Prova vermelho->verde do teste NOVO (criterio 4): derruba a correcao que o
teste cobre e confirma que ele fica vermelho. Reverte sempre no final.
"""
import pathlib
import subprocess

WS = pathlib.Path(__file__).resolve().parents[1]
ALVO = "src/components/talkx/__tests__/TalkXCampaignScheduled.piso-e-espera.test.tsx"

MUTACOES = [
    (
        "A14-campo-min-em-UTC (como antes da correcao)",
        "src/components/talkx/TalkXCampaignScheduled.tsx",
        "min={minimumDate}",
        "min={new Date().toISOString().slice(0, 10)}",
    ),
    (
        "A12-sem-marco-de-espera (fallback removido)",
        "src/components/talkx/TalkXScheduleTimeline.tsx",
        "  if (milestones.length === 0) {\n"
        "    milestones.push({\n"
        "      key: 'configured', icon: CalendarCheck2, tone: 'muted', when: null,\n"
        "      label: 'Campanha aguardando data e horário no fuso ' + editing.timezone,\n"
        "    });\n"
        "  }\n",
        "",
    ),
]


def roda():
    proc = subprocess.run(["npx", "vitest", "run", ALVO], cwd=WS, capture_output=True, text=True)
    saida = proc.stdout + proc.stderr
    resumo = [ln.strip() for ln in saida.splitlines() if ln.strip().startswith(("Test Files", "Tests "))]
    falhos = [ln.strip() for ln in saida.splitlines() if ln.strip().startswith("×")]
    return proc.returncode, resumo, falhos


def aplica(rel, old, new):
    p = WS / rel
    txt = p.read_text(encoding="utf-8")
    if txt.count(old) != 1:
        raise SystemExit("ancora nao unica (%d) em %s" % (txt.count(old), rel))
    p.write_text(txt.replace(old, new), encoding="utf-8")


def reverte(rel):
    subprocess.run(["git", "checkout", "--", rel], cwd=WS, check=True)


def main():
    rc, resumo, falhos = roda()
    print("== baseline ==", "exit=%d" % rc, resumo)
    for nome, rel, old, new in MUTACOES:
        aplica(rel, old, new)
        try:
            rc, resumo, falhos = roda()
        finally:
            reverte(rel)
        print("== %s == exit=%d" % (nome, rc))
        for ln in falhos:
            print("   ", ln)
        print("   ", resumo)
        print("    mordeu=%s" % ("SIM" if rc != 0 and falhos else "NAO"))


main()
