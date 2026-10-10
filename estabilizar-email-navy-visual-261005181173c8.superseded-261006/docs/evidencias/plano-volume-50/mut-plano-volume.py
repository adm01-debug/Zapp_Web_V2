#!/usr/bin/env python3
"""Prova por mutação das etapas E10/E16/E37/E39/E41.

Para cada correção: desfaz a correção no código, roda o teste que a protege e
EXIGE vermelho; depois restaura por bytes e confere o sha256.
"""
import hashlib
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(
    "/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/"
    "plano-volume-50-etapas-finalizacao-2610011018e48d"
)

TESTE_MEDIA = "src/components/inbox/__tests__/MediaVolume.test.tsx"

MUTACOES = [
    {
        "nome": "E10a — contexto criado no mount (sem o gate do gesto de play)",
        "arquivo": "src/lib/mediaVolumeElement.ts",
        "de": "  if (!elementosComGesto.has(element)) return null;\n",
        "para": "",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "primeiro play"],
        "alvo": "o contexto da mídia nasce no primeiro play",
    },
    {
        "nome": "E10b — libera o ganho mas nao fecha o contexto (vaza AudioContext)",
        "arquivo": "src/lib/mediaVolumeElement.ts",
        "de": "    void contexto?.close().catch(() => {});\n",
        "para": "",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "primeiro play"],
        "alvo": "o contexto da mídia nasce no primeiro play",
    },
    {
        "nome": "E10c — fecha o contexto sem contar quantos players restam",
        "arquivo": "src/lib/mediaVolumeElement.ts",
        "de": "  if (elementosLigados > 0) return;\n",
        "para": "",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "fecha quando o"],
        "alvo": "o contexto só fecha quando o ÚLTIMO solta",
    },
    {
        "nome": "E16a — atalho so no botao (sem listener no container do player)",
        "arquivo": "src/hooks/ui/useVolumeRocker.ts",
        "de": "    player.addEventListener('keydown', aoTeclar);\n",
        "para": "",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "qualquer parte do player"],
        "alvo": "E16: as setas e o M valem com o foco em qualquer parte do player",
    },
    {
        "nome": "E16b — sem dedup: o mesmo teclado conta duas vezes",
        "arquivo": "src/hooks/ui/useVolumeRocker.ts",
        "de": "  if (event.defaultPrevented) return;\n",
        "para": "",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "qualquer parte do player"],
        "alvo": "E16: as setas e o M valem com o foco em qualquer parte do player",
    },
    {
        "nome": "E39 — cadeia do alerta nao termina no destination",
        "arquivo": "src/utils/notificationSounds.ts",
        "de": "gainNode.connect(ctx.destination);",
        "para": "void ctx.destination;",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "E38/E39"],
        "alvo": "E38/E39: com a mídia em mudo, o alerta continua saindo no ganho",
    },
    {
        "nome": "E41 — ancora de separacao removida do toque da chamada",
        "arquivo": "src/components/calls/IncomingCallAlert.tsx",
        "de": " * ÂNCORA (não unificar): o toque da chamada entrante é um **alerta**, não mídia de\n",
        "para": " * Nota: o toque da chamada entrante é um **alerta**, não mídia de\n",
        "cmd": ["bunx", "vitest", "run", TESTE_MEDIA, "-t", "E41"],
        "alvo": "E41: alertas e mídia não se importam",
    },
    {
        "nome": "E37a — isencao da biblioteca do admin sem a ancora textual",
        "arquivo": "src/components/settings/media-library/useMediaLibrary.ts",
        "de": "    // E37 — isenta do controle de volume de mídia (`mediaVolumeStore`): prévia da\n",
        "para": "    // E37 — isenta: prévia da\n",
        "cmd": ["bun", "run", "test:contracts", "--", "media-volume-surfaces"],
        "alvo": "contrato: prévia da biblioteca do admin declara a isenção",
    },
    {
        "nome": "E37b — superficie isenta passa a usar o controle de midia",
        "arquivo": "src/components/voice/ElevenLabsVoiceDesign.tsx",
        "de": "            {/* E37 — isenta do controle de volume de mídia (`mediaVolumeStore`): é o\n",
        "para": "            {/* useMediaVolume */}\n",
        "cmd": ["bun", "run", "test:contracts", "--", "media-volume-surfaces"],
        "alvo": "contrato: superfície isenta não usa o controle",
    },
]


def sha(caminho: pathlib.Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


def rodar(cmd, esperado_verde: bool, alvo: str):
    """Roda o teste e devolve (ok, saida). ok=True quando o resultado é o esperado."""
    processo = subprocess.run(
        cmd, cwd=RAIZ, capture_output=True, text=True, timeout=900,
        env={"PATH": "/home/joaquim_ataides/.bun/bin:/usr/local/bin:/usr/bin:/bin",
             "HOME": "/home/joaquim_ataides", "TMPDIR": str(RAIZ / ".tmp")},
    )
    saida = (processo.stdout + processo.stderr).strip().splitlines()
    resumo = " | ".join(linha for linha in saida if "Tests " in linha or "Test Files" in linha)[:160]
    passou = processo.returncode == 0
    return (passou == esperado_verde), resumo


def main() -> int:
    falhas = []
    print("=== 0) linha de base (tudo verde e sem mutação) ===")
    base_ok = True
    for cmd, alvo in [
        (["bunx", "vitest", "run", TESTE_MEDIA], "MediaVolume"),
        (["bun", "run", "test:contracts", "--", "media-volume-surfaces"], "contrato"),
    ]:
        ok, resumo = rodar(cmd, True, alvo)
        base_ok = base_ok and ok
        print(f"  {'OK ' if ok else 'FALHOU'} {alvo}: {resumo}")
    if not base_ok:
        print("linha de base vermelha: nada a provar.")
        return 1

    for indice, mut in enumerate(MUTACOES, start=1):
        arquivo = RAIZ / mut["arquivo"]
        original = arquivo.read_bytes()
        antes = sha(arquivo)
        texto = original.decode()
        if mut["de"] not in texto:
            print(f"[{indice}] {mut['nome']}: ALVO DA MUTACAO NAO ENCONTRADO — revisar")
            falhas.append(mut["nome"])
            continue

        arquivo.write_bytes(texto.replace(mut["de"], mut["para"], 1).encode())
        try:
            ok, resumo = rodar(mut["cmd"], False, mut["alvo"])
        finally:
            arquivo.write_bytes(original)
        depois = sha(arquivo)

        restaurado = antes == depois
        veredito = "PEGA" if ok else "SOBREVIVE"
        if not ok or not restaurado:
            falhas.append(mut["nome"])
        print(f"[{indice}] {veredito} {mut['nome']}\n      {resumo}"
              f"\n      arquivo restaurado: {'sim' if restaurado else 'NAO'}")

    print(f"\n=== {len(MUTACOES) - len(falhas)}/{len(MUTACOES)} mutações pegas ===")
    for nome in falhas:
        print(f"  NAO PEGA / FALHA: {nome}")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
