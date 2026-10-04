from pathlib import Path
import json, hashlib, collections, argparse, subprocess

ROOT = Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source',default=str(ROOT/'source'));p.add_argument('--integrity',default=str(ROOT/'source-integrity.json'));p.add_argument('--out',default=str(ROOT/'reports/root'));args=p.parse_args()
SOURCE = Path(args.source).resolve()
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
integrity = json.loads(Path(args.integrity).read_text())
HEAD = integrity['head_sha']
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==HEAD
files = {r['path']: r for r in integrity['files']}
BASE = f'https://github.com/adm01-debug/Zapp_Web_V2/blob/{HEAD}/'

def ev(p, lo, hi=None, purpose=''):
    assert p in files, p
    b=(SOURCE/p).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==files[p]['git_blob_sha'],p
    hi = hi or lo
    assert 0 < lo <= hi <= len((SOURCE / p).read_text().splitlines()), (p, lo, hi)
    return {'path': p, 'line_start': lo, 'line_end': hi, 'git_blob_sha': files[p]['git_blob_sha'], 'commit': HEAD,
            'url': f'{BASE}{p}#L{lo}-L{hi}', 'purpose': purpose}

findings = []
def add(fid, severity, title, condition, observed, impact, evidence, probes, recommendation, features=None, relation='NEW_DISCOVERY', prior=None):
    findings.append({'id': fid, 'severity': severity, 'title': title, 'classification': 'CONFIRMED_STATIC_CONTRACT',
      'baseline_sha': HEAD, 'preconditions': condition, 'observed_behavior': observed, 'impact': impact,
      'evidence': evidence, 'probes': probes, 'runtime_observed': False, 'recommendation': recommendation,
      'feature_catalog_ids': features or [], 'relation_to_prior_audit': relation, 'prior_finding_ids': prior or [],
      'novelty_note': 'Descoberta nesta revisão; não é afirmação de regressão introduzida nos dois commits novos.'})

add('R2-GOV-001','P2','Duas fontes com tarefas explícitas ficaram sem adjudicação no registro de planos',
    'Reconciliar todas as fontes de requisitos, inclusive prompts históricos versionados.',
    'SOURCE_CATALOG inclui os dois prompts como SUPPORTING_DOCUMENT, mas PLAN_REGISTRY e os 62 arquivos tasks não os referenciam. Há seis tarefas no prompt CRM 360° e quatro no de Inteligência.',
    'Dez cabeçalhos de tarefa ficam sem sucessão, cancelamento ou correspondência explícita; isso não significa dez funcionalidades ausentes nem autoriza ressuscitar requisitos antigos.',
    [ev('docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',44,120),ev('docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',25,61)],[],
    'Adicionar a adjudicação de origem e a correspondência com consumidores e decisões atuais; manter requisitos históricos separados de trabalho novo.')

add('R2-GOV-002','P2','Catálogo histórico com 349 marcações de conclusão não comprova os fluxos ativos',
    'Usar docs/COMPLETE_SYSTEM_FEATURES.md como evidência de cobertura funcional atual.',
    'As 349 linhas numeradas com coluna de status estão marcadas ✅; 72 linhas referenciam caminhos literais inexistentes ou renomeados, correspondentes a 69 caminhos únicos. Push/Service Worker aparecem concluídos, enquanto a configuração ativa os desabilita. Alguns componentes citados foram substituídos.',
    'Checkmarks e existência de arquivo podem encobrir capacidades desativadas, consumidores substituídos e contratos quebrados. O índice físico anterior não omitiu este arquivo; faltava confrontar suas promessas com os caminhos ativos.',
    [ev('docs/COMPLETE_SYSTEM_FEATURES.md',430,460),ev('docs/COMPLETE_SYSTEM_FEATURES.md',558,570),ev('src/config/service_worker.ts',1,8),ev('src/hooks/system/useServiceWorker.ts',7,43)],[],
    'Tratar o catálogo como declaração histórica, registrar sucessores e estados de produto, e exigir prova por fluxo; não reativar capacidades removidas por decisão.', ['20.3','20.13','27.2'])

