"""Documentation-only finite merge. Does not import or modify product code."""
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
    assert 1 <= first <= last <= len((SRC / path).read_text().splitlines()), path
    return dict(path=path, line_start=first, line_end=last, sha256=digest(SRC / path), baseline_sha=HEAD, origin='source', reason=reason)

def finding(number, title, severity, description, chain, preconditions, effect, evidence, acceptance, limitations):
    return dict(id=f'R2-INF-{number:03}', title=title, severity=severity, classification='novo', area_extension='finite_layout_onboarding_batch', baseline_sha=HEAD,
        description=description, consumer_chain=chain, preconditions=preconditions, effect=effect, evidence=evidence, acceptance=acceptance,
        affected_tasks=[], related_previous_findings=[], probe_ids=[] if number == 39 else [f'INF-LO-P{number-35:02}'],
        novelty_basis='Locus e mecanismo adicionais aos 104 registros anteriores; root confirmou não haver IDs desses contratos. Descoberta nova não implica regressão introduzida depois da auditoria anterior.',
        proof_type='STATIC_SOURCE_AND_PRIMARY_CONTRACT' if number == 39 else 'STATIC_AND_BOUNDED_SYNTHETIC_OFFLINE',
        limitations=['Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado.', 'Nenhum arquivo de produto foi alterado.'] + limitations)

