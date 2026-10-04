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
    return {
        'id': fid,
        'severity': current['severity'],
        'title': current['title'],
        'status': 'confirmed' if confirmed else 'deferred',
        'classification': ('CONFIRMED_ISOLATED_CALLBACK' if fid in probe_by_id else 'CONFIRMED_STATIC_CONTRACT') if confirmed else 'DEFERRED_DEPENDENCY_CONTRACT',
        'baseline_sha': SHA,
        'preconditions': current['preconditions'],
        'cause': current['cause'],
        'observed_behavior': current['observed_behavior'],
        'impact': current['impact'],
        'evidence': ev,
        'probes': [{'artifact': 'proofs.json', 'probe_id': fid, 'script': 'offline_probes.cjs'}] if fid in probe_by_id else [],
        'runtime_observed': False,
        'offline_probe_observed': fid in probe_by_id,
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
    'status': 'IN_PROGRESS_REMAINING_MODULES',
    'source_integrity_reference': '../../source-integrity.json',
    'scope': 'Módulos complementares frontend: automações, campaigns, catálogo, telefonia, Multiplix, Talk X, relatórios, Agenda, NPS/CSAT, War Room, carteira/pagamentos e ferramentas de IA selecionadas.',
    'excluded_owner_scopes': ['Inbox principal/Composer/arquivos/mídia', 'Team Chat', 'Auth/usuários/contatos', 'SQL e hooks SLA globais', 'backend/provedores', 'migrations/SQL fora dos contratos cruzados', 'infra/deploy'],
    'counts': dict(confirmed=len(confirmed), deferred=len(deferred), isolated_callback_probes=len(probe_by_id), severity=dict(collections.Counter(f['severity'] for f in confirmed)), prior_relation=dict(collections.Counter(f['relation_to_prior_audit'] for f in confirmed))),
    'findings': confirmed,
    'deferred_candidates': deferred,
    'rejected_or_limited': rejected,
    'proof_semantics': f'{len(probe_by_id)} probes executam trechos/callbacks originais em memória com mocks e driver mínimo de hooks. Não são E2E, React renderer, banco ou prova de incidente em produção.',
    'additional_review_observations': 'second-pass-observations.json',
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
added_scopes = ('src/components/tasks/', 'src/hooks/tasks/', 'src/features/talk-me/', 'src/components/chatbot/', 'src/hooks/analytics/')
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
covdoc = {
    'schema_version':'2.0', 'head_sha':SHA, 'reviewer':'/root/grill_me_primary_review',
    'status':'IN_PROGRESS_REMAINING_MODULES',
    'level_definitions': {
        'semantic':'Arquivo lido integralmente e contratos relevantes examinados; não significa cobertura funcional integral nem runtime aprovado.',
        'targeted':'Somente faixas e símbolos listados foram lidos/examinados; lacunas de linha permanecem explícitas.',
        'structural':'Somente caminho/hash no inventário de escopo. Não houve leitura semântica do arquivo nesta rodada.'
    },
    'scope_inventory_basis':'Caminhos versionados do manifesto de integridade para diretórios dos módulos e dependências efetivamente lidas. TalkX, analytics e dashboard foram fechados como recortes finitos, incluindo os testes. Catálogo, Tasks, Chatbot e automações continuam na passagem de saldos. Filas/SLA globais, outros módulos e cobertura global são consolidados por root.',
    'counts': dict(inventoried_files=len(coverage), semantic=counts['semantic'], targeted=counts['targeted'], structural=counts['structural'], read_files=counts['semantic']+counts['targeted'], read_lines=sum(r['lines_read'] for r in coverage)),
    'coverage':coverage,
    'closed_finite_directories': closed_directories,
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
    f'**Fonte fixa:** `{SHA}`. **Resultado:** {len(confirmed)} achados confirmados por contrato estático, dos quais {len(probe_by_id)} também reproduzidos por callbacks isolados; {len(deferred)} candidato adiado. Nenhum desses números representa incidente observado em produção.',
    '',
    'A fonte permaneceu intocada. Foram executados somente probes locais com dados sintéticos, mocks e trechos de código copiados em memória. A confirmação das definições SQL vencedoras foi cruzada com o agente de banco. Não houve banco, envio, ligação, acesso a segredos ou alteração de aplicação.',
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
    'Os diretórios src/components/talkx, src/hooks/analytics e src/components/dashboard foram lidos integralmente, incluindo seus testes: 165 arquivos e 24.311 linhas. A revisão continua nos saldos de catálogo, Tasks, Chatbot e automações. Bibliotecas e outros arquivos marcados structural ainda possuem somente inventário neste relatório; a união dos revisores é consolidada por root. Não é declarada cobertura integral do frontend nem execução de suas integrações.',
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
        report += [f"**Probe:** `proofs.json`, ID `{f['id']}`; código em `offline_probes.cjs`.", '']

report += ['## Hipóteses adiadas, limitadas e duplicadas', '']
for f in deferred:
    report += [f"### {f['id']} — {f['title']}", '', f"**Estado:** {f['classification']}. {f['observed_behavior']}", '', f"**Limite:** {f['impact']}", '', '**Evidência:**', '']
    report += ['- '+link(e)+f" — blob `{e['git_blob_sha']}`." for e in f['evidence']]
    report += ['']
for r in rejected:
    report += [f"### {r['hypothesis']}", '', f"**{r['adjudication']}:** {r['reason']}", '']
    report += ['- '+link(e) for e in r['evidence']]
    if r['evidence']: report += ['']
report += [
    '## Artefatos e reprodução', '',
    '- `findings.json`: achados, hipóteses adiadas, relação anterior, precondições, critérios e evidências imutáveis.',
    '- `coverage.json`: inventário delimitado, nível de leitura, declarações/faixas realmente lidas e lacunas.',
    '- `second-pass-observations.json`: limites concretos dos testes e extensões de famílias já registradas, sem aumentar a contagem.',
    f'- `proofs.json` e `offline_probes.cjs`: {len(probe_by_id)} provas isoladas e respectivas limitações.',
    '- `read-journal.jsonl`: diário bruto de leitura; a cobertura consolidada agrupa as releituras usadas para recuperar saídas truncadas.',
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
    'all_prior_references_exist':True,
    'all_evidence_ranges_valid':True,
    'all_coverage_and_evidence_blobs_match_pin':True,
}
(OUT / 'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({**json_data['counts'], 'coverage':covdoc['counts'], 'validation':'validation.json'},ensure_ascii=False))
