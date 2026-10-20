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
completed = a.state == 'COMPLETED_FINITE_REVIEW'

def sha256(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
def write_json(path, data): path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
def prose(value):
    if isinstance(value, str): return value
    if isinstance(value, list): return ' '.join(prose(v) for v in value)
    if isinstance(value, dict): return '; '.join(str(k) + ': ' + prose(v) for k, v in value.items())
    return str(value)
def number(value): return f'{value:,}'.replace(',', '.')
def read_json(root, name): return json.loads((root / name).read_text())

completion_path = 'global/finite-review-completion.json'
probe_registry_path = 'reports/root/offline-probe-registry.json'
ddl_path = 'reports/database/ddl_completion.json'
completion = probe_registry = ddl = database_coverage = view_review = None
if completed:
    # Reject an absent, provisional or stale gate before replacing an existing package.
    completion = read_json(audit, completion_path)
    assert completion['status'] == 'COMPLETE' and completion['mode'] == 'final', 'Final finite-review gate has not passed'
    assert not completion['errors'] and not completion['pending'], 'Final finite-review gate has unresolved items'
    for entry in completion['inputs']:
        input_path = (audit / entry['path']).resolve()
        assert input_path.is_relative_to(audit), f'Gate input escapes audit root: {entry["path"]}'
        assert sha256(input_path.read_bytes()) == entry['sha256'], f'Stale completion gate input: {entry["path"]}'
    for kind in ['tests', 'shell']:
        recut = completion[kind]
        assert recut['completed_files'] == recut['allocated_unique_files'] == recut['expected_files'], f'Incomplete {kind} file reading'
        assert recut['completed_lines'] == recut['allocated_lines'] == recut['expected_lines'], f'Incomplete {kind} line reading'
        assert not recut['pending_paths'], f'Pending {kind} files'
    assert completion['js_ts']['uncontained_bodies'] == completion['js_ts']['uncontained_non_test_bodies'] == 0
    probe_registry = read_json(audit, probe_registry_path)
    ddl = read_json(audit, ddl_path)
    database_coverage = read_json(audit, 'reports/database/coverage.json')
    view_review = read_json(audit, 'reports/database/view_review.json')
    assert ddl['status'] == 'COMPLETED_MANUAL_READING' and ddl['pending_ddl_instruction_count'] == 0
    for name, artifact in [(probe_registry_path, probe_registry), (ddl_path, ddl),
                           ('reports/database/coverage.json', database_coverage), ('reports/database/view_review.json', view_review)]:
        assert artifact['source_head'] == completion['source_head'], f'Completion pin mismatch: {name}'
    assert probe_registry['status'] == 'COMPLETED', 'Offline probe registry is not complete'
    assert not probe_registry['integrity']['recorded_artifact_mismatches'], 'Probe registry artifact mismatch'
    assert probe_registry['counts']['canonical_unique_total'] == (probe_registry['counts']['primary_total'] + probe_registry['counts']['behavior_controls'])
    assert probe_registry['counts']['primary_total'] == (probe_registry['counts']['primary_authored'] + probe_registry['counts']['primary_vendor'])
    for entry in probe_registry['artifacts']:
        artifact_path = (audit / entry['path']).resolve()
        assert artifact_path.is_relative_to(audit), f'Probe artifact escapes audit root: {entry["path"]}'
        assert sha256(artifact_path.read_bytes()) == entry['sha256'], f'Stale probe registry artifact: {entry["path"]}'
    completion_sha256 = sha256((audit / completion_path).read_bytes())

if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)

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
if completed:
    assert sha256((dest / completion_path).read_bytes()) == completion_sha256, 'Completion gate changed during packaging'
    for entry in completion['inputs']:
        if Path(entry['path']).parts[0] == 'consolidated': continue  # Regenerated below from the captured inputs.
        assert sha256((dest / entry['path']).read_bytes()) == entry['sha256'], f'Gate input changed during snapshot: {entry["path"]}'

command = [sys.executable, str(dest / 'tools/consolidate_reaudit.py'), '--source', str(source),
           '--audit-root', str(dest), '--prior', str(prior), '--out', str(dest / 'consolidated')]
