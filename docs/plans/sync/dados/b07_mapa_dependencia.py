#!/usr/bin/env python3
"""SYNC20-38 / B07-hooks-38 - mapa medido de dependencia (dia x origin/main).

Nao altera a arvore: so le o git (HEAD = dia-base, ORIGIN = tip da origin pinada).
Saidas: b07_arquivos.csv, b07_deps.csv, b07_deps_ausentes.csv

Fonte do lote: docs/plans/sync/dados/lotes.json (chave 'B07-hooks-38'),
matriz aprovada 694e68327b. Rodar do workdir do cartao:
    python3 docs/plans/sync/dados/b07_mapa_dependencia.py
"""
import csv
import os
import re
import subprocess

BASE = "d723a90107"        # dia-base do cartao (2026-10-17)
ORIGIN = "a9b4d6c6fb"      # origin/main pinada no plano (origin/main hoje = fed4f57d74)
OUTDIR = os.path.join("docs", "plans", "sync", "dados")

LOTE = [
    "src/hooks/chat/useRealtimeMessages.ts",
    "src/hooks/chat/useTeamChatDraft.ts",
    "src/hooks/chat/useTeamChatNotifications.ts",
    "src/hooks/chat/useTypingPresence.ts",
    "src/hooks/chat/useWhisperCount.ts",
    "src/hooks/communication/__tests__/mediaVolume.players.test.tsx",
    "src/hooks/communication/__tests__/useAudioMemes.fechamento.test.tsx",
    "src/hooks/communication/__tests__/useAudioMemes.mediaVolumeBindings.test.tsx",
    "src/hooks/communication/__tests__/useAudioMemes.mutacoes.test.tsx",
    "src/hooks/communication/useAudioMemes.ts",
    "src/hooks/communication/useAudioRecorder.ts",
    "src/hooks/communication/useTextToSpeech.ts",
    "src/hooks/communication/useTranscriptionNotifications.ts",
    "src/hooks/crm/useAgents.ts",
    "src/hooks/dashboard/useDashboardKpi.ts",
    "src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts",
    "src/hooks/gamification/__tests__/useLeaderboard.test.tsx",
    "src/hooks/gamification/useAgentGamification.ts",
    "src/hooks/groups/actions.ts",
    "src/hooks/inbox/__tests__/chipCounts.test.ts",
    "src/hooks/inbox/__tests__/useInboxBulkActions.test.ts",
    "src/hooks/inbox/__tests__/useInboxFilters.dia-local.test.tsx",
    "src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx",
    "src/hooks/inbox/chipCounts.ts",
    "src/hooks/inbox/useInboxBulkActions.ts",
    "src/hooks/inbox/useInboxFilterTags.ts",
    "src/hooks/inbox/useInboxFilters.ts",
    "src/hooks/inbox/useRealtimeInbox.ts",
    "src/hooks/inbox/useSentimentAlerts.ts",
    "src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts",
    "src/hooks/integrations/__tests__/useGmail.threadListQuery.test.tsx",
    "src/hooks/integrations/__tests__/useMultiplixReplies.test.tsx",
    "src/hooks/integrations/__tests__/useTalkXTemplates.test.ts",
    "src/hooks/integrations/useCatalogSendHistory.ts",
    "src/hooks/integrations/useCustomEmojis.ts",
    "src/hooks/integrations/useGmail.ts",
    "src/hooks/integrations/useMultiplixDispatches.ts",
    "src/hooks/integrations/useMultiplixReplies.ts",
]

EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".json", ".css", "/index.ts", "/index.tsx"]
IMPORT_RE = re.compile(r"""(?:from|import\s*\()\s*['"]([^'"]+)['"]""")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True)


def blob(ref, path):
    r = git("rev-parse", f"{ref}:{path}")
    return r.stdout.strip() if r.returncode == 0 else ""


def read(ref, path):
    r = git("show", f"{ref}:{path}")
    return r.stdout if r.returncode == 0 else ""


