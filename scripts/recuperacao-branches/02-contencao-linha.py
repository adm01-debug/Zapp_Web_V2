import subprocess, collections, os
O = os.environ['OUT']
R = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()


def run(a):
    return subprocess.run(a, cwd=R, capture_output=True, text=True, errors='replace').stdout


# caminho -> blob na main
main_paths = {}
for ln in run(['git', 'ls-tree', '-r', 'origin/main']).splitlines():
    meta, path = ln.split('\t', 1)
    main_paths[path] = meta.split()[2]

rows = []
with open(f'{O}/unicos.tsv') as f:
    for ln in f:
        p = ln.rstrip('\n').split('\t')
        if len(p) == 3:
            rows.append(tuple(p))

# cache de conjuntos de linhas por blob
cache = {}


def lines(blob):
    if blob in cache:
        return cache[blob]
    txt = subprocess.run(['git', 'cat-file', 'blob', blob], cwd=R, capture_output=True, text=True, errors='replace').stdout
    s = set()
    for l in txt.splitlines():
        t = l.strip()
        # linha curta ou puro delimitador nao distingue nada: fora da comparacao
        if len(t) >= 8 and t not in ('*/', '/*', '});', '};', '},', 'return;'):
            s.add(t)
    cache[blob] = s
    if len(cache) > 6000:
        cache.clear()
    return s


out = []
for br, path, blob in rows:
    if blob == 'SEM-BLOB':
        out.append((br, path, 'ERRO', 0, 0))
        continue
    mb = main_paths.get(path)
    if mb is None:
        out.append((br, path, 'NOVO', 0, 0))
        continue
    bl = lines(blob)
    ml = lines(mb)
    falta = bl - ml
    out.append((br, path, 'CONTIDO' if not falta else 'PARCIAL', len(falta), len(bl)))

with open(f'{O}/linhas.tsv', 'w') as f:
    for r in out:
        f.write('\t'.join(map(str, r)) + '\n')

c = collections.Counter(r[2] for r in out)
print('categorias:', dict(c))
print('branches com NOVO ou PARCIAL:', len({r[0] for r in out if r[2] in ('NOVO', 'PARCIAL')}))
