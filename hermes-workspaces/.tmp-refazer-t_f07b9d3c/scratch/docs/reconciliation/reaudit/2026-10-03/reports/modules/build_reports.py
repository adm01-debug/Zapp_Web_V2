"""Assemble this read-only review's records; never modifies the source tree."""
from pathlib import Path
import collections
import hashlib
import json
import re

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/modules')
AUDIT = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
PRIOR = Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation/FINDINGS.json')
SHA = 'da307ba5626dce892f0b37cb6762463f55d14a96'
REPO = 'https://github.com/adm01-debug/Zapp_Web_V2'
integrity = json.loads((AUDIT / 'source-integrity.json').read_text())
assert integrity['head_sha'] == SHA and not integrity['mismatches']
pinned = {x['path']: x['git_blob_sha'] for x in integrity['files']}
prior = json.loads(PRIOR.read_text())['findings']
prior_ids = {x['id'] for x in prior}
prior_paths = collections.defaultdict(list)
for finding in prior:
    for evidence in finding['evidence']:
        if isinstance(evidence, dict) and evidence.get('path'):
            prior_paths[evidence['path']].append(finding['id'])

def file_meta(path):
    raw = (ROOT / path).read_bytes()
    observed = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert observed == pinned[path], (path, observed, pinned.get(path))
    return observed, raw.decode().splitlines()

def evidence(path, first, last, purpose=''):
    blob, lines = file_meta(path)
    assert 1 <= first <= last <= len(lines), (path, first, last, len(lines))
    return dict(path=path, line_start=first, line_end=last,
                git_blob_sha=blob, commit=SHA,
                url=f'{REPO}/blob/{SHA}/{path}#L{first}-L{last}', purpose=purpose)

adjudications = json.loads((OUT / 'adjudications.json').read_text())
initial = json.loads((OUT / 'candidates.json').read_text())
additional = json.loads((OUT / 'additional_findings.json').read_text())
proofs = json.loads((OUT / 'proofs.json').read_text())
assert proofs['source_head'] == SHA
probe_by_id = {x['id']: x for x in proofs['probes']}
vendor_proofs = json.loads((OUT / 'vendor/proofs.json').read_text())
assert vendor_proofs['head_sha'] == SHA
vendor_probe_by_id = {x['id']: x for x in vendor_proofs['probes']}
frontend_proofs = json.loads((OUT / 'final-frontend-proofs.json').read_text())
assert frontend_proofs['head_sha'] == SHA
frontend_probe_by_id = {x['id']: x for x in frontend_proofs['probes']}
external_probe_artifacts = {'vendor/proofs.json': vendor_probe_by_id, 'final-frontend-proofs.json': frontend_probe_by_id}
authored_probe_count = len(probe_by_id) + len(frontend_probe_by_id)
vendor_coverage = json.loads((OUT / 'vendor/coverage.json').read_text())
assert vendor_coverage['head_sha'] == SHA and vendor_coverage['body_count'] == 208
assert all(f['review_status'] == 'SEMANTIC_BODY_READ' for f in vendor_coverage['functions'])
test_review = json.loads((OUT / 'test-review.json').read_text())
assert test_review['source_head'] == SHA
assert test_review['status'] == 'COMPLETE_FINITE_TEST_READING'
assert test_review['counts'] == {'assigned_files':73,'assigned_lines':18496,'full_body_read':73,'adjudicated':73,'pending':0,'tests_executed':0}
test_paths = {r['path'] for r in test_review['files']}
assert len(test_paths) == 73 and all(r['review_status'] == 'ADJUDICATED_BODY_READ' for r in test_review['files'])
shell_review = json.loads((OUT / 'shell-review.json').read_text())
assert shell_review['source_head'] == SHA and shell_review['status'] == 'COMPLETE_FINITE_SHELL_READING'
assert shell_review['counts']['adjudicated'] == 13 and shell_review['counts']['assigned_lines'] == 3608
shell_paths = {r['path'] for r in shell_review['files']}
review_status = 'COMPLETE_ASSIGNED_RECUTS_WITH_LIMITS'

extra_evidence = {
    'R2-MOD-009': [('src/hooks/integrations/useExternalCatalog.ts',248,285,'filters internos determinam queryKey e só mudam no fetchProducts'), ('src/components/catalog/ExternalProductManagement.tsx',520,533,'efeito de filtros não depende de page e efeito de page ignora zero'), ('src/components/catalog/ExternalProductManagement.tsx',1056,1064,'paginacao chama setPage(p-1)')],
    'R2-MOD-025': [
        ('supabase/migrations/20261002551230_talkx_limits_ritmo.sql',324,340,'RPC de save vigente extrai audience_filters'),
        ('supabase/migrations/20261002551230_talkx_limits_ritmo.sql',509,525,'RPC vigente atualiza audience_filters do draft existente'),
        ('supabase/migrations/20261002421230_talkx_audience_snapshot.sql',420,456,'origem segmento excluída; manual entrega seleção ao motor'),
        ('supabase/migrations/20261002421230_talkx_audience_snapshot.sql',465,482,'substituição transacional de todos os recipients e contador'),
        ('supabase/migrations/20261002391230_talkx_audience_rpc.sql',97,101,'motor limita ao array de contact_ids recebido'),
    ],
    'R2-MOD-027': [
        ('src/components/talkx/TalkXView.tsx',136,140,'backToList desmonta o wizard'),
        ('src/components/talkx/TalkXView.tsx',218,230,'onClose é backToList'),
        ('src/components/talkx/__tests__/TalkXView.route.test.tsx',23,28,'teste substitui wizard por stub sem save'),
        ('src/components/talkx/__tests__/TalkXView.route.test.tsx',95,114,'asserts de navegação não exercitam autosave real'),
    ],
}

