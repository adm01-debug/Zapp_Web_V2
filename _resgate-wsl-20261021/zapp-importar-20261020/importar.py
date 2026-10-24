#!/usr/bin/env python3
"""
RECORTAR E COLAR o trabalho do Zapp Web V2 espalhado no WSL para dentro do repositorio local
(~/projetos/Zapp_Web_V2). Cada origem so e apagada DEPOIS de importada e conferida byte a byte.

  python3 importar.py --simular             so le: mostra o que faria (nao grava no repositorio, nao apaga nada)
  python3 importar.py --executar            RODADA 1: importa tudo para o repositorio e confere. NAO apaga nada.
  python3 importar.py --executar --apagar   RODADA 2: rele o disco, confere byte a byte com o importado e so entao apaga.
  Retomavel: rodar de novo continua de onde parou.

Garantias:
  * nada existente e sobrescrito: so cria refs novas (nunca altera nem apaga ref que ja existe);
  * cada pasta vira um commit cuja arvore e recalculada aqui, arquivo por arquivo (sha1 dos bytes do disco),
    e comparada com a que o git gravou; so com as duas iguais a origem e apagada;
  * antes de apagar, confere que a pasta nao mudou desde a captura (status do git + tamanho/data de cada arquivo);
  * fica de fora (e nao e apagado): worktree de cartao aberto no Kanban, com atividade nas ultimas 72 h,
    travada, usada por servico (preview/typecheck), estado da fabrica (.integra), com processo rodando dentro,
    ou com repositorio desconhecido dentro.
Nao entram no git: node_modules/dist/caches (regeneraveis) e copias de banco sqlite (.db: copias do Kanban
feitas pelos agentes) somem junto com a pasta; segredos locais (.env.local, chaves) vao para
~/.secrets/zapp-importados (INDICE.tsv diz a origem).
Log: importar.log (ou simular.log). Estado retomavel: estado.json
"""
import os, sys, re, json, time, hashlib, subprocess, shutil, sqlite3, collections, stat, fcntl, urllib.parse, tempfile, struct

H = '/home/joaquim_ataides'
R = H + '/projetos/Zapp_Web_V2'
D = os.path.dirname(os.path.abspath(__file__))
SIM = '--simular' in sys.argv
EXE = '--executar' in sys.argv
APAGAR = EXE and '--apagar' in sys.argv
if SIM == EXE:
    sys.exit(__doc__)
EU = b'Joaquim Ataides <ti@promobrindes.com.br>'
TS = int(time.time())
LOTE = 40
AMOSTRA_SIM = 12          # na simulacao, quantas pastas tem o conteudo lido por inteiro (o resto: so tamanho)
KANBAN = '/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/kanban.db'
ASSINATURA = 'importado por ~/backups/zapp-importar-20261020/importar.py'

class Pare(Exception):
    pass

LOG = open(os.path.join(D, 'simular.log' if SIM else 'importar.log'), 'a')
def log(*a):
    m = time.strftime('%d/%m %H:%M:%S ') + ' '.join(str(x) for x in a)
    print(m, flush=True)
    LOG.write(m + '\n'); LOG.flush()

# na execucao (terminal do Joaquim) a limpeza automatica do git fica desligada; na simulacao as guardas do agente nao aceitam -c
GIT = ['git', '--no-optional-locks'] + ([] if SIM else ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.fsmonitor=false'])
def git(repo, *a, inp=None, ok=(0,)):
    r = subprocess.run(GIT + ['-C', repo] + list(a), input=inp, capture_output=True)
    if r.returncode not in ok:
        raise Pare('git %s (em %s) falhou rc=%d: %s' % (' '.join(a[:4]), repo, r.returncode,
                                                        r.stderr.decode(errors='replace').strip()[-700:]))
    return r.stdout
def gs(repo, *a, **k):
    return git(repo, *a, **k).decode()

# ---------------------------------------------------------------- estado retomavel
EST_P = os.path.join(D, 'estado.json')
EST = json.load(open(EST_P)) if ((EXE or os.environ.get('SIM_RETOMAR')) and os.path.exists(EST_P)) else {}   # SIM_RETOMAR: simula a retomada (so le)
def salvar():
    if EXE:
        t = EST_P + '.tmp'
        json.dump(EST, open(t, 'w'), indent=0, ensure_ascii=True)
        os.replace(t, EST_P)

# ---------------------------------------------------------------- hash e arvore (calculo proprio, independente do git)
def h_blob(b):
    return hashlib.sha1(b'blob %d\0' % len(b) + b).hexdigest()

def montar(ent):
    raiz = {}
    for p, v in ent.items():
        partes = p.split(b'/')
        d = raiz
        for x in partes[:-1]:
            d = d.setdefault(x, {})
            if not isinstance(d, dict):
                raise Pare('caminho e arquivo e pasta ao mesmo tempo: %r' % p)
        if partes[-1] in d:
            raise Pare('caminho repetido ou arquivo e pasta ao mesmo tempo: %r' % p)
        d[partes[-1]] = v
    return raiz

def arvore(ent):
    """ent: {caminho_bytes: (modo, sha)} -> sha da arvore, igual ao que o git calcula.
    Modo 040000/40000 = subarvore inteira ja existente (referenciada pelo sha)."""
    def hs(d):
        it = []
        for n, v in d.items():
            if isinstance(v, dict):
                it.append((n + b'/', b'40000', hs(v), n))
            elif v[0] in ('040000', '40000'):
                it.append((n + b'/', b'40000', v[1], n))
            else:
                it.append((n, v[0].encode(), v[1], n))
        it.sort(key=lambda x: x[0])
        corpo = b''.join(m + b' ' + n + b'\0' + bytes.fromhex(s) for _, m, s, n in it)
        return hashlib.sha1(b'tree %d\0' % len(corpo) + corpo).hexdigest()
    return hs(montar(ent))

def ls_tree(repo, rev):
    e = {}
    for rec in git(repo, 'ls-tree', '-r', '-z', '--full-tree', rev).split(b'\0'):
        if rec:
            meta, p = rec.split(b'\t', 1)
            m, t, s = meta.split(b' ')
            e[p] = (m.decode(), s.decode())
    return e

def autoteste():
    e = ls_tree(R, 'HEAD')
    a = arvore(e); b = gs(R, 'rev-parse', 'HEAD^{tree}').strip()
    if a != b:
        raise Pare('autoteste: arvore calculada %s != git %s' % (a, b))
    p = R + '/CLAUDE.md'
    if h_blob(open(p, 'rb').read()) != gs(R, 'hash-object', '--no-filters', p).strip():
        raise Pare('autoteste: hash de arquivo diverge do git')
    log('autoteste OK: arvore recalculada aqui == git (%d arquivos); hash de arquivo == git' % len(e))

# ---------------------------------------------------------------- regras: lixo regeneravel / copia de banco / segredo
LIXO_DIR = {'node_modules', '.tc-cache', 'node-compile-cache', '.vite', '.turbo', '.ruff_cache', '__pycache__',
            '.eslintcache', '.next', '.pnpm-store', '.bun', '.npm', '.cache', '.deno'}
LIXO_RAIZ = {'dist', 'coverage', 'playwright-report', 'test-results', 'graphify-out'}
LIXO_ARQ = re.compile(rb'(\.tsbuildinfo|\.pyc)$|(^|/)\.husky/_/')
BANCO = re.compile(rb'\.(db|db-wal|db-shm|db-journal|sqlite|sqlite3)$')
SEGREDO = re.compile(rb'(^|/)\.env(\.(?!example$|sample$|template$|production$)[^/]*)?$|\.pem$|'
                     rb'(^|/)id_(rsa|ed25519|ecdsa)(\.pub)?$|(^|/)\.auth(/|$)')
SESSAO = re.compile(r'(^|/)\.auth(/|$)')          # estado de sessao: regeneravel, nunca copiado

def repo_real(ab):
    """Pasta e um repositorio git de verdade? (.git pasta, ou .git arquivo apontando para admin que existe e aponta de volta).
    Ponteiro quebrado ou emprestado (copia de worktree) = pasta comum."""
    g = os.path.join(ab, '.git')
    if os.path.isdir(g) and not os.path.islink(g):
        return True
    if not os.path.isfile(g):
        return False
    try:
        t = open(g).read().strip()
    except OSError:
        return False
    if not t.startswith('gitdir: '):
        return False
    adm = t[8:]
    if not os.path.isabs(adm):
        adm = os.path.normpath(os.path.join(ab, adm))
    if not os.path.isdir(adm):
        return False
    try:
        return open(os.path.join(adm, 'gitdir')).read().strip() == g
    except OSError:
        return os.path.isdir(os.path.join(adm, 'objects'))

def novo_info():
    return dict(lixo=0, bancos=[], segredos=[], repos_dentro=[], especiais=[], grandes=[], bytes_disco=0, arquivos_disco=0, cegos=0)

def modo_de(st):
    if stat.S_ISLNK(st.st_mode):
        return '120000'
    return '100755' if st.st_mode & stat.S_IXUSR else '100644'

def varrer(base, rel, excl, disco, info, filtro=True):
    """Poe em disco[caminho_relativo] = caminho_absoluto todo arquivo util abaixo de base/rel."""
    topo = os.path.join(base, os.fsdecode(rel)) if rel else base
    if os.path.islink(topo) or not os.path.isdir(topo):
        if os.path.lexists(topo):
            disco[rel] = topo
        return
    for dp, dns, fns in os.walk(topo):
        rdp = os.path.relpath(dp, base)
        rdp = b'' if rdp == '.' else os.fsencode(rdp)
        pref = rdp + b'/' if rdp else b''
        ficam = []
        for d in dns:
            ab = os.path.join(dp, d); rp = pref + os.fsencode(d)
            if os.path.islink(ab):
                fns.append(d); continue
            if ab in excl:
                continue
            if d in LIXO_DIR or (dp == topo and rel == b'' and d in LIXO_RAIZ):
                info['lixo'] += 1; continue
            if SEGREDO.search(rp):
                info['segredos'].append(ab); continue
            if d == '.git':
                info['repos_dentro'].append(ab); continue
            if os.path.lexists(os.path.join(ab, '.git')) and repo_real(ab):
                info['repos_dentro'].append(ab); continue
            ficam.append(d)
        dns[:] = ficam
        for f in fns:
            ab = os.path.join(dp, f); rp = pref + os.fsencode(f)
            if f == '.git':                      # ponteiro de worktree: guarda o texto com outro nome
                rp = pref + b'.git-original'
            if SEGREDO.search(rp):
                info['segredos'].append(ab); continue
            if filtro and LIXO_ARQ.search(rp):
                info['lixo'] += 1; continue
            if filtro and BANCO.search(rp):
                try: info['bancos'].append((ab, os.lstat(ab).st_size))
                except OSError: pass
                continue
            try:
                st = os.lstat(ab)
            except OSError:
                continue
            if not (stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode)):
                info['especiais'].append(ab); continue
            disco[rp] = ab

