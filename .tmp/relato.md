Especialista: worker (telas)

## Retomada (conflito com a ponta atual)
Cartão de retomada: a entrega anterior estava parada por conflito com a ponta do dia. O workspace novo abriu sobre a ponta dia/2026-10-13 (HEAD inicial 453e6b69f9). Trouxe os 6 commits do trabalho anterior com `git cherry-pick 3a74f8908d..b88940c2c`, resolvi os conflitos preservando o que já tinha entrado na ponta e ajustei só o necessário.

Antes de mexer conferi que o defeito do pedido (X147) ainda existia na ponta: a tela 11 desenhava o ritmo com um `AreaChart` de buckets de minuto e a tela 12 idem, sem janela (60/30/15), sem série "Previsto" e sem balão de término. A lacuna existia.

FAIXA DO PAI: commits 7b73d5815c, 72acd8306d, f58fe6f9c3, 4f914b5e96, b114cc840d, b88940c2c do cartão TL-156 (branch v2/tl-156-ritmo-series-telas-11-12-r2) — são deste cartão por retomada (o cartão manda trazê-los), não são trabalho novo.

## O que mudou e por quê
- src/components/talkx/tracking/TalkXRateChart.tsx (novo, do pai): card do ritmo com séries Enviadas (área), Entregues (tracejada, pelo minuto da entrega) e Previsto (tracejada, só com forecast), select de janela que muda a janela da série, balão "Término estimado" e linha de teto — fecha o X147.
- src/components/talkx/tracking/talkxRatePanel.ts (novo, do pai): funções puras das séries/janela/previsto usadas pelo card (buildRateSeries, forecastFromCampaign).
- src/components/talkx/TalkXLiveMonitor.tsx (tela 11): o rail troca o AreaChart de buckets pelo TalkXRateChart com janela/previsto/término; o TalkXHealthCard que já tinha entrado na ponta segue no mesmo rail (resolução do conflito preservando os dois lados).
- src/components/talkx/TalkXCampaignRunning.tsx (tela 12): TabOverview passa a receber rateCard/rateSeries e mantém o insight "Pico de Respostas" (replyGrowthPct) que já tinha entrado na ponta; a query de histórico passa a devolver rows+at+buckets+replyGrowthPct (a aba Resultados continua consumindo buckets).
- src/hooks/integrations/useTalkXMonitor.ts (1 linha, do pai): expõe isFetching para o estado "buscando" do monitor.
- src/components/talkx/__tests__/TalkXRateChart.test.tsx (novo, do pai): prova o card (séries, janela, previsto e término).
- src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx: adiciona ReferenceLine ao mock de recharts. Sem isso o teste da aba Configurações quebrava ao renderizar o card novo do ritmo (o mock de recharts não tinha ReferenceLine). É ajuste mínimo de teste exigido pela entrada do card; é o "vermelho antes" abaixo.

## Como resolvi cada conflito (preservando o que já tinha entrado na ponta)
- props de TabOverview: união — mantive rateCard/rateSeries (do pai) e replyGrowthPct (da ponta).
- query de histórico: união — { rows, at } (do pai) + { buckets, replyGrowthPct } (da ponta).
- TalkXLiveMonitor: mantive no mesmo rail o TalkXHealthCard (da ponta) e o TalkXRateChart (do pai).
- o card antigo de buckets (chartData + TalkXQueryBoundary do ritmo) saiu junto com o card novo do pai; os dados da ponta (segmentos, resultados/buckets, Pico de Respostas) seguem intactos.

## Prova
- vermelho antes: `npx vitest run src/components/talkx` → `Test Files 1 failed | 110 passed (111)` — `TalkXCampaignActionsCard.test.tsx` : `No "ReferenceLine" export is defined on the "recharts" mock`.
- verde depois: `npx vitest run src/components/talkx` → `Test Files 111 passed (111)`, `Tests 957 passed (957)` (inclui o novo TalkXRateChart.test.tsx).
- lint dos arquivos tocados: `npx eslint src/components/talkx/TalkXCampaignRunning.tsx src/components/talkx/TalkXLiveMonitor.tsx src/components/talkx/tracking/talkxRatePanel.ts src/components/talkx/tracking/TalkXRateChart.tsx src/hooks/integrations/useTalkXMonitor.ts` → sem saída (0 problemas).

## O que NÃO fiz e por quê
- Não alterei recharts/mock de nenhum outro teste, nem código fora dos arquivos do cartão (evidência + testes deles + os arquivos novos do item X147).
- Não toquei em DDL/Edge/migration nem adicionei dependência.