if a.state == 'IN_PROGRESS': command.append('--allow-in-progress')
result = subprocess.run(command, text=True, capture_output=True)
assert result.returncode == 0, result.stdout + result.stderr
summary = json.loads((dest / 'consolidated/summary.json').read_text())
assert summary['validation_errors'] == 0
head = summary['source_head']
if completed:
    assert head == completion['source_head']
    assert not summary['in_progress_artifacts_allowed']
    assert summary['remaining_non_test_js_ts_files_with_uncontained_bodies'] == 0
    for key, total in [('function_span_states_all', 'all_js_ts_bodies'),
                       ('function_span_states_non_test', 'non_test_js_ts_bodies')]:
        assert summary[key].get('BODY_CONTAINED_IN_REVIEWED_RANGES', 0) == summary[total], f'Uncontained bodies: {key}'
        assert not any(count for state, count in summary[key].items() if state != 'BODY_CONTAINED_IN_REVIEWED_RANGES')
    assert completion['js_ts']['total_bodies'] == summary['all_js_ts_bodies']
    assert completion['js_ts']['non_test_bodies'] == summary['non_test_js_ts_bodies']
    assert completion['sql']['functions_semantic'] == summary['sql_function_review']['semantic']
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
def transport_links(text, base=''):
    for entry in compressed:
        text = text.replace(f']({base}{entry["original_path"]})', f']({base}{entry["packed_path"]})')
    return text
write_json(dest / 'CHECKPOINT.json', {'schema_version': 1, 'state': a.state, 'generated_at_utc': now,
    'source_head': head, 'prior_source_head': summary['previous_source_head'], 'summary': summary,
    'review_continues': a.state == 'IN_PROGRESS', 'product_code_changed': False, 'live_acceptance_performed': False,
    'finite_review_gate': {'result': 'PASS', 'artifact': completion_path,
                           'sha256': completion_sha256} if completed else None,
    'offline_probe_registry': probe_registry_path if completed else None,
    'installations_performed': False, 'publication_scope': 'docs/reconciliation/**',
    'prepack_source_inputs': copied,
    'prepack_source_inputs_note': 'Hashes of captured inputs before transport compression. This is not the final physical-file manifest; raw JSON may be transported only as gzip and pre-existing gzip inputs may be canonicalized.',
    'physical_file_manifest': '../../evidence/ARTIFACT_MANIFEST.json',
    'physical_file_manifest_note': 'The publication allowlist with final byte counts and hashes; it excludes its own hash. PACKAGING_MAP.json maps original JSON bytes to final gzip bytes.'})

