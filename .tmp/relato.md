Especialista: semisenior (iris)

## Refazer 1 — espelho do CI no empilhamento (contrato contraste-aa-componentes)
- Ponto 1 (único ponto da recusa: `tests/contracts/contraste-aa-componentes.contract.test.ts` quebra no empilhamento): a causa era minha — a entrega tinha pintado o ícone do cartão "sem dados" em `src/components/sla/SLAHistoryDashboard.tsx` com `text-muted-foreground/60`, e o contrato proíbe exatamente essa cadeia em qualquer fonte (`nenhum texto secundário usa alfa /60 (dava 2,36:1 sobre branco)`). Troquei pela tinta neutra sem alfa (`text-muted-foreground`), a mesma que o código original do arquivo já usava no ícone e a mesma dos outros cartões sem amostra do cartão (`SLAMetricCards`, `SLASummaryCard`); o contrato mede que ela fecha 4,5:1. Nenhuma asserção foi tocada e nenhum outro arquivo mudou neste refazer.

## O que mudou e por quê
- `src/components/sla/SLAHistoryDashboard.tsx`: ícone do estado "Sem dados de SLA no período" de `text-muted-foreground/60` para `text-muted-foreground` — remove a única ocorrência que o contrato de contraste proíbe; visual idêntico em intenção (ícone neutro), agora com razão AA.
- Todo o resto do diff é a entrega anterior (5 painéis com estados "Sem dados"/erro/"Tentar de novo", fim do `?? 100`, sparklines com denominador `evaluatedConversations`, 5 arquivos de teste novos, 3 harnesses vizinhos sem mudar asserção), já descrita abaixo.

## Prova
- vermelho antes (com a entrega, sem este refazer): `./node_modules/.bin/vitest run --config vitest.contracts.config.ts --reporter=dot tests/contracts/contraste-aa-componentes.contract.test.ts` → `FAIL nenhum texto secundário usa alfa /60 (dava 2,36:1 sobre branco)` — `expected [ Array(1) ] to deeply equal []` com `+ "src/components/sla/SLAHistoryDashboard.tsx"`; `Test Files 1 failed (1); Tests 1 failed | 24 passed (25)`.
- verde depois (com este refazer): mesmo comando → `Test Files 1 passed (1); Tests 25 passed (25)`.
- suíte de contratos inteira: `./node_modules/.bin/vitest run --config vitest.contracts.config.ts --reporter=dot` → `Test Files 89 passed (89); Tests 1379 passed (1379)` — nenhum outro contrato quebrou.
- telas do cartão (5 testes novos + 3 vizinhos): `npx vitest run <8 arquivos>` → `Test Files 8 passed (8); Tests 38 passed (38)`.
- verificação do cartão: `zapp-verify . --rapido` → `OK tipos / OK lint / OK migrations / VERIFY: VERDE SEM BANCO (24s)`; `zapp-verify full .` → `OK db_guard / OK tipos / OK lint / OK migrations` e `Test Files 1 failed | 1319 passed (1320); Tests 1 failed | 11923 passed (11963)` — a única falha é `src/components/talkx/__tests__/RuleValueInput.test.tsx` ("em breve": Lead score...), que FALHA TAMBÉM SEM o meu diff (rodei o arquivo com `git checkout --` dos meus 2 arquivos: `Tests 1 failed | 4 passed (5)`), ou seja, pré-existente e de outra área (TalkX, sem nenhum import dos 5 componentes de SLA); o `Errors 1 error` é um WebSocket/undici não tratado no teste realtime do inbox, também fora do meu diff.

## O que NÃO fiz e por quê
- não toquei no contrato nem em nenhuma asserção dele; a correção é no código que o violava.
- não removi o `hasSample: true` do fixture de `src/components/__tests__/y17Selos.contraste.test.tsx`: a prop `hasSample` é obrigatória no `OverallData` e sem a linha o typecheck acusa `TS2322` no vizinho; nenhuma asserção dele mudou.
- não produzi captura (screenshot) claro/escuro: fora dos arquivos permitidos, sem projeto Playwright de visual para as telas de SLA; os 3 estados × 2 temas são provados na saída renderizada.
- não toquei em `src/hooks/sla/**` (área do worker de hooks): o erro é lido como `data === null && !loading` e o "Tentar de novo" invalida a query pelo `useQueryClient`.

