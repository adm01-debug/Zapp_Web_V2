Especialista: Íris (area-front-componentes)

Entrega concluída. O cartão pede que o prazo de resolução fique visível e provado; a tela lê e exibe o desfecho de resolução de `conversation_sla`. A ESCRITA desse desfecho é trilha de banco, fora do escopo desta tela de métricas (registrado em `kanban_comment`).

## O que mudou e por quê
- src/hooks/sla/slaResolution.ts (novo): elegibilidade, denominador e taxa do SLA de RESOLUÇÃO, espelho de `slaFirstResponse.ts` — a pendente (sem violação e sem `resolved_at`) não entra no "no prazo" nem no denominador (R2-SLA-001).
- src/hooks/sla/useSLAMetrics.ts: lê `resolution_breached`/`resolved_at` da MESMA linha e expõe `resolution` no overall e por agente; `totalConversations`/`overallRate` seguem de 1ª resposta.
- src/hooks/sla/useSLAHistory.ts: a série diária ganha `resolutionRate`/`resolutionEvaluated`/`resolutionPending`; os totais do período ganham `resolutionEvaluated`/`resolutionPending`/`resolutionBreaches`; `totalBreaches` segue só 1ª resposta.
- src/components/queues/SLAMetricCards.tsx: 4º card "Resolução" (props `resolution` + `sparkRes`), grade `lg:grid-cols-4`; usa os tokens `getRateColor`/`getRateBg` já existentes.
- src/components/queues/SLADashboard.tsx: passa `data.overall.resolution` e `sparkRes` (de `dailyData.resolutionRate`); o card base vira "Base do cálculo de SLA" com avaliadas+pendentes de resolução; subtítulo agora cita resolução; skeleton em 4 colunas.
- `src/components/__tests__/y17Selos.contraste.test.tsx`: fixture `METRICAS_PROPS` ganhou `resolution` e `sparkRes` (contrato novo de props) e o seletor do contador "atrasados" ficou específico (`/^3 atrasados$/`) porque agora o card de Resolução tem o próprio contador — a asserção de contraste segue a mesma.
- src/hooks/sla/index.ts: exporta `slaResolution`.
- Testes novos: `src/hooks/sla/__tests__/slaResolution.test.ts`, `src/hooks/sla/__tests__/useSLAHistory.resolucao.test.tsx`, `src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx`. O mock de `SLADashboard.redundancia.test.tsx` ganhou `resolution` no `overall` (o contrato do hook mudou).

## Prova
- vermelho antes: os 3 arquivos de teste são novos — na base `dia/2026-10-12` não existem, e o código que eles exercitam também não: `git show dia/2026-10-12:src/components/queues/SLAMetricCards.tsx | grep -c "Resolução"` → `0`; `git show dia/2026-10-12:src/hooks/sla/useSLAMetrics.ts | grep -c "resolution"` → `0`.
- verde depois: `npx vitest run src/hooks/sla/__tests__/slaResolution.test.ts src/hooks/sla/__tests__/useSLAHistory.resolucao.test.tsx src/components/queues/__tests__/SLAMetricCards.resolucao.test.tsx` → `Test Files 3 passed (3); Tests 13 passed (13)`.
- sem regressão: `npx vitest run src/components/queues/__tests__/SLADashboard.redundancia.test.tsx src/hooks/__tests__/useSLAMetrics.test.tsx src/hooks/__tests__/useSLAHistory.test.tsx src/components/__tests__/y17Selos.contraste.test.tsx` → `Test Files 4 passed (4); Tests 40 passed (40)`.

## Casos cobertos (melhor e pior)
- Cálculo: pendente fora da conta (2 no prazo / 1 violada / 3 pendentes ⇒ 66,67%); só pendentes ⇒ taxa 0, nunca 100; sem amostra ⇒ `resolutionRatePct` = null.
- Tela: card "Resolução" renderizado com o componente REAL mostra `75.0%` e `9 no prazo` / `3 atrasados` (valores de resolução, distintos dos de 1ª resposta 40/5).
- Série diária: dia com resolvidas+violada+pendente ⇒ `resolutionRate` 66,67% e `resolutionEvaluated` 3; dia só com pendentes ⇒ taxa 0; totais de 1ª resposta intactos.

## Arquivos fora desta tela
- `conversation_sla.resolution_breached`/`resolved_at`: nenhum escritor no repositório (as colunas só existem no schema). A gravação do desfecho é do worker (sql/edge) — pedido em `kanban_comment`. Esta tela não decide regra de banco.
- `SLAHistoryDashboard`: não alterado; os campos novos da série/totais são aditivos e nenhum consumidor existente mudou.

## Estados da tela alterada
- Carregando: skeleton da tela ajustado para 4 colunas. Vazio: card base mostra 0 e o card "Resolução" renderiza `0.0%` (sem amostra ≠ 100%). Erro: inalterado (o hook mantém o retorno de erro atual).
