#!/usr/bin/env python3
"""Freeze a documented audit checkpoint. Does not change or publish product code."""
from pathlib import Path
import argparse, collections, datetime, gzip, hashlib, json, shutil, subprocess, sys

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--audit-root', required=True)
p.add_argument('--source', required=True)
p.add_argument('--prior', required=True)
p.add_argument('--docs', required=True)
p.add_argument('--pass-date', default='2026-10-03')
p.add_argument('--state', choices=['IN_PROGRESS', 'COMPLETED_FINITE_REVIEW'], default='IN_PROGRESS')
a = p.parse_args()
audit, source, prior, docs = [Path(s).resolve() for s in (a.audit_root, a.source, a.prior, a.docs)]
dest = docs / 'reaudit' / a.pass_date
assert dest.is_relative_to(docs) and not source.is_relative_to(dest)
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)

def sha256(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
def write_json(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
def prose(value):
    if isinstance(value, str): return value
    if isinstance(value, list): return ' '.join(prose(v) for v in value)
    if isinstance(value, dict): return '; '.join(str(k) + ': ' + prose(v) for k, v in value.items())
    return str(value)

# Copy a stable byte snapshot of audit outputs only. No checkout/node_modules/cache.
copied = []
for path in sorted(audit.rglob('*')):
    if not path.is_file(): continue
    rel = path.relative_to(audit)
    if rel.parts[0] in {'source', 'publication', 'consolidated'} or '__pycache__' in rel.parts or path.suffix == '.pyc': continue
    if path.name.startswith('.') or path.suffix in {'.tmp', '.swp'}: continue
    data = path.read_bytes()
    assert path.read_bytes() == data, f'Artifact changed during snapshot: {rel}'
    if path.suffix == '.json': json.loads(data)
    target = dest / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    copied.append({'path': rel.as_posix(), 'sha256': sha256(data), 'bytes': len(data)})

command = [sys.executable, str(dest / 'tools/consolidate_reaudit.py'), '--source', str(source),
           '--audit-root', str(dest), '--prior', str(prior), '--out', str(dest / 'consolidated')]
if a.state == 'IN_PROGRESS': command.append('--allow-in-progress')
result = subprocess.run(command, text=True, capture_output=True)
assert result.returncode == 0, result.stdout + result.stderr
summary = json.loads((dest / 'consolidated/summary.json').read_text())
assert summary['validation_errors'] == 0
head = summary['source_head']
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
finding_rows = json.loads((dest / 'consolidated/findings-index.json').read_text())['findings']

# Large inventories are lossless gzip; report documents and primary findings stay readable.
compressed = []
for path in sorted(dest.rglob('*.json')):
    if path.stat().st_size <= 2_000_000: continue
    raw = path.read_bytes()
    packed = gzip.compress(raw, compresslevel=9, mtime=0)
    out = path.with_name(path.name + '.gz')
    out.write_bytes(packed)
    compressed.append({'original_path': path.relative_to(dest).as_posix(), 'original_bytes': len(raw),
                       'original_sha256': sha256(raw), 'packed_path': out.relative_to(dest).as_posix(),
                       'packed_bytes': len(packed), 'packed_sha256': sha256(packed)})
    path.unlink()
write_json(dest / 'PACKAGING_MAP.json', {'schema_version': 1, 'source_head': head, 'compressed_files': compressed,
    'notes': 'Only lossless transport compression. No evidence is omitted; hydrate_artifacts verifies exact original bytes.'})
write_json(dest / 'CHECKPOINT.json', {'schema_version': 1, 'state': a.state, 'generated_at_utc': now,
    'source_head': head, 'prior_source_head': summary['previous_source_head'], 'summary': summary,
    'review_continues': a.state == 'IN_PROGRESS', 'product_code_changed': False, 'live_acceptance_performed': False,
    'installations_performed': False, 'publication_scope': 'docs/reconciliation/**',
    'prepack_source_inputs': copied,
    'prepack_source_inputs_note': 'Hashes of captured inputs before transport compression. This is not the final physical-file manifest; raw JSON may be transported only as gzip and pre-existing gzip inputs may be canonicalized.',
    'physical_file_manifest': '../../evidence/ARTIFACT_MANIFEST.json',
    'physical_file_manifest_note': 'The publication allowlist with final byte counts and hashes; it excludes its own hash. PACKAGING_MAP.json maps original JSON bytes to final gzip bytes.'})

prefix = f'reaudit/{a.pass_date}'
state_pt = 'EM ANDAMENTO — checkpoint intermediário' if a.state == 'IN_PROGRESS' else 'PASSAGEM FINITA CONCLUÍDA — limites preservados'
front = summary['function_span_states_non_test']
by_area = collections.Counter(r['area'] for r in finding_rows)
area_priority = collections.defaultdict(collections.Counter)
for row in finding_rows: area_priority[row['area']][row['priority']] += 1

lines = ['# Reauditoria da auditoria e das microfuncionalidades', '', f'**Estado: {state_pt}.**', '',
    f'Checkpoint gerado em `{now}`. Código fixado em [`{head}`](https://github.com/adm01-debug/Zapp_Web_V2/commit/{head}); '
    f'auditoria anterior no baseline `{summary["previous_source_head"]}`. Publicação documental no [draft PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869).', '',
    'Esta camada reabre a avaliação dos contratos e da própria evidência anterior, conforme a solicitação de revisão exaustiva. '
    'O inventário histórico e seus 104 achados permanecem preservados. Os registros R2 incluem comportamentos confirmados no código, '
    'refinamentos e lacunas; não devem ser somados como uma quantidade de bugs independentes, incidentes em produção ou regressões recentes.', '',
    '## Cobertura demonstrada neste checkpoint', '',
    '| Dimensão | Resultado | O que comprova |', '| --- | ---: | --- |',
    f'| Arquivos versionados conferidos | {summary["tracked_files_verified"]} | HEAD, tamanho e hash Git de cada arquivo; zero divergência da cópia examinada. |',
    '| Arquivos JS/TS analisados estruturalmente | 2.397 | Parsing e catálogo de corpos; zero erro sintático nesses arquivos. Não é revisão semântica de SQL. |',
    f'| Corpos JS/TS catalogados | {summary["all_js_ts_bodies"]} | Inclui callbacks aninhados e testes, não capacidades de negócio únicas. |',
    f'| Corpos JS/TS fora da classificação teste/fixture | {summary["non_test_js_ts_bodies"]} | Denominador com scripts e código de terceiros; classificação auditável. |',
    f'| Corpos não teste contidos em faixas revisadas | {front.get("BODY_CONTAINED_IN_REVIEWED_RANGES", 0)} | Corpo coberto por leitura declarada; não comprova todos os ramos ou cenários executados. |',
    f'| Corpos não teste parcialmente cobertos | {front.get("BODY_PARTIALLY_OVERLAPS_REVIEWED_RANGES", 0)} | Leitura ainda insuficiente para declarar corpo integral. |',
    f'| Corpos não teste sem faixa atual localizada | {front.get("NO_CURRENT_REVIEWED_RANGE_LOCATED", 0)} | Saldo explícito para orientar a continuação. |',
    f'| Arquivos com revisão integral declarada | {summary["file_review_states"].get("WHOLE_FILE_SEMANTIC_REVIEW_DECLARED", 0)} | Soma única entre áreas, sem duplicar revisões cruzadas. |',
    f'| Corpos candidatos de funções SQL efetivas revisados | {summary["sql_function_review"].get("semantic", 0)} | Ordem das definições versionadas e leitura manual; não é introspecção do banco implantado. |',
    f'| Referências de código validadas | {summary["validated_source_evidence_references"]} | Caminho, faixa e blob correspondem ao pin. |',
    '| Aceite em produção | Não realizado | Nenhum envio, chamada real, migration, deploy, instalação ou correção do produto. |', '',
    f'O saldo de leitura de corpos não teste está distribuído por **{summary["remaining_non_test_js_ts_files_with_uncontained_bodies"]} arquivos**, '
    f'listados em [{prefix}/consolidated/remaining-production-review.json]({prefix}/consolidated/remaining-production-review.json). '
    'O trabalho continua a partir dessa matriz; o fechamento de um diretório não significa encerramento do repositório.', '',
    '### Correção do denominador, sem promoção artificial de cobertura', '',
    '58 arquivos `.unit.*`/`.integration.*`, todos com imports de teste/assert, foram corretamente classificados como testes. '
    'São 668 corpos transferidos entre categorias; o total estrutural de 36.853 não mudou. A mudança não declarou nenhum corpo adicional como lido. '
    f'A decisão e os estados anterior/posterior estão em [test-classification-adjudication.json]({prefix}/global/test-classification-adjudication.json).', '',
    '## Registros por área', '', '| Área | Registros | P1 | P2 | P3 |', '| --- | ---: | ---: | ---: | ---: |']
for area in sorted(by_area):
    counts = area_priority[area]
    lines += [f'| [{area}]({prefix}/reports/{area}/report.md) | {by_area[area]} | {counts["P1"]} | {counts["P2"]} | {counts["P3"]} |']
lines += ['', f'**Total da camada R2 neste snapshot: {summary["findings"]} registros.** '
    + '; '.join(f'{key}: {value}' for key, value in summary['by_review_state'].items()) + '.', '',
    'As prioridades são classificações de revisão, condicionadas ao consumidor e às precondições descritas. '
    'Um risco de autorização demonstrado estaticamente não prova que alguém o explorou. Uma resposta 200 em um probe simulado '
    'não certifica acesso ao provedor real. Defeitos que compartilham causa devem ser agrupados antes de virar trabalho de implementação.', '',
    '## Mecanismos de maior impacto a confrontar', '']
chosen = ['R2-AUTH-001', 'R2-AUTH-003', 'R2-COM-009', 'R2-DB-001', 'R2-DB-009', 'R2-INB-006',
          'R2-CALL-001', 'R2-MOD-025', 'R2-API-027', 'R2-INF-001', 'R2-INF-004', 'R2-COM-001']
by_id = {r['id']: r for r in finding_rows}
for fid in chosen:
    if fid not in by_id: continue
    r = by_id[fid]
    lines += [f'### {fid} — {r["title"]}', '',
              '**Condição:** ' + prose(r['preconditions']), '',
              '**Comportamento e efeito:** ' + prose(r['observed_source_behavior']) + ' ' + prose(r['impact']), '',
              '**Limites:** ' + prose(r['limitations']), '',
              f'Registro completo: [{r["area"]}]({prefix}/reports/{r["area"]}/report.md). ', '']
lines += ['## Falhas na evidência e adjudicações da auditoria anterior', '',
    'O índice anterior já incluía os 352 documentos Markdown do pin atual. A lacuna não era ausência física desses arquivos: '
    'dois prompts com tarefas explícitas estavam classificados apenas como documentos de apoio e careciam de correspondência de requisitos. '
    'Foram mapeados seis cabeçalhos CRM360 e quatro de Inteligência. Eles não viraram dez novas tarefas de implementação; '
    'os sucessores atuais, componentes substituídos e decisões de produto continuam sendo a autoridade para cada caso.', '',
    'O catálogo histórico apresenta 349 linhas com marcação de conclusão. A reconciliação literal encontrou 185 linhas com caminho existente, '
    '72 com caminho ausente/renomeado (69 caminhos únicos) e 92 referências que não são arquivos. Caminho existente e checkmark não certificam '
    'um fluxo, assim como arquivo renomeado não demonstra funcionalidade removida.', '',
    'Alguns candidatos foram rejeitados ou reclassificados ao encontrar consumidores, guardas e decisões anteriores. '
    'Exemplos: a lista de threads Gmail já tem paginação; o problema adicional é o histórico interno. '
    'O componente de modo Zen recebe a ação compartilhada do shell. A regra de cinco minutos de SLA e o marco created_at têm decisões '
    'versionadas que precisam ser adjudicadas antes de qualquer alteração. Os relatórios de área conservam essas ressalvas.', '',
    f'Rastreabilidade: [relatório transversal]({prefix}/reports/root/report.md), '
    f'[adjudicação dos prompts]({prefix}/reports/root/omitted-source-adjudication.json), '
    f'[índice normalizado de registros]({prefix}/consolidated/findings-index.json).', '',
    '## Evidência e reprodução', '',
    'Os probes executam módulos ou callbacks exatos sob fronteiras declaradas: bancos, relógios, rede, React e elementos podem ser sintéticos. '
    'Os programas verificam o pin e os blobs antes de avaliar o código. Casos positivos, contraexemplos, replays de revisão e verificações de integridade '
    'não devem ser contados como se fossem a mesma coisa. A contagem única entre todos os conjuntos de probes será consolidada ao fechar esta passagem.', '',
    f'Comece pelo [guia de reprodução]({prefix}/README.md) e pelo [CHECKPOINT.json]({prefix}/CHECKPOINT.json). '
    'Grandes matrizes estão compactadas sem perda; os hashes dos bytes originais e compactados permitem conferir ou materializar a cópia.', '',
    '## Continuação autorizada', '',
    'A próxima passagem conclui os corpos restantes de interface, utilitários e integrações, além da composição de políticas SQL. '
    'Depois vêm a adjudicação de relações com o ledger anterior, a deduplicação dos mecanismos, o índice único de provas e a validação final da publicação. '
    'O status deste checkpoint é em andamento e nenhuma capacidade é certificada em produção por esta publicação.', '',
    'Cartographer, Claude-Mem e Headroom continuam no plano de avaliação AT, com POCs/instalação não executadas. '
    'Grill Me foi incorporado documentalmente à revisão dos planos; integração executável e validação continuam pendentes. '
    'Esses estados não foram convertidos em instalação por causa da presente reauditoria.', '']
report_name = f'REAUDIT_MICROFUNCTIONS_{a.pass_date}.md'
(docs / report_name).write_text('\n'.join(lines) + '\n')

readme = f'''# Evidências da reauditoria — {a.pass_date}

Estado: **{state_pt}**. Fonte `{head}`. Timestamp `{now}`.

Leia primeiro o [relatório principal](../../{report_name}). `CHECKPOINT.json` fixa contagens e identifica os insumos capturados antes da compactação (`prepack_source_inputs`); esse campo não é um manifesto dos arquivos físicos finais. O [manifesto de publicação](../../evidence/ARTIFACT_MANIFEST.json) enumera os arquivos publicados e seus hashes finais. `PACKAGING_MAP.json` relaciona os bytes JSON originais aos bytes gzip de transporte. O produto não está incluído neste diretório e nenhum script de migration, deploy ou envio é executado por este guia.

## Estrutura

- `source-integrity.json`: 4.068 blobs do checkout examinado.
- `global/`: inventários estruturais, importações, delta do baseline e confronto de evidências antigas.
- `reports/`: achados, cobertura, notas de rejeição e resultados por área.
- `probes/`: runners e pins suplementares de certas áreas.
- `tools/`: geradores/probes transversais; vários probes de área ficam junto a seus relatórios.
- `consolidated/`: índices únicos de arquivos/corpos/achados e saldo de leitura.

As tabelas de corpos são estruturais. `BODY_CONTAINED_IN_REVIEWED_RANGES` indica contenção nas faixas declaradas; não significa que todos os ramos passaram em teste ou que foram exercidos em produção.

## Verificação offline da cópia

Use uma cópia de trabalho para materializar JSON grandes. O comando de verificação não faz rede nem modifica o produto:

```bash
python tools/hydrate_artifacts.py --root . --verify-only
```

Para recriar os arquivos JSON originais sem sobrescrever arquivo alterado:

```bash
python tools/hydrate_artifacts.py --root .
```

Com o checkout do produto já disponível e fixado exatamente no HEAD acima, e o pacote documental anterior disponível como `PRIOR_DOCS`, a reconciliação de hashes e referências é:

```bash
python tools/consolidate_reaudit.py --source /caminho/checkout-do-produto --audit-root . --prior /caminho/PRIOR_DOCS --out /caminho/saida-de-verificacao --allow-in-progress
```

`--allow-in-progress` é explícito neste checkpoint e não deve ser apresentado como gate final. A verificação rejeita HEAD ou blobs diferentes, faixas inválidas, IDs duplicados e referências sem evidência.

## Probes transversais

Node e Python são pré-requisitos do ambiente de reprodução. Os scripts que transpilem TS recebem o caminho de uma instalação já disponível do compilador (5.9.3 no ensaio registrado); este pacote não instala ferramentas. Consulte o cabeçalho de cada runner antes de executar. Exemplos, a partir deste diretório materializado:

```bash
node tools/platform_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-platform.json
node tools/gmail_oauth_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-gmail-oauth.json
```

Os resultados especificam as fronteiras simuladas. Callbacks isolados não substituem testes React DOM; modelos de predicados SQL não substituem PostgreSQL; respostas de fetch sintético não provam comportamento de Google/Evolution/ElevenLabs. Não execute scripts do produto para migration, exclusão, deploy ou tráfego real ao reproduzir esta auditoria documental.
'''
(dest / 'README.md').write_text(readme)

start, end = '<!-- BEGIN REAUDIT CHECKPOINT -->', '<!-- END REAUDIT CHECKPOINT -->'
notice = '\n'.join([start, '## Reauditoria atual', '',
    f'**{state_pt}.** A solicitação posterior reabriu a análise no pin `{head}`. '
    f'Este checkpoint contém {summary["findings"]} registros R2; preserva os104 achados históricos e distingue leitura, estrutura, prova isolada e aceite. '
    f'Consulte [{report_name}]({report_name}) para cobertura, precondições e saldo. A revisão continua; esta publicação é exclusivamente documental.', end])
for name in ['README.md', 'SESSION_HANDOFF.md', 'EXECUTION_WAVES.md']:
    path = docs / name
    text = path.read_text()
    if start in text:
        lo, hi = text.index(start), text.index(end) + len(end)
        text = text[:lo] + notice + text[hi:]
    else:
        first, rest = text.split('\n', 1)
        if name == 'README.md': first = '# Reconciliação e reauditoria do ZAPP'
        if name == 'SESSION_HANDOFF.md': first = '# Estado e retomada da reauditoria'
        text = first + '\n\n' + notice + '\n\n## Auditoria documental anterior e planejamento preservado\n' + rest
    path.write_text(text)

manifest_path = docs / 'evidence/ARTIFACT_MANIFEST.json'
manifest = json.loads(manifest_path.read_text())
entries = []
for path in sorted(docs.rglob('*')):
    if not path.is_file() or path == manifest_path: continue
    raw = path.read_bytes()
    entries.append({'path': path.relative_to(docs).as_posix(), 'bytes': len(raw), 'sha256': sha256(raw), 'git_blob_sha': blob(raw)})
manifest.update(file_count=len(entries), bytes_of_hashed_files=sum(r['bytes'] for r in entries), files=entries,
    reaudit_source_head=head, reaudit_checkpoint_state=a.state, reaudit_checkpoint_generated_at_utc=now,
    historical_baseline_fields_preserved=True)
write_json(manifest_path, manifest)
print(json.dumps({'checkpoint': str(dest), 'state': a.state, 'findings': summary['findings'],
                  'validation_errors': summary['validation_errors'], 'compressed_files': len(compressed),
                  'manifest_files': len(entries), 'manifest_bytes': manifest['bytes_of_hashed_files']}))
