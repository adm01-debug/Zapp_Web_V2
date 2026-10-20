import os, sys
# Executa o PREFIXO do bloco python extraido do zapp-verify (tudo antes de 'pre=[]; sem=[]')
# e depois classifica CADA linha de $ST/check-diferencas.txt chamando explicada()/drift_canonico()
# do proprio bloco — nenhuma logica reescrita.
bloco = open(sys.argv[1], encoding='utf-8').read()
prefixo = bloco.split('pre=[]; sem=[]')[0]
ns = {}
try:
    exec(compile(prefixo, sys.argv[1], 'exec'), ns)
except SystemExit:
    print('BLOCO_SAIU_ANTES\t*')   # ex.: migration pendente consta em falhas.tsv (regra estrita)
    sys.exit(0)
except Exception as e:
    print('BLOCO_ERRO\t%s: %s' % (type(e).__name__, e))
    sys.exit(0)
st = os.environ['ST']
try:
    linhas = [l.strip() for l in open(os.path.join(st, 'check-diferencas.txt'), encoding='utf-8') if l.strip()]
except OSError:
    linhas = []
for l in linhas:
    if ns['explicada'](l):
        print('EXPLICADA\t' + l)
    elif ns['drift_canonico'](l):
        print('DRIFT\t' + l)
    else:
        print('FALHOU\t' + l)