findings = [
    finding(36, 'Checklist marca tema como concluído quando a consulta não devolve configuração', 'P3',
        'A condição de tema compara data?.theme com null e system. Quando data é null, o valor é undefined e ambas as comparações são verdadeiras. O error resolvido pelo SDK também é ignorado. O callback real do card incorpora esse true ao conjunto de etapas concluídas.',
        ['Index habilita checklist no dashboard', 'AppShell monta OnboardingChecklist', 'checkAllSteps executa CHECKLIST_STEPS', 'Condição theme recebe data ausente', 'Card mostra etapa concluída e aumenta progresso'],
        ['Usuário autenticado e card ainda visível no dashboard.', 'A consulta de user_settings resolve sem registro ou com error e data null.'],
        'A interface afirma que o usuário escolheu tema claro ou escuro sem evidência dessa configuração e remove a ação pendente dessa etapa. A prova mantém as outras cinco etapas falsas; não afirma que o onboarding inteiro é concluído nessa situação.',
        [ev('src/components/onboarding/checklistSteps.ts', 103, 119, 'Promessa da etapa e condição undefined diferente de null/system'), ev('src/components/onboarding/OnboardingChecklist.tsx', 33, 47, 'Callback inclui a etapa verdadeira e não vê error resolvido'), ev('src/components/onboarding/OnboardingChecklist.tsx', 94, 123, 'Contagem, estado visual e ação condicionados a completedSteps'), ev('src/pages/Index.tsx', 87, 87, 'Card limitado ao dashboard'), ev('src/components/layout/AppShell.tsx', 141, 145, 'Consumidor atual monta card'), ev('src/hooks/ui/useOnboardingChecklist.ts', 58, 68, 'Hook vizinho exige settings existente; não compensa condição do card')],
        ['Validar presença e valor permitido de theme antes de concluir a etapa; ausência ou erro não deve virar conclusão.', 'Manter a regra do card coerente com o hook de estado de onboarding, preservando distinção entre pendente e falha de leitura.', 'Cobrir data null, error resolvido, theme system, theme dark/light e valor malformado no callback consumidor; a contagem deve refletir apenas estados comprovados.'],
        ['P3 delimitado ao estado de orientação; não há concessão de permissão, perda de dados ou gravação no probe.', 'O card desmonta fora do dashboard e remonta ao voltar; a hipótese anterior de falta de atualização ao retornar foi rejeitada.']),
    finding(37, 'Controle de movimento reduzido e transições de rota usam preferências desconectadas', 'P2',
        'O controle global de acessibilidade grava reducedMotion=true/false e aplica a classe reduced-motion. O hook das transições lê zapp:reduce-motion=1/0 e o media query do sistema; ele não lê o contexto global, sua chave ou sua classe. Com a opção global ligada e o sistema sem redução, RouteTransition continua escolhendo slide/zoom/fade em vez de none.',
        ['Sidebar monta AccessibilitySettings', 'HighContrastProvider mantém a opção Reduzir Movimento', 'Efeito grava reducedMotion e aplica classe', 'PageTransitionProvider envolve AppRoutes', 'RouteTransition consulta useTransitionPreferences e escolhe variante animada'],
        ['Usuário liga Reduzir Movimento pela interface global.', 'Sistema operacional não pede redução e zapp:reduce-motion não está em 1.', 'Usuário navega entre rotas abrangidas pelo PageTransitionProvider.'],
        'A preferência anunciada como desativação das animações não chega à decisão de variante das rotas. O controle CSS global reduz duração de animações e transições CSS e continua válido; o probe comprova a divergência da configuração JavaScript, sem medir a duração visual do Framer Motion.',
        [ev('src/components/theme/HighContrastToggle.tsx', 49, 51, 'Estado inicial usa reducedMotion'), ev('src/components/theme/HighContrastToggle.tsx', 107, 114, 'Efeito escreve chave/classe globais'), ev('src/components/theme/HighContrastToggle.tsx', 240, 254, 'Controle e promessa apresentados ao usuário'), ev('src/components/layout/Sidebar.tsx', 251, 252, 'Controle acessível na Sidebar'), ev('src/components/transitions/transitionConfig.ts', 29, 44, 'Chave e codificação diferentes nas rotas'), ev('src/components/transitions/useTransitionPreferences.ts', 11, 30, 'Preferências de sistema e chave privada, sem contexto global'), ev('src/components/transitions/RouteTransition.tsx', 12, 30, 'Flag decide none versus transição animada'), ev('src/routes/AppRoutes.tsx', 44, 84, 'Provider e rotas reais que usam slide/zoom'), ev('src/styles/accessibility.css', 57, 70, 'Controle CSS existe e não é negado pelo achado')],
        ['Usar uma fonte de preferência de usuário para a interface global e as transições, combinada com a preferência do sistema.', 'Garantir atualização da variante após ligar ou desligar a opção sem exigir outra chave escondida ou recarga.', 'Cobrir UI ligada/desligada e sistema ligado/desligado; verificar none no ramo esperado e depois validar em browser a animação efetiva.'],
        ['O probe executa efeito, leitura e decisão de configuração de fonte com fronteiras inertes; não importa Framer Motion nem reimplementa seu motor.', 'Não se afirma que toda animação CSS continua ativa ou que houve sintomas observados em usuário. O efeito demonstrado é a escolha incorreta de variante.']),
    finding(38, 'Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los', 'P2',
        'As duas últimas etapas padrão procuram data-tour=notifications e data-tour=theme. A produção de data-tour vem de SidebarNavItem com IDs de navegação; nenhum dos getters ativos fornece esses dois IDs. Os controles reais de notificações e tema da Sidebar não têm esses atributos. Após dez tentativas, TourOverlay chama nextStep; na última etapa isso chama endTour/onComplete.',
        ['Index inicia DEFAULT_ONBOARDING_STEPS', 'TourOverlay consulta o seletor de cada etapa', 'Sidebar renderiza atributos somente para IDs de itens de navegação', 'Notifications/theme não são encontrados', 'Retries avançam a última etapa e chamam conclusão'],
        ['Usuário inicia o tour padrão e chega às duas últimas etapas.', 'Layout usa os componentes da fonte atual; não há plugin externo inserindo os atributos ausentes.'],
        'As explicações de notificações e personalização não recebem alvo visível no fluxo atual e o callback de conclusão pode ser chamado mesmo sem essas etapas terem sido mostradas. O salto de uma etapa indisponível por permissão pode ser deliberado; aqui os dois seletores não são produzidos sequer para o layout desktop completo lido.',
        [ev('src/components/onboarding/defaultTourSteps.ts', 32, 45, 'Dois seletores ausentes do layout'), ev('src/components/layout/SidebarNavItem.tsx', 33, 44, 'Único produtor dinâmico de data-tour em UI de produto'), ev('src/services/navigation.service.ts', 1, 155, 'Getters de navegação não fornecem os dois IDs'), ev('src/components/layout/Sidebar.tsx', 92, 124, 'Controles de notificações não têm o atributo esperado'), ev('src/components/layout/Sidebar.tsx', 236, 252, 'Controles de tema/acessibilidade não têm data-tour=theme'), ev('src/components/onboarding/TourOverlay.tsx', 16, 39, 'Retries e salto automático por ausência/medida zero'), ev('src/components/onboarding/OnboardingTour.tsx', 50, 63, 'Último nextStep chama endTour e onComplete'), ev('src/pages/Index.tsx', 135, 142, 'Início real do tour padrão'), ev('src/pages/Index.tsx', 183, 192, 'Callback de conclusão conectado ao estado de onboarding')],
        ['Conectar seletores aos controles reais ou corrigir as etapas para os alvos realmente renderizados, respeitando layout e permissões.', 'Validar os seletores no layout composto, não apenas sua sintaxe em um document vazio.', 'Distinguir salto deliberado de ausência inesperada e evitar registrar conclusão de etapa obrigatória que não foi apresentada.', 'Cobrir caminho desktop, mobile e usuário sem uma seção permitida, com política de passos disponíveis explícita.'],
        ['Três getters de navegação e callbacks reais foram analisados/executados em fronteiras sintéticas; nenhum DOM de aplicação foi montado.', 'O probe usa a ausência estática dos IDs e querySelector sintético null; não mede posicionamento, scroll ou visibilidade em browser.', 'O teste existente que só verifica seletor válido/consulta sem throw não prova que o alvo exista. Não foi reexecutado.']),
    finding(39, 'Modais próprios anunciam modalidade sem implementar o contrato de foco', 'P2',
        'WelcomeModal e MobileDrawerMenu renderizam motion.div com role=dialog e aria-modal=true, mas não gerenciam foco inicial, contenção de Tab, inércia do conteúdo externo ou retorno do foco. Seus consumidores mantêm a aplicação e seus controles montados. WelcomeModal já implementa Escape corretamente; o drawer não possui handler de Escape no componente ou em MobileShell.',
        ['Index mantém AppShell montado ao abrir WelcomeModal', 'WelcomeModal anuncia aria-modal sem mecanismo de foco', 'No layout mobile, MobileShell abre MobileDrawerMenu sobre Header e navegação', 'Drawer também anuncia aria-modal sem mecanismo de foco'],
        ['Um dos dois overlays está aberto e há controles focáveis da aplicação ao fundo.', 'Usuário depende de teclado ou do contrato de modalidade comunicado à tecnologia assistiva.'],
        'A semântica declara que a interação está restrita ao diálogo, enquanto a implementação não estabelece essa restrição nem transfere/restaura o foco. Isso cria um caminho de interação incompatível com o contrato modal. O achado é de fonte e contrato primário; nenhuma sequência DOM/AT foi executada ou apresentada como observação de produção.',
        [ev('src/components/onboarding/WelcomeModal.tsx', 13, 47, 'Comentário reconhece ausência de trap; único efeito trata Escape; modal sem primitive de foco'), ev('src/components/onboarding/WelcomeModal.tsx', 56, 62, 'Botão de fechar rotulado preservado'), ev('src/pages/Index.tsx', 110, 143, 'AppShell permanece montado como irmão do modal'), ev('src/components/mobile/MobileDrawerMenu.tsx', 133, 164, 'Drawer próprio com aria-modal, backdrop e drag, sem foco'), ev('src/components/mobile/MobileDrawerMenu.tsx', 184, 220, 'Controles internos e busca sem autofoco/gerenciamento modal'), ev('src/components/mobile/MobileShell.tsx', 33, 105, 'Consumidor mantém Header/bottom navigation e não adiciona foco/Escape'), ev('src/providers/AppProviders.tsx', 61, 90, 'Providers globais não oferecem um escopo de foco para estes overlays')],
        ['Usar o Dialog/Sheet acessível já existente ou implementar integralmente foco inicial apropriado, contenção de Tab/Shift+Tab, conteúdo externo inerte e retorno ao acionador ou destino lógico.', 'Preservar Escape no WelcomeModal e fornecer fechamento por Escape no drawer sem quebrar botão, backdrop ou drag.', 'Testar cada modal com um controle focável externo: abertura, ciclo de Tab/Shift+Tab, Escape, fechamento e retorno. Complementar com tecnologia assistiva em browser.', 'Não considerar role/aria-modal ou uma regra isolada de axe como prova suficiente do ciclo de foco.'],
        ['Dois loci foram agrupados em um único mecanismo; MobileDrawerMenu foi revisto também pelo root.', 'WelcomeModal já tem nome acessível, um único role de diálogo e Escape. Essas correções anteriores são preservadas.', 'Não há probe adicional para este registro. Foco nativo, ordem DOM e comportamento de tecnologia assistiva continuam pendentes de execução controlada.']),
]
findings[-1]['external_references'] = [dict(url='https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/', retrieved_on='2026-10-04', source_kind='primary_documentation', supports='Contrato de modal: foco entra, Tab permanece no diálogo, Escape fecha, foco retorna e conteúdo externo é inerte.')]