def resolve(spec, importer, ref):
    """Resolve um import para um caminho de arquivo existente em `ref`."""
    if spec.startswith("@/"):
        base = "src/" + spec[2:]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        return None
    for e in EXT:
        cand = base + e
        if blob(ref, cand):
            return cand
    return None


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    arquivos, deps, ausentes = [], [], []

    for path in LOTE:
        bd, bo = blob(BASE, path), blob(ORIGIN, path)
        if not bd and bo:
            status = "origin_only"
        elif bd and not bo:
            status = "apagado_na_origin"
        elif bd == bo:
            status = "igual"
        else:
            status = "blob_diferente"
        ns = git("diff", "--numstat", BASE, ORIGIN, "--", path).stdout.strip()
        add, dele = ("0", "0")
        if ns:
            parts = ns.split("\t")
            add, dele = parts[0], parts[1]
        eh_teste = "__tests__" in path or path.endswith((".test.ts", ".test.tsx"))
        arquivos.append(dict(arquivo=path, status=status, blob_dia=bd[:12],
                             blob_origin=bo[:12], add=add, del_=dele,
                             eh_teste=str(eh_teste).lower()))

        src = read(ORIGIN, path)
        vistos = set()
        for spec in IMPORT_RE.findall(src):
            if spec in vistos:
                continue
            vistos.add(spec)
            if not (spec.startswith("@/") or spec.startswith(".")):
                continue
            alvo = resolve(spec, path, ORIGIN)
            if not alvo:
                deps.append(dict(arquivo=path, import_=spec, alvo="", existe_dia="nao",
                                 existe_origin="nao", interno_lote="nao", blob_muda="nao"))
                ausentes.append(dict(arquivo=path, import_=spec, alvo="", motivo="nao resolve na origin"))
                continue
            ex_dia = bool(blob(BASE, alvo))
            ex_orig = bool(blob(ORIGIN, alvo))
            interno = str(alvo in LOTE).lower()
            muda = str(bool(ex_dia) and blob(BASE, alvo) != blob(ORIGIN, alvo)).lower()
            deps.append(dict(arquivo=path, import_=spec, alvo=alvo, existe_dia=str(ex_dia).lower(),
                             existe_origin=str(ex_orig).lower(), interno_lote=interno, blob_muda=muda))
            if not ex_dia:
                ausentes.append(dict(arquivo=path, import_=spec, alvo=alvo,
                                     motivo="nao existe na dia-base"))

    def dump(nome, rows):
        rows = [{("import" if k == "import_" else k): v for k, v in r.items()} for r in rows]
        with open(os.path.join(OUTDIR, nome), "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
        print(f"{nome}: {len(rows)} linhas")

    dump("b07_arquivos.csv", arquivos)
    dump("b07_deps.csv", deps)
    if ausentes:
        dump("b07_deps_ausentes.csv", ausentes)
    else:
        open(os.path.join(OUTDIR, "b07_deps_ausentes.csv"), "w").close()
        print("b07_deps_ausentes.csv: 0 linhas")

    # raio de impacto: quem importa (na dia) cada alvo do lote e cada alvo externo que muda
    alvos = sorted({d["alvo"] for d in deps if d["alvo"]} | set(LOTE))
    blast = []
    for alvo in alvos:
        spec = alvo
        for e in (".tsx", ".ts"):
            if spec.endswith(e):
                spec = spec[: -len(e)]
                break
        r = git("grep", "-l", "-F", spec, BASE, "--", "src", "tests")
        imp = [l.split(":", 1)[1] for l in r.stdout.strip().splitlines() if ":" in l and l.split(":", 1)[1] != alvo]
        imp = sorted(set(imp))
        if not imp:
            continue
        testes = [i for i in imp if "__tests__" in i or ".test." in i]
        blast.append(dict(alvo=alvo, importadores=len(imp), testes=len(testes),
                          quem=" | ".join(imp)))
    if blast:
        dump("b07_raio_impacto.csv", blast)
        alcancados = set()
        for b in blast:
            alcancados.update(x for x in b["quem"].split(" | ") if "__tests__" in x or ".test." in x)
        print("raio: alvos com importador =", len(blast), "| arquivos de teste alcancados =", len(alcancados))

    # resumo no stdout
    from collections import Counter
    print("status:", dict(Counter(a["status"] for a in arquivos)))
    print("deps fora do lote que mudam:", len({d["alvo"] for d in deps if d["interno_lote"] == "false" and d["blob_muda"] == "true"}))
    print("deps ausentes na dia:", len(ausentes))


if __name__ == "__main__":
    main()
