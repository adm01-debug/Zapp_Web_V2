#!/usr/bin/env python3
"""Mutation testing do worker do Multiplix (Bloco A edge/front).

Cada mutante quebra UM comportamento que o teste precisa defender. Se o mutante
sobrevive (suite continua verde), o teste e decorativo naquele ponto.
Roda com: python3 scripts/tmp-mutate2.py
"""
import subprocess
import sys

WORKER = "supabase/functions/multiplix-send/index.ts"
DENO = [
    "deno", "test", "--config", "scripts/ci/deno.json", "--frozen", "--allow-env",
    "supabase/functions/multiplix-send/index.test.ts",
]

MUTANTS = [
    ("F09: supressao pos-claim ignorada",
     """        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (await isRecipientSuppressed(recipient.destino_e164)) {""",
     """        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (false && await isRecipientSuppressed(recipient.destino_e164)) {"""),
    ("F09: supressao antes do POST ignorada",
     "          if (await isRecipientSuppressed(recipient.destino_e164)) {",
     "          if (false && await isRecipientSuppressed(recipient.destino_e164)) {"),
    ("F17: pausa por cota com motivo errado",
     '          await pauseDispatch("daily_limit");',
     '          await pauseDispatch("outside_window");'),
    ("F17: cota diaria ignorada na checagem",
     "        if (dailyRoom !== null && dailyRoom <= 0) {",
     "        if (dailyRoom !== null && dailyRoom <= -999) {"),
    ("F17: cota nao e consumida por envio",
     "            if (dailyRoom !== null) dailyRoom -= 1;",
     "            if (false) dailyRoom -= 1;"),
    ("F11a: total do disparo zerado",
     "      selectedTotal += recipients.length;",
     "      selectedTotal += 0;"),
    ("F11a: lote padrao fora do configurado",
     '    const parsedBatchSize = Number.parseInt(Deno.env.get("MULTIPLIX_BATCH_SIZE") ?? "", 10);',
     '    const parsedBatchSize = Number.parseInt(Deno.env.get("MULTIPLIX_BATCH_SIZE") ?? "1000", 10);'),
    ("F11a: laco nao encerra na passada vazia",
     "      if (claimedInPass === 0) break;",
     "      if (claimedInPass === -1) break;"),
    ("F06: permissao de gestao nao e conferida no start",
     "      if (!(await canManageDispatch(targetDispatch.created_by))) {",
     "      if (false) {"),
    ("F10: pausa por janela com motivo errado",
     '          await pauseDispatch("outside_window");\n          break passLoop;',
     '          await pauseDispatch("daily_limit");\n          break passLoop;'),
]

pristine = open(WORKER, encoding="utf-8").read()
survivors, errors = [], []

def run_tests():
    proc = subprocess.run(DENO, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")

print("== baseline (sem mutante) ==")
code, out = run_tests()
print("   exit", code)
if code != 0:
    sys.exit("ABORT: a suite ja esta vermelha antes dos mutantes\n" + out[-800:])

for label, old, new in MUTANTS:
    n = pristine.count(old)
    if n != 1:
        errors.append((label, f"ancora aparece {n}x (esperado 1) — mutante nao aplicado"))
        print(f"PULADO {label}: ancora com {n} ocorrencia(s)")
        continue
    open(WORKER, "w", encoding="utf-8").write(pristine.replace(old, new, 1))
    code, out = run_tests()
    killed = code != 0
    print(f"{'MORTO  ' if killed else 'VIVO!!!'} {label}")
    if not killed:
        survivors.append(label)
    if "0 failed" not in out and not killed:
        errors.append((label, out[-400:]))
    open(WORKER, "w", encoding="utf-8").write(pristine)

assert open(WORKER, encoding="utf-8").read() == pristine, "worker nao foi restaurado"
print(f"\nresultado: {len(MUTANTS) - len(survivors) - len(errors)}/{len(MUTANTS)} mortos")
if survivors:
    print("SOBREVIVENTES (teste decorativo nesses pontos):")
    for s in survivors:
        print("  -", s)
for label, detail in errors:
    print(f"  erro em {label}: {detail}")
sys.exit(1 if (survivors or errors) else 0)
