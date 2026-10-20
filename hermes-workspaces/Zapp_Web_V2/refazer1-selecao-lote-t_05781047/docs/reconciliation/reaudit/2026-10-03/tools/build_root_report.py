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
findings[-1]['observed_behavior'] += ' O consumidor ativo SystemFeaturesView exibe um badge literal 100% Implementado, enquanto sua lista estática ainda anuncia push e Service Worker. A afirmação vem do próprio catálogo de produto; não foi atribuída ao ledger da auditoria anterior.'
findings[-1]['evidence'] += [ev('src/components/docs/SystemFeaturesView.tsx',37,44),ev('src/components/docs/featuresSectionsData.ts',207,214),ev('src/components/docs/featuresSectionsData.ts',275,282),ev('src/pages/lazyViews.ts',21,21)]

add('R2-GOV-003','P2','A fragilidade de provas do TC-011 também ocorre em testes de outros módulos',
    'Usar a quantidade ou os títulos de testes como prova de que as funções de produto foram exercitadas.',
    'Há assertivas literais e regras reimplementadas dentro de testes, sem chamar a função produtiva correspondente. useAgents afirma validar status mas compara true com true; MediaLibraryAdmin compara limites literais e replica extractStoragePath; ChurnPredictionDashboard valida o literal 500; webhookStatusPriority define mapa e função locais. AutoTicketClassifier testa uma fórmula local que converte confiança zero em70, enquanto scenario-simulation importa a classificação real e espera zero. O teste nominal de sucesso de useQueuesComparison espera somente loading=false, e o mock de messages termina em uma Promise antes dos filtros gte/lte que o hook exige.',
    'Esses casos podem continuar satisfeitos com o comportamento real ausente ou incorreto; o caso de comparação de filas admite a saída pelo catch. A descoberta amplia a família TC-011 além de Team Chat e não representa uma nova falha de produto por arquivo nem invalida os testes comportamentais existentes.',
    [ev('src/hooks/__tests__/useAgents.test.tsx',66,91),ev('src/components/settings/__tests__/MediaLibraryAdmin.test.tsx',1089,1097),ev('src/components/settings/__tests__/MediaLibraryAdmin.test.tsx',1418,1446),ev('src/components/ai/__tests__/ChurnPredictionDashboard.test.tsx',197,215),ev('src/lib/__tests__/webhookStatusPriority.test.ts',1,28),ev('src/components/ai/__tests__/AutoTicketClassifier.test.tsx',168,193),ev('src/lib/__tests__/scenario-simulation.test.ts',188,232),ev('src/hooks/__tests__/useQueuesComparison.test.tsx',1,122),ev('src/hooks/business/useQueuesComparison.ts',72,84)],[],
    'Migrar gradualmente os casos desconectados para o módulo real e exigir saídas/efeitos relevantes, incluindo erro explícito. Separar contrato textual, regra pura, hook com fronteiras simuladas e fluxo integrado no relatório. O aceite deve falhar ao quebrar o alvo produtivo e preservar controles positivos legítimos; não exigir um teste que apenas duplique cada linha da implementação.',relation='EXTENSION_OF_PRIOR',prior=['TC-011'])