add('R2-QUE-001','P1','Analytics de filas apresentam estimativas fixas como resultados medidos',
    'Abrir os detalhes ou gráficos de uma fila com contatos atribuídos.',
    'QueueDetails define Tempo Médio como ~3 min e Resolvidos Hoje como floor(assignedContacts*0.7). processStatusData assume 70% dos atribuídos resolvidos, e processDailyData conta atribuição como resolução na data de criação.',
    'Uma fila com dez contatos no total, todos atribuídos e nenhuma resolução, exibe sete resolvidos e 70% de resolução; o gestor recebe um resultado sem eventos que o sustentem.',
    [ev('src/pages/QueueDetails.tsx',48,64),ev('src/pages/queue-details/QueueMetricsCards.tsx',12,18),ev('src/hooks/business/useQueueAnalytics.ts',101,119),ev('src/hooks/business/useQueueAnalytics.ts',183,210),ev('src/components/queues/QueueCharts.tsx',55,65)],['ROOT-P01','ROOT-P06'],
    'Derivar resoluções de eventos/status canônicos e tempos de timestamps válidos; representar ausência de amostra como sem dados. Provar atribuído aberto, resolvido antigo e resolvido hoje.', ['7.8','7.10'])

add('R2-QUE-002','P1','Contagem de espera zerada impede os alertas configurados de filas',
    'Fila com contatos aguardando e metas/alertas habilitados.',
    'useQueues sobrescreve waiting_count com 0. QueuesView usa esse valor nos únicos dois alertas implementados; calcula atribuição com número de membros, não contatos atribuídos. max_avg_wait_minutes e max_messages_pending são editados e persistidos, mas não são avaliados por esse consumidor.',
    'A tela mostra zero aguardando e não dispara os alertas de espera/atribuição. Duas metas aparentam funcionar, embora não participem dessa avaliação.',
    [ev('src/hooks/business/useQueues.ts',44,63),ev('src/components/queues/QueuesView.tsx',31,48),ev('src/components/queues/QueueCard.tsx',53,60),ev('src/components/queues/QueueGoalsDialog.tsx',127,157),ev('src/components/queues/QueueGoalsDialog.tsx',195,225)],[],
    'Buscar contagens reais por fila, definir denominador de atribuição e conectar todos os limites exibidos. Testar transição do limiar e recuperação, sem inferir ausência de eventual monitor externo.', ['7.6','7.7'])

add('R2-QUE-003','P1','Totais de filas são calculados sobre amostras truncadas',
    'Fila com mais de 50 contatos, ou consultas de analytics/comparação que excedam o limite de resposta do PostgREST.',
    'QueueDetails aplica limit(50) e usa contactsWithDetails.length como Total de Contatos. Para cada contato faz count de mensagens, última mensagem e possível busca de agente. Analytics/comparação usam consultas de linhas sem continuação.',
    'O total e a espera não representam a fila inteira; o caminho de 50 contatos faz de 103 a 153 consultas conforme atribuição, antes de somar os gráficos. Não foi medida latência real.',
    [ev('src/pages/QueueDetails.tsx',41,63),ev('src/hooks/business/useQueueAnalytics.ts',217,247),ev('src/hooks/business/useQueuesComparison.ts',54,84),ev('src/pages/queue-details/QueueMetricsCards.tsx',12,17)],[],
    'Separar totais agregados da página visível e agregar mensagens/perfis em lote. Provar mais de 50 contatos e mais de uma página do servidor, preservando ACL e filtros.', ['7.9','7.10'])

add('R2-QUE-004','P2','Agrupamento de 30 dias conta o último dia duas vezes',
    'Gráfico diário com intervalo cujo último índice não coincide com showEveryNth, por exemplo 30 dias.',
    'processDailyData escolhe índices múltiplos do salto e também o último índice, depois atribui a ambos uma janela inteira. Em 30 dias, o bucket do dia 28 cobre 28–30 e o bucket do dia 30 inclui o mesmo dia novamente.',
    'Uma única mensagem no dia 30 aparece em dois pontos; totais visuais de mensagens/novos/resolvidos ficam sobrepostos.',
    [ev('src/hooks/business/useQueueAnalytics.ts',74,121)],['ROOT-P02'],
    'Construir intervalos consecutivos, exclusivos e limitados ao término selecionado. Testar 15, 30 e 90 dias com eventos nos limites.', ['7.8','7.11'])

add('R2-QUE-005','P2','Salvar metas fecha o formulário mesmo quando a gravação falha',
    'UPDATE/INSERT de queue_goals retorna erro explícito, como 42501.',
    'saveGoal mostra erro e resolve normalmente no catch; handleSave aguarda a função e fecha o diálogo incondicionalmente.',
    'O rascunho sai de tela após uma gravação recusada, dificultando correção e repetição confiável.',
    [ev('src/hooks/business/useQueueGoals.ts',68,103),ev('src/components/queues/QueueGoalsDialog.tsx',53,61)],['ROOT-P03'],
    'Propagar a falha ou retornar resultado discriminado; fechar apenas no sucesso confirmado e preservar o rascunho.', ['7.6'])

