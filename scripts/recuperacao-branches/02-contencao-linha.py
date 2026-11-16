import subprocess, collections, os, re
O = os.environ['OUT']
R = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()

# Linha feita so de estrutura: delimitador de bloco, virgula, ponto e virgula ou
# marcacao de comentario. NAO entram aqui operadores (`+`, `-`, `=>`, `||`): quando um
# operador ocupa uma linha propria, ele E a diferenca de comportamento -- trocar `+` por
# `-` muda a conta. Achado do Codex na PR #3192, reproduzido antes da troca.
ESTRUTURAL = re.compile(r'^(?:[\s{}()\[\];,]*|/\*+|\*+/|//+|\*)$')


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

# merge-base por branch, para detectar linha REMOVIDA pela branch
mb_cache = {}


def merge_base(br):
    if br not in mb_cache:
        mb_cache[br] = subprocess.run(['git', 'merge-base', 'origin/main', br], cwd=R, capture_output=True, text=True).stdout.strip()
    return mb_cache[br]


def linhas_de(ref, path):
    out = subprocess.run(['git', 'show', f'{ref}:{path}'], cwd=R, capture_output=True, text=True, errors='replace')
    if out.returncode != 0:
        return None
    s = set()
    for l in out.stdout.splitlines():
        t = l.strip()
        if t and not ESTRUTURAL.match(t):
            s.add(t)
    return s


# cache de conjuntos de linhas por blob
cache = {}


def lines(blob):
    if blob in cache:
        return cache[blob]
    txt = subprocess.run(['git', 'cat-file', 'blob', blob], cwd=R, capture_output=True, text=True, errors='replace').stdout
    s = set()
    for l in txt.splitlines():
        t = l.strip()
        # Nao se corta por tamanho: uma linha curta pode ser a diferenca inteira de
        # comportamento -- `true;` contra `false;` sao 5 e 6 caracteres e invertem a regra.
        if t and not ESTRUTURAL.match(t):
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
    if falta:
        out.append((br, path, 'PARCIAL', len(falta), len(bl)))
        continue
    # A main contem todas as linhas da branch -- mas REMOVER linha tambem e trabalho.
    # Linha que existia no ponto de bifurcacao, a branch tirou e a main ainda tem e'
    # remocao nao incorporada, e sairia como CONTIDO. Achado do Codex na PR #3192;
    # medido nesta base: 7 dos 208 pares CONTIDO, dois deles em migration.
    base = merge_base(br)
    lbase = linhas_de(base, path) if base else None
    if lbase is not None:
        removidas = (lbase - bl) & ml
        if removidas:
            out.append((br, path, 'PARCIAL-REMOCAO', len(removidas), len(bl)))
            continue
    out.append((br, path, 'CONTIDO', 0, len(bl)))

with open(f'{O}/linhas.tsv', 'w') as f:
    for r in out:
        f.write('\t'.join(map(str, r)) + '\n')

c = collections.Counter(r[2] for r in out)
print('categorias:', dict(c))
print('branches com NOVO ou PARCIAL:', len({r[0] for r in out if r[2] in ('NOVO', 'PARCIAL')}))