findings[-1]['classification']='REFINED_PRIOR_FINDING'
findings[-1]['novelty_note']='Ampliação documental da família de qualidade de prova TC-011; os casos foram localizados no HEAD fixado, sem afirmar regressão nova ou execução da suíte.'
findings[-1]['observed_behavior'] += ' Em outbound-message.service.test, a prova de reutilização do id fixa crypto.randomUUID no mesmo literal para todas as chamadas: ids iguais não distinguem retenção da ação de geração repetida.'
findings[-1]['evidence'] += [ev('src/services/__tests__/outbound-message.service.test.ts',11,15),ev('src/services/__tests__/outbound-message.service.test.ts',55,70)]
findings[-1]['evidence'] += [ev('src/hooks/business/useQueuesComparison.ts',139,144),ev('src/lib/__tests__/scenario-simulation.test.ts',8,13)]
findings[-1]['observed_behavior'] += ' A leitura suplementar de Bash encontrou o mesmo limite de prova em dois casos precisos: cron-secret-l5-contract anuncia D2-MUT de segredo truncado, mas reutiliza a fixture vazia de D1-MUT sem trocá-la por 32 caracteres; talkx-settings-replay-idempotent anuncia atualização de admin, mas compara apenas SELECT 1 após um UPDATE que pode afetar zero linhas por RLS. Os controles não mutantes de segredo truncado e o UPDATE de agente com RETURNING/count são preservados.'
findings[-1]['evidence'] += [ev('scripts/db-audit/cron-secret-l5-contract.test.sh',738,780),ev('scripts/db-audit/talkx-settings-replay-idempotent.test.sh',113,124)]
findings[-1]['supplemental_adjudication_journals']=['test-review.json','inbox-peer-test-review.json','inbox-peer-test-review-extra.json','shell-review.json']
findings[-1]['positive_controls']=[
    'scenario-simulation importa as regras reais de classificação e verifica confiança zero; sua evidência não foi descartada por outros testes usarem cópias.',
    'useMessages exercita mudança de contato, resposta obsoleta, desabilitação e preservação de páginas antigas com o hook real.',
    'useContactMedia exercita paginação de201 itens, cursor por data/id, assinatura em lote e erros através do hook real.',
    'Os casos reais de renderização presentes em arquivos mistos foram mantidos com seu escopo, e contratos textuais declarados não foram tratados como tautologias.',
    'Os roteiros Bash contêm controles úteis de dados persistidos, mensagens específicas, ACL com SET ROLE e mutações direcionadas; a leitura suplementar registra o alcance de cada um, sem afirmar sua execução neste passe.'
]

add('R2-GOV-004','P2','Validação do export anuncia sucesso após falha do comando de banco',
    'O comando psql-safe falha durante validate_destino.sh e sua saída não contém uma linha de métrica FAIL reconhecida. Separadamente, um bloco ausente durante import.sh provoca apenas aviso e continuação.',
    'validate_destino.sh usa set -u e testa node psql-safe | tee sem pipefail; o status observado é o de tee. Uma falha do comando de banco sem linha de métrica FAIL prossegue com contagem zero e exit0. Os comandos de geração JSON/CSV também não propagam falha. import.sh pula um bloco ausente e imprime importação concluída antes de chamar esse validador. POST_EXPORT_CHECKLIST é um verificador separado de existência/tamanho, não executado por import.sh.',
    'O validador pode certificar um destino que nem foi consultado. O probe executou o Bash original com node substituído por um stub: erro42 resultou em sucesso/exit0 e nenhum JSON; controles com métrica FAIL e sucesso sintético foram distinguidos. import.sh tem set -e e aborta se o Node que aplica um bloco falhar; um bloco ausente, porém, permite o anúncio prematuro de importação concluída. O sucesso final dessa cadeia depende do validador posterior. Não houve importação ou validação em banco real.',
    [ev('supabase-export/validate_destino.sh',17,45),ev('supabase-export/validate_destino.sh',47,95),ev('supabase-export/import.sh',30,43),ev('supabase-export/POST_EXPORT_CHECKLIST.sh',44,94)],['ROOT-EXPORT-P01'],
    'Propagar falhas em pipelines e em cada geração de artefato, rejeitar blocos obrigatórios ausentes e só anunciar sucesso após validação estrutural dos resultados. O aceite deve distinguir falha de conexão, métrica FAIL, saída vazia e sucesso conhecido em ambiente descartável, sem atuar no banco de produção.')
findings[-1]['behavior_controls']=['ROOT-EXPORT-C01','ROOT-EXPORT-C02']
findings[-1]['evidence'].append(ev('supabase-export/import.sh',1,2))
findings[-1]['relation_to_prior_audit']='NEW_DISCOVERY_SEPARATE_RUNNER_FROM_R2_INF_014'

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