add('R2-QUE-006','P2','Ações Editar e Configurar fila estão visíveis sem operação',
    'Usar Editar no card de fila ou Configurar na página de detalhes.',
    'QueueCard renderiza o item Editar sem callback; QueueDetails renderiza Configurar sem callback. updateQueue existe, mas não é conectado a esses controles.',
    'O CRUD anunciado não inclui um caminho funcional de edição nesses pontos de entrada.',
    [ev('src/components/queues/QueueCard.tsx',39,47),ev('src/pages/QueueDetails.tsx',95,99),ev('src/hooks/business/useQueues.ts',106,126)],[],
    'Conectar os controles a um formulário com confirmação de gravação, ou retirar a promessa até existir. Testar edição pelo ponto de entrada ativo.', ['7.1'])

add('R2-SLA-001','P2','Métricas e histórico de SLA usam denominadores incompatíveis',
    'Mesmo conjunto contendo linhas pendentes legadas, importadas ou criadas por escrita administrativa, sem primeira resposta e ainda não marcadas como violadas. O escritor versionado atual insere linhas já respondidas; não se afirma que ele produza rotineiramente essa amostra, nem que ela exista em produção.',
    'fetchSLAMetrics exclui pendentes do denominador de taxa; fetchSLAHistory os conta como sucesso. Dez registros, um com resposta válida tardia e nove pendentes, resultam em 0% no painel e 90% no histórico. Ausência de amostra também vira 100%.',
    'O resumo, o histórico e os sparklines podem contradizer-se sem mudança no dado e apresentar desempenho perfeito sem respostas avaliadas.',
    [ev('src/hooks/sla/useSLAMetrics.ts',41,74),ev('src/hooks/sla/useSLAHistory.ts',87,116),ev('src/components/queues/SLADashboard.tsx',25,33)],['ROOT-P04'],
    'Definir elegibilidade e denominador únicos, distinguir pendente de atendido no prazo e sem amostra; provar ambos consumidores com a mesma fixture.', ['8.4','8.5','8.6'])

add('R2-SLA-002','P2','Períodos de SLA não correspondem aos rótulos Todos e 7d',
    'Selecionar Todos, ou calcular histórico de sete dias.',
    'Todos aplica limite inferior de 365 dias. Histórico subtrai sete dias e inclui os dois extremos, produzindo oito datas civis; vale também para 14/30/90.',
    'Registros mais antigos desaparecem do total anunciado, e a janela histórica contém um dia extra.',
    [ev('src/hooks/sla/useSLAMetrics.ts',31,54),ev('src/components/queues/SLADashboard.tsx',55,60),ev('src/hooks/sla/useSLAHistory.ts',60,83)],['ROOT-P04','ROOT-P05'],
    'Remover o limite em Todos ou explicitar Últimos 365 dias; definir janelas inclusivas/exclusivas e testar virada do dia no fuso do produto.', ['8.5','8.6'])

add('R2-SLA-003','P1','Configurações granulares de prazo não governam o SLA efetivo',
    'Salvar regra ativa com primeira resposta diferente de cinco minutos.',
    'O manager promete precedência automática, e as mutations persistem os prazos. useApplicableSLA implementa resolução, mas não tem consumidor ativo localizado. Os dois indicadores ativos passam 5 e a última definição versionada localizada da função do banco também compara cinco minutos.',
    'Salvar uma regra não altera o indicador nem a classificação persistida no caminho examinado. A revisão não presume que restaurar um modelo antigo seja a decisão correta; a promessa atual precisa corresponder ao comportamento.',
    [ev('src/components/settings/SLARulesManager.tsx',50,61),ev('src/hooks/sla/useSLARules.ts',67,86),ev('src/hooks/sla/useApplicableSLA.ts',97,134),ev('src/components/inbox/chat/ChatPanelHeader.tsx',128,132),ev('src/components/inbox/VirtualizedRealtimeList.tsx',518,524),ev('supabase/migrations/20260903233000_sla_base_only_valid_messages.sql',46,55)],[],
    'Adjudicar o contrato de cinco minutos versus configurável e fazê-lo único entre UI, persistência e documentação. Testar regra de dois minutos com resposta aos três.', ['8.1','8.2','8.3'])