---
# Entrega anterior (recusada pelo limpador — mantida para contexto)
## O que mudou e por quê
- `src/components/dashboard/SLAMetricsDashboard.tsx`: tirei o `?? 100` (o erro de consulta pintava 100% verde) e o painel ganhou 2 estados próprios — erro, com "Não foi possível carregar as métricas de SLA" + botão **Tentar de novo** (invalida a query `sla-metrics`), e sem amostra, com o aviso "Sem dados de SLA no período" e a taxa mostrada como '—'. A sparkline "No Prazo" deixou de ser `totalConversations - totalBreaches` e passou a ser `evaluatedConversations - totalBreaches` (a pendente não é sucesso).
- `src/components/queues/SLAMetricCards.tsx`: com `hasSample=false` a taxa geral e a de 1ª resposta viram '—' com tinta neutra (`text-muted-foreground`/`bg-muted/20`) e o rótulo "Sem dados avaliados no período" ocupa o lugar da barra — acabou o 0.0% vermelho sem amostra.
- `src/components/queues/SLADashboard.tsx`: o bloco `if (!data)`, que era o caminho de ERRO da consulta (o queryFn nunca devolve `null`), virou estado de erro explícito com **Tentar de novo**; a sparkline de 1ª resposta saiu de `100 - breaches/totalConversations` para o denominador `evaluatedConversations` (sem avaliada o dia é 0, não 100).
- `src/components/dashboard/sla/SLASummaryCard.tsx`: nova prop obrigatória `hasSample` — sem amostra a taxa vira '—', a barra zera e "Respostas no Prazo"/"Respostas com Violação" viram '—'.
- `src/components/sla/SLAHistoryDashboard.tsx`: erro de consulta ("Não foi possível carregar o histórico de SLA" + Tentar de novo, invalida `sla-history`) separado de "Sem dados de SLA no período" (`!totals.hasSample`), que substitui o resumo e os gráficos; o seletor de período continua visível.
- Cores: só as que o sistema já tem (`text-success`/`text-warning`/`text-destructive` e `text-muted-foreground`); nenhuma cor nova.
- Testes (novos): `src/components/queues/__tests__/SLAMetricCards.semAmostra.test.tsx`, `src/components/queues/__tests__/SLADashboard.sparkline-denominador.test.tsx`, `src/components/dashboard/__tests__/SLAMetricsDashboard.sem-dados-erro.test.tsx`, `src/components/dashboard/sla/__tests__/SLASummaryCard.semAmostra.test.tsx`, `src/components/sla/__tests__/SLAHistoryDashboard.sem-dados-erro.test.tsx` — os 3 estados (dados, sem dados, erro) × claro/escuro, e a geometria das sparklines lida da saída renderizada.
- Testes (harness, sem tocar em asserção): `src/components/queues/__tests__/SLADashboard.redundancia.test.tsx` e `src/pages/__tests__/QueuesComparisonSLA.landmarks.test.tsx` ganharam o `QueryClientProvider` (os componentes passaram a usar `useQueryClient`); `src/components/__tests__/y17Selos.contraste.test.tsx` ganhou `hasSample: true` no fixture de `SLAMetricCards` (a prop passou a ser obrigatória).
- Por que esses 3 arquivos foram indispensáveis (são "testes", que o cartão permite): sem o provider, os dois suites QUEBRAM com `Error: No QueryClient set, use QueryClientProvider to set one` (componentes deixam de renderizar); sem o `hasSample: true`, o typecheck acusa `TS2322` no fixture. Em nenhum dos três a asserção foi mudada, pulada ou afrouxada — só o harness acompanhou o contrato novo dos componentes.

## Prova da entrega anterior
- vermelho antes: `npx vitest run <os 5 arquivos de teste novos>`, com as 5 telas no estado da BASE (`git show HEAD:<arquivo>` restaurado) → `Test Files 5 failed (5); Tests 16 failed | 6 passed (22)` — as 6 que passam são os casos "com dados/com amostra", que valem nos dois códigos; todas as de "sem dados", erro e denominador caem.
- verde depois: mesmo comando → `Test Files 5 passed (5); Tests 22 passed (22)`.
- espinha dorsal (vizinhos das telas tocadas): `npx vitest run src/components/queues src/components/dashboard src/components/sla src/pages/__tests__/SLADashboard.sidebar-navegacao.test.tsx src/pages/__tests__/QueuesComparisonSLA.landmarks.test.tsx` → `Test Files 49 passed (49); Tests 193 passed (193)`.
- verificação do cartão: `zapp-verify . --rapido` → `OK tipos / OK lint / OK migrations / VERIFY: VERDE SEM BANCO (40s)`.
- a prova do denominador não usa mock de resposta: renderiza o dashboard REAL e lê o `polyline`/`path` que o componente pintou (1ª resposta e taxa geral saem com a mesma geometria; com o denominador antigo a linha de "No Prazo" fica reta, porque os dois dias dariam 5).
