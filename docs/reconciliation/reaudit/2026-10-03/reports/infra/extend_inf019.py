"""Add a root-reviewed historical mutation harness as an extension, not a new finding."""
from pathlib import Path
import hashlib, json

BASE = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
OUT = BASE / 'reports/infra'
SRC = BASE / 'source'
PATH = 'docs/evidencias/plano-volume-50/mut-plano-volume.py'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
DESCRIPTION = ('Extensão histórica: mut-plano-volume.py recebe alvo em rodar, mas não o usa. '
    'Qualquer returncode não zero na execução do mutante satisfaz esperado_verde=False e vira PEGA, '
    'inclusive erro do runner ou compilação sem assertion relevante executada. Diferentemente do runner '
    'original do mapa, este script exige baseline verde, confere alvo literal, restaura bytes em finally '
    'e compara SHA. Esses controles são preservados; não se atribui falha a uma execução histórica não observada.')

def apply_extension(f):
    assert f['id'] == 'R2-INF-019'
    extension = dict(classification='extensão', path=PATH, description=DESCRIPTION,
        reviewed_by='root whole file 1–158; infra source ranges 95–154',
        preconditions=['Execução manual no ambiente/caminho histórico previsto; baseline termina verde.',
            'Durante um mutante o processo termina não zero por infraestrutura/compilação ou outro teste, sem a assertion alvo provar a mudança.'],
        effect='Esse mutante pode ser contado como PEGA sem evidência da detecção pelo contrato pretendido.',
        preserved_controls=['baseline verde obrigatório','substituição exige alvo literal','restauração em finally','comparação SHA depois da restauração'],
        limitation='Revisão de fonte; script não executado, sem rejeitar automaticamente evidência histórica. Não conta um novo achado.')
    f['extensions'] = [e for e in f.get('extensions',[]) if e.get('path') != PATH] + [extension]
    f['evidence'] = [e for e in f['evidence'] if e['path'] != PATH]
    sha = hashlib.sha256((SRC / PATH).read_bytes()).hexdigest()
    for a,b,reason in [(99,109,'alvo não usado; classificação apenas por returncode'),(112,125,'Controle positivo: baseline verde antes de qualquer mutação'),(127,149,'Alvo literal, finally e SHA preservados; resultado classificado PEGA pelo booleano permissivo')]:
        f['evidence'].append(dict(path=PATH,line_start=a,line_end=b,sha256=sha,baseline_sha=HEAD,origin='source',reason=reason))
    acceptance = 'No runner histórico de volume, preservar baseline/literal/finally/SHA e exigir prova da assertion alvo; erro de compilação/runner deve ser inconclusivo, não PEGA.'
    if acceptance not in f['acceptance']:
        f['acceptance'].append(acceptance)
    return f

def main():
    for name in ['findings.json','findings-second-pass.json']:
        p = OUT / name
        d = json.loads(p.read_text())
        apply_extension(next(f for f in d['findings'] if f['id'] == 'R2-INF-019'))
        p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
    p = OUT / 'report.md'
    marker = '\n### Extensão documental de R2-INF-019 — runner histórico de volume\n'
    text = p.read_text()
    if marker not in text:
        f = next(f for f in json.loads((OUT/'findings.json').read_text())['findings'] if f['id']=='R2-INF-019')
        text += marker + '\n' + DESCRIPTION + '\n\n'
        text += '\n'.join(f'- `{e["path"]}:{e["line_start"]}–{e["line_end"]}` — {e["reason"]}. SHA256 `{e["sha256"]}`.' for e in f['evidence'] if e['path']==PATH) + '\n'
        p.write_text(text)
    print('INF-019 extended; finding count unchanged')

if __name__ == '__main__':
    main()