prefix = f'reaudit/{a.pass_date}'
state_pt = 'EM ANDAMENTO — checkpoint intermediário' if a.state == 'IN_PROGRESS' else 'PASSAGEM FINITA CONCLUÍDA — limites preservados'
front = summary['function_span_states_non_test']
coverage_tail = (
    f'A leitura finita tem **zero corpos JS/TS restantes** no catálogo: '
    f'{number(summary["function_span_states_all"].get("BODY_CONTAINED_IN_REVIEWED_RANGES", 0))} corpos, '
    f'incluindo {number(summary["non_test_js_ts_bodies"])} fora da classificação teste/fixture, estão contidos nas faixas revisadas. '
    f'O [gate final]({prefix}/{completion_path}) está aprovado (`PASS`, estado `COMPLETE`, modo `final`), '
    f'e a [matriz de saldo]({prefix}/consolidated/remaining-production-review.json) não contém arquivos pendentes desse recorte. '
    'Essa conclusão encerra a leitura declarada e verificável do escopo catalogado; não atesta ausência de defeitos, '
    'cobertura de todos os cenários nem comportamento da implantação.'
    if completed else
    f'O saldo de leitura de corpos não teste está distribuído por **{summary["remaining_non_test_js_ts_files_with_uncontained_bodies"]} arquivos**, '
    f'listados em [{prefix}/consolidated/remaining-production-review.json]({prefix}/consolidated/remaining-production-review.json). '
    'O trabalho continua a partir dessa matriz; o fechamento de um diretório não significa encerramento do repositório.'
)
completion_rows = []
completion_details = []
if completed:
    tests, shell = completion['tests'], completion['shell']
    completion_rows = [
        f'| Recorte suplementar de testes JS/TS lido integralmente | {number(tests["completed_files"])} arquivos / {number(tests["completed_lines"])} linhas | Assertions, mocks e contratos adjudicados. É o lote suplementar, não todos os testes do repositório; não foram executadas essas suítes. |',
        f'| Recorte suplementar Bash lido integralmente | {number(shell["completed_files"])} arquivos / {number(shell["completed_lines"])} linhas | SQL embutido, fixtures, asserts e cleanup lidos; esses roteiros não foram executados por essa passagem. |',
        f'| Fila original de instruções DDL revisada | {number(ddl["original_ddl_instruction_count"])} / {number(ddl["original_ddl_instruction_count"])} | Inclui {number(ddl["peer_original_ddl_instruction_count"])} instruções de privilégios de funções revisadas pelo root; zero instruções pendentes na alocação original. |',
    ]
    view_count = database_coverage['views']['coverage_counts']['semantic']
    alter_count = sum(len(view['effective_alter_sequence']) for view in view_review['views'])
    completion_details = [
        '### Fechamento dos recortes suplementares e de SQL', '',
        f'Os {number(tests["completed_files"])} testes JS/TS e os {number(shell["completed_files"])} roteiros Bash são lotes finitos '
        'abertos para preencher lacunas de leitura. As adjudicações por arquivo preservam controles positivos, '
        'mocks e limites de inferência; leitura de um teste não equivale a resultado de execução. '
        f'O [registro de conclusão]({prefix}/{completion_path}) também explicita o gate das demais linguagens.', '',
        f'A [conclusão DDL]({prefix}/{ddl_path}) reconcilia a fila original de '
        f'{number(ddl["original_ddl_instruction_count"])} instruções, com '
        f'{number(ddl["own_original_ddl_instruction_count"])} revisadas pelo agente database e '
        f'{number(ddl["peer_original_ddl_instruction_count"])} instruções de ACL de funções incorporadas com autoria do root. '
        f'A [cobertura SQL]({prefix}/reports/database/coverage.json) registra ainda '
        f'{number(summary["sql_function_review"]["semantic"])} corpos de funções efetivas, '
        f'{number(database_coverage["anonymous_do_blocks"]["coverage_counts"]["semantic"])} blocos DO, '
        f'{number(view_count)} definições finais de views com {number(alter_count)} ALTERs efetivos e '
        f'{number(database_coverage["trigger_bindings"]["coverage_counts"]["semantic"])} vínculos de trigger lidos. '
        'São denominadores distintos, com histórias e composição de policies/ACL documentadas; não devem ser somados como objetos únicos. '
        'Nenhuma migration, expansão de DO ou consulta ao banco vivo foi executada para certificar esse fechamento.', '',
    ]
by_area = collections.Counter(r['area'] for r in finding_rows)
area_priority = collections.defaultdict(collections.Counter)
for row in finding_rows: area_priority[row['area']][row['priority']] += 1