coverage = json.loads((OUT / 'layout-onboarding-coverage.json').read_text())
assert coverage['primary_full_file_read'] == coverage['primary_files'] == 25
assert coverage['primary_lines'] == 2136
probes = json.loads((OUT / 'layout-onboarding-probes.json').read_text())
assert probes['case_count'] == 3
assert probes['finding_ids'] == [f['id'] for f in findings[:3]]
task_notes = [
    'Nenhuma tarefa DONE_VERIFIED foi reaberta por associação temática; os quatro achados especificam novos subcontratos de produto.',
    'P055/090 já está PARTIAL e trata onboarding/ambiente local do projeto, não certifica este tour visual. O status é preservado.',
    'P015/E97 está SUPERSEDED e trata onboarding do catálogo. Não é reativado pelo defeito no tour global.',
    'Tarefas de movimento reduzido de Contatos, Tarefas e Telefonia mantêm seus estados próprios. O defeito 037 é a preferência global versus roteador, não rejeição genérica dos controles por módulo.',
    'Root PLAT010/011 cobrem busca e notificações mobile; a navegação filtrada por permissões permanece um controle válido. Esses mecanismos não foram recontados.',
]
unpromoted = [
    'Atualização do checklist ao voltar ao dashboard: rejeitada, pois o card é desmontado fora da view e remonta no retorno.',
    'PageTemplate/scroll: sem prova do DOM e dos estilos computados, não foi promovida a hipótese de dois donos de scroll.',
    'Posicionamento do tour durante scroll e passos ocultos por permissão são limites adicionais; não recebem IDs sem cenário composto comprovado.',
    'Heurísticas de perfil/conexão/notificações foram lidas. Um indicador de orientação simplificado não foi automaticamente tratado como requisito novo de negócio.',
    'WelcomeModal Escape, nome acessível e diálogo único são correções presentes. O registro 039 cobre somente o contrato restante de foco e o drawer correspondente.',
    'A redução CSS existente e o media query do sistema são controles reais; o achado 037 não os descreve como ausentes.',
]
remaining = [
    'Não houve browser, axe, tecnologia assistiva, medição visual ou chamada de produto. Leitura integral não é aceite de interação.',
    'Três casos offline sustentam 036–038. O registro 039 é uma análise estática do contrato modal, sem quarto teste executado.',
    'A cobertura primária fecha somente estes 25 arquivos e suas 2.136 linhas; a reauditoria global continua em andamento.',
]
coverage.update(remaining_gaps=remaining, candidate_notes=unpromoted, task_adjudication=task_notes)
dump('layout-onboarding-coverage.json', coverage)
dump('layout-onboarding-findings.json', dict(schema_version=1, area='infra_layout_onboarding', baseline_sha=HEAD, mode='READ_ONLY_SOURCE_AND_BOUNDED_OFFLINE_PROBES', findings=findings, previous_findings_compared=104, task_adjudication=task_notes, unpromoted=unpromoted, remaining_gaps=remaining))
report = ['# Revisão de layout, transições e onboarding', '', f'Fonte fixa `{HEAD}`. Os 25 arquivos primários foram lidos integralmente, somando 2.136 linhas. Com apoios, o inventário tem {coverage["counts"]["total"]} caminhos: {coverage["counts"]["semantic"]} leituras integrais e {coverage["counts"]["targeted"]} dirigidas. Nenhum arquivo de produto foi alterado.', '', '## Resultado delimitado', '', '| ID | Prioridade | Contrato |', '|---|---|---|', *[f'| {f["id"]} | {f["severity"]} | {f["title"]} |' for f in findings], '', 'Há três casos offline para os três primeiros registros e análise estática para o quarto. Os dois modais são loci de um único mecanismo, sem aumentar a contagem. O harness valida SHA256 de 11 fontes e do compilador antes de importá-lo; as fronteiras de SDK, timers e hooks são sintéticas.', '', '## Probes e controles', '', '| Caso | Execução delimitada | Controle |', '|---|---|---|', '| INF-LO-P01 | Módulo checklistSteps completo e callback checkAllSteps real | data ausente/erro concluem tema; system não conclui e dark conclui |', '| INF-LO-P02 | Efeito global, leitor/hook de preferência e decisão de variante de rota | Chave privada de rota ou preferência do sistema produz none |', '| INF-LO-P03 | Etapas padrão e callbacks de retry, avanço e conclusão | Apenas getters de navegação lidos são usados para verificar IDs; nenhuma query de produto |', '', 'Os três casos passaram na execução delimitada registrada. Não se repetiram suítes anteriores nem se simulou o motor de movimento ou um navegador.']
for f in findings:
    report += ['', f'## {f["id"]} — {f["title"]}', '', f['description'], '', '**Precondições:** ' + ' '.join(f['preconditions']), '', '**Efeito e alcance:** ' + f['effect'], '', '**Evidência:**', '', *[f'- `{e["path"]}:{e["line_start"]}–{e["line_end"]}` — {e["reason"]}. SHA256 `{e["sha256"]}`.' for e in f['evidence']], '', '**Critérios de aceite:**', '', *[f'- {x}' for x in f['acceptance']], '', '**Limites:** ' + ' '.join(f['limitations'])]
    if f.get('external_references'):
        report += ['', '**Contrato primário:** [WAI-ARIA APG — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), consultado em 04/10/2026. O documento fornece o contrato de foco; não representa uma observação da aplicação.']