add('R2-QUE-007','P2','Período personalizado aceita início posterior ao fim',
    'Selecionar uma data final e depois alterar a data inicial para um dia posterior àquela data final, ambas no passado.',
    'O calendário inicial preserva o fim anterior. Aplicar verifica apenas a existência das duas datas, e useQueuesComparison transmite os limites invertidos diretamente em gte/lte. O bloqueio no calendário final impede novas escolhas inválidas, mas não corrige um fim já selecionado.',
    'O operador pode aplicar um intervalo impossível; a consulta de mensagens não pode conter uma linha que satisfaça simultaneamente esses limites. O probe confirma os parâmetros enviados, sem consultar banco real.',
    [ev('src/components/queues/PeriodSelector.tsx',62,66),ev('src/components/queues/PeriodSelector.tsx',138,170),ev('src/components/queues/PeriodSelector.tsx',187,192),ev('src/components/queues/QueuesComparisonDashboard.tsx',128,132),ev('src/hooks/business/useQueuesComparison.ts',74,84)],['ROOT-P07'],
    'Validar a ordem no handler e no contrato de consulta, ajustar ou invalidar o fim quando o início mudar, e apresentar o erro antes de aplicar. Provar as duas ordens de seleção.', ['7.11'])

add('R2-QUE-008','P2','Filas com o mesmo nome compartilham indevidamente a série do radar',
    'Duas filas ativas e visíveis têm o mesmo name e métricas distintas. O schema local permite nomes repetidos: queues possui PK por id e não há UNIQUE de nome no histórico adjudicado pelo revisor de banco.',
    'Object.fromEntries indexa os cinco eixos pelo nome e preserva apenas o último valor de cada nome. Os Radar usam id como chave React, mas dataKey continua sendo o nome. Duas filas com 10 e 5 contatos ficam ambas ligadas ao valor 50% da segunda.',
    'A comparação pode desenhar os mesmos valores para filas distintas, embora a tabela e a lista de barras conservem entradas separadas. Não se afirma que o renderer foi executado nem que existem nomes duplicados em produção.',
    [ev('src/components/queues/QueuesComparisonCharts.tsx',34,45),ev('src/components/queues/QueuesComparisonCharts.tsx',88,94),ev('src/components/queues/QueuesComparisonDashboard.tsx',201,207),ev('supabase/migrations/20251220130243_14f0f8fe-6186-499e-8eee-e7d0f8e9cfd8.sql',2,12)],['ROOT-P08'],
    'Indexar as séries pelo id estável da fila e manter name somente como rótulo. Provar nomes iguais e distintos, inclusive uma fila fora das quatro séries exibidas.', ['7.9'])

add('R2-QUE-009','P2','Falha ao buscar atendentes é apresentada como fila já completa',
    'Na primeira abertura do diálogo Adicionar Atendente, a consulta de profiles retorna erro explícito, como 42501.',
    'fetchProfiles registra o erro e encerra loading sem estado de erro. Como profiles permanece vazio, o diálogo exibe Todos os atendentes já estão nesta fila. A mesma mensagem também não distingue ausência de perfis ativos de associação completa.',
    'Uma falha de leitura pode ser interpretada como ausência de pessoas a adicionar, sem tentativa de recuperação visível no diálogo. Nenhum acesso não autorizado ou associação real foi realizado.',
    [ev('src/components/queues/AddMemberDialog.tsx',38,58),ev('src/components/queues/AddMemberDialog.tsx',76,92),ev('src/components/queues/QueuesView.tsx',99,112)],['ROOT-P09'],
    'Separar erro, ausência de perfis ativos e todos já associados; oferecer repetição e manter resultados anteriores identificados como desatualizados quando aplicável.', ['7.5'])

