"""Extrai a arvore de uma revisao do repo de referencia para o workspace.

Leitura somente: usa `git show <rev>:<path>` (comando de consulta permitido).
Escreve apenas dentro do workspace proprio. Uso:
  python3 extract.py <rev> <dest>
"""
import subprocess
import sys
import os

REPO = "/home/joaquim_ataides/projetos/Zapp_Web_V2"


def git(*args):
    p = subprocess.run(
        ["git", "-C", REPO] + list(args),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} falhou: {p.stderr.decode()[:300]}")
    return p.stdout


def main():
    rev, dest = sys.argv[1], sys.argv[2]
    out = git("ls-tree", "-r", "-z", "--full-name", rev).decode("utf-8", "replace")
    # formato: <mode> <type> <sha>\t<path>\0
    entries = []
    for chunk in out.split("\0"):
        if not chunk.strip():
            continue
        meta, path = chunk.split("\t")
        mode, typ, sha = meta.split(" ")
        if typ == "blob":
            entries.append((path, sha))
    print(f"arquivos: {len(entries)}", flush=True)
    # busca os blobs em lote com um unico processo git
    proc = subprocess.Popen(
        ["git", "-C", REPO, "cat-file", "--batch"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout
    ok, falha = 0, 0
    for path, sha in entries:
        if ".." in path.split("/"):
            falha += 1
            continue
        target = os.path.join(dest, path)
        os.makedirs(os.path.dirname(target) or dest, exist_ok=True)
        proc.stdin.write((sha + "\n").encode())
        proc.stdin.flush()
        header = proc.stdout.readline().decode().strip().split(" ")
        if len(header) < 3 or header[1] != "blob":
            falha += 1
            continue
        size = int(header[2])
        data = proc.stdout.read(size)
        trailer = proc.stdout.read(1)  # \n final do lote
        if len(data) != size:
            falha += 1
            continue
        with open(target, "wb") as f:
            f.write(data)
        ok += 1
        if ok % 1500 == 0:
            print(f"  ...{ok} arquivos", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"OK={ok} FALHA={falha}", flush=True)


if __name__ == "__main__":
    main()