findings[-1]['observed_behavior'] += ' A revisão cruzada de modules também localizou o formulário SLAConfigTable: ele promete editar o prazo, mas oferece somente nome, prioridade e padrão. Esse contraste de interface reforça a necessidade de adjudicar o contrato atual, sem criar outro ID para a mesma família.'
findings[-1]['evidence'].append(ev('src/components/dashboard/sla/SLAConfigTable.tsx',101,130,'Descrição de prazo versus campos realmente editáveis.'))

trigger_path = next(p for p in files if p.startswith('supabase/migrations/20260903225000'))
add('R2-SLA-004','P2','Marco de medição do SLA omite o tempo entre criação e envio',
    'Mensagem do agente é criada antes de ser efetivamente enviada e muda para sent após atraso suficiente para ultrapassar o SLA.',
    'O trigger roda ao confirmar sent, mas passa NEW.created_at para p_responded_at. A migração declara essa escolha deliberada para evitar drift de now(). O enqueue insere sending antes da entrega. Exemplo estático: criada aos quatro minutos e confirmada aos dez pode ser classificada como resposta aos quatro.',
    'A medida representa criação de uma mensagem que acabou enviada; não mede todo o tempo em fila/retentativa até a entrega ao provedor. O comportamento é confirmado, mas a aceitação desse marco é uma lacuna de contrato, não um incidente comprovado nem autorização para trocar a regra.',
    [ev(trigger_path,1,11),ev(trigger_path,109,135),ev('supabase/migrations/20260903233000_sla_base_only_valid_messages.sql',46,55),ev('supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql',113,120),ev('supabase/functions/message-delivery/index.ts',327,331)],[],
    'Adjudicar o evento que materializa resposta e documentar seu timestamp; distinguir atraso de entrega de atraso do webhook sem presumir que now() seja correto. Provar envio pendente, confirmação posterior e retentativa.', ['8.2'])
findings[-1]['classification'] = 'CONFIRMED_BEHAVIOR_CONTRACT_GAP'

mapping = [
 ('CRM360-T1','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',46,58,'CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION','Panel ativo dentro de Mais detalhes, protegido pelo gate CRM; a localização histórica mudou.', [('src/components/inbox/contact-details/ContactAccordionSections.tsx',94,104)]),
 ('CRM360-T2','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',60,72,'CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION','Busca CRM integrada à tela de Contatos via ContactCRMDialog; planos posteriores divergem sobre o botão, sem dez tarefas novas presumidas.', [('src/components/contacts/ContactsView.tsx',170,180)]),
 ('CRM360-T3','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',74,82,'PARTIAL_OR_CHANGED_SCOPE','GlobalSearch consulta CRM com gate de supervisor, deduplica telefone e só inclui vínculos locais; debounce300ms. CommandPalette ativo busca módulos. Reconciliar a intenção antiga de busca/importação.', [('src/components/inbox/useGlobalSearchData.ts',189,218),('src/components/inbox/useGlobalSearchData.ts',241,247),('src/components/CommandPalette.tsx',1,139)]),
 ('CRM360-T4','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',84,96,'IMPLEMENTED_IN_SUPERSEDED_COMPONENT','ChatHeader antigo contém CrmBadges, mas ChatPanel usa ChatPanelHeader. A presença do componente legado não certifica o header ativo.', [('src/components/inbox/chat/ChatHeader.tsx',43,55),('src/components/inbox/chat/ChatHeader.tsx',127,129),('src/components/inbox/ChatPanel.tsx',244,251)]),
 ('CRM360-T5','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',98,108,'PARTIAL_OR_CHANGED_SCOPE','Header atual tem logo/nome/VIP; vendedor não aparece nesse header, podendo estar na ficha. Necessita sucessão explícita, não reaplicação cega do prompt.', [('src/components/inbox/contact-details/ContactHeaderSection.tsx',140,205)]),
 ('CRM360-T6','docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md',110,120,'PARTIAL_OR_CHANGED_SCOPE','Lista ativa mostra empresa do contato local; não há consulta CRM por linha nesse ponto. Badge CRM específico do prompt não está presente no trecho.', [('src/components/inbox/VirtualizedRealtimeList.tsx',458,467)]),
 ('INTEL-T1','docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',27,36,'CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION','Painel ativo possui gatilhos limitados a4, rapport condicional, fallback de horários, cores churn e DISC. QA visual e contrato de dados externos não foram executados.', [('src/components/inbox/contact-details/ContactIntelligencePanel.tsx',99,251),('src/components/inbox/contact-details/ContactAccordionSections.tsx',100,104)]),
 ('INTEL-T2','docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',38,45,'IMPLEMENTED_IN_SUPERSEDED_COMPONENT','Brain, largura320, borda de risco e motion existem no ChatHeader legado; o header ativo é outro.', [('src/components/inbox/chat/ChatHeader.tsx',70,99),('src/components/inbox/ChatPanel.tsx',244,251)]),
 ('INTEL-T3','docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',47,53,'PARTIAL_OR_CHANGED_SCOPE','CRMSyncButton legado não tem consumidor ativo localizado. O sucessor CrmSyncMenuItem envia contato estável, mas não mostra badge persistente de último sync ou modo Sem CRM.', [('src/components/inbox/CRMAutoSync.tsx',98,151),('src/components/inbox/contact-details/ContactActionButtons.tsx',30,58)]),
 ('INTEL-T4','docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md',55,61,'PARTIAL_OR_CHANGED_SCOPE','Lista ativa usa ai_sentiment canônico PT-BR; header legado usa briefing.sentiment. O detector do CRMAutoSync não é uma prova de atualização em tempo real de ambos.', [('src/components/inbox/VirtualizedRealtimeList.tsx',439,454),('src/components/inbox/CRMAutoSync.tsx',66,90)]),
]
plan_rows=[]
for fid,p,lo,hi,status,note,refs in mapping:
    plan_rows.append({'id':fid,'source':ev(p,lo,hi),'status':status,'adjudication':note,'evidence':[ev(*r) for r in refs], 'new_implementation_authorized':False, 'counts_as_new_backlog_task':False})

