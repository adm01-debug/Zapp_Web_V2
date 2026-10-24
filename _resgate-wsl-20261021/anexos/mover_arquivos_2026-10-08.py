#!/usr/bin/env python3
"""Recorta e cola arquivos do projeto Zapp Web V2 espalhados fora da pasta dele (decisão do Joaquim, 08/10/2026).
Uso: mover_arquivos_2026-10-08.py [--executar]   (padrão: ensaio, não move nada)
Regras: lista explícita por nome (nunca por pasta inteira de arquivos pessoais); sha256 antes e depois da cópia;
byte-idêntico a algo já versionado no repo OU a outro arquivo do lote => fica uma só cópia; segredo detectado =>
vai para anexos/sensiveis (fora do git); nada é movido sem a cópia verificada."""
import os, re, sys, shutil, hashlib, subprocess, csv, time
H = os.path.expanduser("~"); W = "/mnt/c/Users/Joaquim Ataides"
REPO = f"{H}/projetos/Zapp_Web_V2"; DOCS = f"{REPO}/docs"; ANX = f"{H}/projetos/Zapp_Web_V2-anexos"
EXEC = "--executar" in sys.argv
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()
# blobs versionados (dia/2026-10-08) por hash git
blobs = {}
for l in subprocess.run(["git", "-C", REPO, "ls-tree", "-r", "dia/2026-10-08"], capture_output=True, text=True).stdout.splitlines():
    meta, path = l.split("\t", 1); blobs[meta.split()[2]] = path
SEG = [re.compile(x) for x in (r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", r"\bsk-[A-Za-z0-9]{20,}", r"\bsbp_[a-z0-9]{20,}",
       r"\bghp_[A-Za-z0-9]{30,}", r"AKIA[0-9A-Z]{16}", r"BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY",
       r"(?i)(service_role|api[_-]?key|secret|token|password|senha)\w*\s*[:=]\s*[\"']?[A-Za-z0-9_\-\.]{24,}")]
TEXTO = (".md", ".json", ".css", ".ts", ".html", ".txt", ".py", ".sql", ".sh", ".csv", ".mjs", ".tsx", ".diff", ".patch", ".toml", ".js", ".yml")
def tem_segredo(p):
    if not p.lower().endswith(TEXTO) or os.path.getsize(p) > 8_000_000: return False
    try: t = open(p, encoding="utf-8", errors="ignore").read()
    except OSError: return False
    return any(r.search(t) for r in SEG)
# (pasta de origem, regex do nome, destino relativo)
R = [
 (f"{W}/Desktop", r"^PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL.*\.md$", f"{DOCS}/plans"),
 (f"{W}/Desktop", r"^Plano_IA_Zapp_Web_V2_200_Etapas\.(md|json)$", f"{DOCS}/plans"),
 (f"{W}/Desktop", r"^PLANO_100_ETAPAS_WORKFLOWS_.*\.md$", f"{DOCS}/plans"),
 (f"{W}/Desktop", r"^PLANO_MULTIPLIX_200_ETAPAS\.md$", f"{DOCS}/plans"),
 (f"{W}/Desktop", r"^PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_v1\.1_.*\.md$", f"{DOCS}/plans"),
 (f"{W}/Desktop", r"^ZAPP_WEB_V2_TELEFONIA_AUDITORIA_E_60_MELHORIAS\.md$", f"{DOCS}/audits"),
 (f"{W}/Desktop", r"^(RELATORIO_REAUDITORIA_DELTA_.*\.md|FINDINGS_DELTA\.json|COBERTURA_DELTA\.csv|ARQUITETURA_V2_DESCOBERTAS\.md)$", f"{DOCS}/audits"),
 (f"{W}/Desktop", r"^(Multiplix_ZAPP_V2_(Especificacao|Prototipo).*\.(md|html)|ZAPP App v2\.dc\.html)$", f"{DOCS}/design"),
 (f"{W}/Desktop", r"^ADR-007-MULTIPLIX\.md$", f"{DOCS}/adr"),
 (f"{W}/Desktop", r"^(PROMPT_AUDITORIA_MIGRACAO_DB_v1|HERMES_AUTONOMOUS_ENGINE_V1|guia-exaustivo-promptops)\.md$", f"{DOCS}/prompts"),
 (f"{W}/Desktop", r"^(Multiplix_ZAPP_V2_Previa.*\.png|ZAPP_WEB_V2_TELEFONIA_SUGESTAO\.png)$", f"{ANX}/design"),
 (f"{W}/Downloads", r"^(PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.*|PROMPT_IMPLEMENTACAO_REDESIGN_CONTATOS_ZAPP_WEB_V2|00_PROMPT_MESTRE_DASHBOARD_WIDE_24_FULLHD_ZAPP_WEB_V2.*)\.md$", f"{DOCS}/plans"),
 (f"{W}/Downloads", r"^(ZAPP_WEB_V2_DARKBLUE_PREMIUM_DESIGN_SYSTEM\.md|ZAPP_DARKBLUE_PREMIUM_(TOKENS\.css|MOTION\.ts)|PROMO_GIFTS_V4_BLUE_PREMIUM_.*|CLAUDE_BLUE_PREMIUM_ACTIVATION_PROMPT\.md|design-system\.json|ui-kit-preview\.html)$", f"{DOCS}/design"),
 (f"{W}/Downloads", r"^HANDOFF-melhorias50-f4-2026-10-03\.md$", f"{DOCS}/handoffs"),
 (f"{W}/Downloads", r"^(TALKX_DARKBLUE_REDESIGN_PACKAGE\.zip|uxpilot-export.*\.pdf|UX Pilot - Superfast.*\.html|ZAPP_CAMPANHAS_TODAS_AS_IMAGENS.*\.zip)$", f"{ANX}/design"),
 (f"{W}/Downloads", r"^(zapp\.atomicabr\.com\.br|zapp-web-v2\.vercel\.app)-\d+\.log$", f"{ANX}/logs-navegador"),
 (f"{W}/Downloads", r"^MANUAL_extracao_service_role_lovable\.md$", f"{ANX}/sensiveis"),
 (W, r"^(auditoria-sidebar-2026-10-03\.zip|tel-00-before\.png)$", f"{ANX}/auditorias"),
 (f"{H}/auditoria-zapp-v3", r"^[^/]+\.md$", f"{DOCS}/audits/auditoria-zapp-v3"),
 (f"{H}/telefonia-lacunas-files/docs/design", r"^PLANO_TELEFONIA_FINALIZACAO_.*\.md$", f"{DOCS}/plans"),
 (f"{H}/hermes-handoffs", r"^HANDOFF-.*\.md$", f"{DOCS}/handoffs"),
]
# pastas WSL pequenas inteiras -> anexos (wip) ; sensíveis ; arquivo
DIRS = [("auditoria-zapp-v3", "wip"), ("telefonia-lacunas-files", "wip"), ("x006-wip", "wip"), ("parqueado", "wip"), ("patch-notify-due-tasks", "wip"),
        ("recuperados", "wip"), ("hermes-achados", "wip"), ("out", "wip"), ("src", "wip"), ("entrada", "sensiveis"), ("hermes-infra", "sensiveis"),
        ("qa-fase0", "arquivo"), ("backups", "arquivo"), ("mapa-zapp-v2", "arquivo"), ("_audit_v09b", "arquivo"), ("hermes-guard-tests", "arquivo")]