lines = ['# Reauditoria da auditoria e das microfuncionalidades', '', f'**Estado: {state_pt}.**', '',
    f'Checkpoint gerado em `{now}`. Código fixado em [`{head}`](https://github.com/adm01-debug/Zapp_Web_V2/commit/{head}); '
    f'auditoria anterior no baseline `{summary["previous_source_head"]}`. Publicação documental no [draft PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869).', '',
    'Esta camada reabre a avaliação dos contratos e da própria evidência anterior, conforme a solicitação de revisão exaustiva. '
    f'O inventário histórico e seus {summary["previous_findings_preserved"]} achados permanecem preservados. Os registros R2 incluem comportamentos confirmados no código, '
    'refinamentos e lacunas; não devem ser somados como uma quantidade de bugs independentes, incidentes em produção ou regressões recentes.', '',
    '## Cobertura demonstrada neste checkpoint', '',
    '| Dimensão | Resultado | O que comprova |', '| --- | ---: | --- |',
    f'| Arquivos versionados conferidos | {summary["tracked_files_verified"]} | HEAD, tamanho e hash Git de cada arquivo; zero divergência da cópia examinada. |',
    *([] if completed else ['| Arquivos JS/TS analisados estruturalmente | 2.397 | Parsing e catálogo de corpos; zero erro sintático nesses arquivos. Não é revisão semântica de SQL. |']),
    f'| Corpos JS/TS catalogados | {summary["all_js_ts_bodies"]} | Inclui callbacks aninhados e testes, não capacidades de negócio únicas. |',
    f'| Corpos JS/TS fora da classificação teste/fixture | {summary["non_test_js_ts_bodies"]} | Denominador com scripts e código de terceiros; classificação auditável. |',
    f'| Corpos não teste contidos em faixas revisadas | {front.get("BODY_CONTAINED_IN_REVIEWED_RANGES", 0)} | Corpo coberto por leitura declarada; não comprova todos os ramos ou cenários executados. |',
    f'| Corpos não teste parcialmente cobertos | {front.get("BODY_PARTIALLY_OVERLAPS_REVIEWED_RANGES", 0)} | Leitura ainda insuficiente para declarar corpo integral. |',
    f'| Corpos não teste sem faixa atual localizada | {front.get("NO_CURRENT_REVIEWED_RANGE_LOCATED", 0)} | ' + ('Zero exigido pelo gate final de leitura. |' if completed else 'Saldo explícito para orientar a continuação. |'),
    f'| Arquivos com revisão integral declarada | {summary["file_review_states"].get("WHOLE_FILE_SEMANTIC_REVIEW_DECLARED", 0)} | Soma única entre áreas, sem duplicar revisões cruzadas. |',
    f'| Arquivos com revisão de faixas específicas | {summary["file_review_states"].get("REVIEWED_SOURCE_RANGES_LOCATED", 0)} | Trechos documentados, sem declarar leitura integral do arquivo. |',
    f'| Arquivos apenas no inventário estrutural | {summary["file_review_states"].get("STRUCTURAL_INVENTORY_ONLY", 0)} | Identidade e estrutura catalogadas; sem revisão semântica declarada. |',
    f'| Corpos candidatos de funções SQL efetivas revisados | {summary["sql_function_review"].get("semantic", 0)} | Ordem das definições versionadas e leitura manual; não é introspecção do banco implantado. |',
    f'| Referências de código validadas | {summary["validated_source_evidence_references"]} | Caminho, faixa e blob correspondem ao pin. |',
    *completion_rows,
    '| Aceite em produção | Não realizado | Nenhum envio, chamada real, migration, deploy, instalação ou correção do produto. |', '',
    coverage_tail, '', *completion_details,
    '### Correção do denominador, sem promoção artificial de cobertura', '',
    '58 arquivos `.unit.*`/`.integration.*`, todos com imports de teste/assert, foram corretamente classificados como testes. '
    'São 668 corpos transferidos entre categorias; o total estrutural de 36.853 não mudou. A mudança não declarou nenhum corpo adicional como lido. '
    'O arquivo Deno `supabase/functions/ai-auto-tag/auth_test.ts` acrescentou uma correção de mais dois corpos, também registrada no mesmo journal. '
    'O denominador final é de 16.652 corpos não teste e 20.201 de teste/fixture. '
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
if completed:
    assert {'R2-GOV-003', 'R2-GOV-004'} <= by_id.keys(), 'Final evidence findings missing from consolidated index'
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
    *(['### Dois contratos da evidência de testes e runners', '',
    '**R2-GOV-003 — refinamento de TC-011.** A leitura encontrou assertions literais, réplicas locais de regra e mocks que '
    'não reproduzem o contrato do consumidor, além de asserts incapazes de discriminar o defeito anunciado. '
    'Isso limita a força probatória de testes específicos; não transforma todo teste do repositório em falso positivo nem '
    'cria um defeito de produto por arquivo. Controles positivos reais, inclusive testes que importam o consumidor e verificações '
    'de acessibilidade executáveis, permanecem distinguidos nos relatórios. A classificação é um refinamento da evidência anterior TC-011.', '',
    '**R2-GOV-004 — falha independente no runner de exportação.** No trecho de validação, um processo Node pode falhar '
    'e ter seu status perdido pelo pipeline com `tee` sem `pipefail`; o contador de mensagens `FAIL` então permite um anúncio de sucesso. '
    'Há uma reprodução offline do Bash exato com Node substituto e dois controles; nenhum export ou banco real foi executado. '
    '`import.sh` tem `set -e`, portanto não se afirma que ele ignore uma falha do primeiro Node. Nesse arquivo, a observação '
    'sobre bloco de importação ausente se limita ao anúncio prematuro: o resultado final ainda depende do validador posterior.', '',
    f'Os registros completos e os limites de seus loci estão no [relatório root]({prefix}/reports/root/report.md); '
    f'a [revisão independente do núcleo GOV-003/004]({prefix}/reports/root/peer-review-gov003-gov004.md) '
    'registra as correções aceitas e a ausência de reexecução pelo revisor. Suplementos posteriores de Bash têm adjudicação própria.', ''] if completed else []),
    '## Evidência e reprodução', '',
    'Os casos têm fronteiras diferentes: há execução de módulos/callbacks sob stubs, extrações de código, modelos de predicados, '
    'decisões estáticas e controles de proveniência. Bancos, relógios, rede, React e elementos podem ser sintéticos. '
    'A classificação individual informa o que efetivamente foi exercido; um caso não equivale a um achado nem a um teste integrado. '
    + (f'O [índice único]({prefix}/{probe_registry_path}) consolida '
       f'{number(probe_registry["counts"]["canonical_unique_total"])} casos canônicos únicos: '
       f'{number(probe_registry["counts"]["primary_total"])} casos diagnósticos '
       f'({number(probe_registry["counts"]["primary_authored"])} de código autoral e '
       f'{number(probe_registry["counts"]["primary_vendor"])} de código vendorizado) e '
       f'{number(probe_registry["counts"]["behavior_controls"])} controles comportamentais. '
       'Os controles incluem verificações positivas de consumidores, o smoke do vendor e os controles do export, cada um com papel próprio; '
       'o total canônico não é uma contagem de defeitos reproduzidos. '
       f'Ficam separados desse total {number(probe_registry["counts"]["provenance_negative_controls"])} controles negativos de proveniência e '
       f'{number(probe_registry["counts"]["textual_hash_controls"])} controle textual de hash. '
       f'Os {number(probe_registry["counts"]["peer_replay_cases"])} casos de replay e '
       f'{number(probe_registry["counts"]["superseded_same_primary_cases"])} registros históricos dos mesmos casos primários '
       'ficam fora da soma primária. O índice apenas reconciliou provas existentes; não reexecutou probes ou suítes.'
       if completed else
       'Casos positivos, contraexemplos, replays de revisão e verificações de integridade não devem ser contados como se fossem '
       'a mesma coisa. A contagem única entre todos os conjuntos será consolidada ao fechar esta passagem.'), '',
    f'Comece pelo [guia de reprodução]({prefix}/README.md) e pelo [CHECKPOINT.json]({prefix}/CHECKPOINT.json). '
    'Grandes matrizes estão compactadas sem perda; os hashes dos bytes originais e compactados permitem conferir ou materializar a cópia.', '',
    '## Limites do fechamento e trabalho de implementação' if completed else '## Continuação autorizada', '',
    ('Esta passagem finita de leitura está concluída com o gate final aprovado e os denominadores explicitados acima. '
     'Os achados continuam condicionados às precondições e aos limites de suas provas. Corrigir o produto, instalar ferramentas, '
     'validar migrations em ambiente isolado e realizar aceite integrado são trabalhos posteriores; não ocorreram nesta publicação documental.'
     if completed else
     'A próxima passagem conclui os corpos restantes de interface, utilitários e integrações, além da composição de políticas SQL. '
     'Depois vêm a adjudicação de relações com o ledger anterior, a deduplicação dos mecanismos, o índice único de provas e a validação final da publicação. '
     'O status deste checkpoint é em andamento e nenhuma capacidade é certificada em produção por esta publicação.'), '',
    'Cartographer, Claude-Mem e Headroom continuam no plano de avaliação AT; suas POCs e instalações não foram executadas nesta entrega. '
    'A existência de instalações locais, globais ou na VPS permanece sem verificação. '
    'Grill Me foi incorporado documentalmente à revisão dos planos; integração executável e validação continuam pendentes. '
    'Esses estados não foram convertidos em instalação por causa da presente reauditoria.', '']