def ler(ab):
    st = os.lstat(ab)
    if stat.S_ISLNK(st.st_mode):
        return os.fsencode(os.readlink(ab)), st
    with open(ab, 'rb') as f:
        b = f.read()
    st2 = os.lstat(ab)
    if st2.st_size != len(b) or st2.st_mtime_ns != st.st_mtime_ns:
        raise Pare('arquivo mudou durante a leitura: %s' % ab)
    return b, st

# ---------------------------------------------------------------- metadados do git de uma pasta
ESTADO_PAIS = ('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD')
def ler_admin(admin, pular_worktrees, clone=False):
    """Arquivos de controle do git (HEAD, ORIG_HEAD, rebase/merge em andamento, refs da worktree, reflogs...).
    Retorna (arquivos {caminho: bytes}, candidatos {sha40} fora dos reflogs, pais_estado [sha])."""
    arqs, cand, pais = {}, set(), []
    PULAR = {'objects', 'hooks', 'lfs', 'modules', 'commondir', 'info'}
    if not admin or not os.path.isdir(admin):
        return arqs, cand, pais
    for dp, dns, fns in os.walk(admin):
        rel = os.path.relpath(dp, admin)
        if rel == '.':
            dns[:] = [d for d in dns if d not in PULAR and not (pular_worktrees and d == 'worktrees')]
        for f in fns:
            if f == 'index' or f.endswith('.lock') or (rel == '.' and f in PULAR):
                continue
            ab = os.path.join(dp, f)
            try:
                b = open(ab, 'rb').read()
            except OSError:
                continue
            rp = os.path.normpath(os.path.join(rel, f))
            if rp.startswith('refs/exportar/') or rp.startswith('logs/refs/exportar/'):
                continue
            if rp == 'packed-refs':
                b = b''.join(l for l in b.splitlines(True) if b' refs/exportar/' not in l)
            arqs[b'.importado-estado-git/' + os.fsencode(rp)] = b
            eh_log = rp.startswith('logs/') or '/logs/' in rp
            nao_estado = rp in ('packed-refs', 'config', 'description', 'COMMIT_EDITMSG', 'gc.log', 'shallow', 'gitdir') or \
                rp.startswith('worktrees/') or (clone and rp.startswith('refs/'))
            if not eh_log and not nao_estado and len(b) < 5_000_000:
                cand |= {c.decode() for c in re.findall(rb'(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])', b)}
            if rel == '.' and f in ESTADO_PAIS:
                pais += [c.decode() for c in re.findall(rb'(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])', b)]
    return arqs, cand, pais

def tipos(repo, shas):
    t = {}
    shas = sorted(set(shas))
    for i in range(0, len(shas), 5000):
        bloco = shas[i:i + 5000]
        for l in gs(repo, 'cat-file', '--batch-check', inp=('\n'.join(bloco) + '\n').encode()).splitlines():
            x = l.split()
            if len(x) >= 2:
                t[x[0]] = x[1]
    return t

def fora_de(repo, cands, base):
    """Dos commits cands, os que NAO sao ancestrais de base (rev-list cands --not base)."""
    cands = [c for c in cands if c != base]
    if not cands:
        return []
    args = ['rev-list', '--stdin'] + (['--not', base] if base else [])
    alc = set(gs(repo, *args, inp=('\n'.join(cands) + '\n').encode()).split())
    return [c for c in cands if c in alc]

def ler_indice(path):
    """Le o arquivo de indice do git (versoes 2, 3 e 4) sem chamar o git. Retorna [(modo, sha, estagio, caminho)]."""
    b = open(path, 'rb').read()
    if b[:4] != b'DIRC':
        raise Pare('indice invalido: %s' % path)
    ver, n = struct.unpack('>II', b[4:12]); pos = 12; prev = b''; out = []
    for _ in range(n):
        ini = pos
        modo = struct.unpack('>I', b[pos + 24:pos + 28])[0]
        sha = b[pos + 40:pos + 60].hex(); flags = struct.unpack('>H', b[pos + 60:pos + 62])[0]; pos += 62
        if ver >= 3 and flags & 0x4000:
            pos += 2
        if ver == 4:
            c = b[pos]; pos += 1; tira = c & 0x7f
            while c & 0x80:
                c = b[pos]; pos += 1; tira = ((tira + 1) << 7) | (c & 0x7f)
            fim = b.index(b'\0', pos); p = prev[:len(prev) - tira] + b[pos:fim]; pos = fim + 1
        else:
            fim = b.index(b'\0', pos); p = b[pos:fim]
            pos = ini + ((fim - ini) + 8) // 8 * 8
        prev = p
        out.append(('%06o' % modo, sha, (flags >> 12) & 3, p))
    return out

def indice_de(admin):
    """Entradas do indice de uma worktree registrada cuja pasta ja nao existe."""
    e = {}
    if not admin or not os.path.exists(os.path.join(admin, 'index')):
        return e
    for m, s, sg, p in ler_indice(os.path.join(admin, 'index')):
        e[b'.importado-estado-git/indice/%d/' % sg + p] = (m, s)
    return e

def cegos(pasta):
    """Arquivos que o git status NAO confere no disco: assume-unchanged (letra minuscula no ls-files -v) e skip-worktree (S)."""
    r = set()
    for rec in git(pasta, 'ls-files', '-v', '-z').split(b'\0'):
        if len(rec) > 2 and rec[1:2] == b' ' and (rec[0:1].islower() or rec[0:1] == b'S'):
            r.add(rec[2:])
    return r

def difere_do_indice(ab, ms):
    """Arquivo marcado: o disco e diferente do indice? Ausente nao difere (fica a versao do indice)."""
    if not (os.path.islink(ab) or os.path.isfile(ab)):
        return False
    b, st = ler(ab)
    return (modo_de(st), h_blob(b)) != (ms[0], ms[1])

