"""Assemble explicit coverage of the third-party copy; no source writes."""
import hashlib
import json
from pathlib import Path

audit = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
out = audit / 'reports/modules'
vendor = out / 'vendor'
manifest = json.loads((vendor / 'manifest.json').read_text())
raw = (audit / 'source' / manifest['source_path']).read_bytes()
assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == manifest['source_git_blob_sha']
readable = (vendor / 'lamejs.readable.js').read_bytes()
assert hashlib.sha256(readable).hexdigest() == manifest['formatted_sha256']
journal = [json.loads(s) for s in (vendor / 'read-journal.jsonl').read_text().splitlines()]
for row in journal:
    if row['line_start'] == 1:
        row['purpose'] = 'Alocação de arrays, enum, filtros ReplayGain, presets e início da quantização'
    if row['line_start'] == 1051:
        row['purpose'] = 'VBR/tags, estruturas, laço CBR e inicialização dos limiares auditivos'
(vendor / 'read-journal.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in journal))
ranges = []
for row in sorted(journal, key=lambda x: x['line_start']):
    assert row['formatted_sha256'] == manifest['formatted_sha256']
    a, b = row['line_start'], row['line_end']
    if ranges and a <= ranges[-1][1] + 1:
        ranges[-1][1] = max(ranges[-1][1], b)
    else:
        ranges.append([a, b])
assert ranges == [[1, manifest['formatted_lines']]], ranges
phases = [
    (1,153,'Arrays tipados, enums e análise ReplayGain'),
    (154,294,'Presets de VBR/ABR e parâmetros de quantização'),
    (295,684,'Quantização, contagem de bits, Huffman, regiões e scalefactors'),
    (685,711,'Reservatório e distribuição de bits'),
    (712,970,'Emissão de bitstream, headers, cópia de buffers e CRC'),
    (971,1221,'Tags VBR/LAME, seek table e leitura/escrita de metadados'),
    (1222,1306,'Estruturas de estado e laço CBR'),
    (1307,1661,'Tabelas de potência, ATH, energia/ruído e cópia de granules'),
    (1662,2161,'Laço externo de quantização e ramos VBR/ABR'),
    (2162,2652,'Banco polifásico, janelas, MDCT e anti-alias por subbanda'),
    (2653,2867,'Encode de frame, estado, histogramas e buffers'),
    (2868,3019,'FHT, FFT curta/longa e janelas'),
    (3020,3896,'Energia, mascaramento, ataques, decisão de blocos e inicialização psicoacústica'),
    (3897,4499,'API LAME interna, parâmetros, reamostragem, buffering e flush'),
    (4500,4683,'Stubs, tabelas Huffman, constantes e API pública Mp3Encoder/WavHeader'),
]
functions = []
for row in manifest['functions']:
    item = dict(row)
    item['review_status'] = 'SEMANTIC_BODY_READ'
    item['phases'] = [name for a,b,name in phases if item['formatted']['line_start'] <= b and item['formatted']['line_end'] >= a]
    item['remaining_validation_gap'] = 'Leitura de corpo não prova correção numérica/coeficientes, conformidade MP3 ou todos os caminhos executados.'
    functions.append(item)
result = {
    'head_sha': manifest['head_sha'], 'source_path': manifest['source_path'],
    'git_blob_sha': manifest['source_git_blob_sha'], 'code_origin': 'third_party_vendored',
    'status': 'SEMANTIC_BODY_READ_WITH_NUMERICAL_AND_RUNTIME_LIMITS',
    'source_ranges_read_via_ast_copy': [[1, manifest['original_lines']]],
    'formatted_copy': 'lamejs.readable.js', 'formatted_sha256': manifest['formatted_sha256'],
    'formatted_ranges_read': ranges, 'body_count': len(functions),
    'functions': functions, 'phases': [{'formatted_range':[a,b],'reviewed_contracts':name} for a,b,name in phases],
    'probes': 'proofs.json',
    'limits': [
        'Somente cópia formatada pelo AST foi usada para a leitura integral; original permanece inalterado e fixado por blob.',
        '208 corpos são código de terceiro e não 208 microfuncionalidades autorais do produto.',
        'Coeficientes/tabelas foram vistos e seu consumo percorrido; não comparados a uma especificação ou vetor oficial independente.',
        'Dois fragmentos originais foram exercitados com vetores numéricos e a API pública com silêncio/seno sintético curto.',
        'Nenhum MP3 foi decodificado, ouvido ou validado em navegador; não houve fuzzing, benchmark ou verificação de áudio longo.',
        'Leitura não certifica suporte aos ramos VBR/ReplayGain/WAV dormentes nem configurações diferentes da integração atual.',
    ],
}
(vendor / 'coverage.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
main_journal = out / 'read-journal.jsonl'
existing = [json.loads(s) for s in main_journal.read_text().splitlines()]
if not any(r['path'] == manifest['source_path'] and r['line_start'] == 1 and r['line_end'] == manifest['original_lines'] for r in existing):
    with main_journal.open('a') as stream:
        stream.write(json.dumps({'path': manifest['source_path'], 'line_start':1, 'line_end':manifest['original_lines'], 'total_lines':manifest['original_lines'], 'blob_sha':manifest['source_git_blob_sha'], 'read_level':'semantic', 'symbols_or_purpose':'Código terceiro: 208 corpos lidos via cópia AST 1–4683, mapa completo em vendor/coverage.json. API pública, laços, buffers, quantização/FFT/MDCT e ramos dormentes; sem certificação MP3.'}, ensure_ascii=False)+'\n')
print(json.dumps({'vendor_bodies_read': len(functions), 'formatted_lines_read': manifest['formatted_lines'], 'source_lines': manifest['original_lines']}))