report_name = f'REAUDIT_MICROFUNCTIONS_{a.pass_date}.md'
(docs / report_name).write_text(transport_links('\n'.join(lines) + '\n', prefix + '/'))

verification_flag = '' if completed else ' --allow-in-progress'
verification_out = './consolidated' if completed else '/caminho/saida-de-verificacao'
finite_gate_command = (
    '\nNa cópia de trabalho materializada, após a reconciliação acima, o gate finito pode ser refeito sem permitir pendências:\n\n'
    '```bash\npython tools/validate_finite_review.py --audit-root . --source /caminho/checkout-do-produto\n```\n'
    if completed else ''
)
verification_note = (
    'O estado final exige a reconciliação sem `--allow-in-progress` e o gate `global/finite-review-completion.json` '
    'em modo `final`, com status `COMPLETE`, nenhum erro e nenhuma pendência. O empacotador deriva `PASS` desse resultado '
    'e rejeita inputs cujo hash tenha mudado depois do gate. O gate registra conclusão da leitura finita; não é aceite do produto.'
    if completed else
    '`--allow-in-progress` é explícito neste checkpoint e não deve ser apresentado como gate final.'
)
completion_structure = (
    f'\n- [{completion_path}]({completion_path}): gate e denominadores finais dos recortes suplementares de testes, Bash e outras linguagens.'
    f'\n- [{probe_registry_path}]({probe_registry_path}): índice único das provas existentes, controles e replays excluídos da soma primária.'
    f'\n- [{ddl_path}]({ddl_path}): reconciliação da fila original de DDL, com autoria da leitura e saldo zero.'
    if completed else ''
)
readme = f'''# Evidências da reauditoria — {a.pass_date}

Estado: **{state_pt}**. Fonte `{head}`. Timestamp `{now}`.

Leia primeiro o [relatório principal](../../{report_name}). `CHECKPOINT.json` fixa contagens e identifica os insumos capturados antes da compactação (`prepack_source_inputs`); esse campo não é um manifesto dos arquivos físicos finais. O [manifesto de publicação](../../evidence/ARTIFACT_MANIFEST.json) enumera os arquivos publicados e seus hashes finais. `PACKAGING_MAP.json` relaciona os bytes JSON originais aos bytes gzip de transporte. O produto não está incluído neste diretório e nenhum script de migration, deploy ou envio é executado por este guia.

## Estrutura

- `source-integrity.json`: {number(summary['tracked_files_verified'])} blobs do checkout examinado.
- `global/`: inventários estruturais, importações, delta do baseline e confronto de evidências antigas.
- `reports/`: achados, cobertura, notas de rejeição e resultados por área.
- `probes/`: runners e pins suplementares de certas áreas.
- `tools/`: geradores/probes transversais; vários probes de área ficam junto a seus relatórios.
- `consolidated/`: índices únicos de arquivos/corpos/achados e saldo de leitura.{completion_structure}

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
python tools/consolidate_reaudit.py --source /caminho/checkout-do-produto --audit-root . --prior /caminho/PRIOR_DOCS --out {verification_out}{verification_flag}
```

{verification_note} A reconciliação rejeita HEAD ou blobs diferentes, faixas inválidas, IDs duplicados e referências sem evidência.
{finite_gate_command}

## Probes transversais

Node e Python são pré-requisitos do ambiente de reprodução. Os scripts que transpilem TS recebem o caminho de uma instalação já disponível do compilador (5.9.3 no ensaio registrado); este pacote não instala ferramentas. Consulte o cabeçalho de cada runner antes de executar. Exemplos, a partir deste diretório materializado:

```bash
node tools/platform_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-platform.json
node tools/gmail_oauth_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-gmail-oauth.json
```

Os resultados especificam as fronteiras simuladas. Callbacks isolados não substituem testes React DOM; modelos de predicados SQL não substituem PostgreSQL; respostas de fetch sintético não provam comportamento de Google/Evolution/ElevenLabs. Não execute scripts do produto para migration, exclusão, deploy ou tráfego real ao reproduzir esta auditoria documental.
'''
(dest / 'README.md').write_text(transport_links(readme))

start, end = '<!-- BEGIN REAUDIT CHECKPOINT -->', '<!-- END REAUDIT CHECKPOINT -->'
notice = '\n'.join([start, '## Reauditoria atual', '',
    f'**{state_pt}.** A solicitação posterior reabriu a análise no pin `{head}`. '
    f'Este checkpoint contém {summary["findings"]} registros R2; preserva os {summary["previous_findings_preserved"]} achados históricos e distingue leitura, estrutura, prova isolada e aceite. '
    f'Consulte [{report_name}]({report_name}) para cobertura, precondições e limites. '
    + ('A leitura do escopo finito catalogado foi concluída com gate final aprovado e saldo de corpos zero; não houve aceite em produção. '
       if completed else 'A revisão continua; ')
    + 'Esta publicação é exclusivamente documental.', end])
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