report += ['', '## Adjudicação e controles', '', *[f'- {x}' for x in task_notes + unpromoted], '', '## Cobertura por arquivo', '', '| Arquivo | Nível | Faixas | Avaliação |', '|---|---|---|---|', *[f'| `{e["path"]}` | {e["review_level"]} | ' + ', '.join(f'{a}–{b}' for a,b in e['reviewed_ranges']) + ' | ' + e['review_basis'].replace('|','/') + ' |' for e in coverage['inventory']], '', '## Lacunas remanescentes', '', *[f'- {x}' for x in remaining], '']
report_text = '\n'.join(report)
(OUT / 'layout-onboarding-report.md').write_text(report_text)

main = json.loads((OUT / 'findings.json').read_text())
new_ids = {f['id'] for f in findings}
prior = [f for f in main['findings'] if f['id'] not in new_ids]
assert len(prior) == 35
prior_hash = hashlib.sha256(json.dumps(prior, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
main['findings'] = prior + findings
main['layout_onboarding_review'] = dict(coverage='layout-onboarding-coverage.json', findings='layout-onboarding-findings.json', report='layout-onboarding-report.md', probes='layout-onboarding-probes.json', added_ids=sorted(new_ids), preserved_prior_findings_sha256=prior_hash)
dump('findings.json', main)

def merge_ranges(spans):
    out = []
    for a,b in sorted(spans):
        if out and a <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a,b])
    return out

