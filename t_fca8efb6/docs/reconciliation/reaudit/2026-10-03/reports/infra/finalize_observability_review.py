"""Only audit documents are written. No product module/script is executed."""
from pathlib import Path
from collections import Counter, defaultdict
import json
import re
import hashlib
from build_observability_review import BASE, SRC, OUT, HEAD, build, digest

def dump(name, value):
 (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def evidence(path, first, last, why):
 p=SRC/path
 assert 1<=first<=last<=len(p.read_text().splitlines()), path
 return dict(path=path,line_start=first,line_end=last,sha256=digest(p),baseline_sha=HEAD,origin='source',reason=why)

def task(plan, task_id, sub):
 p=Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation/tasks')/(plan+'.json')
 t=next(x for x in json.loads(p.read_text())['tasks'] if x['id']==task_id)
 return dict(plan_record_id=plan,task_id=task_id,canonical_id=t['canonical_id'],previous_status=t['status'],previous_assessment=t.get('assessment'),affected_subcontract=sub,proposed_status=t['status'],baseline_task_file='tasks/'+p.name,baseline_task_sha256=digest(p))

def finding(n,title,description,chain,preconditions,effect,refs,acceptance,limits,priority='P2',tasks=None):
 return dict(id=f'R2-INF-{n:03d}',title=title,severity=priority,classification='novo',area_extension='finite_observability_batch',baseline_sha=HEAD,description=description,consumer_chain=chain,preconditions=preconditions,effect=effect,evidence=[evidence(*x) for x in refs],acceptance=acceptance,affected_tasks=tasks or [],probe_ids=[f'INF-OBS-P{n-25:02d}'],related_previous_findings=[],novelty_basis='Mecanismo de fonte adicional aos104 achados anteriores; não implica regressão posterior. Fronteiras coordenadas com root, providers e revisão de módulos; limites específicos abaixo.',proof_type='STATIC_AND_BOUNDED_SYNTHETIC_OFFLINE',limitations=['Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão.']+limits)

diag='src/hooks/system/useDiagnosticsData.ts'
view='src/components/diagnostics/DiagnosticsView.tsx'
monitor='src/components/monitoring/hooks/useMonitoringData.ts'
dashboard='src/components/monitoring/EvolutionMonitoringDashboard.tsx'
perf='src/components/performance/PerformanceMonitor.tsx'
snap='src/hooks/analytics/usePerformanceSnapshots.ts'
web='src/lib/web-vitals.ts'

findings=[
 finding(26,'Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis',
  'fetchSystemHealth mede a duração de consultas de banco e listagem de Storage, mas não inspeciona seus campos error. O status depende apenas de latência; um erro que retorna rápido vira healthy. Realtime é definido diretamente como healthy sem subscribe/ack/status. DiagnosticsView converte isso em Saudável, Canal de tempo real ativo e, quando a Edge também retorna sem erro, Todos os sistemas operacionais.',
  ['ViewRouter autoriza diagnostics e monta DiagnosticsView','useDiagnosticsData dispara coleta inicial/intervalo30s ou refresh','Respostas normais com error retornam rápido → database/storage healthy; realtime constante','HealthBadge e resumo operacional afirmam saúde'],
  ['Usuário admitido no gate da rota abre diagnósticos.','A consulta/listagem resolve com error em menos dos limiares500ms/1000ms, ou o canal Realtime está indisponível sem erro correspondente nas outras consultas.'],
  'O operador pode interpretar falha de permissão/serviço como saúde confirmada; o painel não distingue teste com falha, teste não realizado e sucesso. O achado não presume que todo error prove indisponibilidade global: ele prova que a saúde exibida não é sustentada pela coleta.',
  [(diag,137,167,'Duração usada como status; error ignorado e realtime constante'),(diag,249,275,'Coleta inicial/periódica e refresh'),(view,31,42,'healthy é apresentado como Saudável'),(view,72,86,'Realtime ativo sem medição e hook consumidor'),(view,237,270,'Resumo de todos os sistemas operacionais'),('src/pages/ViewRouter.tsx',129,151,'Gate de autorização precede montagem do painel')],
  ['Representar sucesso, falha de coleta e não testado separadamente; só avaliar latência de resultado bem-sucedido.','Marcar Realtime a partir de estado/ack observado com validade temporal ou mostrar não medido.','Teste com SELECT/List retornando error rápido não pode produzir Saudável; falha de autorização deve ser distinguida de serviço fora do ar.','Manter controle existente de error nas Edge Functions e derivar resumo apenas de sinais válidos.'],
  ['Probe executa callback real com interfaces falsas; texto da UI foi verificado no fonte, sem renderização React.','API001/API037 cobrem autorização e contagens globais da Edge webhook-diagnostic, que são mecanismos separados. Não se alegou acesso anônimo às rotas.']),
 finding(27,'SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks',
  'useMonitoringData consulta connection_health_logs a partir do período selecionado (padrão12h). computeUptime filtra mais24h sobre esse resultado já reduzido, sem recuperar as horas faltantes, e devolve100% quando não há checks. O mesmo estado abastece Uptime24h e SLA últimas24h; o heatmap7dias recebe os mesmos logs filtrados. Sua grade indica corretamente células sem dados, mas o badge agregado também mostra100% no vazio e o gauge de SLA diz Atingido.',
  ['evolution-monitor abre com period12h ou usuário escolhe1h','Consulta filtra healthLogs por esse período','computeUptime/heatmap calculam sobre dados incompletos para24h/7d','Cards fixos24h/7d e gauge de99.5% interpretam o valor'],
  ['Há seleção inferior à janela anunciada, ou o conjunto de checks resolvido está vazio.','Para o caso numérico, um check saudável está na última hora e outro com falha está oito horas antes, ambos nas últimas24h.'],
  'Sem mudança dos checks, selecionar1h produz uptime100% e selecionar24h produz50%, enquanto o texto de SLA permanece24h. Zero checks resulta SLA atingido. Não é medida observada de disponibilidade ou violação real de contrato de serviço; é inconsistência na janela e na suficiência do dado usado pelo painel.',
  [(monitor,9,18,'Filtro adicional24h e default100% sem amostras'),(monitor,68,83,'Consulta limitada pelo período antes de calcular uptime'),('src/components/monitoring/hooks/useEvolutionMonitoring.ts',10,23,'Período inicial12h e encaminhamento da seleção'),('src/components/monitoring/MonitoringStatsCards.tsx',83,92,'Título Uptime24h e Sem dados apenas no subtítulo'),('src/components/monitoring/MonitoringSLAPanel.tsx',16,42,'Gauge interpreta100 como SLA atingido'),('src/components/monitoring/MonitoringSLAPanel.tsx',46,69,'Descrição últimas24h e counts'),(dashboard,310,328,'Mesmo dataset encaminhado ao SLA e heatmap'),('src/components/monitoring/MonitoringAvailabilityHeatmap.tsx',43,89,'Grade 7 dias, células vazias diferenciadas e agregado vazio100')],
  ['Consultar a janela prometida por cada painel ou ajustar seu título, critério e tooltip à seleção efetiva.','Representar ausência de checks como dado insuficiente, sem sucesso do SLA ou porcentagem100 por default.','Definir e mostrar janela real/quantidade/cobertura de checks; tratar limite2000 e paginação antes de afirmar completude.','Fixar teste com check falho fora de1h mas dentro de 24h, e caso zero checks; preservar o estado cinza correto da grade.'],
  ['Probe usa duas linhas sintéticas e queries filtradas em memória; nenhum dado real de disponibilidade foi coletado.','Porcentagem de checks não é automaticamente disponibilidade ponderada por duração. Esta auditoria não impõe uma nova definição de SLA; exige coerência com a janela/estado anunciados.','Rótulos adicionais Checks(7d) sobre últimos50 e Última hora sobre health logs sem cutoff constam da cobertura como extensões de apresentação, sem novos IDs.']),
 finding(28,'Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora',
  'fetchData calcula buckets de tamanhos variáveis, mas usa chaves de hora civil tanto para a âncora quanto para cada mensagem. Em7d há sete âncoras diárias na hora atual; mensagens de outras horas do dia não encontram chave e são ignoradas no gráfico, embora contem no total. Em1h seis âncoras de10min geram chaves HH:00 repetidas, reduzindo a resolução a uma ou duas entradas.',
  ['Seleção7d ou1h em EvolutionMonitoringDashboard','fetchData recebe mensagens do período com sucesso','Loop de buckets usa intervalos diários/10min, lookup usa hora literal','MonitoringMessageChart plota hourlyData com soma diferente do total'],
  ['Resposta de messages contém linhas válidas dentro do período selecionado; não depende de erro, truncamento de API ou dados malformados.','Em7d ao menos uma mensagem está em hora diferente da âncora diária.'],
  'O volume/forma da série apresentados ao operador podem divergir do tráfego consultado. No probe, duas mensagens válidas somam total2 e apenas1 chega à área plotada; em1h seis buckets previstos viram dois.',
  [('src/components/monitoring/hooks/types.ts',3,13,'Duração e quantidade de buckets por período'),(monitor,84,104,'Totais e chave por hora incompatível com bucketSize'),(dashboard,196,206,'Cards e gráfico consomem o mesmo messageStats'),('src/components/monitoring/MonitoringMessageChart.tsx',37,73,'Série e período são apresentados ao usuário')],
  ['Agrupar por índice temporal floor((timestamp-início)/bucketSize), ou por uma política equivalente explicitamente definida, e formatar o rótulo somente após agrupar.','Garantir que cada mensagem elegível entre em exatamente um bucket e que soma dos buckets corresponda aos totais do mesmo conjunto.','Testar limites inicial/final, horas diferentes no mesmo dia em7d, seis intervalos10min em1h e fusos/virada de dia.'],
  ['Probe executa o callback real e as funções auxiliares com respostas completas em memória; usa UTC explicitamente.','Não inferido volume real, limite efetivo do PostgREST ou comportamento em horário de verão a partir do caso sintético.']),
 finding(29,'Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g',
  'collectMetrics transforma ausência de performance.memory em0MB/256MB e0% de uso, e ausência de navigator.connection em4g/RTT0. Esses valores recebem status good e entram com o mesmo peso no score; o payload salvo não inclui uma indicação de não medido. Navegação/pintura ausentes também viram0. A UI pode declarar Excelente com parcela relevante dos critérios inventada como default.',
  ['Rota performance autorizada monta PerformanceMonitor','collectMetrics lê APIs disponíveis e preenche defaults para APIs ausentes','Três critérios de memória/rede recebem good sem observação','Score/indicador Excelente e saveSnapshot propagam os defaults'],
  ['Navegador não fornece memory ou connection (ou entradas de timing ainda não estão disponíveis).','Os demais critérios têm valores bons para o exemplo100; gravação real depende de profile.id e sucesso do INSERT.'],
  'O score e o histórico tentado confundem desconhecido com bom. No mesmo fixture de navegação/DOM, APIs ausentes dão100 pontos; memória90%,2g e RTT500 observados dão63. Isso não mede diferença real entre navegadores, apenas demonstra a contribuição indevida dos valores de substituição.',
  [(perf,26,56,'Defaults e critérios good das medições ausentes'),(perf,70,97,'Score, payload e coleta periódica'),(perf,165,187,'Texto Excelente e apresentação do score/histórico'),(snap,32,55,'Payload segue para INSERT se profile existir'),('src/pages/ViewRouter.tsx',80,84,'Rota produtiva de PerformanceMonitor')],
  ['Usar estado indisponível/não medido para APIs ou entries ausentes; não fabricar valor numérico normal.','Calcular score apenas sobre medições válidas e exibir sua cobertura, ou não emitir score quando a amostra for insuficiente.','Persistir validade/origem das medições para que histórico não trate defaults como observações.','Teste com memory/connection ausentes deve mostrar cobertura parcial e nenhum4g ou memória livre presumidos; controle com APIs válidas deve manter classificação correspondente.'],
  ['Callback real executado com objetos de navegador falsos; payload capturado em saveSnapshot falso, sem gravação real.','Testes de metricThresholds isolados não provam a coleta: PerformanceMonitor possui thresholds inline; teste de suporte inicial foi lido, não executado como gate.']),
 finding(30,'Limpar snapshots informa remoção mesmo quando DELETE devolve erro',
  'clearOldSnapshots aguarda a cadeia delete().lt(), mas ignora o resultado com error. Como erro normal de SDK pode resolver a Promise, o catch não roda, o hook dispara Dados antigos removidos e recarrega histórico. O botão Limpar antigos da rota performance chama esse caminho diretamente.',
  ['Usuário clica Limpar antigos','DELETE resolve com {error:...}','Retorno não é inspecionado → toast.success','loadHistory roda apesar da limpeza rejeitada'],
  ['A chamada DELETE retorna erro por envelope resolvido, em vez de lançar rejeição.','Usuário está admitido na rota performance; não se pressupõe qual política/serviço originou o erro.'],
  'Confirmação falsa de uma ação solicitada e nenhuma orientação para tentar novamente ou corrigir a causa. O probe faz o mesmo callback mostrar sucesso para error resolvido e erro para Promise rejeitada.',
  [(snap,78,90,'Retorno de DELETE ignorado antes da confirmação'),(perf,145,161,'Botão produtivo chama clearOldSnapshots'),(snap,58,76,'loadHistory verifica seu próprio error, mas não confirma a remoção')],
  ['Inspecionar error do DELETE antes de anunciar sucesso e propagar causa de falha de forma tratável.','No erro, preservar estado e avisar que a limpeza não foi confirmada; não converter simples recarga em prova de remoção.','Cobrir envelope {error} e rejeição, mais controle de sucesso; manter período selecionado ao recarregar.'],
  ['Nenhuma exclusão real executada e nenhuma inferência de RLS/global delete baseada na ausência de filtro de profile_id.','Hook coordenado com revisão de módulos: não há ID duplicado criado por ela para este callback.']),
 finding(31,'Coletor local rotula agregações incompatíveis como CLS e INP',
  'O observador CLS soma shifts por toda a sessão visível, sem separar janelas; o INP usa o maior duration bruto, sem contar interações ou desconsiderar um pico por 50. As definições atuais usam maior janela de shifts para CLS e descartam um maior valor de interação por 50 no INP. O erro se manifesta no Map/log do coletor próprio inicializado em main, cujo getRating consulta o budget correto sobre um valor agregado incorretamente.',
  ['main inicializa web-vitals.ts','Observadores acumulam shifts e maior event.duration','pagehide/visibilitychange chama onMetric','Map/getWebVitalsReport e log de desenvolvimento expõem CLS/INP divergentes'],
  ['Navegador fornece entries de layout-shift/event e ocorre flush.','CLS: shifts separados por mais de1s; INP:50 interações distintas com um pico isolado.'],
  'Diagnóstico local contra o budget pode classificar estabilidade/responsividade incorretamente. No fixture, dois shifts0.06 separados por2s produzem0.12 em vez de0.06;50 interações com pico1000 e segundo valor160 produzem1000 em vez de160. PrioridadeP3 porque o consumidor confirmado é local/desenvolvimento: info é suprimido em produção e não foi identificado consumidor produtivo adicional de getWebVitalsReport.',
  [(web,34,64,'Threshold correto é aplicado ao valor agregado e salvo no Map/log'),(web,111,141,'Soma de shifts e máximo bruto de event.duration'),(web,143,166,'Flush por visibilidade/pagehide'),(web,185,187,'Export de relatório local'),('src/main.tsx',30,33,'Coletor próprio e Speed Insights são inicializações separadas'),('src/lib/logger.ts',50,64,'info/debug desativados fora de DEV'),('src/lib/__tests__/web-vitals-budget.test.ts',22,49,'Teste verifica targets/rating, sem exercitar observadores ou agregação')],
  ['Usar implementação mantida das métricas ou implementar integralmente janelaCLS e cálculoINP por interação com os limites definidos.','Preservar o consumo dos thresholds do budget, separado da medição do valor.','Comparar fixtures de shifts separados/mesma janela e49/50+ interações com referência; incluir visibilidade e BFCache conforme a política adotada.','Não usar o resultado local como prova de métricas do Speed Insights sem demonstrar a cadeia real de dados.'],
  ['Probe executa o módulo completo em VM com PerformanceObserver/DOM/logger falsos e entradas sintéticas; não certifica Web Vitals de browser ou tráfego real.','Nenhuma falha atribuída à coleta independente do Speed Insights ou aos gates de tamanho de bundle.','P008E36 e P041033 já são PARTIAL; apenas o subcontrato do coletor local recebe evidência adicional.'],priority='P3',tasks=[task('P008','E36','Agregação CLS/INP do coletor próprio, sem alterar aceite de budget ou statusPARTIAL.'),task('P041','033','Coletor local e qualidade do valor; envio/RUM independente continua com limites já registrados.')]),
]
findings[-1]['external_references']=[
 {'url':'https://web.dev/articles/cls','retrieved_on':'2026-10-04','source_kind':'primary_documentation','supports':'CLS é a maior janela de shifts, com intervalo entre shifts inferior a1s e duração máxima5s; a soma vitalícia é a definição anterior.'},
 {'url':'https://web.dev/articles/inp','retrieved_on':'2026-10-04','source_kind':'primary_documentation','supports':'INP considera interações lógicas, descartando uma maior a cada50; não é máximo incondicional de todos os eventos.'},
]

coverage=build()
probes=json.loads((OUT/'observability-probes.json').read_text())
assert probes['case_count']==6
assert set(probes['finding_ids'])=={f['id'] for f in findings}
for p in json.loads((OUT/'observability-probe-pins.json').read_text())['sources']:
 assert digest(SRC/p['path'])==p['sha256']

duplicates=[
 {'related_id':'R2-API-001','disposition':'não duplicado','note':'Gates/auto-fix do webhook-diagnostic ficam com providers; INF026 é inferência de saúde no cliente.'},
 {'related_id':'R2-API-037','disposition':'não duplicado','note':'Tráfego global atribuído por instância fica com providers; INF027/028 usam leituras próprias e cálculos do cliente.'},
 {'related_id':'R2-API-043','disposition':'não duplicado','note':'AIProviderHealthPanel e filtro ai-proxy ficam com providers.'},
 {'related_id':'P008/E36 e P041/033','disposition':'extensão documental, status preservado','note':'Ambos PARTIAL. Fórmula do coletor local é evidência nova de subcontrato pendente; não reabre budgets DONE_VERIFIED.'},
 {'related_id':'P008/E24 e relatório REPLAY_LOCAL_MIGRATIONS_2026-10-03','disposition':'limite histórico preservado, não contado','note':'Faixa400–700LIDs já explicitada em57–60; comunicada à revisão de banco para evitar falsa novidade.'},
]
dump('observability-findings.json',dict(schema_version=1,area='infra_observability',baseline_sha=HEAD,counts=dict(Counter(f['severity'] for f in findings)),findings=findings,duplicates_and_coordination=duplicates))

report=[
 '# Revisão de monitoramento, diagnósticos e desempenho', '',
 f'Fonte fixa: `{HEAD}`. Leitura integral de 27 arquivos primários,4.550 linhas; 37 arquivos no lote incluindo apoios, 32 semânticos integrais e 5 dirigidos. Não houve execução do produto.', '',
 '## Resultado', '',
 'Seis achados adicionais: cinco P2 e um P3. Os seis casos sintéticos abaixo sustentam esses seis achados; não são seis descobertas adicionais. As rotas passam pelo gate de papéis/permissões do ViewRouter. Não há alegação de acesso anônimo, incidente de produção ou indisponibilidade real.', '',
 '| ID | Prioridade | Contrato observado |', '|---|---|---|',
 *[f"| {f['id']} | {f['severity']} | {f['title']} |" for f in findings], '',
 '## Evidência comportamental delimitada', '',
 '| Probe | Fonte realmente executada | Fixture e resultado | Limite |', '|---|---|---|---|',
 '| INF-OBS-P01 | callback fetchSystemHealth | SELECT/List com error rápido → DB/Storage saudáveis; Realtime constante; Edge.error → degraded no controle | SDK e latência falsos; UI lida no fonte |',
 '| INF-OBS-P02 | fetchData + computeUptime | mesmos dois checks →100% em1h,50% em24h; vazio→100%/0checks | Não mede SLA real |',
 '| INF-OBS-P03 | fetchData e loop de buckets | duas mensagens7d →total2/plot1; seis âncoras1h→duas chaves | Dados completos e UTC explícito |',
 '| INF-OBS-P04 | collectMetrics | memória/rede ausentes→score100; controle observado90%/2g/500ms→63 | Payload capturado, sem INSERT |',
 '| INF-OBS-P05 | clearOldSnapshots | DELETE.error resolvido→sucesso/recarga; rejeição→toast.error | Nenhum DELETE real |',
 '| INF-OBS-P06 | módulo web-vitals completo em VM | CLS0.12 vs referência0.06; INP1000 vs160 em50interações | Coletor próprio local, sem Vercel RUM |', '',
 'Os sete arquivos executados como texto e o compilador foram verificados por SHA256 antes da importação do compilador. VM recebeu interfaces falsas explícitas; nenhum hook React, SDK, handler Edge ou biblioteca de analytics do produto foi importado. Compilar trechos com transpileModule não é typecheck, build ou suíte completa.', '',
]
for f in findings:
 report += [f"## {f['id']} — {f['title']}",'',f['description'],'','**Precondições:** '+' '.join(f['preconditions']),'','**Efeito:** '+f['effect'],'','**Evidência:**','']
 report += [f"- `{e['path']}:{e['line_start']}–{e['line_end']}` — {e['reason']}. SHA256 `{e['sha256']}`." for e in f['evidence']]
 report += ['','**Critérios de aceite:**','',*[f'- {x}' for x in f['acceptance']],'','**Limites:** '+' '.join(f['limitations']),'']
 if f['affected_tasks']:
  report += ['**Planos:** '+'; '.join(f"{t['plan_record_id']}/{t['task_id']} permanece {t['previous_status']}: {t['affected_subcontract']}" for t in f['affected_tasks']), '']
 if f.get('external_references'):
  report += ['**Definições primárias consultadas:** [CLS](https://web.dev/articles/cls) e [INP](https://web.dev/articles/inp), consultadas em04/10/2026. A primeira usa a maior janela de shifts; a segunda descarta um pico por 50interações. Essas definições fundamentam somente a referência dos fixtures do coletor local.','']

report += [
 '## Controles preservados e observações sem novo ID','',
 '- O roteador espera papéis/permissões e nega acesso antes de montar views restritas. Os achados de UI pressupõem admissão no gate.',
 '- ConnectionHealthPanel faz polling de dados armazenados com sinal/timeout e usa ação manual para a Edge. Não se atribuiu auto-fix a esse polling.',
 '- A grade do heatmap diferencia corretamente células sem dados. A falha está no agregado/janela anunciados, não na cor de toda célula vazia.',
 '- O cartão Checks(7d) de ConnectionHealthPanel usa os últimos50checks, sem cutoff7d; MonitoringEventTimeline mistura mensagens1h com15healthlogs sem cutoff1h. São extensões do contrato temporal documentadas na cobertura, sem multiplicar o número de mecanismos.',
 '- Conectar/reiniciar trata data.error===true; não foi registrada falha genérica de toast nesses ramos.',
 '- HotRoutePrefetcher está montado, respeita saveData/2g e tem cancel flag para novos imports. Ganho de navegação permanece sem medição, coerente com P008E35.',
 '- OptimizedImage/Avatar, VirtualizedList/Grid e Prefetcher legado tiveram leitura integral, mas a busca de consumidores produtivos só encontrou definições/exports nos caminhos relevantes. Estados de imagem ou callbacks de fim latentes não foram promovidos a problemas de fluxo ativo.',
 '- Testes de threshold/getRating não exercitam automaticamente coleta; o teste web-vitals-budget completo valida a origem dos alvos, não o algoritmo dos observadores.',
 '- SentryIntegrationView, AIProviderHealthPanel, webhook-diagnostic e Shadow Webhooks ficaram com providers; nenhum achado novo deste lote os substitui.',
 '- A assertiva de400–700LIDs está no relatório histórico de replay. Sua descoberta por leitura integral é revalidação de limite conhecido, não novo incidente.', '',
 '## Cobertura por arquivo','',
 'observability-coverage.json contém SHA256, contagem de linhas, faixa lida e avaliação de função/ramo por arquivo. Todos os27 primários estão com 1–EOF. Apoios de rota, main, Index e teste parcial continuam dirigidos. src/hooks/monitoring não existe nesta fonte.', '',
 '| Arquivo | Nível | Faixas | Avaliação |', '|---|---|---|---|',
 *[f"| `{e['path']}` | {e['review_level']} | {', '.join(f'{a}–{b}' for a,b in e['reviewed_ranges'])} | {e['review_basis']} |" for e in coverage['inventory']], '',
 '## Lacunas remanescentes','', *[f'- {g}' for g in coverage['remaining_gaps']], '',
 'Nenhum pedido de deploy, SQL, credenciais ou teste de produto é necessário para revisar estes resultados. Correções de produção ficam para etapa autorizada própria; a entrega atual preserva a fonte auditada.', '',
]
text='\n'.join(report)
(OUT/'observability-report.md').write_text(text)

# Preserve all earlier25 findings, then merge only our finite batch.
main=json.loads((OUT/'findings.json').read_text())
new_ids={f['id'] for f in findings}
prior=[f for f in main['findings'] if f['id'] not in new_ids]
assert len(prior)==25
prior_hash=hashlib.sha256(json.dumps(prior,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
main['findings']=prior+findings
main['observability_review']=dict(coverage='observability-coverage.json',findings='observability-findings.json',report='observability-report.md',probes='observability-probes.json',added_ids=sorted(new_ids),preserved_prior_findings_sha256=prior_hash)
dump('findings.json',main)

def merge_ranges(spans):
 merged=[]
 for a,b in sorted(spans):
  if merged and a<=merged[-1][1]+1: merged[-1][1]=max(merged[-1][1],b)
  else: merged.append([a,b])
 return merged

combined=json.loads((OUT/'coverage.json').read_text())
inventory={x['path']:x for x in combined['inventory']}
for e in coverage['inventory']:
 old=inventory.get(e['path'])
 if old is None:
  inventory[e['path']]=dict(e,binary=False,lexical_signals={})
  continue
 assert old['sha256']==e['sha256']
 spans=old.get('reviewed_ranges',old.get('reviewed_line_ranges',[]))
 if old['review_level']=='semantic' and not spans: spans=[[1,old['lines']]]
 merged=merge_ranges(spans+e['reviewed_ranges'])
 old['reviewed_ranges']=old['reviewed_line_ranges']=merged
 old['full_file_read']=merged==[[1,old['lines']]]
 old['review_level']='semantic' if old['full_file_read'] else 'targeted'
 marker=' Observabilidade: '
 old['review_basis']=old.get('review_basis','').split(marker)[0]+marker+e['review_basis']
 old['observability_review']=dict(artifact='observability-coverage.json',reviewed_ranges=e['reviewed_ranges'],primary_delegated=e['primary_delegated'])
combined['inventory']=sorted(inventory.values(),key=lambda e:e['path'])
cc=Counter(e['review_level'] for e in combined['inventory'])
combined['counts']={'total':len(inventory),**dict(cc)}
layers=defaultdict(Counter)
for e in combined['inventory']: layers[e['layer']][e['review_level']]+=1
combined['layers']={k:{'total':sum(v.values()),**dict(v)} for k,v in sorted(layers.items())}
combined['observability_review']=dict(artifact='observability-coverage.json',primary_files=27,primary_lines=4550,counts=coverage['counts'],primary_remaining_not_fully_read=0)
dump('coverage.json',combined)

main_report=(OUT/'report.md').read_text()
marker='\n## Ampliação finita — observabilidade, diagnósticos e desempenho\n'
main_report=main_report.split(marker)[0].rstrip()+'\n'
severity=Counter(f['severity'] for f in main['findings'])
main_report=re.sub(r'## Resultado: \d+ mecanismos adicionais \([^\n]+\)',f"## Resultado: {len(main['findings'])} mecanismos adicionais ({severity['P1']} P1, {severity['P2']} P2, {severity['P3']} P3)",main_report,count=1)
main_report='\n'.join(line for line in main_report.splitlines() if not any(line.startswith(f'| {fid} |') for fid in new_ids))+'\n'
table='\n'.join(f"| {f['id']} | {f['severity']} | {f['title']} | novo; lote observabilidade delegado |" for f in findings)
main_report=main_report.replace('\n## Evidência executada e limites',table+'\n\n## Evidência executada e limites',1)
main_report=re.sub(r'Foram inventariados \d+ arquivos: \d+ com revisão semântica, \d+ com revisão dirigida e \d+ com revisão estrutural\.',f"Foram inventariados {len(inventory)} arquivos: {cc['semantic']} com revisão semântica, {cc['targeted']} com revisão dirigida e {cc['structural']} com revisão estrutural.",main_report,count=1)
start=main_report.index('| Camada | Semântica | Dirigida | Estrutural | Total |')
end=main_report.index('\n\nWiring preservado:',start)
layer_table='| Camada | Semântica | Dirigida | Estrutural | Total |\n|---|---:|---:|---:|---:|\n'+'\n'.join(f"| {k} | {v.get('semantic',0)} | {v.get('targeted',0)} | {v.get('structural',0)} | {v['total']} |" for k,v in combined['layers'].items())
main_report=main_report[:start]+layer_table+main_report[end:]
main_report+=marker+'\n'+text.replace('# Revisão de monitoramento, diagnósticos e desempenho','### Revisão de monitoramento, diagnósticos e desempenho',1)
(OUT/'report.md').write_text(main_report)

# Validate source evidence and declared ranges once for the completed union.
refs=0
for f in main['findings']:
 for e in f.get('evidence',[]):
  if e.get('origin','source')!='source': continue
  assert digest(SRC/e['path'])==e['sha256'],e['path']
  assert 1<=e['line_start']<=e['line_end']<=len((SRC/e['path']).read_text().splitlines()),e['path']
  refs+=1
for e in combined['inventory']:
 assert digest(SRC/e['path'])==e['sha256'],e['path']
 for a,b in e.get('reviewed_ranges',[]): assert 1<=a<=b<=e['lines'],e['path']
integrity=dict(schema_version=1,baseline_sha=HEAD,source_hashes_checked=len(combined['inventory']),evidence_refs=sum(len(f.get('evidence',[])) for f in main['findings']),source_evidence_refs=refs,finding_total=len(main['findings']),finding_counts=dict(severity),coverage_counts=combined['counts'],observability_ids=sorted(new_ids),observability_primary_files=27,observability_primary_lines=4550,observability_primary_unread=0,preserved_prior_findings_sha256=prior_hash,artifact_hashes={name:digest(OUT/name) for name in ['findings.json','coverage.json','report.md','observability-findings.json','observability-coverage.json','observability-report.md','observability-probes.json','probe-observability.mjs','observability-probe-pins.json','build_observability_review.py','finalize_observability_review.py']})
dump('observability-integrity.json',integrity)
print(json.dumps({'findings':len(main['findings']),'severity':dict(severity),'coverage':combined['counts'],'evidence_refs':refs,'observability_primary_files':27,'observability_primary_lines':4550},ensure_ascii=False))
