"""F4: mata (ou não) as mutações sobreviventes da auditoria F3 — versão corrigida.

Erro da v1 (registrado para não repetir): o backup era copiado DEPOIS da edição,
então a "restauração" devolvia o próprio código mutado e as mutações seguintes
rodavam com as anteriores aplicadas (veredito contaminado). Aqui o backup é
copiado ANTES de qualquer escrita.

Uso: python3 .tmp/mut-f4.py
"""
import os
import shutil
import subprocess

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(WS)
BAK = '.tmp/mut-f4-bak'
os.makedirs(BAK, exist_ok=True)

TESTS = ['src/components/tasks/__tests__/', 'src/hooks/tasks/__tests__/']

PROD = [
    'src/components/tasks/TasksModule.tsx',
    'src/components/tasks/agenda/TasksAgendaMode.tsx',
    'src/components/tasks/board/TasksBoardMode.tsx',
]

M = [
    ('M17-aria-controls-auto-ref', [
        ('src/components/tasks/agenda/TasksAgendaMode.tsx',
         '<div id="agenda-atrasadas" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">',
         '<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">'),
        ('src/components/tasks/agenda/TasksAgendaMode.tsx',
         'px-3 py-2">\n          <button\n            type="button"',
         'px-3 py-2">\n          <button\n            id="agenda-atrasadas"\n            type="button"'),
    ]),
    ('M19/M20/M27-doingCount-ignorado (Board sem a prop real)', [
        ('src/components/tasks/board/TasksBoardMode.tsx',
         'const doingTotal = doingCount ?? byStatus.doing.length;',
         'const doingTotal = byStatus.doing.length;'),
    ]),
    ('M23-cabecalho-hoje-filtrado (so a mutacao M23)', [
        ('src/components/tasks/TasksModule.tsx', 'kpiReal.dueToday', 'kpiData.dueToday'),
    ]),
    ('M24-kpi-doing-filtrado (so a mutacao M24)', [
        ('src/components/tasks/TasksModule.tsx', 'doingCount: doingReal', 'doingCount: kpiData.doingCount'),
    ]),
    ('M25-doingReal-filtrado (so a mutacao M25)', [
        ('src/components/tasks/TasksModule.tsx', 'countDoing(hook.items)', 'countDoing(items)'),
    ]),
]


def backup(path):
    bak = os.path.join(BAK, path.replace('/', '__'))
    if not os.path.exists(bak):          # ANTES de editar (a v1 falhava aqui)
        shutil.copy2(path, bak)
    return bak


def apply(edits):
    for path, old, new in edits:
        backup(path)
        src = open(path).read()
        if old not in src:
            raise SystemExit(f'ANCORA NAO ENCONTRADA em {path}: {old[:70]!r}')
        open(path, 'w').write(src.replace(old, new, 1))


def restore():
    for name in os.listdir(BAK):
        shutil.copy2(os.path.join(BAK, name), name.replace('__', '/'))


def limpo():
    return subprocess.run(['git', 'diff', '--quiet', '--', *PROD]).returncode == 0


def suite():
    p = subprocess.run(['bunx', 'vitest', 'run', *TESTS], capture_output=True, text=True)
    linhas = [l for l in p.stdout.splitlines() if ('Tests ' in l or 'Test Files' in l)]
    return p.returncode, '\n'.join(linhas)


print('== baseline ==')
rc, out = suite()
print(out)
if rc != 0:
    raise SystemExit('baseline VERMELHO — corrija antes de mutar')

for nome, edits in M:
    apply(edits)
    try:
        rc, out = suite()
    finally:
        restore()
        if not limpo():
            raise SystemExit(f'RESTAURACAO FALHOU depois de {nome} — pare e investigue')
    print(f'\n== {nome}: {"MORTA (a suite pega)" if rc != 0 else "VIVA (a suite NAO pega)"}')
    print(out)

print('\n== arvore de producao limpa e todas as mutacoes medidas ==')