def normalize(base, details):
    fid = base['id']
    current = {**base, **details}
    raw_evidence = base['evidence']
    ev = []
    for item in raw_evidence:
        if isinstance(item, list):
            ev.append(evidence(*item))
        else:
            span = item.get('lines') or [item['line_start'], item['line_end']]
            ev.append(evidence(item['path'], span[0], span[1], item.get('purpose','')))
    ev.extend(evidence(*item) for item in extra_evidence.get(fid, []))
    initial_relation = base.get('prior_relation', {})
    initial_ids = initial_relation.get('ids', []) if isinstance(initial_relation, dict) else []
    related = current.get('prior_ids', initial_ids)
    assert all(pid in prior_ids for pid in related), (fid, related)
    relation = current.get('prior_relation', 'NEW_DISCOVERY')
    if not isinstance(relation, str): relation = 'NEW_DISCOVERY'
    confirmed = current.get('status') != 'DEFERRED_DEPENDENCY_CONTRACT'
    external_probes = current.get('external_probes', [])
    for probe in external_probes:
        assert probe['artifact'] in external_probe_artifacts and probe['probe_id'] in external_probe_artifacts[probe['artifact']]
        assert (OUT / probe['script']).is_file()
    finding_probes = ([{'artifact': 'proofs.json', 'probe_id': fid, 'script': 'offline_probes.cjs'}] if fid in probe_by_id else []) + external_probes
    classification = 'CONFIRMED_STATIC_CONTRACT'
    if fid in probe_by_id: classification = 'CONFIRMED_ISOLATED_CALLBACK'
    if external_probes: classification = 'CONFIRMED_ISOLATED_VENDOR_FRAGMENT' if current.get('code_origin') == 'third_party_vendored' else 'CONFIRMED_ISOLATED_CALLBACK'
    return {
        'id': fid,
        'severity': current['severity'],
        'title': current['title'],
        'status': 'confirmed' if confirmed else 'deferred',
        'classification': classification if confirmed else 'DEFERRED_DEPENDENCY_CONTRACT',
        'code_origin': current.get('code_origin', 'application_authored'),
        'baseline_sha': SHA,
        'preconditions': current['preconditions'],
        'cause': current['cause'],
        'observed_behavior': current['observed_behavior'],
        'impact': current['impact'],
        'evidence': ev,
        'probes': finding_probes,
        'runtime_observed': False,
        'offline_probe_observed': bool(finding_probes),
        'recommendation': current['recommendation'],
        'acceptance': current['acceptance'],
        'limitations': ['Fonte revisada estaticamente; nenhum navegador, banco ou provedor de produção foi executado.'] + current.get('limitations', []),
        'feature_catalog_ids': [],
        'relation_to_prior_audit': relation,
        'prior_finding_ids': related,
        'novelty_note': current.get('prior_note', 'Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.'),
    }

all_records = [normalize(f, adjudications[f['id']]) for f in initial]
all_records.extend(normalize(f, f) for f in additional)
all_records.sort(key=lambda f: f['id'])
assert len({f['id'] for f in all_records}) == len(all_records)
confirmed = [f for f in all_records if f['status'] == 'confirmed']
deferred = [f for f in all_records if f['status'] == 'deferred']

rejected = [
    {
        'hypothesis': 'University aplica resposta à conversa seguinte no fluxo atual',
        'adjudication': 'LIMITED_NOT_CONFIRMED',
        'reason': 'RealtimeInboxView dá key da conversa ao ChatPanel. Mantido apenas R2-MOD-012, corrida do período no mesmo componente.',
        'evidence': [evidence('src/components/inbox/RealtimeInboxView.tsx',298,305,'identidade do ChatPanel')],
    },
    {
        'hypothesis': 'Discador persiste anotação/chamada no contato antigo após alterar número',
        'adjudication': 'LIMITED_NOT_CONFIRMED',
        'reason': 'O provider consome phone e useSipClient resolve por esse telefone. R2-MOD-016 limita-se ao chip incorreto.',
        'evidence': [evidence('src/providers/CallSessionProvider.tsx',338,375,'destino efetivo'), evidence('src/hooks/communication/useSipClient.ts',43,56,'resolução pelo telefone')],
    },
    {
        'hypothesis': 'NPS com limit 500 é descoberta nova',
        'adjudication': 'DUPLICATE_CONFIRMED',
        'prior_finding_ids': ['DASH-METRICS-001'],
        'reason': 'A limitação permanece, mas está explicitamente registrada na auditoria anterior; não recebe outro ID novo.',
        'evidence': [evidence('src/hooks/business/useNPSSurveys.ts',39,59,'consulta limitada e erro'), evidence('src/hooks/business/useNPSSurveys.ts',97,110,'totais derivados da amostra')],
    },
    {
        'hypothesis': 'Exportação automática aparece pronta sem integração',
        'adjudication': 'REJECTED_UI_EXPLICITLY_UNAVAILABLE',
        'reason': 'AutoExportManager informa explicitamente indisponibilidade por política. Esse estado honesto não é contado como funcionalidade quebrada ocultamente.',
        'evidence': [evidence('src/components/reports/AutoExportManager.tsx',1,32,'estado indisponível explícito')],
    },
    {
        'hypothesis': 'Links de pagamento anunciam checkout integrado disponível',
        'adjudication': 'LIMITED_UI_EXPLICITLY_UNAVAILABLE',
        'reason': 'PaymentLinksView contém aviso de checkout indisponível. Não se interpreta o cadastro/local URL como prova de integração de pagamento.',
        'evidence': [evidence('src/components/payments/PaymentLinksView.tsx',100,118,'aviso de checkout não integrado')],
    },
    {
        'hypothesis': 'Editor possui ação de investimento/ROI pós-envio ligada à RPC',
        'adjudication': 'NO_CONSUMER_FOUND',
        'reason': 'Busca global em src por talkx_set_campaign_investment/investment/investimento e leitura das telas Talk X não localizaram consumidor. O agente de banco avalia apenas o contrato RPC/trigger.',
        'evidence': [],
    },
    {
        'hypothesis': 'Supressão removida/expirada continua bloqueando entrega por causa da UI',
        'adjudication': 'NOT_INFERRED_FROM_UI',
        'reason': 'As falhas de representação/busca da UI não provam quebra da decisão no motor. O agente de banco confirmou critérios removed_at/expires_at no motor vigente.',
        'evidence': [],
    },
]


