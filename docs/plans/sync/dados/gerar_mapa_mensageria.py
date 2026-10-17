#!/usr/bin/env python3
"""Gera o mapa de divergencia HEAD x origin/main do recorte de mensageria
(TalkX / Multiplix / Evolution / WhatsApp / send-* / message-*) do SYNC20-16.

Leitura pura: usa `git ls-tree`, `git rev-parse`, `git log` e le o working tree
para achar consumidores. Nao altera arquivo nenhum de codigo.

Uso: python3 docs/plans/sync/dados/gerar_mapa_mensageria.py
Saida: dados/mensageria_funcoes.csv, dados/mensageria_hooks.csv,
       dados/mensageria_arquivos.csv (stdout resumido)
"""
import csv
import os
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
HEAD = "HEAD"
ORIGIN = "origin/main"

PREFIXES = ("evolution-", "whatsapp-webhook", "multiplix-", "talkx-", "send-", "message-")

# Modulos de `_shared` que sao contrato do recorte (importados pelas edges acima).
SHARED_RECORTE = (
    "supabase/functions/_shared/evolution-api-proxy.ts",
    "supabase/functions/_shared/evolution-control-authz.ts",
    "supabase/functions/_shared/evolution-types.ts",
    "supabase/functions/_shared/evolution-webhook-handlers.ts",
    "supabase/functions/_shared/evolution-webhook-messages.ts",
    "supabase/functions/_shared/talkx-tracking-token.ts",
    "supabase/functions/_shared/cors-origins.ts",
    "supabase/functions/_shared/hmac-validation.ts",
    "supabase/functions/_shared/validation.ts",
    "supabase/functions/_shared/cron-secret-auth.ts",
)

MESSAGING_HOOK_RE = re.compile(
    r"^src/hooks/(evolution/|integrations/(useTalkX|useMultiplix|useEvolution|"
    r"useExternalEvolution|useWhatsApp|useQuarantine|evolutionApi))"
)


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout


def ls_files(ref, path):
    out = git("ls-tree", "-r", "--name-only", ref, "--", path)
    return [l for l in out.splitlines() if l.strip()]


def blob(ref, path):
    out = git("rev-parse", "--verify", "--quiet", f"{ref}:{path}").strip()
    return out if out and not out.startswith("fatal") else None


def verify_jwt(ref, name):
    """Le [functions.<name>] verify_jwt do config.toml no ref."""
    txt = git("show", f"{ref}:supabase/config.toml")
    m = re.search(
        r"\[functions\." + re.escape(name) + r"\]\s*\n(?:#[^\n]*\n)*verify_jwt\s*=\s*(\w+)", txt
    )
    return m.group(1) if m else "(default true)"


def func_dirs(ref):
    out = git("ls-tree", "--name-only", ref, "supabase/functions/")
    dirs = []
    for line in out.splitlines():
        name = line.strip().split("/")[-1].rstrip("/")
        if name.startswith(PREFIXES):
            dirs.append(name)
    return sorted(set(dirs))


def eincluivel(rel: str) -> bool:
    """Chamador de verdade: fora de docs/, de testes e das listas de feature."""
    return not (
        re.search(r"(^|/)(docs|__tests__|e2e)/", rel)
        or ".test." in rel
        or "featuresSections" in rel
        or rel.endswith((".md", ".sh"))
    )


def consumers(name):
    """Arquivos que citam o nome da funcao (fora do proprio diretorio)."""
    skip = f"supabase/functions/{name}/"
    found = []
    for root in ("src", "supabase/functions", "scripts", "e2e"):
        p = REPO / root
        if not p.exists():
            continue
        for f in p.rglob("*"):
            if not f.is_file() or f.suffix not in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cs", ".sh", ".md"}:
                continue
            rel = str(f.relative_to(REPO))
            if rel.startswith(skip) or rel.startswith(".tmp"):
                continue
            try:
                txt = f.read_text(errors="ignore")
            except OSError:
                continue
            if name in txt:
                found.append(rel)
    return found