full_read = [
 'src/components/inbox/useGlobalSearchData.ts','src/components/CommandPalette.tsx','src/components/inbox/chat/CrmBadges.tsx',
 'src/components/inbox/CRMAutoSync.tsx','src/components/inbox/contact-details/ContactIntelligencePanel.tsx','src/hooks/crm/useContactIntelligence.ts',
 'src/hooks/crm/useExternalContact360.ts','src/hooks/system/useOfflineCache.ts','src/hooks/system/useServiceWorker.ts','src/config/service_worker.ts','src/lib/safeStorage.ts',
 'src/services/queue.service.ts','src/hooks/business/useQueues.ts','src/hooks/business/useQueueAnalytics.ts','src/hooks/business/useQueuesComparison.ts','src/hooks/business/useQueueGoals.ts',
 'src/pages/QueueDetails.tsx','src/pages/queue-details/QueueMetricsCards.tsx','src/components/queues/QueueCard.tsx','src/components/queues/QueueGoalsDialog.tsx',
 'src/components/queues/QueuesView.tsx','src/components/queues/QueueCharts.tsx','src/components/queues/SLADashboard.tsx','src/pages/SLADashboard.tsx',
 'src/hooks/sla/useSLAMetrics.ts','src/hooks/sla/useSLACalculation.ts','src/hooks/sla/useSLAHistory.ts','src/hooks/sla/useSLARules.ts','src/hooks/sla/useSLAConfigurations.ts','src/hooks/sla/useApplicableSLA.ts','src/hooks/sla/useSLANotifications.ts',
 'src/components/settings/SLARulesManager.tsx','src/components/settings/sla/ScopeRulesList.tsx',
 'src/hooks/__tests__/useQueueAnalytics.test.tsx','src/hooks/__tests__/useSLAMetrics.test.tsx','src/hooks/__tests__/useQueueGoals.test.tsx',
 'docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md','docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md','docs/decisions/ADR-005-empty-state-consolidation.md',
 'supabase/migrations/20260903233000_sla_base_only_valid_messages.sql',
]
coverage = [dict(ev(p,1,len((SOURCE/p).read_text().splitlines())),review_level='SEMANTIC_FILE_REVIEW',scope='Leitura e rastreio de contratos; sem homologação visual/live.') for p in full_read]
covered = set(full_read)
for f in findings:
    for e in f['evidence']:
        if e['path'] not in covered:coverage.append(dict(e,review_level='TARGETED_RANGE_REVIEW',scope=f['id']))