rejected.append({
    'hypothesis': 'Atalhos X/Delete de Tasks disparam duas vezes por handler local e global',
    'adjudication': 'REJECTED_GLOBAL_CAPTURE_STOPS_PROPAGATION',
    'reason': 'O handler global instala listener em window na fase capture e chama preventDefault/stopPropagation antes da action. Com binding padrão e escopo Tasks, o evento não chega ao handler do card; fora do escopo/binding, só o handler local aplica. Não foi comprovado duplo disparo.',
    'evidence': [evidence('src/hooks/ui/useGlobalKeyboardShortcuts.ts',97,143,'guardas, stopPropagation e capture'), evidence('src/hooks/shortcuts/defaultShortcuts.ts',49,55,'bindings Tasks'), evidence('src/components/tasks/shared/WorkItemCard.tsx',61,68,'handler local'), evidence('src/components/tasks/TasksModule.tsx',203,223,'evento de domínio')],
})

observations = json.loads((OUT / 'second_pass_observations_input.json').read_text())
for observation in observations:
    assert all(pid in prior_ids for pid in observation['prior_finding_ids']), observation['id']
    observation['evidence'] = [evidence(*item) for item in observation['evidence']]
    observation['head_sha'] = SHA
    observation['runtime_observed'] = False
(OUT / 'second-pass-observations.json').write_text(json.dumps({
    'head_sha': SHA, 'reviewer': '/root/grill_me_primary_review',
    'counting_rule': 'Observações, limites e extensões sem novos IDs de finding. Não somar às contagens de findings.json.',
    'observations': observations,
}, ensure_ascii=False, indent=2) + '\n')

json_data = {
    'schema_version': '2.0', 'head_sha': SHA,
    'reviewer': '/root/grill_me_primary_review',
    'status': review_status,
    'source_integrity_reference': '../../source-integrity.json',
    'scope': 'Módulos complementares frontend: automações, campaigns, catálogo, telefonia, Multiplix, Talk X, relatórios, Agenda, NPS/CSAT, War Room, carteira/pagamentos e ferramentas de IA selecionadas. Recorte adicional de 40 helpers em src/lib e src/utils, incluindo monitor cliente de atualização. Codec vendorizado e dez auxiliares Dashboard/transcrições/Meta lidos integralmente; roster final de 73 testes lido integralmente e adjudicado, sem execução de suítes.',
    'excluded_owner_scopes': ['Inbox principal/Composer/arquivos/mídia', 'Team Chat de produção; quatro arquivos de testes foram incorporados pelo roster final', 'Auth/usuários/contatos', 'SQL e hooks SLA globais', 'backend/provedores', 'migrations/SQL fora dos contratos cruzados', 'infra/deploy fora dos helpers cliente explicitamente lidos'],
    'counts': dict(confirmed=len(confirmed), deferred=len(deferred), isolated_callback_probes=authored_probe_count, primary_probes=len(probe_by_id), final_frontend_probes=len(frontend_probe_by_id), vendor_probes=len(vendor_probe_by_id), findings_with_offline_probe=sum(f['offline_probe_observed'] for f in confirmed), code_origin=dict(collections.Counter(f['code_origin'] for f in confirmed)), severity=dict(collections.Counter(f['severity'] for f in confirmed)), prior_relation=dict(collections.Counter(f['relation_to_prior_audit'] for f in confirmed))),
    'findings': confirmed,
    'deferred_candidates': deferred,
    'rejected_or_limited': rejected,
    'proof_semantics': f'{authored_probe_count} probes autorais executam trechos/callbacks originais em memória com mocks e driver mínimo de hooks ({len(probe_by_id)} principais e {len(frontend_probe_by_id)} do recorte final). Mais {len(vendor_probe_by_id)} probes do fornecedor: dois fragmentos numéricos sustentam um achado e um smoke test emite bytes pela API pública. Não são E2E, React renderer, banco ou prova de incidente em produção; o MP3 não foi decodificado/ouvido.',
    'third_party_vendor_review': 'vendor/report.md',
    'additional_review_observations': 'second-pass-observations.json',
    'final_test_review': {'artifact':'test-review.json','report':'test-review.md',**test_review['counts']},
}
(OUT / 'findings.json').write_text(json.dumps(json_data, ensure_ascii=False, indent=2) + '\n')

