#!/usr/bin/env python3
"""Mutation testing do worker do Multiplix (Bloco A edge/front).

Cada mutante quebra UM comportamento que o teste precisa defender. Se o mutante
sobrevive (suite continua verde), o teste e decorativo naquele ponto. Morto =
assercao falhou com a suite rodando (erro de type-check nao conta como morte).
Roda no CI: passo "Provar por mutação os testes do worker do Multiplix (N-017)"
do .github/workflows/db-guard.yml (job offline-contract) — fail-closed: sai 1 se
algum mutante sobreviver. A mao: python3 scripts/db-audit/multiplix-send-mutation.py
"""
import re
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
     "            if (dailyRoom !== null) dailyRoom -= 0;"),
    ("F11a: total do disparo zerado",
     "      selectedTotal += claimable.length;",
     "      selectedTotal += 0;"),
    ("F11a: lote padrao fora do configurado",
     '    const parsedBatchSize = Number.parseInt(Deno.env.get("MULTIPLIX_BATCH_SIZE") ?? "", 10);',
     '    const parsedBatchSize = Number.parseInt(Deno.env.get("MULTIPLIX_BATCH_SIZE") ?? "1000", 10);'),
    # F11a: o mutante "laco nao encerra na passada vazia" (`if (claimedInPass === 0)
    # break;`) saiu em 09/10/2026 — o `for(;;)` que ele atacava virou UMA passada por
    # invocacao (F11a, 01/10) e o `break passLoop` do FIM do bloco ja encerra a
    # passada vazia. Sem o `break` do topo o fluxo cai no MESMO break de fim de
    # bloco (mutante equivalente): medido com `||`->`&&` e com `=== -1`, a suite
    # fica verde (80 passed | 0 failed). Nenhum teste pode mata-lo, entao ele nao
    # prova nada — fica aqui registrado para nao voltar como "ancora 0x".
    ("F06: permissao de gestao nao e conferida no start",
     "      if (!(await canManageDispatch(targetDispatch.created_by))) {",
     "      if (false) {"),
    ("F10: pausa por janela com motivo errado",
     '          await pauseDispatch("outside_window");\n          break passLoop;',
     '          await pauseDispatch("daily_limit");\n          break passLoop;'),
    # --- Auditoria adversarial 29/09/2026 ---------------------------------------
    # Mutantes dos pontos em que a suite ficava verde com o comportamento
    # quebrado (27 de 40 mutantes sobreviviam). Cada um casa com um teste
    # "gap M*" em index.test.ts — se o teste sumir, o mutante volta a viver.
    ("M08: supressao do 1o ponto ignorada mantendo a RPC",
     """        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (await isRecipientSuppressed(recipient.destino_e164)) {""",
     """        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (await isRecipientSuppressed(recipient.destino_e164) && false) {"""),
    ("M13: cota consultada com conexao arbitraria",
     'supabase.rpc("multiplix_connection_daily_usage", { p_connection_id: connectionId });',
     'supabase.rpc("multiplix_connection_daily_usage", { p_connection_id: "00000000-0000-0000-0000-0000000000ff" });'),
    ("M16: teto de 200 do lote removido",
     "const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.min(parsedBatchSize, 200) : 20;",
     "const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 20;"),
    ("M18: env invalido de lote tratado como valor alto",
     "const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.min(parsedBatchSize, 200) : 20;",
     "const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.min(parsedBatchSize, 200) : 999999999;"),
    ("M25: supressao ilegivel libera envio (fail-open)",
     """      if (error || typeof data !== "boolean") {
        throw new Error(`multiplix_suppression_check_failed: ${error?.message ?? "invalid_response"}`);
      }""",
     """      if (error || typeof data !== "boolean") {
        return false;
      }"""),
    # MX02/F37/F43 (01-02/10) tiraram `getMediaEndpoint`/`mediaEndpoint` do worker: a
    # midia do ITEM sai do SEU bloco e o adaptador decide o endpoint pelo `MessageKind`
    # de `kindForMedia`. O mutante continua no MESMO ponto de prova (midia nao pode cair
    # no endpoint de texto), agora ancorado no mapeamento do audio (nota de voz -> ptt).
    ("M32: midia de audio (nota de voz) cai no endpoint de texto",
     '    case "audio":\n      return "ptt";',
     '    case "audio":\n      return "text";'),
    # F60 (TL-035, 10/10/2026): o worker le `whatsapp_connections.capabilities` e
    # exclui (skipped, motivo nomeado) o bloco que a conexao nao entrega, ANTES de
    # qualquer rede. Cada mutante casa com um teste F60 em index.test.ts.
    ("F60: veto por capacidade declarada removido (false explicito nao barra)",
     "  if (caps[capabilityKey] === false) return `connection_capability_unsupported:${capabilityKey}`;",
     "  if (false) return `connection_capability_unsupported:${capabilityKey}`;"),
    ("F60: teto max_chars declarado ignorado (texto acima do teto passa)",
     "  if (typeof maxChars === \"number\" && Number.isFinite(maxChars) && text.length > maxChars) {",
     "  if (typeof maxChars === \"number\" && Number.isFinite(maxChars) && text.length < maxChars) {"),
    ("F60: audio/voz nao caem na chave ptt (veto ptt nao pega a nota de voz)",
     '  const capabilityKey = kind === "audio" || kind === "voice" ? "ptt" : kind;',
     '  const capabilityKey = kind;'),
]

pristine = open(WORKER, encoding="utf-8").read()
survivors, errors = [], []


def run_tests():
    proc = subprocess.run(DENO, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def classificar(out: str) -> tuple[str, int, int]:
    """Classifica o mutante pelo RESUMO DE TESTES, nunca pelo exit code.

    Exit code != 0 tambem acontece quando o mutante quebra o type-check e
    NENHUM teste roda (foi assim que um falso 'morto' entrou no primeiro
    relatorio). Morto = pelo menos uma ASSERCAO falhou com a suite rodando.
    """
    resumo = re.search(r"(\d+) passed \| (\d+) failed", out)
    if not resumo:
        return "invalido", 0, 0
    passed, failed = int(resumo.group(1)), int(resumo.group(2))
    return ("morto" if failed > 0 else "vivo"), passed, failed


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
    veredito, passed, failed = classificar(out)
    if veredito == "morto":
        print(f"MORTO    {label}  ({failed} assercao(oes) falharam)")
    elif veredito == "vivo":
        print(f"VIVO!!!  {label}  (suite verde: {passed} passed | 0 failed)")
        survivors.append(label)
    else:
        # Sem resumo de testes: o mutante nao compila ou o runner quebrou antes
        # de rodar. Isso NAO e o teste pegando o mutante — conta como falha do
        # proprio harness de mutacao, nunca como morte.
        print(f"INVALIDO {label}  (sem resumo de testes: type-check/runner)")
        errors.append((label, out[-400:]))
    open(WORKER, "w", encoding="utf-8").write(pristine)

assert open(WORKER, encoding="utf-8").read() == pristine, "worker nao foi restaurado"
print(f"\nresultado: {len(MUTANTS) - len(survivors) - len(errors)}/{len(MUTANTS)} mortos por assercao")
if survivors:
    print("SOBREVIVENTES (teste decorativo nesses pontos):")
    for s in survivors:
        print("  -", s)
for label, detail in errors:
    print(f"  erro em {label}: {detail}")
sys.exit(1 if (survivors or errors) else 0)
