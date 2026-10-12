Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Portei da V3 o isolamento de erro por bloco (`SectionErrorBoundary`) para as telas de SLA e Relatórios. Antes, qualquer erro em um bloco subia e derrubava a tela inteira; agora cada bloco independente mostra o aviso com botão "Tentar novamente" e o resto da tela continua funcionando.

- `src/components/queues/SLADashboard.tsx`: envolve `SLAMetricCards` ("Métricas de SLA"), `SLAAgentTable` ("Desempenho por agente") e as duas abas de configuração ("Configuração Global de SLA", "Regras Granulares de SLA").
- `src/pages/SLAHistory.tsx`: envolve o bloco `SLAHistoryDashboard` ("Histórico de SLA").
- `src/components/reports/AdvancedReportsView.tsx`: envolve as quatro abas de análise — `ConversationHeatmap` ("Mapa de calor"), `PeriodComparison` ("Comparação de períodos"), `DemandForecast` ("Previsão de demanda"), `AbandonmentRate` ("Taxa de abandono") — os mesmos quatro nomes de bloco da V3.

## Prova (3 testes novos)
- vermelho antes: `npx vitest run src/components/queues/__tests__/SLADashboard.isolamentoErro.test.tsx src/pages/__tests__/SLAHistory.isolamentoErro.test.tsx src/components/reports/__tests__/AdvancedReportsView.isolamentoErro.test.tsx` com as três telas na BASE (`git checkout --` nos 3 arquivos de produção) → `Test Files 3 failed (3); Tests 3 failed (3)` (o erro do bloco sobe e derruba a renderização).
- verde depois: `npx vitest run` nos mesmos 3 arquivos → `Test Files 3 passed (3); Tests 3 passed (3)`.
- regressão (telas vizinhas): `npx vitest run` dos 3 arquivos novos + `SLADashboard.redundancia.test.tsx` + `AdvancedReportsView.periodComparison.test.tsx` + `SLADashboard.sidebar-navegacao.test.tsx` → `Test Files 6 passed (6); Tests 14 passed (14)`.

Testes (arquivos novos):
- `src/components/queues/__tests__/SLADashboard.isolamentoErro.test.tsx`
- `src/pages/__tests__/SLAHistory.isolamentoErro.test.tsx`
- `src/components/reports/__tests__/AdvancedReportsView.isolamentoErro.test.tsx`

Cada teste renderiza a TELA real, faz UM bloco lançar erro e confere: (a) aparece o aviso `Erro em "<bloco>"`; (b) o resto da tela (cabeçalho/outra aba/sidebar) continua utilizável. Só os componentes de bloco são mockados, para forçar o erro; a composição (Tabs, header, fallback) é a real.

## Estados da tela alterada
- Erro: é o novo — vem do próprio `SectionErrorBoundary` (borda/fundo do design system, ícone AlertTriangle, botão "Tentar novamente").
- Carregando e vazio: inalterados por este diff; seguem com os estados próprios de cada dashboard.

## O que NÃO fiz e por quê
- Não criei "Filas & Roteamento" nem "Histórico de Entregas": são blocos da V3, mas não existem na V2 (não há `QueueSlaPanel` nem `SLADeliveryHistoryDashboard`). Protegi todos os blocos independentes que existem na V2.
- O card "Base do cálculo de 1ª resposta" em `SLADashboard` ficou fora: é estático (lê só `data` já em memória, sem busca), não é bloco de dados que possa cair.