rejected = [
 {'candidate':'CRMSyncButton bloqueia outros contatos depois de contact_not_found','disposition':'DORMANT_COMPONENT_NOT_ACTIVE_OUTAGE','basis':'Componente exportado sem consumidor ativo localizado; o menu atual usa CrmSyncMenuItem.'},
 {'candidate':'Todas as72 referências ausentes do catálogo representam funcionalidades removidas','disposition':'REJECTED_INFERENCE','basis':'As72 linhas representam69 caminhos únicos; muitos hooks foram movidos para subpastas. Resolver caminho/sucessor antes de concluir ausência.'},
 {'candidate':'Ausência de linha citada prova que ninguém leu a função','disposition':'REJECTED_INFERENCE','basis':'Índice é de evidência estruturada localizada, não registro onisciente de leitura.'},
 {'candidate':'ADR de empty states gera automaticamente3tarefas novas','disposition':'REQUIRES_AUTHORITY_AND_LINEAGE_ADJUDICATION','basis':'Guia contém etapas, mas é regra/proposta; o estado de adoção e planos sucessores devem ser reconciliados antes de aumentar backlog.'},
 {'candidate':'OfflineCache nunca é limpo no logout','disposition':'REJECTED_BY_CURRENT_CONSUMER','basis':'useAuth chama clearOfflineCache e queryClient.clear no sign-out; não se inferiu vazamento do simples CACHE_KEY global.'},
 {'candidate':'Atividade por hora ignora o período sem aviso','disposition':'REJECTED_INFERENCE','basis':'QueueCharts rotula explicitamente Atividade por Hora (Hoje); outros problemas de amostra são separados.'},
]

def save(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
save('findings.json',{'schema_version':1,'head_sha':HEAD,'reviewer':'root','findings':findings,'rejected_or_limited':rejected})
save('coverage.json',{'schema_version':1,'head_sha':HEAD,'files':coverage,'limitations':['AST/import graph and citation indexing cover the whole tree structurally, not every function semantically.','Only explicit read ranges are claimed; a whole-file read does not imply all runtime inputs were tested.']})
save('omitted-source-adjudication.json',{'schema_version':1,'head_sha':HEAD,'two_missing_source_adjudications':True,'task_headings':10,'new_tasks_added_to_original_ledger':0,'tasks':plan_rows})

lines = ['# Revisão transversal: cobertura, requisitos, Filas e SLA','',f'Código examinado: `{HEAD}`. Data local: 3 de outubro de 2026.','',
 'Esta revisão preserva o ledger anterior e acrescenta evidência. As descobertas abaixo não representam autorização para alterar produto, migrar banco ou operar provedores. Os cenários foram inspecionados no código e, quando indicado, executados com fronteiras sintéticas.','',
 '## Achados','']
for f in findings:
    lines += [f"### {f['id']} · {f['severity']} · {f['title']}",'', '**Condição:** '+f['preconditions'],'', '**Comportamento:** '+f['observed_behavior'],'', '**Efeito:** '+f['impact'],'', '**Correção e aceite propostos:** '+f['recommendation'],'',
              '**Evidências:** '+ '; '.join(f"[{e['path']}:{e['line_start']}–{e['line_end']}]({e['url']})" for e in f['evidence']) + '.', '', '**Prova local:** '+(', '.join(f['probes']) if f['probes'] else 'Inspeção de contrato/cadeia; sem execução de produção.')+'.','']
lines += ['## As duas fontes omitidas','',
 'A enumeração física de Markdown anterior contém todos os352 arquivos atuais. A falha é de adjudicação de requisitos: dois prompts classificados como apoio possuem dez tarefas explícitas sem correspondência no registro de planos. Parte já está implementada em consumidores atuais; parte existe em componentes substituídos. O arquivo omitted-source-adjudication.json conserva a comparação, sem fabricar dez tarefas pendentes.','',
 '| Requisito | Estado da correspondência | Avaliação |','|---|---|---|']
for r in plan_rows:lines.append(f"| {r['id']} | {r['status']} | {r['adjudication']} |")
lines += ['', '## Limites e falsos positivos rejeitados','']
for r in rejected:lines.append(f"- **{r['candidate']}:** {r['basis']}")
lines += ['', 'O catálogo de microfunções e o grafo de importação servem para identificar cobertura faltante. Funções aninhadas e callbacks não equivalem a funcionalidades de negócio; um import ou uma faixa citada não prova execução. A cobertura específica desta revisão está em coverage.json.','']
(OUT/'report.md').write_text('\n'.join(lines))
print(json.dumps({'root_findings':len(findings),'coverage_entries':len(coverage),'omitted_task_headings':len(plan_rows),'out':str(OUT)}))