add('R2-QUE-010','P2','Resposta de um período antigo sobrescreve a comparação mais recente',
    'O usuário troca o período enquanto a consulta anterior está em andamento; a consulta mais recente termina primeiro e a antiga retorna depois, com o hook ainda montado.',
    'Cada callback fecha sobre dateRange, mas ambos escrevem no mesmo estado. isMountedRef impede escrita após desmontagem; não identifica a geração da consulta. O último retorno, mesmo antigo, substitui queuesPerformance e loading.',
    'O seletor permanece no período novo enquanto os gráficos e a tabela mostram as métricas do período anterior. O probe reproduz a inversão de 2 para 1 mensagem usando duas promises ordenadas, sem medir latência real.',
    [ev('src/hooks/business/useQueuesComparison.ts',23,37),ev('src/hooks/business/useQueuesComparison.ts',74,84),ev('src/hooks/business/useQueuesComparison.ts',133,151),ev('src/components/queues/QueuesComparisonDashboard.tsx',32,46),ev('src/components/queues/QueuesComparisonDashboard.tsx',128,132)],['ROOT-P10'],
    'Cancelar a consulta anterior ou conferir uma geração/chave de período antes de publicar o resultado. Provar retornos em ambas as ordens e desmontagem, preservando o controle existente.', ['7.9','7.11'])

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
 'src/components/queues/PeriodSelector.tsx','src/components/queues/QueuesComparisonCharts.tsx','src/components/queues/QueuesComparisonDashboard.tsx',
 'src/components/queues/QueueAlertsDisplay.tsx','src/components/queues/AddMemberDialog.tsx','src/components/queues/CreateQueueDialog.tsx',
 'src/components/queues/SLAAgentTable.tsx','src/components/queues/SLAMetricCards.tsx','src/components/sla/SLAHistoryDashboard.tsx','src/components/sla/SLACharts.tsx',
 'src/pages/QueuesComparison.tsx','src/pages/SLAHistory.tsx','src/pages/queue-details/QueueContactsTable.tsx','src/components/dashboard/SLAMetricsDashboard.tsx',
 'src/components/docs/SystemFeaturesView.tsx','src/components/docs/featuresSectionsData.ts','src/pages/lazyViews.ts','generate_audit_pdf.ts',
]
manual_path=OUT/'manual-review.json'
if manual_path.exists():
    manual=json.loads(manual_path.read_text())
    assert manual['source_head']==HEAD
    for r in manual['files']:
        assert r['review_status']=='SEMANTIC_FILE_REVIEW' and r['git_blob_sha']==files[r['path']]['git_blob_sha']
        assert r['line_start']==1 and r['line_end']==len((SOURCE/r['path']).read_bytes().splitlines())
        full_read.append(r['path'])
full_read=list(dict.fromkeys(full_read))
coverage = [dict(ev(p,1,len((SOURCE/p).read_text().splitlines())),review_level='SEMANTIC_FILE_REVIEW',scope='Leitura e rastreio de contratos; sem homologação visual/live.') for p in full_read]
covered = set(full_read)
acl_path=OUT/'routine-acl-review.json'
if acl_path.exists():
    acl=json.loads(acl_path.read_text())
    assert acl['source_head']==HEAD and acl['status']=='COMPLETED_REVIEW_PASS'
    for u in acl['units']:
        assert u['coverage_level']=='semantic'
        r=u['source']
        coverage.append(dict(ev(u['path'],r['start_line'],r['end_line'],u['adjudication']),review_level='TARGETED_RANGE_REVIEW',scope='Dedicated routine ACL semantic pass; exact statement ranges, no live execution.'))
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
 {'candidate':'CreateQueueDialog apaga o rascunho quando a criação é recusada','disposition':'REJECTED_BY_ERROR_PROPAGATION','basis':'O consumidor passa useQueues.createQueue, que verifica error e relança a exceção. O diálogo aguarda esse resultado antes de limpar/fechar; o finally apenas retira loading. Não se confunde com saveGoal, que absorve a falha.'},
 {'candidate':'Nome repetido de fila é bloqueado por UNIQUE','disposition':'REJECTED_BY_SCHEMA_REVIEW','basis':'A tabela possui PK(id), name NOT NULL e nenhuma UNIQUE de nome no histórico/manifest revisados; o radar deve usar identidade estável.'},
 {'candidate':'O PDF de auditoria gerado comprova a saúde atual do produto','disposition':'HISTORICAL_STATIC_ARTIFACT_ONLY','basis':'generate_audit_pdf.ts imprime data e texto fixos de 14/05/2026, sem execução de testes ou leitura de evidências atuais. A saída determinística corrige drift do arquivo, não valida suas afirmações históricas.'},
]