combined = json.loads((OUT / 'coverage.json').read_text())
inventory = {e['path']:e for e in combined['inventory']}
for e in coverage['inventory']:
    old = inventory.get(e['path'])
    if old is None:
        inventory[e['path']] = dict(e, binary=False, lexical_signals={})
        continue
    assert old['sha256'] == e['sha256']
    spans = old.get('reviewed_ranges', old.get('reviewed_line_ranges', []))
    if old['review_level'] == 'semantic' and not spans:
        spans = [[1,old['lines']]]
    spans = merge_ranges(spans + e['reviewed_ranges'])
    old['reviewed_ranges'] = old['reviewed_line_ranges'] = spans
    old['full_file_read'] = spans == [[1,old['lines']]]
    old['review_level'] = 'semantic' if old['full_file_read'] else 'targeted'
    marker = ' Layout/onboarding: '
    old['review_basis'] = old.get('review_basis','').split(marker)[0] + marker + e['review_basis']
    old['layout_onboarding_review'] = dict(artifact='layout-onboarding-coverage.json', reviewed_ranges=e['reviewed_ranges'], primary_delegated=e['primary_delegated'])
combined['inventory'] = sorted(inventory.values(), key=lambda e:e['path'])
cc = Counter(e['review_level'] for e in combined['inventory'])
combined['counts'] = {'total':len(inventory), **dict(cc)}
layers = defaultdict(Counter)
for e in combined['inventory']:
    layers[e['layer']][e['review_level']] += 1
