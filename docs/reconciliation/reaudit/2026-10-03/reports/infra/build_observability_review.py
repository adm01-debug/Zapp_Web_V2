"""Documentation only: hash/range manifest for the finite observability review."""
from pathlib import Path
from collections import Counter
import hashlib
import json

BASE = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
SRC = BASE / 'source'
OUT = BASE / 'reports/infra'
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'

# Each primary file was read fully in bounded line-numbered batches. This map
# records actual review, not a promotion based on file existence or AST counts.
ASSESSED = {
 'MonitoringDiagnosticPanel.tsx': 'Execução manual do diagnóstico, erro/loading, metadados, recomendações e exportação TXT/PDF. Confronto de dados da Edge com os rótulos; autorização/backend e estatística global permanecem API001/API037, sem nova contagem.',
 'PerformanceMonitor.tsx': 'collectMetrics: Navigation/Paint, memória/rede opcionais, classificação, score, snapshot e timer; histórico/seleção/limpeza e JSX. Ausência de APIs vira valores bons no score; cleanup depende de hook externo. Métricas de cache locais não certificam taxa real.',
 'web-vitals.ts': 'Observadores FCP/LCP/FID/CLS/INP, inicialização idempotente, Map limitado por nome, visibilidade, TTFB e thresholds do budget. CLS soma a vida inteira e INP usa máximo bruto; efeito restrito ao coletor local, separado do Speed Insights.',
 'DiagnosticsView.tsx': 'Cards de conexões/mensagens, HealthBadge, textos de estado operacional, erros e Refresh; segue o hook useDiagnosticsData. Realtime ativo é afirmado a partir de constante, e erros rápidos da coleta podem virar saudáveis.',
 'MonitoringStatsCards.tsx': 'Indicadores por dados, empty state, ratio e sparkline; uptime anunciado 24h vem do período selecionado. Texto Sem dados preservado no subtítulo, mas valor e estilo ainda vêm de 100% por default.',
 'EvolutionMonitoringDashboard.tsx': 'Composição de período, notificações, conexões, webhook, diagnóstico, SLA, heatmap e loading; rastreado que os mesmos healthLogs filtrados abastecem cartões 24h e grade 7d. LastUpdatedBadge exibe relógio, não reivindicação explícita de última coleta.',
 'MonitoringConnectionsList.tsx': 'QR/conectar/reiniciar por instância, chave de pendência, status/latência e mensagens de erro. Ramos data.error===true são tratados; ausência de QR retorna informação. Nenhum envio real ou reinício executado.',
 'useDiagnosticsData.ts': 'Todas as consultas, contagens, erros recentes, saúde DB/Storage/Edge/Realtime, atualização e polling. Retornos error não lançados são ignorados em várias consultas; latência é usada como sucesso e realtime não é testado.',
 'useMonitoringData.ts': 'computeUptime, uptime por instância, sparkline, consultas por período, limites, totais e formação de buckets. Vazio vira100%, consulta já limita janela e chaves por hora divergem de buckets 10min/1d. Erros e concorrência de fetch ficam explicitados.',
 'MonitoringAvailabilityHeatmap.tsx': 'Grade7d/24h, agrupamento de checks, tooltip, ratio e cores. Células sem dados são corretamente cinzas; agregado vazio=100 e dados recebidos podem ser apenas1h/12h. Não se atribuiu saúde a cada célula vazia.',
 'OptimizedImage.tsx': 'IntersectionObserver, lazy image, skeleton, src/srcset/error/load, prioridade, estilos e OptimizedAvatar. Estados não reiniciam em troca de src e props podem substituir handlers, mas busca produtiva só encontrou exports/definições: limitações latentes, sem novo achado de fluxo ativo.',
 'MonitoringEventTimeline.tsx': 'Carga de mensagens1h e últimos15 health logs, merge/ordem/corte, filtro, pausa e intervalo15s. Health logs sem filtro1h podem aparecer sob Última hora; tabela deixa sua idade visível. Nenhuma alegação de canal realtime foi inferida de LiveDot.',
 'ConnectionHealthPanel.tsx': 'Consultas com AbortSignal/timeout, polling visível de dados armazenados, execução manual, resumo/status/histórico. Polled fetch não invoca auto-fix. Checks(7d) usa últimos50 sem filtro temporal; ausência de latência contribui0 na média.',
 'VirtualizedList.tsx': 'Virtualizer, medições/overscan/keys/scroll, empty/loading/end reached e VirtualizedGrid. Callbacks de fim/guardas de coluna têm contratos latentes; nenhum consumidor JSX produtivo encontrado no escopo de busca. Sem promover export a bug ativo.',
 'MonitoringWebhookPanel.tsx': 'Estado/filtros/eventos esperados, cópia, configuração e verificação manual; erros da API tratados. Configuração única e check por instância foram cruzados com API037; nenhum achado duplicado de tráfego global.',
 'useMonitoringActions.ts': 'Invocações de obter/configurar/verificar webhook e diagnóstico, estados loading/result, toast e erros retornados/lançados. Somente leitura de fonte; mutações do handler ficam com providers.',
 'MonitoringHealthLogs.tsx': 'Filtro/status/contadores/tabela, metadados, ordem e empty state; todos os cálculos são do dataset recebido. Não há prova de cobertura temporal maior que o fetch.',
 'MonitoringSLAPanel.tsx': 'Meta99.5, attainment, progresso, contagem e detalhe por instância. Afirma últimas24h com stats derivados do período selecionado; zero amostras resulta Atingido por uptime100.',
 'Prefetcher.tsx': 'Prefetch por hover/delay, hooks/cleanup, loader catch, CriticalRoutePrefetcher e resource hints. Caminhos legados sem consumidor produtivo encontrado; sem inferir ganho de navegação ou bug ativo só por export.',
 'useMonitoringNotifications.ts': 'Estado anterior, transição de conexão, mute/volume/horário silencioso, áudio e desktop notification. Contextos de áudio e preferências de notificação registrados como fronteira de revisão; sem chamar Notification/áudio reais.',
 'LazyRoutes.tsx': 'Mapas de imports dinâmicos, fallbacks Suspense, factory/HOC e placeholders. Exports e nomes conferidos; presença de lazy wrapper não é métrica de bundle/runtime.',
 'HotRoutePrefetcher.tsx': 'Uso ativo pelo Index, política saveData/2g, idle/timer, fila de imports, captura de falha e cancel flag. Cancelamento impede novos imports; não alegado cancelamento de import em andamento.',
 'MonitoringMessageChart.tsx': 'Selecionador de período, toggle enviados/recebidos, área/tooltip e ligação hourlyData. Não reconcilia soma plotada com total consultado; consumidor do defeito de buckets.',
 'metricThresholds.ts': 'Funções puras de limiares; sem estado desconhecido. PerformanceMonitor duplica limiares inline, portanto testes do helper isolado não provam o ramo de coleta no painel.',
 'useEvolutionMonitoring.ts': 'Período inicial12h, refetch, interval, listener de conexão, troca de período e exposição de estados/actions. Sem request fence/abort entre períodos; janela de healthLogs é a seleção atual.',
 'hotRoutePrefetch.ts': 'Tabela das cinco views quentes e decisão por connection/saveData/2g. Nenhum import é executado na declaração; decisão desconhecida permite prefetch.',
 'MonitoringSkeletons.tsx': 'Skeletons acessíveis dos painéis, estrutura, variabilidade visual e nenhum efeito de produto; leitura completa sem achado novo.'
}

