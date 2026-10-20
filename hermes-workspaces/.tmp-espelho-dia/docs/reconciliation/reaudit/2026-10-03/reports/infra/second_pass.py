"""Audit documentation only: append actual source reads and merge coverage."""
from pathlib import Path
import json, hashlib, collections

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/infra')
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'

def read_json(name):
    return json.loads((OUT / name).read_text())

def save_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def register(batch, entries):
    file = OUT / 'second-pass-review.json'
    ledger = read_json(file.name) if file.exists() else {
        'schema_version': 1, 'area': 'infra', 'baseline_sha': HEAD,
        'mode': 'read_only_source_review',
        'note': 'Faixas indicam leitura efetiva de fonte; não são cobertura de execução. Arquivos de produção não foram executados. A ausência de achado neste lote não certifica ausência de defeitos.',
        'files': [],
    }
    indexed = {x['path']: x for x in ledger['files']}
    for entry in entries:
        entry = dict(entry)
        p = ROOT / entry['path']
        lines = p.read_text().splitlines()
        ranges = entry.pop('ranges', [[1, len(lines)]])
        for a, b in ranges:
            assert 1 <= a <= b <= len(lines), (p, a, b, len(lines))
        entry.update(batch=batch, sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                     baseline_sha=HEAD, line_ranges=ranges, reviewed_ranges=ranges, lines=len(lines),
                     review_level=entry.pop('review_level', 'semantic'),
                     executed=False)
        indexed[entry['path']] = entry
    ledger['files'] = sorted(indexed.values(), key=lambda x: x['path'])
    ledger['counts'] = dict(total=len(indexed), **collections.Counter(x['review_level'] for x in indexed.values()))
    save_json(file.name, ledger)

def merge():
    coverage = read_json('coverage.json')
    ledger = read_json('second-pass-review.json')
    old = {x['path']: x for x in coverage['inventory']}
    for item in ledger['files']:
        if item['path'] not in old:
            p = ROOT / item['path']
            old[item['path']] = dict(path=item['path'], sha256=item['sha256'], bytes=p.stat().st_size,
                                    lines=item['lines'], layer='second_pass_entrypoints', binary=False, lexical_signals={})
        dst = old[item['path']]
        assert dst['sha256'] == item['sha256'], item['path']
        dst.setdefault('first_pass_review_level', dst.get('review_level', 'not_in_first_scope'))
        dst.update(review_level=item['review_level'], review_basis=item['assessment'],
                   reviewed_line_ranges=item['line_ranges'], reviewed_ranges=item['line_ranges'], second_pass_batch=item['batch'],
                   effect_contract=item.get('effect_contract'), consumers=item.get('consumers', []),
                   finding_ids=item.get('finding_ids', []))
    coverage['inventory'] = sorted(old.values(), key=lambda x: x['path'])
    coverage['counts'] = dict(total=len(old), **collections.Counter(x['review_level'] for x in old.values()))
    layers = {}
    for x in old.values():
        c = layers.setdefault(x['layer'], collections.Counter())
        c[x['review_level']] += 1
    coverage['layers'] = {k: dict(total=sum(v.values()), **v) for k,v in sorted(layers.items())}
    coverage['second_pass'] = dict(ledger='second-pass-review.json', files=len(ledger['files']),
                                 scope='Entrypoints de automação/produção, configs executáveis e dependências invocadas; testes repetitivos podem permanecer estruturais.')
    save_json('coverage.json', coverage)

if __name__ == '__main__':
    merge()