def save(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
save('findings.json',{'schema_version':1,'head_sha':HEAD,'reviewer':'root','findings':findings,'rejected_or_limited':rejected})
save('coverage.json',{'schema_version':1,'head_sha':HEAD,'files':coverage,'limitations':['AST/import graph and citation indexing are structural; semantic coverage is separately grounded in the explicit ranges below.','Only explicit read ranges are claimed; a whole-file read does not imply all runtime inputs were tested.']})
save('omitted-source-adjudication.json',{'schema_version':1,'head_sha':HEAD,'two_missing_source_adjudications':True,'task_headings':10,'new_tasks_added_to_original_ledger':0,'tasks':plan_rows})

lines = ['# Revisão transversal: cobertura, requisitos, Filas e SLA','',f'Código examinado: `{HEAD}`. Passagem iniciada em 3 de outubro de 2026, com complementação em 4 de outubro de 2026 (UTC).','',
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
lines += ['## Leitura suplementar e controles da prova', '',
    'O lote próprio de testes JS/TS tem 77 arquivos e 19.008 linhas, adjudicados individualmente em [test-review.md](test-review.md) e [test-review.json](test-review.json). O apoio de 45 arquivos da frente Inbox conserva autoria e faixas nos dois journals peer; seus arquivos são contados uma vez pelo owner no denominador global.', '',
    'O lote Bash próprio tem 12 arquivos e 3.529 linhas, incluindo SQL embutido, fixtures, assertivas e limpeza. [shell-review.md](shell-review.md) registra tanto controles positivos quanto limites precisos; [shell-review.json](shell-review.json) fixa os hashes e faixas 1..EOF. Nenhum desses roteiros de banco foi executado.', '',
    'A revisão cruzada de ACL de rotinas abrange 730 instruções e 965 linhas, com 587 textos únicos inspecionados e sem promoção de arquivos SQL inteiros. A trilha está em [routine-acl-review.json](routine-acl-review.json).', '',
    'O complemento de estilos/referências registra 11 arquivos e 1.443 linhas em [style-review.md](style-review.md), com a regra de foco do preset Diversity encaminhada para revisão independente de Auth. Outras 18 configurações de desenvolvimento/agentes, com 804 linhas, estão em [config-review.md](config-review.md). Declarações de MCP, extensões, presets e regras de editor não foram tratadas como instalação ou execução.', '',
    'O validador de export tem uma reprodução primária (ROOT-EXPORT-P01) e dois controles comportamentais (C01/C02), executados apenas com node falso e diretório temporário. [export-validation-probe-results.json](export-validation-probe-results.json) distingue esses casos; nenhum banco ou import foi executado. A revisão independente anterior do núcleo GOV003/GOV004 permanece em [peer-review-gov003-gov004.md](peer-review-gov003-gov004.md); os dois exemplos Bash acrescentados depois estão sustentados pelo journal suplementar.', '']
(OUT/'report.md').write_text('\n'.join(lines))
print(json.dumps({'root_findings':len(findings),'coverage_entries':len(coverage),'omitted_task_headings':len(plan_rows),'out':str(OUT)}))