# Consolidate ranges. All previously truncated ranges marked semantic have been
# reread in subsequent journal entries. Partial files stay targeted.
journal = [json.loads(line) for line in (OUT / 'read-journal.jsonl').read_text().splitlines()]
reads = collections.defaultdict(list)
for row in journal:
    assert row['blob_sha'] == pinned[row['path']], row['path']
    reads[row['path']].append(row)

def merge_ranges(ranges):
    result = []
    for start, end in sorted(ranges):
        if result and start <= result[-1][1] + 1:
            result[-1][1] = max(result[-1][1], end)
        else: result.append([start, end])
    return result

def gaps(total, ranges):
    result = []; position = 1
    for first, last in ranges:
        if position < first: result.append([position, first-1])
        position = last + 1
    if position <= total: result.append([position, total])
    return result

component_scopes = ('automations/', 'automation/', 'chatbot/', 'campaigns/', 'catalog/', 'calls/', 'csat/', 'dashboard/', 'multiplix/', 'nps/', 'payments/', 'reports/', 'schedule/', 'talkx/', 'voice/', 'wallet/', 'inbox/ai-tools/', 'settings/media-library/', 'tasks/')
added_scopes = ('src/components/tasks/', 'src/hooks/tasks/', 'src/features/talk-me/', 'src/components/chatbot/', 'src/hooks/analytics/', 'src/lib/', 'src/utils/', 'public/vendor/', 'src/components/transcriptions/', 'src/components/meta-capi/', 'src/hooks/business/useWarRoomAlerts.ts', 'src/hooks/business/useDemandPrediction.ts', 'src/components/team-chat/__tests__/', 'src/hooks/team-chat/__tests__/', 'tests/contracts/', 'scripts/db-audit/')
def in_inventory(path):
    if path.startswith('src/components/'):
        return path[len('src/components/'):].startswith(component_scopes)
    if path.startswith(('src/hooks/calls/', 'src/hooks/payments/', 'src/hooks/dashboard/', 'src/hooks/analytics/', 'src/hooks/tasks/', 'src/features/talk-me/')): return True
    if path.startswith('src/hooks/integrations/') and re.search(r'(TalkX|Multiplix|Catalog|SendProduct|ExternalCatalog|Chatbot|Automation)', path): return True
    return path in reads

inventory = sorted({p for p in pinned if in_inventory(p) and p.endswith(('.ts','.tsx','.js','.jsx','.css'))} | set(reads))
coverage = []
for path in inventory:
    blob, lines = file_meta(path)
    entries = reads.get(path, [])
    assert all(1 <= e['line_start'] <= e['line_end'] <= len(lines) for e in entries), path
    ranges = merge_ranges([[e['line_start'], e['line_end']] for e in entries])
    missing = gaps(len(lines), ranges)
    level = 'semantic' if ranges and not missing else 'targeted' if ranges else 'structural'
    # Record actual declaration lines contained in visible/read ranges. Regex is
    # an index, never used as evidence of complete call-graph understanding.
    declarations = []
    for number, line in enumerate(lines, 1):
        if any(a <= number <= b for a,b in ranges) and re.match(r'\s*(?:export\s+)?(?:async\s+)?(?:function|const|class)\s+[A-Za-z_$]', line):
            if len(declarations) < 45:
                declarations.append({'line': number, 'declaration': line.strip()[:180]})
    associated = [f['id'] for f in confirmed if any(e['path'] == path for e in f['evidence'])]
    row = {
        'path': path, 'git_blob_sha': blob, 'review_level': level,
        'code_origin': 'third_party_vendored' if path.startswith('public/vendor/') else 'application_authored',
        'detailed_body_coverage': 'vendor/coverage.json' if path == vendor_coverage['source_path'] else None,
        'test_adjudication': 'shell-review.json' if path in shell_paths else 'test-review.json' if path in test_paths else None,
        'total_lines': len(lines), 'ranges_read': ranges,
        'added_after_initial_inventory': path.startswith(added_scopes),
        'inventory_addition_reason': 'Diretório incorporado explicitamente ao inventário finito na segunda passagem. Dependências individuais podiam ter leitura anterior; a inclusão não supõe revisão implícita de outros arquivos.' if path.startswith(added_scopes) else None,
        'lines_read': sum(b-a+1 for a,b in ranges),
        'symbols_or_ranges_read': declarations,
        'review_purposes': list(dict.fromkeys(e['symbols_or_purpose'] for e in entries)),
        'remaining_unread_ranges': missing,
        'remaining_gaps': ('Nenhuma leitura semântica nesta rodada; arquivo apenas inventariado por caminho/hash.' if not ranges else 'Trechos fora das faixas acima não foram revisados semanticamente.' if missing else 'Leitura semântica não certifica execução do navegador, RLS, integração externa ou todos os casos de uso.'),
        'findings': associated,
        'prior_findings_with_same_evidence_path': sorted(set(prior_paths[path])),
        'prior_review_limit': 'Ausência do caminho em FINDINGS anterior não prova que o arquivo nunca foi lido; o registro de 104 achados não é um mapa completo de cobertura.',
    }
    coverage.append(row)