plano = []  # (origem, destino, motivo)
vistos = {}
def decidir(src, dst_dir, forcar_sens=False):
    h = sha(src); base = os.path.basename(src)
    if h in vistos: plano.append((src, vistos[h], "duplicado de arquivo do mesmo lote")); return
    gh = subprocess.run(["git", "-C", REPO, "hash-object", src], capture_output=True, text=True).stdout.strip()
    if gh in blobs: plano.append((src, f"{REPO}/{blobs[gh]}", "idêntico a arquivo já versionado")); vistos[h] = f"{REPO}/{blobs[gh]}"; return
    if forcar_sens or tem_segredo(src):
        dst_dir = f"{ANX}/sensiveis"; motivo = "segredo detectado -> fora do git" if not forcar_sens else "sensível por natureza -> fora do git"
    else: motivo = "mover"
    dst = os.path.join(dst_dir, base)
    if os.path.exists(dst) and sha(dst) != h: dst = os.path.join(dst_dir, os.path.splitext(base)[0] + "__externo-2026-10-08" + os.path.splitext(base)[1]); motivo += " (nome já existia com outro conteúdo)"
    plano.append((src, dst, motivo)); vistos[h] = dst
for srcdir, rx, dst in R:
    if not os.path.isdir(srcdir): continue
    for f in sorted(os.listdir(srcdir)):
        p = os.path.join(srcdir, f)
        if os.path.isfile(p) and re.search(rx, f): decidir(p, dst, forcar_sens=(dst.endswith("sensiveis")))
# ensaio / execução
cont = {}
for s, d, m in plano: cont[m.split(" (")[0]] = cont.get(m.split(" (")[0], 0) + 1
print("ARQUIVOS:", cont, "| total", len(plano))
for s, d, m in plano:
    if "segredo" in m or "sensível" in m: print("  SENSÍVEL:", s.replace(H, "~").replace(W, "W"))
dirs_ok = []
for d, kind in DIRS:
    p = f"{H}/{d}"
    if os.path.isdir(p): dirs_ok.append((p, f"{ANX}/{kind}/{d}"))
print("PASTAS WSL inteiras:", [(os.path.basename(a), b.split('/Zapp_Web_V2-anexos/')[1]) for a, b in dirs_ok])
if not EXEC: print("\n[ENSAIO] nada foi movido. Rode com --executar."); sys.exit(0)
log = open(f"{ANX}/MANIFESTO_MOVIMENTACAO_2026-10-08.tsv", "w", encoding="utf-8", newline=""); w = csv.writer(log, delimiter="\t")
w.writerow(["acao", "origem", "destino", "sha256", "bytes", "motivo"])
ok = err = 0
for s, d, m in plano:
    try:
        h = sha(s); n = os.path.getsize(s)
        if m.startswith(("duplicado", "idêntico")):
            os.remove(s); w.writerow(["removido-duplicata", s, d, h, n, m]); ok += 1; continue
        os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d)
        if sha(d) != h: raise RuntimeError("hash difere após a cópia")
        os.remove(s); w.writerow(["movido", s, d, h, n, m]); ok += 1
    except Exception as e:
        w.writerow(["ERRO", s, d, "", "", str(e)]); err += 1
for a, b in dirs_ok:
    try:
        os.makedirs(os.path.dirname(b), exist_ok=True); n = sum(len(fs) for _, _, fs in os.walk(a)); shutil.move(a, b)
        w.writerow(["pasta-movida", a, b, "", n, "pasta inteira"]); ok += 1
    except Exception as e: w.writerow(["ERRO", a, b, "", "", str(e)]); err += 1
log.close(); print(f"FEITO: {ok} ações, {err} erros. Manifesto: {ANX}/MANIFESTO_MOVIMENTACAO_2026-10-08.tsv")