combined['layers'] = {k:{'total':sum(v.values()), **dict(v)} for k,v in sorted(layers.items())}
combined['layout_onboarding_review'] = dict(artifact='layout-onboarding-coverage.json', primary_files=25, primary_lines=2136, primary_remaining_not_fully_read=0, counts=coverage['counts'])
dump('coverage.json', combined)

main_report = (OUT / 'report.md').read_text()
marker = '\n## Ampliação finita — layout, transições e onboarding\n'
main_report = main_report.split(marker)[0].rstrip() + '\n'
severity = Counter(f['severity'] for f in main['findings'])
main_report = re.sub(r'## Resultado: \d+ mecanismos adicionais \([^\n]+\)', f'## Resultado: {len(main["findings"])} mecanismos adicionais ({severity["P1"]} P1, {severity["P2"]} P2, {severity["P3"]} P3)', main_report, count=1)
main_report = '\n'.join(line for line in main_report.splitlines() if not any(line.startswith(f'| {fid} |') for fid in new_ids)) + '\n'
table = '\n'.join(f'| {f["id"]} | {f["severity"]} | {f["title"]} | novo; lote layout/onboarding |' for f in findings)
main_report = main_report.replace('\n## Evidência executada e limites', table + '\n\n## Evidência executada e limites', 1)
main_report = re.sub(r'Foram inventariados \d+ arquivos: \d+ com revisão semântica, \d+ com revisão dirigida e \d+ com revisão estrutural\.', f'Foram inventariados {len(inventory)} arquivos: {cc["semantic"]} com revisão semântica, {cc["targeted"]} com revisão dirigida e {cc["structural"]} com revisão estrutural.', main_report, count=1)
start = main_report.index('| Camada | Semântica | Dirigida | Estrutural | Total |')
end = main_report.index('\n\nWiring preservado:', start)
layer_table = '| Camada | Semântica | Dirigida | Estrutural | Total |\n|---|---:|---:|---:|---:|\n' + '\n'.join(f'| {k} | {v.get("semantic",0)} | {v.get("targeted",0)} | {v.get("structural",0)} | {v["total"]} |' for k,v in combined['layers'].items())
main_report = main_report[:start] + layer_table + main_report[end:]
main_report += marker + '\n' + report_text.replace('# Revisão de layout, transições e onboarding', '### Revisão de layout, transições e onboarding', 1)
(OUT / 'report.md').write_text(main_report)

source_refs = 0
for f in main['findings']:
    for e in f.get('evidence', []):
        if e.get('origin','source') != 'source':
            continue
        assert digest(SRC / e['path']) == e['sha256']
        assert 1 <= e['line_start'] <= e['line_end'] <= len((SRC / e['path']).read_text().splitlines())
        source_refs += 1
for e in combined['inventory']:
    assert digest(SRC / e['path']) == e['sha256'], e['path']
    for a,b in e.get('reviewed_ranges', []):
        assert 1 <= a <= b <= e['lines']
assert hashlib.sha256(json.dumps(main['findings'][:35], ensure_ascii=False, sort_keys=True).encode()).hexdigest() == prior_hash
integrity = dict(schema_version=1, baseline_sha=HEAD, source_hashes_checked=len(inventory), evidence_refs=sum(len(f.get('evidence', [])) for f in main['findings']), source_evidence_refs=source_refs, finding_total=len(main['findings']), finding_counts=dict(severity), coverage_counts=combined['counts'], added_ids=sorted(new_ids), primary_files=25, primary_lines=2136, primary_unread=0, executed_probe_cases=3, static_only_finding_ids=['R2-INF-039'], preserved_prior_findings_sha256=prior_hash, artifact_hashes={name:digest(OUT / name) for name in ['findings.json','coverage.json','report.md','layout-onboarding-findings.json','layout-onboarding-coverage.json','layout-onboarding-report.md','layout-onboarding-probes.json','layout-onboarding-probe-pins.json','probe-layout-onboarding.mjs','build_layout_onboarding_review.py','finalize_layout_onboarding_review.py']})
dump('layout-onboarding-integrity.json', integrity)
print(json.dumps({k:integrity[k] for k in ['finding_total','finding_counts','coverage_counts','evidence_refs','source_evidence_refs','primary_files','primary_lines','executed_probe_cases']}, ensure_ascii=False))