counts = collections.Counter(r['review_level'] for r in coverage)
closed_directories = []
for directory in ('src/components/talkx/', 'src/hooks/analytics/', 'src/components/dashboard/'):
    expected_paths = sorted(p for p in pinned if p.startswith(directory))
    selected = [r for r in coverage if r['path'] in expected_paths]
    assert len(selected) == len(expected_paths), directory
    assert all(r['review_level'] == 'semantic' for r in selected), directory
    closed_directories.append({
        'directory': directory, 'status': 'SOURCE_BODIES_AND_TESTS_READ',
        'files': len(selected), 'test_files': sum('/__tests__/' in r['path'] or '.test.' in r['path'] for r in selected),
        'lines': sum(r['total_lines'] for r in selected), 'remaining_unread_ranges': [],
        'limit': 'Leitura dos corpos e dos testes; a suíte não foi executada e os contratos externos permanecem sujeitos aos limites de prova.',
    })
closed_production_directories = []
for directory in ('src/components/catalog/', 'src/components/tasks/', 'src/hooks/tasks/', 'src/components/chatbot/', 'src/components/automations/', 'src/components/reports/', 'src/components/voice/'):
    expected_paths = sorted(p for p in pinned if p.startswith(directory) and p.endswith(('.ts', '.tsx', '.js', '.jsx')) and '/__tests__/' not in p and '.test.' not in p)
    selected = [r for r in coverage if r['path'] in expected_paths]
    assert len(selected) == len(expected_paths) and all(r['review_level'] == 'semantic' for r in selected), directory
    closed_production_directories.append({
        'directory': directory, 'status': 'PRODUCTION_SOURCE_BODIES_READ', 'files': len(selected),
        'lines': sum(r['total_lines'] for r in selected), 'remaining_production_unread_ranges': [],
        'test_limit': 'Testes continuam classificados individualmente; este fechamento não inclui todos os testes do diretório.',
    })
lib_utils_scope = json.loads((OUT / 'lib-utils-scope.json').read_text())
lib_utils_selected = [r for r in coverage if r['path'] in lib_utils_scope['paths']]
assert len(lib_utils_selected) == lib_utils_scope['assigned_files']
assert all(r['review_level'] == 'semantic' for r in lib_utils_selected)
lib_utils_closed = {
    'status': 'FINITE_AUTHORED_HELPER_RECUT_READ', 'scope_manifest': 'lib-utils-scope.json',
    'files': len(lib_utils_selected), 'lines': sum(r['total_lines'] for r in lib_utils_selected),
    'remaining_unread_ranges': [],
    'limit': 'Somente os 40 caminhos atribuídos pela matriz global. Não inclui todos os testes, outros helpers ou o código terceiro de public/vendor.',
}
frontend_scope = json.loads((OUT / 'final-frontend-scope.json').read_text())
frontend_selected = [r for r in coverage if r['path'] in frontend_scope['paths']]
assert len(frontend_selected) == 10 and all(r['review_level'] == 'semantic' for r in frontend_selected)
assert sum(r['total_lines'] for r in frontend_selected) == frontend_scope['assigned_lines']
covdoc = {
    'schema_version':'2.0', 'head_sha':SHA, 'reviewer':'/root/grill_me_primary_review',
    'status':review_status,
    'level_definitions': {
        'semantic':'Arquivo lido integralmente e contratos relevantes examinados; não significa cobertura funcional integral nem runtime aprovado.',
        'targeted':'Somente faixas e símbolos listados foram lidos/examinados; lacunas de linha permanecem explícitas.',
        'structural':'Somente caminho/hash no inventário de escopo. Não houve leitura semântica do arquivo nesta rodada.'
    },
    'scope_inventory_basis':'Caminhos versionados do manifesto de integridade para diretórios dos módulos e dependências efetivamente lidas. TalkX, analytics e dashboard foram fechados incluindo os testes. A produção de catálogo, Tasks, Chatbot, automações, relatórios e voz também foi lida integralmente; os testes desses outros diretórios mantêm seus níveis individuais. Os 40 helpers de src/lib e src/utils atribuídos pela matriz global foram lidos integralmente, com exclusões registradas no manifesto do recorte. O codec vendorizado foi lido integralmente via cópia AST: 208 corpos/307 linhas originais, separados do código autoral. O saldo individual de arquivos estruturais continua explícito, sem representar a união de outros revisores.',
    'counts': dict(inventoried_files=len(coverage), semantic=counts['semantic'], targeted=counts['targeted'], structural=counts['structural'], read_files=counts['semantic']+counts['targeted'], read_lines=sum(r['lines_read'] for r in coverage)),
    'coverage':coverage,
    'closed_finite_directories': closed_directories,
    'closed_production_directories': closed_production_directories,
    'closed_authored_helper_recut': lib_utils_closed,
    'closed_vendor_recut': {'status': vendor_coverage['status'], 'path': vendor_coverage['source_path'], 'code_origin': 'third_party_vendored', 'source_lines': 307, 'formatted_lines': 4683, 'bodies_read': 208, 'details': 'vendor/coverage.json', 'report': 'vendor/report.md'},
    'closed_final_frontend_recut': {'status': 'FINITE_PRODUCTION_RECUT_BODIES_READ', 'scope_manifest': 'final-frontend-scope.json', 'files': 10, 'lines': 1055, 'remaining_unread_ranges': [], 'test_limit': 'Roster posterior de 73 testes fechado separadamente em test-review.json; nenhuma suíte executada.'},
    'closed_test_recut': {'status': test_review['status'], 'allocation_roster':'test-review-roster.json', 'adjudication':'test-review.json', 'report':'test-review.md', **test_review['counts']},
    'closed_shell_recut': {'status':shell_review['status'], 'allocation_roster':'shell-review-roster.json', 'adjudication':'shell-review.json', 'report':'shell-review.md', **shell_review['counts'], 'additional_dependency_lines':85},
    'cross_agent_boundaries': [
        'Inbox confirmou que seu achado de ScheduleMessageDialog é distinto da leitura da Agenda (R2-MOD-029).',
        'Providers mantém contratos ElevenLabs; R2-MOD-040 cobre somente desfecho do diálogo.',
        'Database confirmou definições vigentes de snapshot/manual e saveDraft para R2-MOD-025.',
        'Root cobre filas/SLA, cache offline, service worker, navegação global e reconciliação dos planos.',
        'Segunda passagem: Tasks e TalkMe UI foram incorporados ao escopo deste revisor; Database cobre funções TalkMe, e root cobre kernel src/lib/calls e hooks/communication.'
    ],
    'unexecuted': ['Navegador e renderização React real','Supabase/RLS/banco remoto','Envio a WhatsApp/telefonia/ElevenLabs','Suíte do projeto e gates de CI','Performance real e acessibilidade visual'],
}
(OUT / 'coverage.json').write_text(json.dumps(covdoc, ensure_ascii=False, indent=2) + '\n')