# ---------------------------------------------------------------- foto de uma pasta com git
def foto(pasta, excl, admin, repo_objs, pular_worktrees=True, ja=frozenset()):
    info = novo_info()
    idx = {}
    for rec in git(pasta, 'ls-files', '-s', '-z').split(b'\0'):
        if rec:
            meta, p = rec.split(b'\t', 1)
            m, s, sg = meta.split(b' ')
            idx.setdefault(p, {})[int(sg)] = (m.decode(), s.decode())
    st_raw = git(pasta, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching', '--no-renames')
    mud, nao_rast, ign = {}, [], []
    for rec in st_raw.split(b'\0'):
        if not rec:
            continue
        xy, p = rec[:2], rec[3:]
        if xy == b'??': nao_rast.append(p)
        elif xy == b'!!': ign.append(p)
        else: mud[p] = xy
    cg = cegos(pasta)
    ent_idx, disco, extras = {}, {}, {}
    for p, sts in idx.items():
        xy = mud.get(p)
        cego_dif = p in cg and 0 in sts and difere_do_indice(os.path.join(pasta, os.fsdecode(p)), sts[0])
        info['cegos'] += cego_dif
        if 0 in sts and (xy is None or xy[1:2] == b' ') and not cego_dif:
            ent_idx[p] = sts[0]                      # disco == indice (git status; os marcados assume-unchanged/skip-worktree conferidos acima)
        else:
            ab = os.path.join(pasta, os.fsdecode(p))
            if os.path.islink(ab) or os.path.isfile(ab):
                disco[p] = ab
        for sg, (m, s) in sts.items():
            if sg != 0 or cego_dif or (xy is not None and xy[0:1] != b' ' and xy[1:2] != b' '):
                extras[b'.importado-estado-git/indice/%d/' % sg + p] = (m, s)
    for p in nao_rast:
        ab = os.path.join(pasta, os.fsdecode(p.rstrip(b'/')))
        if p.endswith(b'/'):
            if ab in excl:
                continue
            if repo_real(ab):
                info['repos_dentro'].append(ab); continue
            varrer(pasta, p.rstrip(b'/'), excl, disco, info, filtro=False)
            continue
        if SEGREDO.search(p):
            info['segredos'].append(os.path.join(pasta, os.fsdecode(p))); continue
        varrer(pasta, p, excl, disco, info, filtro=False)
    for p in ign:
        nome = p.rstrip(b'/')
        partes = nome.split(b'/')
        if p.endswith(b'/') and (os.fsdecode(partes[-1]) in LIXO_DIR or (len(partes) == 1 and os.fsdecode(nome) in LIXO_RAIZ)):
            info['lixo'] += 1; continue
        ab = os.path.join(pasta, os.fsdecode(nome))
        if ab in excl:
            continue
        if SEGREDO.search(nome):
            info['segredos'].append(ab); continue
        if p.endswith(b'/'):
            if repo_real(ab):
                info['repos_dentro'].append(ab); continue
            varrer(pasta, nome, excl, disco, info)
        else:
            if LIXO_ARQ.search(nome): info['lixo'] += 1; continue
            if BANCO.search(nome):
                try: info['bancos'].append((ab, os.lstat(ab).st_size))
                except OSError: pass
                continue
            disco[nome] = ab
    for p in list(disco):
        ent_idx.pop(p, None)
    arqs, cand, pais_estado = ler_admin(admin, pular_worktrees, clone=not pular_worktrees)
    head = git(pasta, 'rev-parse', '-q', '--verify', 'HEAD^{commit}', ok=(0, 1)).decode().strip()
    t = tipos(pasta, cand | set(pais_estado))
    am = arqs.get(b'.importado-estado-git/AUTO_MERGE', b'').strip().decode()
    if t.get(am) == 'tree':
        extras[b'.importado-estado-git/AUTO_MERGE-arvore'] = ('040000', am)
    commits = [c for c in sorted(cand) if t.get(c) == 'commit']
    pe = [c for c in pais_estado if t.get(c) == 'commit']
    outros = fora_de(pasta, [c for c in commits if c not in pe and c not in ja], head)
    pais = list(dict.fromkeys(([head] if head else []) + pe))
    blobs_soltos = [c for c in sorted(cand) if t.get(c) in ('blob', 'tree') and c != am]
    for c in blobs_soltos:
        extras[b'.importado-estado-git/objetos/' + c.encode()] = ('100644' if t[c] == 'blob' else '040000', c)
    return dict(ent_idx=ent_idx, disco=disco, extras=extras, estado_git=arqs, pais=pais, head=head,
                status_raw=st_raw, info=info, extra_commits=[c for c in outros if c not in pais])

def foto_pasta(pasta, excl):
    """Pasta sem git confiavel (copia solta, worktree quebrada, ou .git emprestado de outra worktree): so arquivos."""
    info = novo_info(); disco = {}
    varrer(pasta, b'', excl, disco, info)
    return dict(ent_idx={}, disco=disco, extras={}, estado_git={}, pais=[], head='', status_raw=b'', info=info, extra_commits=[])

COFRE = H + '/.secrets/zapp-importados'
def guardar_segredos(caminhos, origem):
    """Segredo local (.env.local, chave) nao vai para o git, mas tambem nao some: vai para ~/.secrets/zapp-importados
    (permissao 600, sem duplicar conteudo igual). Pastas .auth (sessao) se recriam sozinhas e nao sao copiadas."""
    if SIM:
        return 0
    n = 0
    for ab in caminhos:
        if SESSAO.search(ab) or not os.path.lexists(ab):
            continue
        arqs = []
        if os.path.isdir(ab) and not os.path.islink(ab):
            for dp, _, fns in os.walk(ab):
                arqs += [os.path.join(dp, x) for x in fns]
        elif os.path.isfile(ab) and not os.path.islink(ab):
            arqs = [ab]
        for a in arqs:
            b = open(a, 'rb').read()
            h = hashlib.sha256(b).hexdigest()
            os.makedirs(COFRE, mode=0o700, exist_ok=True)
            dst = os.path.join(COFRE, h[:16] + '-' + os.path.basename(a))
            if not os.path.exists(dst):
                fd = os.open(dst + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                os.write(fd, b); os.close(fd); os.replace(dst + '.tmp', dst)
            if hashlib.sha256(open(dst, 'rb').read()).hexdigest() != h:
                raise Pare('falha ao guardar segredo local de %s' % origem)
            with open(os.path.join(COFRE, 'INDICE.tsv'), 'a') as ix:
                ix.write('%s\t%s\n' % (a, os.path.basename(dst)))
            n += 1
    return n

def filtrar_existentes(repo, f, onde):
    """Tira de ent_idx/extras entradas cujo objeto nao existe no repositorio (indice antigo apontando para blob ja apagado).
    Gitlink (160000) aponta para commit de outro repositorio e nao precisa existir."""
    shas = {v[1] for d in (f['ent_idx'], f['extras']) for v in d.values() if v[0] != '160000'}
    if not shas:
        return 0
    t = tipos(repo, shas)
    tirados = 0
    for d in (f['ent_idx'], f['extras']):
        for p in [p for p, v in d.items() if v[0] != '160000' and v[1] not in t]:
            del d[p]; tirados += 1
    if tirados:
        log('   aviso: %d entradas do indice de %s apontam para objeto que nao existe mais (ficam de fora)' % (tirados, onde))
    return tirados

def arvore_do_disco(f):
    """Rele TODOS os bytes do disco e recalcula a arvore (sem gravar nada). None se algo mudou durante a leitura."""
    try:
        return simular(f, ler_tudo=True)
    except (Pare, OSError):
        return None

def digital(f):
    """Impressao digital para saber se a pasta mudou entre a captura e a hora de apagar."""
    h = hashlib.sha1(f['status_raw'])
    for p in sorted(f['disco']):
        try:
            st = os.lstat(f['disco'][p]); h.update(p + b' %d %d\n' % (st.st_size, st.st_mtime_ns))
        except OSError:
            h.update(p + b' SUMIU\n')
    return h.hexdigest()

# ---------------------------------------------------------------- git fast-import (grava objetos; so cria refs novas)
def q(p):
    o = bytearray(b'"')
    for c in p:
        if c == 0x22: o += b'\\"'
        elif c == 0x5c: o += b'\\\\'
        elif c == 0x0a: o += b'\\n'
        elif c < 0x20 or c >= 0x7f: o += b'\\%03o' % c
        else: o.append(c)
    return bytes(o + b'"')

class FI:
    def __init__(self, repo):
        self.err = open(os.path.join(D, 'fast-import.err'), 'ab')
        self.p = subprocess.Popen(GIT + ['-C', repo, 'fast-import', '--quiet', '--done'],
                                  stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.err)
        self.w = self.p.stdin
    def commit(self, ref, msg, pais, linhas):
        m = msg.encode()
        self.w.write(b'commit %s\ncommitter %s %d -0300\ndata %d\n%s\n' % (ref.encode(), EU, TS, len(m), m))
        if pais:
            self.w.write(b'from %s\n' % pais[0].encode())
            for x in pais[1:]:
                self.w.write(b'merge %s\n' % x.encode())
        self.w.write(b'deleteall\n')
        for l in linhas:
            self.w.write(l)
        self.w.write(b'\n')
    def reset(self, ref, sha):
        self.w.write(b'reset %s\nfrom %s\n\n' % (ref.encode(), sha.encode()))
    def fim(self):
        self.w.write(b'done\n'); self.w.close()
        rc = self.p.wait(); self.err.close()
        if rc != 0:
            raise Pare('git fast-import falhou rc=%d (veja fast-import.err)' % rc)

def linhas_de(f, conhecidos, esperado, ler_tudo=True):
    """Gera as linhas M do fast-import e preenche esperado {p:(modo,sha)} com os bytes realmente enviados.
    ler_tudo=False (so na simulacao): nao le conteudo, so soma tamanhos."""
    for p, (m, s) in f['ent_idx'].items():
        esperado[p] = (m, s); yield b'M %s %s %s\n' % (m.encode(), s.encode(), q(p))
    for p, (m, s) in f['extras'].items():
        esperado[p] = (m, s); yield b'M %s %s %s\n' % (m.encode(), s.encode(), q(p))
    for p, b in f['estado_git'].items():
        s = h_blob(b); esperado[p] = ('100644', s)
        yield b'M 100644 inline %s\ndata %d\n' % (q(p), len(b)) + b + b'\n'
    for p, ab in f['disco'].items():
        f['info']['arquivos_disco'] += 1
        if not ler_tudo:
            try: f['info']['bytes_disco'] += os.lstat(ab).st_size
            except OSError: pass
            esperado[p] = ('100644', '0' * 40)
            continue
        b, st = ler(ab)
        m = modo_de(st); s = h_blob(b); esperado[p] = (m, s)
        f['info']['bytes_disco'] += len(b)
        if len(b) > 50_000_000:
            f['info']['grandes'].append((ab, len(b)))
        if s in conhecidos:
            yield b'M %s %s %s\n' % (m.encode(), s.encode(), q(p))
        else:
            conhecidos.add(s)
            yield b'M %s inline %s\ndata %d\n' % (m.encode(), q(p), len(b)) + b + b'\n'

def simular(f, ler_tudo):
    e = {}
    for _ in linhas_de(f, set(), e, ler_tudo):
        pass
    montar(e)                                  # pega caminho repetido / arquivo-e-pasta tambem na simulacao
    return arvore(e) if ler_tudo else None

# ---------------------------------------------------------------- consultas ao repositorio
def objetos(repo):
    return set(gs(repo, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)').split())

def refs_de(repo):
    r = {}
    for l in gs(repo, 'for-each-ref', '--format=%(objectname) %(refname)').splitlines():
        s, n = l.split(' ', 1); r[n] = s
    return r

def alcancaveis(repo):
    return set(gs(repo, 'rev-list', '--all').split())

def arvores_alcancaveis(repo):
    return set(gs(repo, 'log', '--all', '--format=%T').split())

def soltos_fsck(repo):
    """Objetos soltos (nao alcancaveis por nenhuma ref/HEAD/indice; reflog NAO conta)."""
    out = git(repo, 'fsck', '--dangling', '--no-reflogs', '--no-progress', ok=tuple(range(0, 64))).decode()
    r = collections.defaultdict(list)
    for l in out.splitlines():
        x = l.split()
        if len(x) == 3 and x[0] == 'dangling':
            r[x[1]].append(x[2])
    return r

def pontas_uteis(repo, pontas, RR, TR):
    """Das pontas soltas, so as que trazem algum commit ainda nao preservado com conteudo (arvore) novo.
    Ponta cujo historico solto inteiro so repete arvores ja existentes nao acrescenta nada (ex.: rebase refeito).
    Uma passada so: rev-list de todas as pontas --not --all, depois propaga 'util' dos pais para os filhos."""
    if not pontas:
        return [], 0
    out = gs(repo, 'rev-list', '--reverse', '--topo-order', '--parents', '--format=%T', '--stdin', '--not', '--all',
             inp=('\n'.join(pontas) + '\n').encode()).split('\n')
    util = {}
    k = 0
    while k < len(out):
        l = out[k]
        if l.startswith('commit '):
            x = l.split()[1:]
            c, pais = x[0], x[1:]
            t = out[k + 1].strip() if k + 1 < len(out) else ''
            util[c] = (c not in RR and t not in TR) or any(util.get(p, False) for p in pais)
            k += 2
        else:
            k += 1
    uteis = [p for p in pontas if util.get(p)]
    return uteis, len(pontas) - len(uteis)

def rss_mb():
    for l in open('/proc/self/status'):
        if l.startswith('VmRSS:'):
            return int(l.split()[1]) // 1024
    return 0

def mem_ok():
    for l in open('/proc/meminfo'):
        if l.startswith('MemAvailable:'):
            return int(l.split()[1]) > 4_000_000
    return True

# ---------------------------------------------------------------- quem fica (protecoes)
SERVICO = {H + '/zapp-worktrees/preview', H + '/zapp-worktrees/_base', H + '/zapp-worktrees/tc-medir'}
def cartoes_abertos():
    sql = ("select id, coalesce(workspace_path,''), coalesce(branch_name,''), coalesce(title,''), coalesce(body,''), "
           "coalesce(result,'') from tasks where status not in ('done','archived')")
    try:
        db = sqlite3.connect('file:' + urllib.parse.quote(KANBAN) + '?mode=ro', uri=True)
        rows = db.execute(sql).fetchall(); db.close()
    except sqlite3.Error:
        tmp = tempfile.mkdtemp()
        for suf in ('', '-wal'):
            if os.path.exists(KANBAN + suf):
                shutil.copy2(KANBAN + suf, os.path.join(tmp, 'k.db' + suf))
        db = sqlite3.connect(os.path.join(tmp, 'k.db'))
        rows = db.execute(sql).fetchall(); db.close(); shutil.rmtree(tmp)
    ids = {r[0] for r in rows}
    return ids, {r[1] for r in rows if r[1]}, {r[2] for r in rows if r[2]}, '\n'.join(' '.join(r) for r in rows)

def worktrees_r():
    out, cur = [], {}
    for l in gs(R, 'worktree', 'list', '--porcelain').split('\n'):
        if not l:
            if cur: out.append(cur); cur = {}
            continue
        k, _, v = l.partition(' ')
        cur[k] = v if v else True
    if cur: out.append(cur)
    return out

def admin_de(p):
    try:
        t = open(p + '/.git').read().strip()
        return t[8:] if t.startswith('gitdir: ') else None
    except OSError:
        return None

def cwds():
    c = set()
    for p in os.listdir('/proc'):
        if p.isdigit():
            try: c.add(os.readlink('/proc/%s/cwd' % p))
            except OSError: pass
    return c

def hora_reflog(f):
    """Maior horario registrado dentro de um reflog (linha: <velho> <novo> Nome <email> <segundos> <fuso>\\t<msg>).
    Se nao der para ler, devolve a data do arquivo (conservador: na duvida a pasta fica)."""
    try:
        b = open(f, 'rb').read()
    except OSError:
        return 0
    m = 0
    for l in b.splitlines():
        x = re.match(rb'[0-9a-f]{40} [0-9a-f]{40} .*> (\d+) [-+]\d{4}', l)
        if x: m = max(m, int(x.group(1)))
    if not m:
        try: return os.stat(f).st_mtime
        except OSError: return 0
    return m

class Protecao:
    def __init__(self, caminhos_repos):
        self.ids, self.wps, self.brs, self.textos = cartoes_abertos()
        fx = os.path.join(D, 'wt-cartao-aberto.json')
        self.fixos = set(json.load(open(fx))) if os.path.exists(fx) else set()
        self.cw = cwds(); self.agora = time.time(); self.caminhos = set(caminhos_repos)
        log('Kanban: %d cartoes abertos' % len(self.ids))
    def motivo(self, p, branch='', admin=None, locked=False, checar_dentro=True, so_admin=False):
        m = 0
        sinais = [admin + '/index', admin + '/HEAD', admin + '/FETCH_HEAD'] if admin else []
        if admin:
            m = hora_reflog(admin + '/logs/HEAD')   # horario do ultimo registro, nao a data do arquivo (o git gc reescreve o arquivo)
        if not so_admin:
            sinais += [p, p + '/.tmp', p + '/.git']
        for f in sinais:
            try: m = max(m, os.stat(f).st_mtime)
            except OSError: pass
        base = os.path.basename(p)
        idc = base.rsplit('-', 1)[-1]
        cards = {'t_' + x for x in re.findall(r't[_-]?([0-9a-f]{8})(?![0-9a-f])', base)}
        try:
            cards |= set(re.findall(r't_[0-9a-f]{8}', open(p + '/.hermes-tarefa', errors='ignore').read()))
        except OSError:
            pass
        if locked: return 'travada'
        if p in SERVICO: return 'usada por servico'
        if p.startswith(H + '/hermes-workspaces/.integra/'): return 'estado da fabrica (.integra)'
        if p in self.fixos or p in self.wps or (branch and branch.replace('refs/heads/', '') in self.brs) \
                or (len(idc) >= 12 and idc in self.textos) or (cards & self.ids):
            return 'cartao aberto no Kanban'
        if self.agora - m < 72 * 3600: return 'atividade nas ultimas 72 h'
        if any(c == p or c.startswith(p + '/') for c in self.cw): return 'processo rodando dentro'
        if checar_dentro and any(o != p and o.startswith(p + '/') for o in self.caminhos): return 'tem outro repositorio dentro'
        return None

# ---------------------------------------------------------------- origens
CLONES = [  # aninhados primeiro (estao dentro de clone-ws)
    ('n142', H + '/hermes-workspaces/Zapp_Web_V2/n142-banco-leitura-reacoes-espelho-ci-26101418239f52'),
    ('retomar', H + '/hermes-workspaces/Zapp_Web_V2/retomar-automation-suggest-reply-t-e494c228'),
    ('t_682cc676', H + '/hermes-workspaces/Zapp_Web_V2/t_682cc676_v2'),
    ('clone-ws', H + '/hermes-workspaces/Zapp_Web_V2'),
    ('r2a5', H + '/hermes-workspaces/.verificacao/r2a5/repo'),
    ('chat-h353953', H + '/hermes-workspaces/chat-h353953/repo'),
    ('mapa-zapp-v2', H + '/projetos/Zapp_Web_V2-anexos/arquivo/mapa-zapp-v2'),
    ('qa4-ref', H + '/projetos/Zapp_Web_V2-anexos/arquivo/qa-fase0/qa4/ref'),
]
AVULSOS = [
    'backups-sync-2026-10-17', 'backups/zapp-sync-20261019-200821', 'zapp-audit-backup',
    'projetos/_arquivo_zapp/consolidacao_v2_20261004', 'projetos/_arquivo_zapp/v2_clones_pendentes',
    'projetos/_arquivo_zapp/v2_all_refs_20260925.bundle',
    'talkx-placar-permissao-fora-do-pr.patch', 'telefonia-lacunas.patch', 'telefonia-lacunas-tudo.tgz', 'fix-busca-livre.diff',
    'auditorias/fase-f-260930', 't36119648-work', 'refazer2-tmp', 'tmp-refazer-t_1a45b46d',
    'hermes-workspaces/.tmp-espelho-dia', 'hermes-workspaces/.tmp-refazer-t_f07b9d3c', 'hermes-workspaces/.verificacao',
    'hermes-workspaces/chat-h353953', 'hermes-workspaces/.tl-003-multiplix-prepare-voice.patch',
    'hermes-workspaces/_pendente-telefonia', 'hermes-workspaces/_entrega-t_59eb0a93-rota-de-aceite',
    'hermes-workspaces/_prova-t_137805b5-evidencias', 'hermes-workspaces/_patch-t_699fa539-explicador-banco-local',
    'hermes-workspaces/_patch-t_99c558a6-emoji-refazer1', 'hermes-workspaces/_diag-t_7dfec728-explicador-banco-local',
    'hermes-workspaces/refazer-conexao-admin-t_2adf3c34', 'hermes-workspaces/t_98cbd28e',
    'hermes-workspaces/.decisoes/anexos-contatos/rodada3/r2a1-mig-audit',
    'hermes-workspaces/redteam-a5-repo', 'hermes-workspaces/zapp-web-v2-main/reverter-e17-26092615073385',
    'codex-workspaces/zapp-sidebar-impl-261003', 'dec-backup-04495111e',
    'hermes-workspaces/.assets/0001-feat-tarefas-faixa-de-atrasadas-semana-rotulada-e-po.patch',
    'hermes-workspaces/.assets/0002-test-tarefas-seleciona-o-cartao-do-dia-pela-posicao-.patch',
    'hermes-workspaces/.assets/0003-fix-tarefas-pontos-do-dia-na-Agenda-com-a-cor-do-tip.patch',
    'hermes-workspaces/.assets/0004-chore-tarefas-relato-do-cartao-da-Agenda-com-os-3-po.patch',
    'evidencias/auditoria-alertas-20261001/logs/diff-agente-irmao.patch',
    'evidencias/auditoria-alertas-20261001/logs/diff-atual.patch',
    'evidencias/plano-volume-50/0001-fechamento-decisoes-e-producao.patch',
    'evidencias/sonar-s7773/s7773.patch',
    'hermes-evidencias/t_59aba8e3/04134d5e8.diff',
    'hermes-relatorios/t_a540f752/05-marcadores-ResetPassword.diff',
    'hermes-relatorios/t_a540f752/05-marcadores-SSOCallback.diff',
    'hermes-relatorios/t_a540f752/13-aprovado-diff-3-fontes.patch',
    'hermes-relatorios/t_b53f32cc/aprovado-8cb091-src.patch',
    'hermes-relatorios/t_b53f32cc/aprovado-vs-tip.patch',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1290.diff',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1294.diff',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1297.diff',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1309.diff',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1313.diff',
    'hermes-validacao/auditoria-onda3-260930/artefatos/a4-ci-work/pr1314.diff',
    'hermes-validacao/catalogo-bloco-bc/bc-final.patch',
    'hermes-validacao/catalogo-bloco-bc/bc-parcial-1356.patch',
    'hermes-validacao/item2/0001-fix-db-endurece-o-cron-sem-DML-direto-em-cron.job.patch',
    'hermes-validacao/item2/491bf508-comentarios-sonar.patch',
    'hermes-validacao/item2/l5-todos-os-commits.patch',
    'hermes-workspaces/.v2-handoff/t-a4b7bae0-evolution-api-WIP.patch',
    'projetos/Zapp_Web_V2-anexos/wip/hermes-achados/t-20e5a091/achado-stash-estrangeiro.diff',
    'projetos/Zapp_Web_V2-anexos/wip/x006-wip/TalkXCampaignRunning.patch',
]
PAIS_VAZIOS = ['hermes-workspaces/.verificacao', 'hermes-workspaces/chat-h353953', 'hermes-workspaces/zapp-web-v2-main',
               'projetos/Zapp_Web_V2-anexos/arquivo/qa-fase0/qa4', 'projetos/Zapp_Web_V2-anexos/arquivo/qa-fase0',
               'codex-workspaces']
BUNDLES_FORA = ('v3_all_refs', 'git_safety_20260907')     # historico do Zapp V3, nao do V2

def tem_preso_dentro(ab, preservar):
    """True se dentro de ab existe algo que deve ficar: repositorio real ou caminho protegido ainda presente."""
    if any(p != ab and p.startswith(ab + '/') and os.path.lexists(p) for p in preservar):
        return True
    for dp, dns, fns in os.walk(ab):
        if '.git' in dns or '.git' in fns:
            if dp != ab and repo_real(dp):
                return True
        dns[:] = [d for d in dns if d not in LIXO_DIR and d != '.git']
    return False

def raiz_do_disco(ab, excl):
    """Recalcula, relendo o disco, a arvore (ou o blob) que uma raiz avulsa deveria ter no commit de avulsos."""
    rb = os.fsencode(os.path.relpath(ab, H))
    info = novo_info(); d = {}
    varrer(H, rb, excl - {ab}, d, info)
    d = {p: a for p, a in d.items() if not a.endswith('.bundle') and not patch_redundante(a)}
    if rb in d:
        try:
            b, _ = ler(d[rb]); return h_blob(b)
        except (Pare, OSError):
            return None
    sub = {}
    try:
        for p, a in d.items():
            b, st = ler(a); sub[p[len(rb) + 1:]] = (modo_de(st), h_blob(b))
    except (Pare, OSError):
        return None
    return arvore(sub) if sub else ''

def emprestados(wt_paths):
    """Pastas dentro de hermes-workspaces/Zapp_Web_V2 cujo .git aponta para a worktree de OUTRA pasta (copia de worktree):
    o git dali mostraria o estado da outra pasta, entao entram como arquivos."""
    base = H + '/hermes-workspaces/Zapp_Web_V2'; out = []
    if not os.path.isdir(base):
        return out
    for d in sorted(os.listdir(base)):
        p = base + '/' + d
        if p in wt_paths or os.path.islink(p) or not os.path.isfile(p + '/.git'):
            continue
        g = admin_de(p) or ''
        try:
            dono = open(g + '/gitdir').read().strip() if '/.git/worktrees/' in g else None
        except OSError:
            dono = None
        if dono != p + '/.git':
            out.append(p)
    return out

def patch_redundante(ab):
    """Patch grande que so APAGA arquivos cujo conteudo ja esta no repositorio: nao acrescenta nada."""
    try:
        if os.path.getsize(ab) < 10_000_000 or not re.search(r'\.(patch|diff)$', ab):
            return False
        shas = []
        with open(ab, 'rb') as fh:
            for l in fh:
                if l.startswith(b'index '):
                    a, _, bb = l[6:].split(b' ')[0].partition(b'..')
                    if set(bb.strip()) != {ord('0')}:
                        return False
                    shas.append(a.decode())
        if not shas:
            return False
        out = gs(R, 'cat-file', '--batch-check', inp=('\n'.join(shas) + '\n').encode())
        return 'missing' not in out and 'ambiguous' not in out
    except (OSError, Pare):
        return False

# ================================================================ principal
def principal():
    trava = open(os.path.join(D, '.trava'), 'w')
    try:
        fcntl.flock(trava, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise Pare('ja existe outra execucao rodando')
    log('=' * 70); log('INICIO', 'SIMULACAO (so leitura)' if SIM else ('RODADA 2: conferir e apagar' if APAGAR else 'RODADA 1: importar (nao apaga nada)'))
    autoteste()
    if shutil.disk_usage('/').free < 30 * 2**30:
        raise Pare('menos de 30 GB livres no disco')
    refs0 = refs_de(R)
    if EXE and not os.path.exists(os.path.join(D, 'refs-antes.txt')):
        open(os.path.join(D, 'refs-antes.txt'), 'w').write(''.join('%s %s\n' % (s, n) for n, s in sorted(refs0.items())))
    REFV = dict(refs0)
    def novo_nome(base, sha=None):
        """Nome de ref livre. Se ja existe com o mesmo sha, devolve None (ja importado)."""
        n, i = base, 1
        while n in REFV:
            if sha and REFV[n] == sha:
                return None
            i += 1; n = '%s-r%d' % (base, i)
        REFV[n] = sha or 'reservado'
        return n
    resumo = collections.Counter()
    corrigidas = set()                       # refs de worktrees recapturadas nesta execucao (troca atomica, nao e mudanca alheia)
    TR = arvores_alcancaveis(R)

    # ---------- passo 1: commits e objetos soltos do proprio repositorio ganham nome (a limpeza do git nao os apaga mais)
    if not EST.get('passo1'):
        so = soltos_fsck(R)
        RR = alcancaveis(R)
        uteis, red = pontas_uteis(R, sorted(set(so['commit'])), RR, TR)
        log('passo 1: soltos no repositorio: commits=%d (uteis %d, so repetem conteudo ja existente %d) blobs=%d arvores=%d'
            % (len(so['commit']), len(uteis), red, len(so['blob']), len(so['tree'])))
        pares = [(novo_nome('refs/importado/repo-soltos/%s' % s, s), s) for s in uteis]
        pares = [(n, s) for n, s in pares if n]
        resumo['passo1: refs de commits soltos'] = len(pares)
        if EXE:
            if pares:
                git(R, 'update-ref', '--stdin', inp=''.join('create %s %s\n' % (n, s) for n, s in pares).encode())
            if so['blob'] or so['tree']:
                ref = novo_nome('refs/importado/repo-objetos-soltos')
                ls = [b'M 100644 %s blobs/%s\n' % (s.encode(), s.encode()) for s in so['blob']] + \
                     [b'M 040000 %s arvores/%s\n' % (s.encode(), s.encode()) for s in so['tree']]
                esp = {b'blobs/' + s.encode(): ('100644', s) for s in so['blob']}
                esp.update({b'arvores/' + s.encode(): ('40000', s) for s in so['tree']})
                fi = FI(R); fi.commit(ref, 'importado: objetos soltos do repositorio (blobs e arvores sem referencia)\n\n' + ASSINATURA + '\n', [], ls); fi.fim()
                if gs(R, 'rev-parse', ref + '^{tree}').strip() != arvore(esp):
                    raise Pare('conferencia dos objetos soltos do repositorio falhou')
            depois = refs_de(R)
            for n, s in pares:
                if depois.get(n) != s:
                    raise Pare('conferencia falhou em %s' % n)
            EST['passo1'] = len(pares); salvar()
            log('   OK: %d refs criadas e conferidas' % len(pares))
    RR = alcancaveis(R)
    if SIM:
        so = soltos_fsck(R)
        if so['commit']:
            RR |= set(gs(R, 'rev-list', '--stdin', inp=('\n'.join(so['commit']) + '\n').encode()).split())
    log('commits preservados no repositorio: %d' % len(RR))

    wts = worktrees_r()
    wt_paths = {w['worktree'] for w in wts}
    clones_paths = {c[1] for c in CLONES}
    emp = emprestados(wt_paths)
    conhecidos_fora = wt_paths | clones_paths | set(emp)

    # ---------- passo 2: clones separados do Zapp V2
    prot = Protecao(conhecidos_fora)
    for nome, C in CLONES:
        chave = 'clone:' + nome
        if EST.get(chave) in ('importado', 'apagado') or not os.path.isdir(C + '/.git'):
            continue
        log('passo 2: clone %s (%s) [memoria do script %d MB]' % (nome, C.replace(H, '~'), rss_mb()))
        objs_r = objetos(R)
        if os.path.exists(C + '/.git/shallow'):
            corte = open(C + '/.git/shallow').read().split()
            faltam = [c for c in corte if c not in RR]
            if faltam:
                log('   PULADO (clone raso cujo ponto de corte nao esta no repositorio; nao importa e nao apaga): %s' % faltam[:3])
                continue
            log('   clone raso: os %d pontos de corte ja estao no repositorio (o repositorio NAO vira raso)' % len(corte))
        refs_c = refs_de(C)
        peel = {}
        for l in gs(C, 'for-each-ref', '--format=%(refname) %(*objectname)').splitlines():
            n, _, s = l.partition(' ')
            if s: peel[n] = s
        importar = []
        for n, s in sorted(refs_c.items()):
            if n == 'refs/stash' or n.startswith('refs/exportar/'):
                continue
            if peel.get(n, s) in RR and s in objs_r:
                continue
            dst = ('refs/heads/importado/%s/%s' % (nome, n[11:])) if n.startswith('refs/heads/') else ('refs/importado/%s/%s' % (nome, n[5:]))
            dst = novo_nome(dst, s)
            if dst: importar.append((n, dst, s))
        stash = []
        sp = C + '/.git/logs/refs/stash'
        if os.path.exists(sp):
            for l in open(sp, errors='replace'):
                x = l.split(' ')
                if len(x) > 1 and re.fullmatch(r'[0-9a-f]{40}', x[1]): stash.append(x[1])
            stash = stash[::-1]
        exp_reset = [('refs/exportar/stash/%03d' % i, s) for i, s in enumerate(stash) if s not in RR]
        so = soltos_fsck(C)
        # worktrees registradas no clone (quase todas sem pasta): HEAD/estado e indice somem com o clone
        wt_heads, wt_idx, cwts = set(), {}, []
        wdir = C + '/.git/worktrees'
        for a in (sorted(os.listdir(wdir)) if os.path.isdir(wdir) else []):
            adm = wdir + '/' + a
            _, cand, _ = ler_admin(adm, True)
            hd = open(adm + '/HEAD', errors='ignore').read().strip() if os.path.exists(adm + '/HEAD') else ''
            if re.fullmatch(r'[0-9a-f]{40}', hd): cand.add(hd)
            wt_heads |= cand
            try:
                gd = open(adm + '/gitdir').read().strip()[:-5]
            except OSError:
                gd = ''
            if gd and os.path.isdir(gd) and admin_de(gd) == adm:
                cwts.append((gd, adm))
            else:
                for p, v in indice_de(adm).items():
                    if v[1] not in objs_r:          # so o que traz conteudo novo (o resto ja esta no repositorio)
                        wt_idx[b'%s/' % a.encode() + p] = v
        tc = tipos(C, set(so['commit']) | wt_heads)
        cand_c = sorted({s for s in set(so['commit']) | wt_heads if tc.get(s) == 'commit' and s not in RR} - {s for _, s in exp_reset} - {x[2] for x in importar})
        uteis, red = pontas_uteis(C, cand_c, RR, TR) if cand_c else ([], 0)
        exp_reset += [('refs/exportar/soltos/%s' % s, s) for s in uteis]
        obj_soltos = sorted(s for s in so['blob'] + so['tree'] if s not in objs_r)
        tw = tipos(C, [v[1] for v in wt_idx.values()])
        idx_soltos = {p: v for p, v in wt_idx.items() if tw.get(v[1]) in ('blob', 'commit') or v[0] == '160000'}
        excl = conhecidos_fora | {x[0] for x in cwts}
        f = foto(C, excl, C + '/.git', objs_r, pular_worktrees=False, ja=RR)
        fws = [(p, a, foto(p, excl - {p}, a, objs_r, ja=RR)) for p, a in cwts]
        protegido = [(C, prot.motivo(C, admin=C + '/.git', checar_dentro=False, so_admin=True))] + \
                    [(p, prot.motivo(p, admin=a)) for p, a, _ in fws]
        protegido = [(p, m) for p, m in protegido if m]
        if protegido:
            log('   o clone sera importado mas NAO apagado:', ['%s (%s)' % (p.replace(H, '~'), m) for p, m in protegido])
        ja_ref = {s for _, s in exp_reset}
        for ff in [f] + [fw for _, _, fw in fws]:
            for c in ff['extra_commits']:
                if c not in ja_ref and c not in RR:
                    exp_reset.append(('refs/exportar/extra/%s' % c, c)); ja_ref.add(c)
        desconhecidos = sorted({x for x in f['info']['repos_dentro'] + [y for _, _, fw in fws for y in fw['info']['repos_dentro']] if x not in excl})
        log('   refs a importar=%d stash=%d pontas soltas uteis=%d (repetidas %d) objetos soltos=%d indices de worktrees sumidas=%d; '
            'pasta: %d do indice + %d do disco; worktrees proprias=%d; repos desconhecidos dentro=%d'
            % (len(importar), sum(1 for x in exp_reset if '/stash/' in x[0]), len(uteis), red, len(obj_soltos), len(idx_soltos),
               len(f['ent_idx']), len(f['disco']), len(fws), len(desconhecidos)))
        if desconhecidos:
            log('   ATENCAO: repositorios desconhecidos dentro (o clone sera importado mas NAO apagado):', [x.replace(H, '~') for x in desconhecidos[:8]])
        exp_commits = [('refs/exportar/estado', f, 'importado: estado da pasta %s (clone %s)' % (C, nome))]
        for p, a, fw in fws:
            exp_commits.append(('refs/exportar/estado-wt/%s' % os.path.basename(a), fw, 'importado: estado da worktree %s (do clone %s)' % (p, nome)))
        if SIM:
            for i, (ref, ff, msg) in enumerate(exp_commits):
                simular(ff, ler_tudo=False)
                resumo['clones: arquivos lidos do disco'] += ff['info']['arquivos_disco']
                resumo['clones: bytes lidos do disco'] += ff['info']['bytes_disco']
            resumo['clones: refs a criar'] += len(importar) + len(exp_reset) + len(exp_commits) + (1 if obj_soltos or idx_soltos else 0)
            resumo['clones: repos desconhecidos (clone fica)'] += len(desconhecidos)
            continue
        # grava no proprio clone (que vai ser apagado) e busca para o repositorio
        for n in [n for n in refs_de(C) if n.startswith('refs/exportar/')]:
            git(C, 'update-ref', '-d', n)
        for _, ff, _ in exp_commits:
            filtrar_existentes(C, ff, C)
        conhecidos_c = objetos(C)
        fi = FI(C); esperados = {}
        for ref, ff, msg in exp_commits:
            e = {}
            fi.commit(ref, msg + '\n\norigem: %s\n%s\n' % (C, ASSINATURA), ff['pais'], linhas_de(ff, conhecidos_c, e))
            esperados[ref] = arvore(e)
        if obj_soltos or idx_soltos:
            tt = tipos(C, obj_soltos)
            ls, esp = [], {}
            for s in obj_soltos:
                pth = (b'blobs/' if tt.get(s) == 'blob' else b'arvores/') + s.encode()
                m = '100644' if tt.get(s) == 'blob' else '040000'
                ls.append(b'M %s %s %s\n' % (m.encode(), s.encode(), q(pth))); esp[pth] = (m, s)
            for p, (m, s) in idx_soltos.items():
                pth = b'indices-de-worktrees-sumidas/' + p
                ls.append(b'M %s %s %s\n' % (m.encode(), s.encode(), q(pth))); esp[pth] = (m, s)
            fi.commit('refs/exportar/objetos-soltos', 'importado: objetos soltos do clone %s\n\n%s\n' % (nome, ASSINATURA), [], ls)
            esperados['refs/exportar/objetos-soltos'] = arvore(esp)
        for ref, s in exp_reset:
            fi.reset(ref, s)
        fi.fim()
        specs, alvo = [], {}
        for src, dst, s in importar:
            specs.append('%s:%s' % (src, dst)); alvo[dst] = s
        mapa_exp = {}
        for n, s in refs_de(C).items():
            if n.startswith('refs/exportar/'):
                dst = novo_nome('refs/importado/%s/%s' % (nome, n[len('refs/exportar/'):]), s)
                if dst:
                    specs.append('%s:%s' % (n, dst)); alvo[dst] = s; mapa_exp[n] = dst
        if specs:
            git(R, 'fetch', '--no-tags', '--no-write-fetch-head', '--no-auto-gc', '--no-recurse-submodules', '--quiet', '--stdin', C,
                inp=('\n'.join(specs) + '\n').encode())
        depois = refs_de(R)
        for dst, s in alvo.items():
            if depois.get(dst) != s:
                raise Pare('conferencia falhou: %s esperado %s, ficou %s' % (dst, s, depois.get(dst)))
        if os.path.exists(R + '/.git/shallow'):
            raise Pare('o repositorio ficou raso depois de buscar de %s: PARE e me chame' % C)
        for ref, tree in esperados.items():
            dst = mapa_exp.get(ref)
            tg = gs(R, 'rev-parse', (dst or ref) + '^{tree}').strip() if dst else gs(C, 'rev-parse', ref + '^{tree}').strip()
            if tg != tree:
                raise Pare('conferencia byte a byte falhou em %s: calculado %s, git %s' % (dst or ref, tree, tg))
        EST[chave] = 'importado'
        EST[chave + ':info'] = dict(refs=len(specs), desconhecidos=desconhecidos, wts=[p for p, _, _ in fws],
                                    tree=esperados['refs/exportar/estado'],
                                    trees_wt={p: esperados['refs/exportar/estado-wt/%s' % os.path.basename(a)] for p, a, _ in fws},
                                    admins_wt={p: a for p, a, _ in fws},
                                    protegido=[p for p, _ in protegido],
                                    segredos=f['info']['segredos'] + [y for _, _, fw in fws for y in fw['info']['segredos']])
        salvar()
        RR = alcancaveis(R); TR = arvores_alcancaveis(R)
        log('   OK: %d refs importadas (sha conferido) e estado da pasta igual byte a byte' % len(specs))
        resumo['clones: refs criadas'] += len(specs)

    # ---------- passo 3: bundles (copias de seguranca antigas de branches)
    bundles = []
    for raiz in AVULSOS:
        ab = H + '/' + raiz
        if os.path.isfile(ab) and ab.endswith('.bundle'):
            bundles.append(ab)
        elif os.path.isdir(ab) and not os.path.islink(ab):
            for dp, dns, fns in os.walk(ab):
                dns[:] = [d for d in dns if d not in LIXO_DIR and d != '.git']
                bundles += [os.path.join(dp, x) for x in fns if x.endswith('.bundle')]
    bundles = sorted({b for b in bundles if not any(x in b for x in BUNDLES_FORA)}, key=lambda b: -os.path.getmtime(b))
    for b in bundles:
        chave = 'bundle:' + b
        if EST.get(chave):
            continue
        heads = []
        for l in gs(D, 'bundle', 'list-heads', b).splitlines():
            s, _, n = l.partition(' ')
            heads.append((n, s))
        objs_r = objetos(R)
        t = tipos(R, [s for _, s in heads if s in objs_r])
        rot = re.sub(r'[^A-Za-z0-9._-]+', '-', os.path.basename(b)[:-7])
        falta = []
        for n, s in heads:
            if s in RR:
                continue
            if t.get(s) == 'tag' and gs(R, 'rev-parse', s + '^{}').strip() in RR | set(objs_r):
                continue
            if t.get(s) in ('blob', 'tree'):
                continue
            if n.startswith('refs/heads/'): dst = 'refs/heads/importado/bundle-%s/%s' % (rot, n[11:])
            elif n.startswith('refs/'): dst = 'refs/importado/bundle-%s/%s' % (rot, n[5:])
            else: dst = 'refs/importado/bundle-%s/%s' % (rot, n)
            dst = novo_nome(dst, s)
            if dst: falta.append((n, dst, s))
        log('passo 3: bundle %s: %d refs; %d com commit que ainda falta no repositorio' % (b.replace(H, '~'), len(heads), len(falta)))
        resumo['bundles: refs a criar'] += len(falta)
        if SIM:
            for _, _, s in falta:
                RR.add(s)
            continue
        if falta:
            git(R, 'fetch', '--no-tags', '--no-write-fetch-head', '--no-auto-gc', '--quiet', '--stdin', b,
                inp=('\n'.join('%s:%s' % (src, dst) for src, dst, _ in falta) + '\n').encode())
            depois = refs_de(R)
            for src, dst, s in falta:
                if depois.get(dst) != s:
                    raise Pare('conferencia falhou: %s esperado %s, ficou %s' % (dst, s, depois.get(dst)))
            RR = alcancaveis(R)
        objs_r = objetos(R)
        for n, s in heads:
            if s not in objs_r:
                raise Pare('bundle %s: %s (%s) continua faltando no repositorio' % (b, n, s))
        EST[chave] = 'validado'; salvar()
        log('   OK: todos os %d objetos de ponta do bundle estao no repositorio' % len(heads))

    # ---------- passo 4: worktrees do repositorio (uma por pasta de cartao)
    wts = worktrees_r()
    wt_paths = {w['worktree'] for w in wts}
    sair, ficar = [], []
    nomes_adm = {}
    for n in os.listdir(R + '/.git/worktrees'):
        try: nomes_adm[open(R + '/.git/worktrees/%s/gitdir' % n).read().strip()[:-5]] = n
        except OSError: pass
    for w in wts:
        p = w['worktree']
        if p == R:
            continue
        n = nomes_adm.get(p)
        x = dict(path=p, admin=(R + '/.git/worktrees/' + n) if n else None, nome=n or re.sub(r'[^A-Za-z0-9._-]+', '-', p),
                 branch=w.get('branch', ''), ausente=not os.path.isdir(p))
        x['motivo'] = None if x['ausente'] else prot.motivo(p, x['branch'], x['admin'], 'locked' in w)
        (ficar if x['motivo'] else sair).append(x)
    log('passo 4: worktrees: %d saem, %d ficam %s' % (len(sair), len(ficar), dict(collections.Counter(x['motivo'] for x in ficar))))
    open(os.path.join(D, ('simulacao-' if SIM else '') + 'worktrees-ficam.txt'), 'w').write(
        ''.join('%s\t%s\n' % (x['path'], x['motivo']) for x in sorted(ficar, key=lambda x: x['path'])))
    caminhos_todos = wt_paths | clones_paths | set(emp)
    pend = [x for x in sair if EST.get('wt:' + x['nome'], {}).get('fase') != 'apagado']
    bancos = collections.Counter(); bancos_b = collections.Counter(); ficaram_dentro = []
    amostra = 0
    for i in range(0, len(pend), LOTE):
        lote = pend[i:i + LOTE]
        itens = []
        objs_r = objetos(R)
        for x in lote:
            k = 'wt:' + x['nome']
            if EST.get(k, {}).get('fase') == 'importado':
                if x['ausente']:                 # sem pasta: so o admin, conferido no reflogs/indice (nada a reler)
                    itens.append((x, None)); continue
                fc = foto(x['path'], caminhos_todos - {x['path']}, x['admin'], objs_r, ja=RR)
                filtrar_existentes(R, fc, x['path'])
                tn = arvore_do_disco(fc)
                if tn is None:
                    raise Pare('arquivo mudou durante a releitura de %s: rode de novo' % x['path'])
                if tn == EST[k]['tree']:
                    itens.append((x, None)); continue
                log('   recapturar (o disco mudou desde a importacao%s): %s' % (
                    ': arquivo marcado assume-unchanged/skip-worktree' if fc['info']['cegos'] else '', x['path'].replace(H, '~')))
                x['corrigir'] = EST[k]['ref']
                resumo['worktrees: recapturadas (disco mudou ou o git status nao conferia)'] += 1
            if x['ausente']:
                arqs, cand, pe = ler_admin(x['admin'], True)
                hd = (open(x['admin'] + '/HEAD').read().strip() if x['admin'] and os.path.exists(x['admin'] + '/HEAD') else '')
                t = tipos(R, cand | ({hd} if re.fullmatch(r'[0-9a-f]{40}', hd) else set()))
                head = hd if t.get(hd) == 'commit' else ''
                outros = fora_de(R, [c for c in sorted(cand) if t.get(c) == 'commit' and c not in RR], head)
                pe2 = [c for c in dict.fromkeys(pe) if t.get(c) == 'commit' and c != head]
                ix = indice_de(x['admin'])
                ti = tipos(R, [v[1] for v in ix.values() if v[0] != '160000'])
                ix = {p: v for p, v in ix.items() if v[0] == '160000' or v[1] in ti}
                f = dict(ent_idx={}, disco={}, extras=ix, estado_git=arqs, pais=([head] if head else []) + pe2,
                         head=head, status_raw=b'', info=novo_info(), extra_commits=[c for c in outros if c not in pe2])
            else:
                f = foto(x['path'], caminhos_todos - {x['path']}, x['admin'], objs_r, ja=RR)
                dent = [d for d in f['info']['repos_dentro'] if d not in caminhos_todos]
                if dent:
                    ficaram_dentro.append((x['path'], dent[:3]))
                    log('   FICA (repositorio desconhecido dentro): %s -> %s' % (x['path'].replace(H, '~'), [d.replace(H, '~') for d in dent[:3]]))
                    continue
            for ab, sz in f['info']['bancos']:
                bancos[os.path.basename(ab)] += 1; bancos_b[os.path.basename(ab)] += sz
            resumo['worktrees: segredos locais (vao para ~/.secrets, nao para o git)'] += len(f['info']['segredos'])
            resumo['worktrees: commits extras (ORIG_HEAD/rebase/fetch) com ref propria'] += len(f['extra_commits'])
            resumo['worktrees: pastas regeneraveis (nao entram)'] += f['info']['lixo']
            itens.append((x, f))
        if SIM:
            for x, f in itens:
                if f is None:                    # ja importada (so acontece com SIM_RETOMAR)
                    resumo['simulacao: worktrees ja importadas, nada a refazer'] += 1; continue
                ler_tudo = amostra < AMOSTRA_SIM and bool(f['disco'])
                amostra += ler_tudo
                t1 = simular(f, ler_tudo)
                if ler_tudo and not x['ausente']:
                    f2 = foto(x['path'], caminhos_todos - {x['path']}, x['admin'], objs_r, ja=RR)
                    t2 = arvore_do_disco(f2)
                    resumo['simulacao: conferencia byte a byte repetida OK' if t1 == t2 else 'simulacao: conferencia byte a byte DIVERGIU'] += 1
                    if t1 != t2:
                        log('   DIVERGIU na releitura: %s' % x['path'])
                resumo['worktrees: capturadas'] += 1
                resumo['worktrees: arquivos lidos do disco'] += f['info']['arquivos_disco']
                resumo['worktrees: bytes lidos do disco'] += f['info']['bytes_disco']
                resumo['worktrees: com mudanca ou arquivo fora do git'] += bool(f['disco'] or f['extras'])
            log('   simulado %d/%d' % (min(i + LOTE, len(pend)), len(pend)))
            continue
        while not mem_ok():
            log('   memoria baixa: esperando 60 s'); time.sleep(60)
        fi = FI(R); esperados = {}; conhecidos = set(objs_r)
        for x, f in itens:
            if f is None:
                continue
            filtrar_existentes(R, f, x['path'])
            ref = novo_nome(('refs/importado/recaptura/%s' if x.get('corrigir') else 'refs/importado/estado/%s') % x['nome'])
            try:
                tarefa = open(x['path'] + '/.hermes-tarefa', errors='replace').read()
            except OSError:
                tarefa = ''
            msg = ('importado: estado da worktree %s\n\norigem: %s\nbranch: %s\nHEAD: %s\npais extras (merge/rebase/cherry-pick em andamento, ORIG_HEAD...): %s\n'
                   'arquivos: %d do indice + %d lidos do disco\nfora (regeneraveis, copias de banco, segredos locais): %d pastas, %d bancos, %d segredos\n'
                   '\n.hermes-tarefa:\n%s\n%s\n'
                   % (x['path'], x['path'], x['branch'] or '(sem branch)', f['head'] or '-', ' '.join(f['pais'][1:]) or '-',
                      len(f['ent_idx']), len(f['disco']), f['info']['lixo'], len(f['info']['bancos']), len(f['info']['segredos']), tarefa, ASSINATURA))
            pais_c = list(f['pais'])
            if x.get('corrigir'):                # recaptura: a foto anterior vira o ultimo pai (nada e sobrescrito nem perdido)
                x['velho'] = gs(R, 'rev-parse', x['corrigir']).strip(); pais_c.append(x['velho'])
                msg += 'recaptura: o disco mudou depois da 1a foto (ou havia arquivo que o git status nao conferia); a foto anterior e o ultimo pai: %s\n' % x['velho']
            e = {}
            fi.commit(ref, msg, pais_c, linhas_de(f, conhecidos, e))
            esperados[ref] = (arvore(e), pais_c, x, f)
        fi.fim()
        for ref, (tree, pais, x, f) in esperados.items():
            tg = gs(R, 'rev-parse', ref + '^{tree}').strip()
            pg = gs(R, 'rev-list', '--parents', '-n1', ref).split()[1:]
            if tg != tree or pg != pais:
                raise Pare('conferencia byte a byte falhou em %s (arvore %s vs %s; pais %s vs %s)' % (ref, tree, tg, pais, pg))
            final = ref
            if x.get('corrigir'):
                # troca atomica: a ref antiga passa a apontar para a foto nova (so se ninguem mexeu nela) e a temporaria some
                final = x['corrigir']
                novo = gs(R, 'rev-parse', ref).strip(); velho = x['velho']
                git(R, 'update-ref', '--stdin', inp=('update %s %s %s\ndelete %s %s\n' % (final, novo, velho, ref, novo)).encode())
                dep = refs_de(R)
                if dep.get(final) != novo or ref in dep or gs(R, 'rev-parse', final + '^{tree}').strip() != tree or \
                        gs(R, 'rev-list', '--parents', '-n1', final).split()[-1] != velho:
                    raise Pare('troca da ref recapturada falhou: %s' % final)
                REFV.pop(ref, None); REFV[final] = novo; corrigidas.add(final)
                log('   recapturada e conferida byte a byte: %s (antes %s, agora %s)' % (final, velho[:12], novo[:12]))
            EST['wt:' + x['nome']] = dict(fase='importado', ref=final, tree=tree, digital='' if x['ausente'] else digital(f),
                                          segredos=f['info']['segredos'])
        extra = []
        for ref, (tree, pais, x, f) in esperados.items():
            for c in f['extra_commits']:
                n2 = novo_nome('%s-extra/%s' % (EST['wt:' + x['nome']]['ref'], c), c)
                if n2: extra.append((n2, c))
        if extra:
            git(R, 'update-ref', '--stdin', inp=''.join('create %s %s\n' % (n2, c) for n2, c in extra).encode())
            dep = refs_de(R)
            for n2, c in extra:
                if dep.get(n2) != c:
                    raise Pare('conferencia falhou em %s' % n2)
        salvar()
        if not APAGAR:
            log('   lote %d-%d: importadas e conferidas (rodada 1: nada apagado)' % (i + 1, i + len(lote)))
            continue
        cw = cwds()
        for x, f in itens:
            k = 'wt:' + x['nome']; e = EST.get(k, {})
            if e.get('fase') != 'importado':
                continue
            if not x['ausente']:
                f2 = foto(x['path'], caminhos_todos - {x['path']}, x['admin'], objs_r, ja=RR)
                filtrar_existentes(R, f2, x['path'])
                if arvore_do_disco(f2) != e['tree']:
                    log('   FICA (o disco nao bate byte a byte com o importado; sera recapturada na proxima rodada): %s' % x['path'])
                    EST.pop(k, None); EST.setdefault('ficou', []).append(x['path']); continue
                if any(c == x['path'] or c.startswith(x['path'] + '/') for c in cw):
                    log('   FICA (processo entrou na pasta): %s' % x['path']); EST.pop(k, None); EST.setdefault('ficou', []).append(x['path']); continue
                resumo['segredos locais guardados em ~/.secrets'] += guardar_segredos(e.get('segredos', []), x['path'])
                r = subprocess.run(GIT + ['-C', R, 'worktree', 'remove', '--force', x['path']], capture_output=True)
                if r.returncode != 0 or os.path.lexists(x['path']):
                    log('   FICA (git worktree remove falhou: %s): %s' % (r.stderr.decode(errors='replace').strip()[-200:], x['path']))
                    EST.setdefault('ficou', []).append(x['path']); continue
            else:
                if x['admin'] and os.path.isdir(x['admin']) and x['admin'].startswith(R + '/.git/worktrees/'):
                    shutil.rmtree(x['admin'])
            e['fase'] = 'apagado'; resumo['worktrees: apagadas'] += 1
        salvar()
        log('   lote %d-%d: importadas, conferidas e apagadas' % (i + 1, i + len(lote)))
    resumo['worktrees: ficaram por repositorio desconhecido dentro'] = len(ficaram_dentro)
    if bancos:
        log('   copias de banco que nao entram (somem com as pastas): %s' % ', '.join(
            '%s x%d %.0f MB' % (n, bancos[n], bancos_b[n] / 1e6) for n, _ in bancos_b.most_common(12)))

    # ---------- passo 5: pastas e arquivos avulsos (copias soltas, patches, backups) -> uma branch so
    if not (EST.get('avulsos') or {}).get('ref'):
        objs_r = objetos(R)
        excl = conhecidos_fora
        raizes = {}; disco = {}; info_t = novo_info(); redund = []; bunds = []
        lista = [(r, H + '/' + r) for r in AVULSOS] + [(os.path.relpath(p, H), p) for p in emp]
        for r, ab in lista:
            if not os.path.lexists(ab):
                continue
            if ab in emp:
                mt = prot.motivo(ab)
                if mt:
                    log('   FICA (%s): %s' % (mt, ab.replace(H, '~'))); continue
            info = novo_info(); d = {}
            varrer(H, os.fsencode(r), excl - {ab}, d, info)
            n_ok = 0
            for p, a in d.items():
                if a.endswith('.bundle'):
                    bunds.append(a); continue
                if patch_redundante(a):
                    redund.append(a); continue
                disco[p] = a; n_ok += 1
            dent = [x for x in info['repos_dentro'] if x not in excl]
            raizes[ab] = dict(arquivos=n_ok, desconhecidos=dent)
            info_t['lixo'] += info['lixo']
            info_t['segredos'] += info['segredos']; info_t['bancos'] += info['bancos']
            raizes[ab]['segredos'] = info['segredos']
            if dent:
                log('   ATENCAO: %s tem repositorio desconhecido dentro (importa, mas NAO apaga): %s' % (ab.replace(H, '~'), [x.replace(H, '~') for x in dent[:3]]))
        log('passo 5: avulsos: %d raizes (%d com .git emprestado), %d arquivos, %d bundles (ja tratados no passo 3), %d patches redundantes'
            % (len(raizes), sum(1 for a in raizes if a in emp), len(disco), len(bunds), len(redund)))
        f = dict(ent_idx={}, disco=disco, extras={}, estado_git={}, pais=[], head='', status_raw=b'', info=info_t)
        if SIM:
            simular(f, ler_tudo=False)
            resumo['avulsos: arquivos'] = info_t['arquivos_disco']; resumo['avulsos: bytes'] = info_t['bytes_disco']
            resumo['avulsos: segredos locais (nao entram)'] = len(info_t['segredos'])
        else:
            ref = novo_nome('refs/heads/importado/arquivos-avulsos')
            e = {}
            fi = FI(R)
            fi.commit(ref, 'importado: pastas e arquivos avulsos do Zapp Web V2 que estavam espalhados no WSL\n\n'
                      'cada item mantem o caminho relativo a /home/joaquim_ataides\n'
                      'bundles (.bundle) nao entram como arquivo: o conteudo deles virou refs (refs/importado/bundle-*)\n'
                      'patches que so apagam arquivos ja presentes no repositorio ficaram de fora: %s\n\n%s\n'
                      % (', '.join(x.replace(H, '~') for x in redund) or '-', ASSINATURA), [], linhas_de(f, objs_r, e))
            fi.fim()
            tree = arvore(e); tg = gs(R, 'rev-parse', ref + '^{tree}').strip()
            if tree != tg:
                raise Pare('conferencia byte a byte dos avulsos falhou: %s vs %s' % (tree, tg))
            for ab in raizes:
                rb = os.fsencode(os.path.relpath(ab, H))
                if rb in e:
                    raizes[ab]['esperado'] = e[rb][1]
                else:
                    sub = {k[len(rb) + 1:]: v for k, v in e.items() if k.startswith(rb + b'/')}
                    raizes[ab]['esperado'] = arvore(sub) if sub else ''
            EST['avulsos'] = dict(ref=ref, tree=tree, raizes=raizes, bundles=bunds, redundantes=redund)
            salvar()
            log('   OK: avulsos importados e conferidos byte a byte (%s, %d arquivos)' % (ref, len(e)))

    # ---------- passo 6: apagar as origens ja conferidas (clones e avulsos) -- so na rodada 2
    if EXE:
        depois = refs_de(R)
        mudadas = [n for n, s in refs0.items() if depois.get(n) != s and n not in corrigidas]
        log('refs: antes %d, depois %d; refs antigas que mudaram durante a execucao (outros chats podem mexer nas branches deles): %d'
            % (len(refs0), len(depois), len(mudadas)))
        if mudadas:
            log('   mudadas:', mudadas[:20])
        if os.path.exists(R + '/.git/shallow'):
            raise Pare('o repositorio esta raso: PARE e me chame')
    if APAGAR:
        abertos = {w['worktree'] for w in worktrees_r()}
        for nome, C in CLONES:
            chave = 'clone:' + nome
            if EST.get(chave) != 'importado':
                continue
            inf = EST.get(chave + ':info', {})
            if inf.get('desconhecidos') or inf.get('protegido'):
                log('passo 6: clone %s FICA (repositorio desconhecido dentro ou protegido)' % nome); continue
            excl = conhecidos_fora | set(inf.get('wts', []))
            objs_r = objetos(R)
            fc = foto(C, excl, C + '/.git', objs_r, pular_worktrees=False, ja=RR); filtrar_existentes(C, fc, C)
            ok_disco = arvore_do_disco(fc) == inf.get('tree')
            for p, a in inf.get('admins_wt', {}).items():
                if ok_disco and os.path.isdir(p):
                    fw2 = foto(p, excl - {p}, a, objs_r, ja=RR); filtrar_existentes(C, fw2, p)
                    ok_disco = arvore_do_disco(fw2) == inf['trees_wt'][p]
            if not ok_disco:
                log('passo 6: clone %s FICA (o disco nao bate byte a byte com o importado; sera reimportado na proxima rodada)' % nome)
                EST[chave] = None; EST.setdefault('ficou', []).append(C); salvar(); continue
            resumo['segredos locais guardados em ~/.secrets'] += guardar_segredos(inf.get('segredos', []), C)
            for p in inf.get('wts', []):
                if os.path.isdir(p): shutil.rmtree(p)
            if nome == 'clone-ws':
                prot_ws = Protecao(abertos | clones_paths | set(emp))
                for e in os.listdir(C):
                    ab = os.path.join(C, e)
                    if e == '.git' or ab in abertos or ab in emp or ab in clones_paths or \
                            (os.path.isdir(ab) and not os.path.islink(ab) and repo_real(ab)):
                        continue
                    mt = prot_ws.motivo(ab) if os.path.isdir(ab) and not os.path.islink(ab) else None
                    if not mt and os.path.isdir(ab) and not os.path.islink(ab) and tem_preso_dentro(ab, abertos | clones_paths | set(emp)):
                        mt = 'tem repositorio ou worktree que fica dentro'
                    if mt:
                        log('   fica (%s): %s' % (mt, ab.replace(H, '~'))); continue
                    shutil.rmtree(ab) if (os.path.isdir(ab) and not os.path.islink(ab)) else os.remove(ab)
                shutil.rmtree(os.path.join(C, '.git'))
            else:
                if any(a == C or a.startswith(C + '/') for a in abertos) or tem_preso_dentro(C, abertos | clones_paths | set(emp)):
                    log('passo 6: clone %s FICA (worktree ou repositorio dentro)' % nome); continue
                shutil.rmtree(C)
            EST[chave] = 'apagado'; salvar(); log('passo 6: clone %s apagado' % nome)
        av = EST.get('avulsos')
        if av and av.get('ref'):
            nao_val = [b for b in av.get('bundles', []) if EST.get('bundle:' + b) != 'validado']
            if nao_val:
                raise Pare('bundles sem validacao, nao apago: %s' % nao_val[:3])
            apagadas = 0
            for ab, ri in av['raizes'].items():
                if ri.get('apagado') or not os.path.lexists(ab):
                    continue
                if ri.get('desconhecidos'):
                    continue
                if os.path.isdir(ab) and not os.path.islink(ab):
                    if tem_preso_dentro(ab, {w['worktree'] for w in worktrees_r()} | clones_paths | set(emp)):
                        log('passo 6: FICA (tem repositorio ou worktree que fica dentro): %s' % ab); continue
                    if raiz_do_disco(ab, conhecidos_fora) != ri.get('esperado'):
                        log('passo 6: FICA (o disco nao bate byte a byte com o importado): %s' % ab); continue
                    resumo['segredos locais guardados em ~/.secrets'] += guardar_segredos(ri.get('segredos', []), ab)
                    shutil.rmtree(ab)
                else:
                    if raiz_do_disco(ab, conhecidos_fora) != ri.get('esperado'):
                        log('passo 6: FICA (o disco nao bate byte a byte com o importado): %s' % ab); continue
                    os.remove(ab)
                ri['apagado'] = True; apagadas += 1
            salvar()
            for d in PAIS_VAZIOS:
                try: os.rmdir(H + '/' + d)
                except OSError: pass
            log('passo 6: %d raizes avulsas apagadas' % apagadas)
    log('RESUMO: ' + json.dumps(dict(resumo), ensure_ascii=False))
    if EXE:
        indice(refs0)
    log('FIM_OK')
    if APAGAR and EST.get('indice_ok') and not pendencias():
        # tudo dentro do repositorio (branch importado/indice): a pasta do script tambem sai do WSL
        LOG.close()
        shutil.rmtree(D)
        print('pasta %s removida: o log completo esta na branch importado/indice do repositorio' % D)

def pendencias():
    return list(EST.get('ficou', [])) + [k for k, v in EST.items() if k.startswith('wt:') and isinstance(v, dict) and v.get('fase') == 'importado'] + \
           [k for k, v in EST.items() if k.startswith('clone:') and ':' not in k[6:] and v == 'importado']

def indice(refs0):
    """Branch importado/indice: o mapa origem -> destino, o log, o estado e o proprio script, tudo dentro do repositorio."""
    depois = refs_de(R)
    base = refs0
    pa = os.path.join(D, 'refs-antes.txt')
    if os.path.exists(pa):                   # retomada e rodada 2: lista tudo que a importacao criou desde a 1a execucao
        base = {}
        for l in open(pa):
            if l.strip():
                sh, n = l.rstrip('\n').split(' ', 1); base[n] = sh
    novas = sorted((n, s) for n, s in depois.items() if n not in base and n != 'refs/heads/importado/indice' and (n.startswith('refs/importado/') or n.startswith('refs/heads/importado/')))
    linhas = ['# Importacao do trabalho do Zapp Web V2 espalhado no WSL', '',
              'Gerado por importar.py em %s. Rodada: %s.' % (time.strftime('%d/%m/%Y %H:%M'), '2 (conferir e apagar)' if APAGAR else '1 (importar)'), '',
              '## Como achar as coisas', '',
              '- branches `importado/<origem>/<nome original>`: branches de clones e de copias de seguranca (bundles) que o repositorio nao tinha;',
              '- `refs/importado/estado/<worktree>`: foto completa de cada worktree (arquivos alterados, nao commitados, ignorados uteis e o estado do git em `.importado-estado-git/`); o 1o pai e o HEAD da worktree; se a foto foi refeita (mensagem com `recaptura:`), o ultimo pai e a foto anterior;',
              '- `refs/importado/<clone>/estado`: foto da pasta de cada clone separado; `.../stash/NNN`, `.../soltos/<sha>`, `.../extra/<sha>`: stashes e commits sem branch;',
              '- `refs/importado/repo-soltos/<sha>`: commits do proprio repositorio que nenhuma branch apontava (a limpeza do git os apagaria);',
              '- branch `importado/arquivos-avulsos`: patches, diffs e pastas soltas, com o caminho relativo a /home/joaquim_ataides;',
              '- segredos locais (.env.local, chaves) nao entram no git: ficam em ~/.secrets/zapp-importados (INDICE.tsv diz a origem).', '',
              'Ver uma foto: `git show --stat <ref>` · listar: `git for-each-ref refs/importado refs/heads/importado`', '',
              '## Refs criadas (%d)' % len(novas), '']
    linhas += ['%s %s' % (s, n) for n, s in novas]
    arqs = {b'INDICE.md': ('\n'.join(linhas) + '\n').encode()}
    for nome in ('importar.py', 'importar.log', 'estado.json', 'refs-antes.txt', 'worktrees-ficam.txt', 'fast-import.err'):
        p = os.path.join(D, nome)
        if os.path.exists(p):
            LOG.flush()
            arqs[nome.encode()] = open(p, 'rb').read()
    ref = 'refs/heads/importado/indice'
    pai = depois.get(ref)
    e = {p: ('100644', h_blob(b)) for p, b in arqs.items()}
    fi = FI(R)
    ls = [b'M 100644 inline %s\ndata %d\n' % (q(p), len(b)) + b + b'\n' for p, b in arqs.items()]
    fi.commit(ref, 'importado: indice da importacao (%s)\n\n%s\n' % ('rodada 2' if APAGAR else 'rodada 1', ASSINATURA), [pai] if pai else [], ls)
    fi.fim()
    if gs(R, 'rev-parse', ref + '^{tree}').strip() != arvore(e):
        raise Pare('conferencia do indice falhou')
    EST['indice_ok'] = True; salvar()
    log('indice gravado e conferido na branch importado/indice (%d refs listadas)' % len(novas))

if __name__ == '__main__':
    try:
        principal()
    except Pare as e:
        salvar(); log('PAROU:', e); sys.exit(2)
    except Exception as e:
        salvar(); log('PAROU (erro inesperado):', repr(e)); raise