def main():
    funcs_head = func_dirs(HEAD)
    funcs_origin = func_dirs(ORIGIN)
    all_funcs = sorted(set(funcs_head) | set(funcs_origin))

    rows = []
    files_rows = []
    for name in all_funcs:
        h = ls_files(HEAD, f"supabase/functions/{name}")
        o = ls_files(ORIGIN, f"supabase/functions/{name}")
        hs, os_ = set(h), set(o)
        diff = sorted(x for x in hs & os_ if blob(HEAD, x) != blob(ORIGIN, x))
        head_only = sorted(hs - os_)
        origin_only = sorted(os_ - hs)
        entry = f"supabase/functions/{name}/index.ts"
        cons = consumers(name)
        cons_code = [c for c in cons if eincluivel(c)]
        rows.append(
            {
                "funcao": name,
                "status_dir": "origin_only" if name not in funcs_head else
                              ("head_only" if name not in funcs_origin else
                               ("blob_diferente" if diff or origin_only or head_only else "igual")),
                "index_head": (blob(HEAD, entry) or "-")[:10],
                "index_origin": (blob(ORIGIN, entry) or "-")[:10],
                "verify_jwt_head": verify_jwt(HEAD, name),
                "verify_jwt_origin": verify_jwt(ORIGIN, name),
                "arquivos_head": len(h),
                "arquivos_origin": len(o),
                "blobs_diferentes": len(diff),
                "origin_only": len(origin_only),
                "head_only": len(head_only),
                "consumidores": len(cons),
                "consumidores_codigo": len(cons_code),
                "consumidores_amostra": ";".join(cons_code[:6]),
            }
        )
        for f in diff:
            files_rows.append({"funcao": name, "caminho": f, "classe": "blob_diferente",
                               "hash_head": (blob(HEAD, f) or "-")[:10],
                               "hash_origin": (blob(ORIGIN, f) or "-")[:10]})
        for f in origin_only:
            files_rows.append({"funcao": name, "caminho": f, "classe": "origin_only",
                               "hash_head": "-", "hash_origin": (blob(ORIGIN, f) or "-")[:10]})
        for f in head_only:
            files_rows.append({"funcao": name, "caminho": f, "classe": "head_only",
                               "hash_head": (blob(HEAD, f) or "-")[:10], "hash_origin": "-"})

    with open(OUT / "mensageria_funcoes.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    with open(OUT / "mensageria_arquivos.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["funcao", "caminho", "classe", "hash_head", "hash_origin"])
        w.writeheader()
        w.writerows(files_rows)

    # dependencias relativas do lado origin que NAO existem no HEAD
    dep_files = []
    for name in all_funcs:
        for f in ls_files(ORIGIN, f"supabase/functions/{name}"):
            if f.endswith((".ts", ".tsx")):
                dep_files.append(f)
    dep_files += list(SHARED_RECORTE)
    imp_re = re.compile(r"""from\s+['"]((?:\.{1,2}/)[A-Za-z0-9._/-]+\.ts)['"]""")
    dep_rows = []
    for f in sorted(set(dep_files)):
        src = git("show", f"{ORIGIN}:{f}")
        for rel in sorted(set(imp_re.findall(src))):
            target = os.path.normpath(os.path.join(os.path.dirname(f), rel))
            if blob(HEAD, target) is None:
                dep_rows.append({"importador_origin": f, "dependencia_ausente_no_head": target})
    with open(OUT / "mensageria_deps_ausentes.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["importador_origin", "dependencia_ausente_no_head"])
        w.writeheader()
        w.writerows(dep_rows)
    print("dependencias ausentes no HEAD:", len(dep_rows))

    # modulos compartilhados do recorte (contrato entre as edges de mensageria)
    shared_rows = []
    for f in SHARED_RECORTE:
        bh, bo = blob(HEAD, f), blob(ORIGIN, f)
        if bh and bo and bh == bo:
            classe = "igual"
        elif bh and bo:
            classe = "blob_diferente"
        elif bo:
            classe = "origin_only"
        else:
            classe = "head_only"
        shared_rows.append({"caminho": f, "classe": classe,
                            "hash_head": (bh or "-")[:10], "hash_origin": (bo or "-")[:10]})
    with open(OUT / "mensageria_shared.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["caminho", "classe", "hash_head", "hash_origin"])
        w.writeheader()
        w.writerows(shared_rows)
    print("shared divergentes:", sum(1 for r in shared_rows if r["classe"] != "igual"), "de", len(shared_rows))

    # hooks de mensageria
    hook_rows = []
    for ref_label, ref in (("head", HEAD), ("origin", ORIGIN)):
        files = {f for f in ls_files(ref, "src/hooks") if MESSAGING_HOOK_RE.match(f)}
        for f in sorted(files):
            hook_rows.append({"lado": ref_label, "caminho": f, "hash": (blob(ref, f) or "-")[:10]})
    with open(OUT / "mensageria_hooks.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["lado", "caminho", "hash"])
        w.writeheader()
        w.writerows(hook_rows)

    print("funcoes:", len(all_funcs))
    for r in rows:
        print(
            f"{r['funcao']:<24} {r['status_dir']:<15} head={r['index_head']} origin={r['index_origin']}"
            f" jwt_h={r['verify_jwt_head']} jwt_o={r['verify_jwt_origin']}"
            f" dif={r['blobs_diferentes']} oo={r['origin_only']} ho={r['head_only']} cons={r['consumidores']}"
        )
    print("arquivos divergentes:", len(files_rows))


if __name__ == "__main__":
    main()