def link(e):
    return f"[{e['path']}:{e['line_start']}–{e['line_end']}]({e['url']})"

report = [
    '# Reauditoria de módulos complementares — rodada 2',
    '',
    f'**Fonte fixa:** `{SHA}`. **Resultado:** {len(confirmed)} achados confirmados por contrato estático, dos quais {authored_probe_count} também reproduzidos por callbacks/transformações isolados e um por dois fragmentos do fornecedor; {len(deferred)} candidato adiado. Um achado pertence ao codec vendorizado e os demais ao código da aplicação. Nenhum desses números representa incidente observado em produção.',
    '',
    'A fonte permaneceu intocada. Foram executados somente probes locais com dados sintéticos, mocks, trechos de código copiados em memória e a API do codec em VM isolada. A confirmação das definições SQL vencedoras foi cruzada com o agente de banco. Não houve banco, envio, ligação, acesso a segredos ou alteração de aplicação.',
    '',
    '## Resultado e prioridades',
    '',
    'Os riscos de maior impacto concentram-se em perda ou troca de dados: edição de automações reutiliza o draft de outro registro e descarta configurações; notas de chamadas podem ser salvas em outro ID; o catálogo classifica uma falha integral como parcial/sucesso; respostas tardias de variantes podem atingir outro template; e reabrir um draft Talk X de audiência manual grande pode acionar autosave com apenas a primeira página de destinatários.',
    '',
    'A passagem final de Talk X examinou os consumidores de Overview, Analytics, LiveMonitor, Running, Scheduled, Segmentos e Supressão, além dos hooks centrais e do editor. Ela revelou divergências entre dados e rótulos, ausência de recuperação de erro, objetos selecionados obsoletos e transições assíncronas. A Agenda tem um problema de completude distinto do agendamento pelo Composer. O limite NPS já documentado foi confirmado como duplicata, sem aumentar a contagem de achados novos.',
    '',
    '| Severidade | Quantidade |', '|---|---:|',
]
for severity, number in sorted(collections.Counter(f['severity'] for f in confirmed).items()): report.append(f'| {severity} | {number} |')
report += ['', '| Relação com auditoria anterior | Quantidade |', '|---|---:|']
for relation, number in sorted(collections.Counter(f['relation_to_prior_audit'] for f in confirmed).items()): report.append(f'| {relation} | {number} |')
report += [
    '',
    '“Nova descoberta” significa causa/efeito não identificado nos 104 achados usados na comparação. Não significa código novo, regressão recente ou prova de que o auditor anterior jamais leu o arquivo. Extensões preservam o ID anterior e acrescentam um consumidor, precondição ou efeito que não estava explicitado.',
    '',
    '## Cobertura e limites',
    '',
    f'O inventário delimitado contém {len(coverage)} arquivos: {counts["semantic"]} com leitura integral, {counts["targeted"]} com leitura dirigida e {counts["structural"]} somente inventariados. Foram lidas {sum(r["lines_read"] for r in coverage)} linhas únicas em {counts["semantic"]+counts["targeted"]} arquivos. Cada caminho, blob SHA, faixa e lacuna está em `coverage.json`. A categoria structural significa apenas inventário, sem revisão semântica.',
    '',
    'Os diretórios src/components/talkx, src/hooks/analytics e src/components/dashboard foram lidos integralmente, incluindo seus testes: 165 arquivos e 24.311 linhas. A produção de catálogo, Tasks, Chatbot, automações, relatórios e voz também foi lida integralmente; os testes desses diretórios mantêm seus níveis individuais. O recorte adicional de 40 helpers em src/lib e src/utils também foi lido integralmente: 2.888 linhas, caminhos e exclusões em lib-utils-scope.json. O codec vendorizado possui 208 corpos lidos em cópia AST de 4.683 linhas, correspondentes a 307 linhas originais; detalhes em vendor/report.md e vendor/coverage.json. Essa leitura não certifica fidelidade ou conformidade MP3. Arquivos marcados structural ainda possuem somente inventário neste relatório; a união dos revisores é consolidada por root. Não é declarada cobertura integral do frontend nem execução de suas integrações.',
    '',
    'O último recorte de produção contém dez auxiliares de Dashboard, transcrições, Meta CAPI e tipos TalkMe: 1.055 linhas lidas, com manifesto em final-frontend-scope.json. O roster final de 73 arquivos de testes (18.496 linhas) foi lido integralmente e adjudicado por arquivo em test-review.json e test-review.md. Cada adjudicação exige faixas completas do diário e confere SHA-256/git blob do arquivo; o roster preserva somente a fotografia de atribuição. Nenhuma suíte foi executada.',
    '',
    '### Arquivos parcialmente lidos',
    '',
    '| Caminho | Faixas sem leitura semântica |', '|---|---|',
]
for row in coverage:
    if row['review_level'] == 'targeted':
        report.append(f"| `{row['path']}` | " + ', '.join(f'{a}–{b}' for a,b in row['remaining_unread_ranges']) + ' |')
