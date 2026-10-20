"""Documentation-only finite UI merge; preserves the earlier 31 INF records."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re

BASE = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SRC = BASE / 'source'
OUT = BASE / 'reports/infra'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def dump(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def ev(path, first, last, reason):
    assert 1 <= first <= last <= len((SRC/path).read_text().splitlines())
    return dict(path=path, line_start=first, line_end=last, sha256=digest(SRC/path), baseline_sha=HEAD, origin='source', reason=reason)

palette = 'src/components/ui/command-palette.tsx'
host = 'src/components/keyboard/CommandPaletteHost.tsx'
provider = 'src/components/keyboard/GlobalKeyboardProvider.tsx'
common_limit = [
    'Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy.',
    'Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva.',
]

def finding(number, title, severity, description, chain, preconditions, effect, evidence, acceptance, limitations):
    return dict(id=f'R2-INF-{number:03}', title=title, severity=severity, classification='novo', area_extension='finite_ui_effects_performance_batch', baseline_sha=HEAD,
        description=description, consumer_chain=chain, preconditions=preconditions, effect=effect, evidence=evidence, acceptance=acceptance,
        affected_tasks=[], probe_ids=[f'INF-UI-P{number-31:02}'], related_previous_findings=[],
        novelty_basis='Locus e mecanismo adicionais aos104 registros antigos; root confirmou que GOV001 é outra paleta e PLAT008/009 são outros contratos de atalho. Descoberta nova não significa regressão posterior.',
        proof_type='STATIC_AND_BOUNDED_SYNTHETIC_OFFLINE', limitations=common_limit+limitations)

findings = [
    finding(32, 'Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta', 'P2',
        'A paleta dispara um callback com debounce, mas toda resolução grava searchResults sem comparar a consulta ou geração corrente. O debounce só cancela timers ainda pendentes. Depois que A e B iniciaram, B pode terminar primeiro e ser substituída por A. O agrupamento concatena searchResults ao filtro da consulta atual sem refiltrar o resultado remoto.',
        ['App monta GlobalKeyboardProvider', 'Primeira abertura mantém CommandPaletteHost montado', 'Host injeta useCatalogQuickSearch', 'Callback atrasado grava resultados e agrupamento os exibe sob a consulta atual', 'Seleção usa href do produto mostrado'],
        ['Paleta aberta e duas consultas de pelo menos dois caracteres já iniciadas após o debounce.', 'A consulta antiga resolve depois da atual, com conjunto diferente de produtos.'],
        'A entrada pode dizer vermelho e a seção Resultados mostrar produto azul da consulta anterior. O link preserva o ID do resultado antigo e abre o fluxo do catálogo para esse item se selecionado. Não há envio automático de mensagem. Um finally antigo também pode encerrar o indicador enquanto outra busca continua.',
        [ev(palette, 40, 68, 'Filtro local, concatenação de resultados e await sem geração'), ev(palette, 70, 94, 'Mudança de consulta, executor e limpeza sem invalidar requisição em voo'), ev('src/hooks/system/useDebounce.ts', 7, 20, 'Cancela apenas timeout; callback iniciado não é abortado'), ev(host, 16, 27, 'Consumidor injeta busca real do catálogo'), ev('src/hooks/integrations/useCatalogQuickSearch.ts', 9, 31, 'Query no endpoint e retorno de href por produto, sem geração'), ev(provider, 58, 63, 'Host permanece montado após primeira abertura'), ev(provider, 146, 154, 'Montagem da paleta atual'), ev('src/App.tsx', 124, 143, 'Provider atual envolve AppRoutes')],
        ['Invalidar respostas anteriores a cada mudança de consulta, limpeza e fechamento; só a geração atual pode alterar resultados/loading.', 'Preservar debounce e usar cancelamento quando suportado, sem depender dele como única proteção contra resposta já resolvida.', 'Verificar A→B com resolução B→A, erro tardio de A, consulta vazia/curta e fechamento; uma resposta antiga não deve substituir nem apagar B.', 'Exercitar o callback consumidor e a seleção do produto, mantendo o ID associado à consulta atual.'],
        ['Fixture usa dois resultados sintéticos e o debounce real com avanço manual de timers. Não invoca promogifts-catalog nem presume falha de RLS.', 'A prova é a troca de consulta dentro da paleta; não se afirma vazamento entre contas ou envio involuntário.']),
    finding(33, 'Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo', 'P2',
        'Nova conversa, Respostas rápidas e Atalhos de teclado são CommandItems de categoria action sem action nem href. executeCommand só trata callback, href ou id nav- e depois fecha incondicionalmente. O Host injeta itens Talk X e busca, mas não conecta handlers às três entradas padrão.',
        ['App→GlobalKeyboardProvider→CommandPaletteHost', 'Paleta concatena defaultActionCommands', 'Consulta pelo título torna a ação visível', 'Clique ou Enter chama executeCommand', 'Nenhum ramo de execução se aplica; diálogo fecha e consulta é limpa'],
        ['Usuário abre a paleta atual e busca um dos três títulos.', 'Seleciona a entrada padrão habilitada, pelo clique ou pela lista consultada.'],
        'A operação anunciada não começa: não abre conversa, templates nem ajuda de atalhos. O fechamento aparenta ter aceitado o comando. Navegações nav- e itens com action explícita continuam funcionando no controle do probe.',
        [ev('src/components/ui/command-palette-data.tsx', 39, 43, 'Três action-* sem action/href'), ev(palette, 40, 48, 'Itens padrão entram na filtragem'), ev(palette, 72, 78, 'Executor não despacha IDs action-* e fecha'), ev(palette, 168, 186, 'Itens habilitados chamam executor'), ev(host, 16, 27, 'Host não fornece handlers para defaults'), ev(provider, 146, 154, 'Consumer atual montado')],
        ['Conectar cada ação anunciada ao mecanismo real existente, com contexto/permissão necessários, ou removê-la/desabilitá-la com explicação quando não disponível.', 'Selecionar cada entrada deve abrir o fluxo indicado e produzir o efeito observável correspondente.', 'Manter controles para nav-, href, action explícita e disabled; não considerar o simples fechamento como sucesso de execução.'],
        ['Não duplica a paleta antiga src/components/CommandPalette.tsx, governança de tags ou configuração global de atalhos.', 'Nenhuma ação de negócio real foi executada pelo probe.']),
    finding(34, 'Acesso rápido inicial fica fora da navegação por setas e Enter da paleta', 'P3',
        'Com query vazia, groupedCommands é vazio e allItems também. Mesmo assim o JSX mostra cinco destinos de acesso rápido e destaca o índice0. O listener de teclado usa exclusivamente allItems: setas ficam no índice0 e Enter não executa item. A UI anuncia as duas teclas como navegação/seleção.',
        ['Paleta aberta com foco inicial na busca e query vazia', 'JSX renderiza cinco defaults de navegação', 'Teclado consulta allItems vazio', 'Setas/Enter não navegam na lista exibida'],
        ['Paleta aberta, busca ainda vazia e foco no input de pesquisa.', 'Usuário segue as dicas visíveis de setas e Enter.'],
        'O acesso rápido não funciona pelo caminho de teclado anunciado até que haja uma consulta. O clique e a navegação nativa por Tab permanecem alternativas; não se afirma bloqueio de toda operação por teclado.',
        [ev(palette, 50, 62, 'Lista de teclado vazia quando query vazia'), ev(palette, 80, 89, 'Listener usa apenas allItems'), ev(palette, 91, 94, 'Abertura dirige foco para o input'), ev(palette, 115, 119, 'Dicas de setas e Enter'), ev(palette, 143, 155, 'Cinco atalhos visíveis usam outra lista')],
        ['Construir uma coleção de itens visíveis usada pelo destaque, teclado e clique, incluindo acesso rápido quando query vazia.', 'Setas devem percorrer os itens exibidos e Enter deve executar o item destacado a partir do foco na busca.', 'Cobrir estados zero/um/vários resultados e manter comportamento de itens desabilitados; não depender de Tab/click para cumprir as dicas anunciadas.'],
        ['Probe chama apenas agrupamento/lista e handler reais com evento sintético; não simula ativação nativa de botões ou ordem DOM.', 'A falha é distinta das ações sem executor: aqui o destino nav-inbox tem executor, mas não entra na coleção do listener.']),
    finding(35, 'Progress aplica value à barra visual e o descarta antes do Root semântico', 'P3',
        'O wrapper remove value na desestruturação e o usa no transform do Indicator, mas não passa value para ProgressPrimitive.Root. O Root recebe os demais props. A API oficial usa Root.value para fornecer a medida do progresso; nos consumidores lidos nenhum aria-valuenow alternativo compensa a omissão.',
        ['Catálogo monta CatalogBulkSendDialog ou composer monta FileUploader', 'Consumidor passa percentual conhecido para Progress', 'Wrapper move Indicator com esse percentual', 'Root recebe max/aria-label se fornecidos, mas não recebe value'],
        ['Um consumidor monta Progress com value determinado.', 'Consumidor não injeta manualmente o valor semântico por atributo alternativo; os caminhos inspecionados não o fazem.'],
        'O controle deixa de transmitir a medida pelo contrato semântico do Radix, embora a largura visual represente25% ou100%. O probe confirma a prop omitida. Textos percentuais adjacentes continuam existentes nos exemplos; não se afirma ausência total de informação para leitor de tela nem falha de envio.',
        [ev('src/components/ui/progress.tsx', 6, 19, 'value sai dos props de Root e só alimenta transform'), ev('src/components/catalog/CatalogBulkSendDialog.tsx', 213, 228, 'Uso determinado com texto percentual adjacente'), ev('src/components/catalog/ExternalProductCatalog.tsx', 709, 721, 'Montagem real do diálogo em massa'), ev('src/components/inbox/FileUploader.tsx', 178, 185, 'Upload passa value sem alternativa aria-valuenow'), ev('src/components/inbox/FileUploader.tsx', 207, 211, 'Progresso da fila também usa wrapper'), ev('src/components/inbox/chat/ChatInputArea.tsx', 210, 216, 'FileUploader no composer'), ev('package.json', 52, 52, 'Dependência Progress declarada'), ev('bun.lock', 382, 382, 'Versão1.1.16 fixada')],
        ['Encaminhar value ao Root e manter medida visual/semântica coerentes, incluindo zero,100 e indeterminado.', 'Verificar o DOM gerado com a dependência fixada: role e valor/estado acessível devem refletir a medida recebida.', 'Manter texto contextual e nome acessível adequados no consumidor; a correção de props não é prova de aceitação completa por tecnologia assistiva.'],
        ['Documentação primária consultada em04/10/2026. Não foi baixado/importado o pacote Radix1.1.16; duas tentativas de consultar o código GitHub foram bloqueadas pelo provedor de pesquisa.', 'Probe captura o JSX produzido pelo wrapper com tipos inertes; não simula o algoritmo interno do Radix nem relata aria-valuenow observado em browser.', 'P3 delimitado pela existência de textos de progresso adjacentes e ausência de efeito sobre a operação de upload/envio.']),
]
findings[-1]['external_references'] = [dict(url='https://www.radix-ui.com/primitives/docs/components/progress', retrieved_on='2026-10-04', source_kind='primary_documentation', supports='Root.value é a medida no exemplo/API e Progress provê contexto de progresso para tecnologia assistiva; documentação geral não prova a execução da versão fixada.')]

coverage = json.loads((OUT/'ui-performance-coverage.json').read_text())
assert coverage['primary_full_file_read'] == coverage['primary_files'] == 87
assert coverage['primary_lines'] == 10095
probes = json.loads((OUT/'ui-performance-probes.json').read_text())
assert probes['case_count'] == 4
assert probes['finding_ids'] == [f['id'] for f in findings]
task_notes = [
    'P010/56 DONE_VERIFIED certifica remoção de nav-tags; continua preservado e não é reaberto pelos novos defeitos de busca/execução.',
    'P015/E38 do catálogo e P043/E26 são SUPERSEDED; a relação histórica com a paleta não reativa planos substituídos.',
    'P046/X054 PARTIAL trata integração específica de Talk X; este lote não altera esse status nem certifica todos os itens Talk X.',
    'Nenhuma tarefa genérica DONE_VERIFIED foi reaberta por associação temática. Os defeitos atuais têm seu próprio subcontrato executável e aceite.',
]
unpromoted = [
    'OfflineIndicator: HTTP404/500 ainda comprova transporte/conectividade; o rótulo não promete saúde de API e SW/PWA foi deliberadamente desativado. Rejeitado como defeito.',
    'ReactionPicker: falta de preventDefault sozinha não prova duplo evento. Wrapper TeamMessageItem antigo não está no Panel ativo e fechamento é síncrono; sem novo ID.',
    'Prefetch/observers/counters/QuickPeek e vários efeitos exportados têm riscos latentes sem consumidor ativo confirmado; não foram convertidos em incidentes de produto.',
    'useTimingHooks tem consumidor real do debounce de valor em useTalkMeQueue; a nota inicial de ausência genérica foi corrigida após busca transversal de imports. Esse debounce limpa timer e não é o callback debounce da paleta.',
    'ChartContainer foi rastreado até config CSS literal em AIStatsWidget; dados de série remotos não demonstram injeção no CSS.',
    'Easter eggs, partículas e skeletons são apresentação deliberada; animação ou placeholders não provam regressão de performance ou conclusão falsa de negócio.',
    'useAnnounce ignora politeness e tem timer sem cleanup, mas só sua definição foi localizada; LiveRegion ativo é componente distinto.',
]
remaining = [
    'Sem browser/assistive technology, medições de FPS/memória ou regressão visual; leitura integral não é teste de renderização.',
    'Dependências Radix/cmdk/vaul são fronteiras não executadas. Eventos/foco/scroll internos não foram reimplementados em mocks como se fossem comprovação do pacote.',
    'Probes cobrem quatro riscos concretos; não são suíte completa, typecheck, build nem aceite final de acessibilidade.',
    'A auditoria global continua IN_PROGRESS; conclusão se refere somente aos87 arquivos primários deste lote.',
]
coverage['remaining_gaps'] = remaining
coverage['candidate_notes'] = unpromoted
coverage['task_adjudication'] = task_notes
coverage['harness_history'] = ['Primeira execução do P01 usou await Promise.resolve() insuficiente para Promise entre VM/host e parou por TypeError antes de gravar resultado. Harness corrigido para aguardar a Promise exata do callback capturada na fronteira; quatro casos então passaram. Nenhuma falha desse harness virou achado.']
dump('ui-performance-coverage.json', coverage)
batch = dict(schema_version=1, area='infra_ui_performance', baseline_sha=HEAD, mode='READ_ONLY_SOURCE_AND_BOUNDED_OFFLINE_PROBES', findings=findings, previous_findings_compared=104, unpromoted=unpromoted, task_adjudication=task_notes, remaining_gaps=remaining)
dump('ui-performance-findings.json', batch)

report = ['# Revisão de UI, efeitos e hooks de performance', '', f'Fonte fixa `{HEAD}`. Todos os87 arquivos primários foram lidos integralmente:78 em UI,5 em effects e4 hooks de performance, somando10.095 linhas. O inventário com apoios tem{coverage["counts"]["total"]} caminhos, com{coverage["counts"]["semantic"]} leituras integrais e{coverage["counts"]["targeted"]} dirigidas. Nenhum arquivo de produto foi alterado.', '', '## Resultado delimitado', '', '| ID | Prioridade | Contrato |', '|---|---|---|', *[f'| {f["id"]} | {f["severity"]} | {f["title"]} |' for f in findings], '', 'Quatro casos de prova confirmam esses quatro registros; não são quatro defeitos adicionais. A ordem de resolução, a filtragem e os handlers vêm do texto de fonte fixado. SHA256 dos sete arquivos do probe e do compilador é validado antes da importação do compilador. O pacote de produto, SDK, rede e banco não são fornecidos à VM.', '', '## Probes e controles', '', '| Probe | Execução delimitada | Controle |', '|---|---|---|', '| INF-UI-P01 | Debounce real e callbacks de busca/agrupamento, A e B iniciadas, B resolve antes de A | Timers ainda pendentes coalescem; a falha depende de pedidos já iniciados |', '| INF-UI-P02 | Dados padrão, filtro e executor reais | nav-, action explícita e disabled mantêm seus efeitos esperados |', '| INF-UI-P03 | Coleção e handler de teclado reais | Um item consultado entra em allItems e Enter o executa |', '| INF-UI-P04 | Módulo Progress completo com captura inerte de JSX | max e aria-label chegam ao Root; value não chega |', '', coverage['harness_history'][0], '']
for f in findings:
    report += [f'## {f["id"]} — {f["title"]}', '', f['description'], '', '**Precondições:** '+' '.join(f['preconditions']), '', '**Efeito e alcance:** '+f['effect'], '', '**Evidência:**', '']
    report += [f'- `{e["path"]}:{e["line_start"]}–{e["line_end"]}` — {e["reason"]}. SHA256 `{e["sha256"]}`.' for e in f['evidence']]
    report += ['', '**Critérios de aceite:**', '', *[f'- {x}' for x in f['acceptance']], '', '**Limites:** '+' '.join(f['limitations']), '']
    if f.get('external_references'):
        report += ['**Contrato primário:** [Progress — Radix](https://www.radix-ui.com/primitives/docs/components/progress), consultado em04/10/2026. A API/exemplo fornece a medida em Root.value. Esta é documentação geral, não captura de execução da versão1.1.16.', '']
report += ['## Adjudicação de planos', '', *[f'- {x}' for x in task_notes], '', '## Controles e candidatos não promovidos', '', *[f'- {x}' for x in unpromoted], '', '## Cobertura por arquivo', '', '| Arquivo | Nível | Faixas | Avaliação |', '|---|---|---|---|', *[f'| `{e["path"]}` | {e["review_level"]} | '+', '.join(f'{a}–{b}' for a,b in e['reviewed_ranges'])+' | '+e['review_basis'].replace('|','/')+' |' for e in coverage['inventory']], '', '## Lacunas remanescentes', '', *[f'- {x}' for x in remaining], '']
report_text = '\n'.join(report)
(OUT/'ui-performance-report.md').write_text(report_text)

main = json.loads((OUT/'findings.json').read_text())
new_ids = {f['id'] for f in findings}
prior = [f for f in main['findings'] if f['id'] not in new_ids]
assert len(prior) == 31
prior_hash = hashlib.sha256(json.dumps(prior, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
main['findings'] = prior + findings
main['ui_performance_review'] = dict(coverage='ui-performance-coverage.json', findings='ui-performance-findings.json', report='ui-performance-report.md', probes='ui-performance-probes.json', added_ids=sorted(new_ids), preserved_prior_findings_sha256=prior_hash)
dump('findings.json', main)

def merge_ranges(spans):
    out = []
    for a,b in sorted(spans):
        if out and a <= out[-1][1]+1: out[-1][1] = max(out[-1][1],b)
        else: out.append([a,b])
    return out

combined = json.loads((OUT/'coverage.json').read_text())
inventory = {e['path']:e for e in combined['inventory']}
for e in coverage['inventory']:
    old = inventory.get(e['path'])
    if old is None:
        inventory[e['path']] = dict(e, binary=False, lexical_signals={})
        continue
    assert old['sha256'] == e['sha256']
    spans = old.get('reviewed_ranges', old.get('reviewed_line_ranges', []))
    if old['review_level'] == 'semantic' and not spans: spans = [[1,old['lines']]]
    spans = merge_ranges(spans+e['reviewed_ranges'])
    old['reviewed_ranges'] = old['reviewed_line_ranges'] = spans
    old['full_file_read'] = spans == [[1,old['lines']]]
    old['review_level'] = 'semantic' if old['full_file_read'] else 'targeted'
    marker = ' UI/effects/performance: '
    old['review_basis'] = old.get('review_basis','').split(marker)[0]+marker+e['review_basis']
    old['ui_performance_review'] = dict(artifact='ui-performance-coverage.json', reviewed_ranges=e['reviewed_ranges'], primary_delegated=e['primary_delegated'])
combined['inventory'] = sorted(inventory.values(), key=lambda e:e['path'])
cc = Counter(e['review_level'] for e in combined['inventory'])
combined['counts'] = {'total':len(inventory), **dict(cc)}
layers = defaultdict(Counter)
for e in combined['inventory']: layers[e['layer']][e['review_level']] += 1
combined['layers'] = {k:{'total':sum(v.values()), **dict(v)} for k,v in sorted(layers.items())}
combined['ui_performance_review'] = dict(artifact='ui-performance-coverage.json', primary_files=87, primary_lines=10095, primary_remaining_not_fully_read=0, counts=coverage['counts'])
dump('coverage.json', combined)

main_report = (OUT/'report.md').read_text()
marker = '\n## Ampliação finita — UI, efeitos e hooks de performance\n'
main_report = main_report.split(marker)[0].rstrip()+'\n'
severity = Counter(f['severity'] for f in main['findings'])
main_report = re.sub(r'## Resultado: \d+ mecanismos adicionais \([^\n]+\)', f'## Resultado: {len(main["findings"])} mecanismos adicionais ({severity["P1"]} P1, {severity["P2"]} P2, {severity["P3"]} P3)', main_report, count=1)
main_report = '\n'.join(line for line in main_report.splitlines() if not any(line.startswith(f'| {fid} |') for fid in new_ids))+'\n'
table = '\n'.join(f'| {f["id"]} | {f["severity"]} | {f["title"]} | novo; lote UI/effects/performance |' for f in findings)
main_report = main_report.replace('\n## Evidência executada e limites', table+'\n\n## Evidência executada e limites',1)
main_report = re.sub(r'Foram inventariados \d+ arquivos: \d+ com revisão semântica, \d+ com revisão dirigida e \d+ com revisão estrutural\.', f'Foram inventariados {len(inventory)} arquivos: {cc["semantic"]} com revisão semântica, {cc["targeted"]} com revisão dirigida e {cc["structural"]} com revisão estrutural.', main_report, count=1)
start = main_report.index('| Camada | Semântica | Dirigida | Estrutural | Total |')
end = main_report.index('\n\nWiring preservado:',start)
layer_table = '| Camada | Semântica | Dirigida | Estrutural | Total |\n|---|---:|---:|---:|---:|\n'+'\n'.join(f'| {k} | {v.get("semantic",0)} | {v.get("targeted",0)} | {v.get("structural",0)} | {v["total"]} |' for k,v in combined['layers'].items())
main_report = main_report[:start]+layer_table+main_report[end:]
main_report += marker+'\n'+report_text.replace('# Revisão de UI, efeitos e hooks de performance','### Revisão de UI, efeitos e hooks de performance',1)
(OUT/'report.md').write_text(main_report)

source_refs = 0
for f in main['findings']:
    for e in f.get('evidence',[]):
        if e.get('origin','source') != 'source': continue
        assert digest(SRC/e['path']) == e['sha256']
        assert 1 <= e['line_start'] <= e['line_end'] <= len((SRC/e['path']).read_text().splitlines())
        source_refs += 1
for e in combined['inventory']:
    assert digest(SRC/e['path']) == e['sha256'],e['path']
    for a,b in e.get('reviewed_ranges',[]): assert 1 <= a <= b <= e['lines']
integrity = dict(schema_version=1, baseline_sha=HEAD, source_hashes_checked=len(inventory), evidence_refs=sum(len(f.get('evidence',[])) for f in main['findings']), source_evidence_refs=source_refs, finding_total=len(main['findings']), finding_counts=dict(severity), coverage_counts=combined['counts'], ui_ids=sorted(new_ids), ui_primary_files=87, ui_primary_lines=10095, ui_primary_unread=0, preserved_prior_findings_sha256=prior_hash, artifact_hashes={name:digest(OUT/name) for name in ['findings.json','coverage.json','report.md','ui-performance-findings.json','ui-performance-coverage.json','ui-performance-report.md','ui-performance-probes.json','ui-performance-probe-pins.json','probe-ui-performance.mjs','build_ui_performance_review.py','finalize_ui_performance_review.py']})
dump('ui-performance-integrity.json', integrity)
print(json.dumps({k:integrity[k] for k in ['finding_total','finding_counts','coverage_counts','evidence_refs','source_evidence_refs','ui_primary_files','ui_primary_lines']},ensure_ascii=False))
