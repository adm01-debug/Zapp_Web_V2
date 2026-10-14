Especialista: worker (telas)

## Retomada (conflito com a ponta do dia)
Cartão de retomada: a entrega anterior ficou parada por conflito. O workspace abriu sobre a ponta `dia/2026-10-13` (HEAD inicial `453e6b69f9`). Trouxe os 6 commits do trabalho anterior por `git cherry-pick 3a74f8908d..b88940c2c`, resolvi os conflitos preservando o que já tinha entrado na ponta e ajustei só o necessário.

Antes de mexer conferi que o defeito (X147) ainda existia na ponta: a tela 11 e a tela 12 desenhavam o ritmo com um `AreaChart` de buckets de minuto, sem janela (60/30/15), sem série "Previsto" e sem balão de término. A lacuna existia.

FAIXA DO PAI: commits `7b73d5815c`, `72acd8306d`, `f58fe6f9c3`, `4f914b5e96`, `b114cc840d`, `b88940c2c` do cartão TL-156 (branch `v2/tl-156-ritmo-series-telas-11-12-r2-261010153273f8`) — são deste cartão por retomada (o cartão manda trazê-los por cherry-pick), não são trabalho novo.

## O que mudou e por quê
- `src/components/talkx/tracking/TalkXRateChart.tsx` (novo): card do ritmo com séries "Enviadas" (área), "Entregues" (tracejada, pelo minuto da entrega) e "Previsto" (tracejada, só com `forecast`), select de janela que muda a janela da série, balão "Término estimado" e linha de teto — fecha o X147.
- `src/components/talkx/tracking/talkxRatePanel.ts` (novo): funções puras das séries/janela/previsto usadas pelo card (`buildRateSeries`, `forecastFromCampaign`).
- `src/components/talkx/TalkXLiveMonitor.tsx` (tela 11): o rail troca o `AreaChart` de buckets pelo `TalkXRateChart` com janela/previsto/término; o `TalkXHealthCard` que já tinha entrado na ponta segue no mesmo rail.
- `src/components/talkx/TalkXCampaignRunning.tsx` (tela 12): `TabOverview` passa a receber `rateCard`/`rateSeries` e mantém o insight "Pico de Respostas" (`replyGrowthPct`) que já tinha entrado na ponta; a query de histórico devolve `rows`+`at`+`buckets`+`replyGrowthPct`.
- `src/hooks/integrations/useTalkXMonitor.ts` (1 linha): expõe `isFetching` para o estado "buscando" do monitor.
- `src/components/talkx/__tests__/TalkXRateChart.test.tsx` (novo): prova o card (séries, janela, previsto e término).
- `src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx`: adiciona `ReferenceLine` ao mock de recharts. Sem isso o teste da aba Configurações quebrava ao renderizar o card novo do ritmo. É ajuste mínimo de teste exigido pela entrada do card; é o "vermelho antes" abaixo.

## Como resolvi cada conflito (preservando o que já tinha entrado na ponta)
- props de TabOverview: união — mantive `rateCard`/`rateSeries` (do pai) e `replyGrowthPct` (da ponta).
- query de histórico: união — `{ rows, at }` (do pai) + `{ buckets, replyGrowthPct }` (da ponta).
- TalkXLiveMonitor: mantive no mesmo rail o `TalkXHealthCard` (da ponta) e o `TalkXRateChart` (do pai).
- o card antigo de buckets (`chartData` + `TalkXQueryBoundary` do ritmo) saiu junto com o card novo do pai; os dados da ponta (segmentos, resultados/buckets, Pico de Respostas) seguem intactos.

## Prova
- vermelho antes: `npx vitest run src/components/talkx` → `Test Files 1 failed | 110 passed (111)` — `TalkXCampaignActionsCard.test.tsx` : `No "ReferenceLine" export is defined on the "recharts" mock`.
- verde depois e prova vermelho→verde dos testes alterados: ver o bloco FATOS MEDIDOS PELO FECHAR no topo deste relato (o fechar roda os testes alterados no commit).
- prova pela tela: o teste novo monta o `TalkXRateChart` REAL (não um mock) e cobre cada série, a troca de janela, a série "Previsto" só com `forecast` e o balão de término.
- lint dos arquivos tocados: `npx eslint src/components/talkx/TalkXCampaignRunning.tsx src/components/talkx/TalkXLiveMonitor.tsx src/components/talkx/tracking/talkxRatePanel.ts src/components/talkx/tracking/TalkXRateChart.tsx src/hooks/integrations/useTalkXMonitor.ts` → sem saída (0 problemas).

## Higiene do fechamento (retomada pedida pelo supervisor)
- Desfeito o `git rm --cached`: o `.tmp/relato.md` versionado voltou a ser rastreado (como na base), então o diff do cartão fica só nos 7 arquivos de código/teste acima, mais o próprio `.tmp/relato.md`, que é artefato da fábrica e já era versionado na base.

## Verificação (`zapp-verify . --rapido`)
- Testes do cartão no commit: `npx vitest run src/components/talkx` → `Test Files 2 passed (2)` / `Tests 15 passed (15)` (vermelho→verde comprovado: na base o `TalkXCampaignActionsCard` quebrava por falta do `ReferenceLine` no mock de recharts).
- `zapp-verify . --rapido`: `db_guard` OK; `tipos` VERMELHO por FALHA DE EXECUÇÃO — o `tsc` do typecheck rápido foi MORTO pelo sistema (`exit 137`, OOM) no meio da rodada. O `jev-juiz falha` classificou como **environment** (certeza 0.94), não como defeito da mudança. Estado da máquina na hora: `load average` 53, 15 processos na fila do pool `pesado` (3 em uso), ~5 GB de RAM livres e swap cheio. Repetida uma vez, a verificação caiu no mesmo ponto de ambiente.
- O `tsc` não chegou a apontar nenhum erro no código do cartão: foi morto antes de terminar a rodada do projeto `app`.

## O que NÃO fiz e por quê
- MOVIMENTO (aviso automático do fechar): é falso positivo. O texto `animate-pulse` aparece só DENTRO do teste, num comentário e numa asserção `expect(classes).not.toContain('animate-pulse')` que justamente prova que o esqueleto NÃO tem a classe nua; o componente anima com `motion-safe:animate-pulse`. Não adicionei nenhuma animação sem `motion-safe:`.
- Não toquei em DDL, Edge Function, migration nem dependência nova.
- Não mexi no script `hermes-tarefa-fechar`, no `.gitignore`, no `.tmp/cartao.md` nem no `.devin`.
- O portão do integrador sinaliza "padrão sensível" por causa da variável local `teto por minuto` (`max_per_minute`) que já existia na tela; não é mudança de política de limite — é só o valor lido para a linha de teto do gráfico.
- Não alterei o mock de recharts de nenhum outro teste, nem código fora dos arquivos do cartão.