report += [
    '',
    '## Provas isoladas e qualidade dos testes',
    '',
    '`offline_probes.cjs` transpila trechos originais com TypeScript já disponível no workspace. Para os casos de estado, usa um driver mínimo e determinístico de hooks. O resultado está em `proofs.json`; não se alegam testes do React real ou do navegador. A simulação de resposta de criação perdida é explicitamente uma precondição artificial do caso Multiplix.',
    '',
    '| Achado | Resultado observado no probe |', '|---|---|',
]
for p in proofs['probes']:
    report.append(f"| {p['id']} | `{json.dumps(p['result'], ensure_ascii=False, separators=(',', ':'))}` |")
report += [
    '',
    'O fornecedor tem três provas separadas em `vendor/proofs.json`: VENDOR-P01/P02 reproduzem a indexação fracionária registrada em MOD073; VENDOR-P03 apenas confirma bytes não vazios e término do flush em silêncio/seno curtos. Um smoke test de emissão não valida a qualidade do MP3. Os três casos não são contados como três novos achados nem incluídos nas provas autorais.',
    '',
    'O recorte final tem três provas em `final-frontend-proofs.json`: monitor de SLA em três ciclos limitados com página de 50/60 violações; bucket SQL de São Paulo comparado ao calendário UTC com stubs explícitos de date-fns; e tendência calculada contra o ponto de quatro horas atrás. São contratos isolados, não execução de SQL, React ou navegador.',
    '',
    'A adjudicação final dos 73 testes distingue componentes/hooks reais, funções puras de produção, contratos por regex de fonte e exemplos locais sem chamada à implementação. CT67 executa axe com controle negativo no próprio teste; os arquivos axe-campaigns/axe-talkx são contratos de fonte sem axe runtime. Os dois grandes testes Team Chat foram incluídos por atribuição explícita do root: comprehensive usa constantes/exemplos locais, enquanto exhaustive lê fonte com regex e casos todo. Estas diferenças alimentam a família GOV003/TC011 consolidada pelo root e não geram um achado por arquivo.',
    '',
    'Alguns testes existentes cobrem contratos menores do que o comportamento que poderiam sugerir: useMyCalls verifica clamp com fixture incompatível com offset vazio; a navegação TalkXView substitui o wizard por stub; o teste de limites mantém a campanha sempre sending; CSAT verifica dados definidos e loading, sem validar média/total após atualização; agendamentos usam dois registros e não conferem completude. Esses testes continuam úteis para seus objetivos estreitos, mas não encerram os cenários encontrados. A suíte não foi executada nem ampliada nesta revisão.',
    '',
    'O fechamento dos três diretórios registra observações separadas em `second-pass-observations.json`, com evidências imutáveis e sem somá-las como novos achados. Entre elas: TalkX.test contém cópias locais de funções para parte dos testes; os fixtures do editor não exercitam paginação de audiência nem saída antes do debounce; a matriz de estados/filtros comprova os componentes isolados, sem assegurar a adoção pelos consumidores; e o teste de fuso do Dashboard não interage com a opção Personalizada. Os testes que exercitam código real conservam seu valor dentro do escopo descrito.',
    '',
    '## Índice de achados',
    '',
    '| ID | Sev. | Achado | Relação anterior |', '|---|---|---|---|',
]
for f in confirmed:
    report.append(f"| {f['id']} | {f['severity']} | {f['title']} | {', '.join(f['prior_finding_ids']) or 'Novo'} |")
report += ['', '## Achados detalhados', '']
for f in confirmed:
    report += [
        f"### {f['id']} — {f['title']}", '',
        f"**Severidade:** {f['severity']}. **Prova:** {f['classification']}. **Relação:** {f['relation_to_prior_audit']}" + (f" ({', '.join(f['prior_finding_ids'])})" if f['prior_finding_ids'] else '') + '.', '',
        f"**Precondição:** {f['preconditions']}", '',
        f"**Causa:** {f['cause']}", '',
        f"**Cadeia observada:** {f['observed_behavior']}", '',
        f"**Efeito:** {f['impact']}", '',
        f"**Correção recomendada:** {f['recommendation']}", '',
        '**Aceite:**', '',
    ]
    report += ['- '+a for a in f['acceptance']]
    report += ['', '**Evidência:**', '']
    report += [f"- {link(e)} — blob `{e['git_blob_sha']}`" + (f"; {e['purpose']}" if e['purpose'] else '') + '.' for e in f['evidence']]
    report += ['', f"**Comparação anterior:** {f['novelty_note']}", '']
    if len(f['limitations']) > 1:
        report += ['**Limites específicos:**', ''] + ['- '+l for l in f['limitations'][1:]] + ['']
    if f['probes']:
        report += ['**Probes:** ' + '; '.join(f"`{p['artifact']}` / `{p['probe_id']}` (código `{p['script']}`)" for p in f['probes']) + '.', '']