def digest(p):
 return hashlib.sha256(p.read_bytes()).hexdigest()

def row(path, assessment, ranges=None, primary=False):
 p=SRC/path
 n=len(p.read_text().splitlines())
 spans=ranges if ranges is not None else [[1,n]]
 assert all(1<=a<=b<=n for a,b in spans), path
 return dict(path=path,sha256=digest(p),bytes=p.stat().st_size,lines=n,
             baseline_sha=HEAD,review_level='semantic' if spans==[[1,n]] else 'targeted',
             reviewed_ranges=spans,full_file_read=spans==[[1,n]],
             primary_delegated=primary,layer='observability_delegated' if primary else 'observability_support',
             review_basis=assessment)

def build():
 targets=json.loads((OUT/'observability-targets.json').read_text())
 inv=[]
 for t in targets['targets']:
  inv.append(row(t['path'],ASSESSED[Path(t['path']).name],primary=True))
 inv.extend([
  row('src/components/monitoring/hooks/types.ts','Tipos de conexão/check/mensagem/uptime, periodMs/bucketCounts e conjunto HEALTHY. Nenhum valor externo validado pelo TypeScript em runtime.'),
  row('src/components/performance/index.ts','Barrel de exports completo; existência de export não promove helper/virtualização a fluxo ativo.'),
  row('src/hooks/analytics/usePerformanceSnapshots.ts','Hook completo: insert de telemetria, query de histórico, auth/profile, janela/limite e clearOldSnapshots. DELETE resolve com error e ainda anuncia sucesso; não inferida RLS/visibilidade global a partir da falta de filtro.'),
  row('src/lib/logger.ts','Logger completo, correlação e filtros DEV. info/debug são suprimidos fora de DEV: resultados do coletor Web Vitals não foram atribuídos a logs de produção ou a Speed Insights.'),
  row('src/pages/ViewRouter.tsx','Mapa das rotas diagnostics/performance/evolution-monitor e gate NavigationService.canAccess após carga de papéis/permissões. Consumo efetivo demonstrado, não alegação de acesso anônimo.',[[1,155]]),
  row('src/pages/lazyViews.ts','Bindings lazy dos três painéis e demais exports no trecho. Não promovida leitura das linhas finais não vistas.',[[1,60]]),
  row('src/pages/Index.tsx','Binding lazy e montagem ativa de HotRoutePrefetcher em Suspense. Trechos restantes fora deste lote.',[[20,40],[115,148]]),
  row('src/main.tsx','Inicialização do coletor manual e import separado de Speed Insights; handlers de erro e preparação do root. Não confundir os dois canais de coleta.',[[1,50]]),
  row('src/components/performance/__tests__/PerformanceMonitor.test.tsx','Inspeção inicial do teste/mocks de navegação, memória/rede e painel. Sem execução ou alegação de cobertura dos demais casos não lidos.',[[1,140]]),
  row('src/lib/__tests__/web-vitals-budget.test.ts','Teste integral verifica origem dos thresholds via mock e getRating; não alimenta PerformanceObserver nem comprova agregação CLS/INP.'),
 ])
 result=dict(schema_version=1,area='infra_observability',baseline_sha=HEAD,source_root=str(SRC),
  scope='Lote finito explicitamente delegado de monitoring, diagnostics, performance, web-vitals e useDiagnosticsData; somente arquivos de produto da matriz sem leitura integral, com apoios declarados.',
  target_snapshot={'file':'observability-targets.json','sha256':digest(OUT/'observability-targets.json'),'matrix_sha256_at_selection':targets['matrix_sha256']},
  counts={'total':len(inv),**Counter(r['review_level'] for r in inv)},
  primary_files=len(targets['targets']),primary_lines=sum(r['lines'] for r in inv if r['primary_delegated']),
  primary_remaining_not_fully_read=0,
  absent_directories=['src/hooks/monitoring'],
  inventory=inv,
  controls=['Nenhum endpoint de produto, SQL, Storage, mensagem, modelo pago ou browser autenticado foi acionado.','Todos os27 corpos primários tiveram leitura integral, com trechos truncados reabertos antes da classificação.','Roteamento e gate de acesso foram lidos; APIs de backend continuam sob revisão providers, sem duplicar API001/API021/API037/API043.','Testes de suporte lidos não contam como teste executado. Probes serão documentados separadamente com pins anteriores à importação.'],
  remaining_gaps=['Sem observação em browser real, permissões atuais, dados de produção, SDK de navegador ou métricas de usuário.','Ramos latentes de componentes exportados sem consumidor produtivo não viraram falhas alcançáveis por suposição.','Não é revisão integral de todos os testes nem de diretórios vizinhos; limites dos apoios permanecem nas faixas por arquivo.'])
 (OUT/'observability-coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 return result

if __name__=='__main__':
 r=build()
 print(json.dumps({'counts':r['counts'],'primary_files':r['primary_files'],'primary_lines':r['primary_lines']},ensure_ascii=False))