report += ['## Hipóteses adiadas, limitadas e duplicadas', '']
for f in deferred:
    report += [f"### {f['id']} — {f['title']}", '', f"**Estado:** {f['classification']}. {f['observed_behavior']}", '', f"**Limite:** {f['impact']}", '', '**Evidência:**', '']
    report += ['- '+link(e)+f" — blob `{e['git_blob_sha']}`." for e in f['evidence']]
    report += ['']
for r in rejected:
    report += [f"### {r['hypothesis']}", '', f"**{r['adjudication']}:** {r['reason']}", '']
    report += ['- '+link(e) for e in r['evidence']]
    if r['evidence']: report += ['']
report += ['## Observações da segunda passagem', '', 'Estas observações não são somadas à contagem de achados. Preservam consumidores adicionais, limites específicos dos testes e a relação com famílias já registradas.', '']
for observation in observations:
    report += [f"### {observation['id']} — {observation['title']}", '', f"**Classificação:** {observation['classification']}.", '', observation['observation'], '']
    related = observation['prior_finding_ids'] + observation['related_finding_ids']
    if related: report += ['**Referências de relação:** ' + ', '.join(related) + '.', '']
    report += ['- '+link(e)+f" — blob `{e['git_blob_sha']}`." for e in observation['evidence']]
    report += ['']
report += [
    '## Artefatos e reprodução', '',
    '- `findings.json`: achados, hipóteses adiadas, relação anterior, precondições, critérios e evidências imutáveis.',
    '- `coverage.json`: inventário delimitado, nível de leitura, declarações/faixas realmente lidas e lacunas.',
    '- `second-pass-observations.json`: limites concretos dos testes e extensões de famílias já registradas, sem aumentar a contagem.',
    f'- `proofs.json` e `offline_probes.cjs`: {len(probe_by_id)} provas isoladas e respectivas limitações.',
    '- `final-frontend-proofs.json` e `final_frontend_probes.cjs`: três provas isoladas do último recorte de produção.',
    '- `vendor/report.md`, `vendor/coverage.json`, `vendor/contracts.json` e `vendor/proofs.json`: revisão separada dos 208 corpos do fornecedor, contrato confirmado, ramos sem consumidor demonstrado e três probes numéricos/de emissão.',
    '- `test-review.json` e `test-review.md`: adjudicação dos 73 testes finais, com controles positivos, mocks, limites e hashes; `build_test_review.py` valida faixas completas sem executar suítes.',
    '- `read-journal.jsonl`: diário bruto de leitura; a cobertura consolidada agrupa as releituras usadas para recuperar saídas truncadas.',
    '- `shell-review.json` / `shell-review.md`: 13 scripts shell e 3.608 linhas lidos integralmente, mais dependência Python de 85 linhas; nenhum script ou SQL executado. Incorporados após o gate adicional de linguagens.',
    '- `database-peer-test-review.json` / `.md`: 52 testes complementares do roster Database, 4.082 linhas; artefato separado para integração do dono e deduplicação do único overlap.',
    '- `candidates.json`, `adjudications.json` e `additional_findings.json`: trilha de candidatos e decisões de classificação.',
    '- `build_reports.py`: montagem e validação de paths/faixas/blobs contra o manifesto fixado.',
    '',
    'Nenhum achado foi corrigido na aplicação nesta tarefa. Aprovar uma correção futura requer executar o cenário de aceite correspondente e os gates relevantes, sem substituir comportamento por marcadores de documentação ou existência de arquivo.',
    '',
]
(OUT / 'report.md').write_text('\n'.join(report))

validation = {
    'head_sha':SHA, 'source_blob_mismatches':[],
    'confirmed_findings':len(confirmed), 'deferred_candidates':len(deferred),
    'evidence_records':sum(len(f['evidence']) for f in all_records),
    'coverage_files':len(coverage), 'read_files':counts['semantic']+counts['targeted'],
    'probe_ids':sorted(probe_by_id),
    'vendor_probe_ids': sorted(vendor_probe_by_id),
    'final_frontend_probe_ids': sorted(frontend_probe_by_id),
    'vendor_bodies_read': 208,
    'final_test_review': {'status':test_review['status'], **test_review['counts']},
    'shell_review': {'status':shell_review['status'], **shell_review['counts'], **shell_review['validation']},
    'all_final_test_sha256_and_git_blob_match_roster': True,
    'all_final_test_full_ranges_and_adjudications_present': True,
    'all_prior_references_exist':True,
    'all_evidence_ranges_valid':True,
    'all_coverage_and_evidence_blobs_match_pin':True,
}
(OUT / 'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({**json_data['counts'], 'coverage':covdoc['counts'], 'validation':'validation.json'},ensure_ascii=False))
