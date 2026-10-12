Especialista: iris

Refazer 2 do cartão `feat(tarefas): cards de KPI no nível da imagem 01` (t_174e6d38, área iris — telas e componentes). Esta rodada reescreveu só o relato; o código é o mesmo da rodada anterior (cherry-pick do commit `be8806e72` "fix(tarefas): refaz KPIs da faixa de tarefas").

## Resposta ponto a ponto à recusa anterior (numeração dela)

Ponto 1 — hook podado (resolvido):
`src/hooks/tasks/workItemAggregates.ts` só ganha `avgLeadTimeDays` (campo no `KpiSnapshot` e valor em `kpis()`, de `created_at` → `completed_at`) e `formatLeadTime`. Não há `AgendaDayCounts`, `agendaDayCounts`, `agendaDayAriaLabel`, `daySubtitle`, `subtitle` de grupo de dia, mudança em `DayGroup`/`groupUpcomingByDay` nem import novo de `localDayKey` ou `format`: o diff não mexe em import nenhum. O `import { localDayKey } from '@/lib/localDay'` (linha 5) e o import de `date-fns` que restam são pré-existentes na base e servem a `groupUpcomingByDay`/`agendaDayDots`, que a poda não tocou.
Prova: `git diff HEAD~2 HEAD~1 -- src/hooks/tasks/workItemAggregates.ts` dá 17 inserções e nenhuma delas é de agenda nem de import; `grep -nE "daySubtitle|agendaDayCounts|agendaDayAriaLabel" src/hooks/tasks/workItemAggregates.ts` → 0 linhas; `head -5` do arquivo é idêntico ao `git show dia/2026-10-12:src/hooks/tasks/workItemAggregates.ts | head -5` (nenhum import mudou).

Ponto 2 — teste podado (resolvido):
`src/hooks/tasks/__tests__/workItemAggregates.test.ts` só acrescenta 2 casos: `avgLeadTimeDays mede criação -> conclusão mesmo sem started_at` e `formatLeadTime escreve dias em pt-BR com uma casa decimal`; o import não traz mais `agendaDayCounts`, `agendaDayAriaLabel`, `daySubtitle` nem `localDayKey`.
Prova: `git diff HEAD~2 HEAD~1 -- src/hooks/tasks/__tests__/workItemAggregates.test.ts | grep -E "^\+\s+it\("` lista exatamente esses 2 casos (31 inserções).

Ponto 3 — relato bate com o diff (resolvido):
A lista de arquivos, o tamanho e o comportamento descritos abaixo são o diff real do commit de código. FATOS MEDIDOS do diff final do branch contra a base do dia: 7 arquivos, 4 de teste, 13 casos de teste novos (11 em `kpiStripTarefas.test.tsx` + 2 em `workItemAggregates.test.ts`), 396 inserções e 50 remoções — dos quais o relato `.tmp/relato.md` responde por 1 arquivo, e o código por 6 arquivos (345 inserções, 21 remoções, 23797 caracteres). Nenhum arquivo de guarda, manifesto, workflow, migration ou Edge Function foi tocado.

Ponto 4 — especialista (corrigido nesta rodada):
A PRIMEIRA linha deste relato é `Especialista: iris`, sem o sufixo `(area-front-hooks)` que a rodada anterior usava. Área do cartão: iris (telas e componentes).

Ponto 5 — tamanho final do diff (corrigido nesta rodada):
Diff final do branch contra a base do dia (`git diff dia/2026-10-12...HEAD --stat` e `... | wc -c`), medido agora: 7 arquivos rastreados no total — 6 de código (345 inserções, 21 remoções, 23797 caracteres) mais o próprio arquivo do relato (`.tmp/relato.md`, que também é rastreado nesta base). Na medição da rodada anterior, onde o relato entrava na conta do fechar, o total reportado foi 7 arquivos, 376 inserções e 35 remoções.
Para comparar, as rodadas anteriores medidas do mesmo jeito: `e84632e6c` (entrega original) = 22 arquivos, 1754 inserções, 40 remoções, 98566 caracteres; `e4421de60` (refazer 1) = 6 arquivos, 589 inserções, 40 remoções, 44470 caracteres. Ou seja: saiu dos ≈98 mil caracteres da entrega original e dos ≈43 mil do refazer 1 para 23797 caracteres de código agora.

## O que foi trazido do e4421de60 e o que foi podado

Trazido do refazer 1 (`e4421de60`, o relato do refazer 1, e o commit de código dele `33d4478fa`): o recorte de tela (`src/components/tasks/shared/TasksKpiStrip.tsx`, 120 inserções, com os 5 cards e o anel SVG) e o seu teste (`src/components/tasks/__tests__/kpiStripTarefas.test.tsx`, 152 inserções), a atualização de contrato de `src/components/tasks/__tests__/TasksModule.test.tsx` (44 inserções) e, do T03, apenas `avgLeadTimeDays` + `formatLeadTime` com os 2 casos de teste.

Podado do refazer 1: do hook saíram `format` (import de `date-fns`), o bloco `AgendaDayCounts`/`agendaDayCounts`/`agendaDayAriaLabel` e o auxiliar de subtítulo de grupo de dia (`110` → `17` inserções); do teste do hook saíram todos os casos de agenda (`151` → `31` inserções). O texto do relato 1 também foi substituído (`52` linhas alteradas → texto novo). Acrescentado na poda (não existia no refazer 1): `src/components/inbox/tabs/__tests__/TasksTab.test.tsx` com `avgLeadTimeDays: null` no mock tipado, para o campo novo do `KpiSnapshot` não quebrar um chamador real.

## Etapas do plano (referência de aceite: `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, §3.1)

- Etapa 017 — Card Atrasadas — §3.1 linha 41: `| KPI Atrasadas (círculo vermelho com alerta, "2", "Requer atenção") | PARCIAL | 016–017 |`. Feito: `>0` → tile destrutivo + "Requer atenção"; `0` → tile neutro + "Tudo em dia". `TasksKpiStrip.tsx:132`.
- Etapa 018 — Card Para hoje — §3.1 linha 42: `| KPI Para hoje (relógio âmbar, "4", "Vencem hoje") | PARCIAL | 018 |`. Feito: tile âmbar + "Vencem hoje"; com `0` → "Nada vence hoje". `TasksKpiStrip.tsx:140`.
- Etapa 019 — Card Fazendo — §3.1 linha 43: `| KPI Fazendo (anel azul, "3/3", "Limite atingido" em vermelho) | PARCIAL (sem anel nem subtítulo) | 019 |`. Feito: anel SVG (`data-testid="kpi-ring"`) com fração `doing/limite`, "Em andamento" abaixo do limite e "Limite atingido" em tom destrutivo no teto (`WIP_LIMITS.doing.hard`). `TasksKpiStrip.tsx:66,123,147`.
- Etapa 020 — Card Concluídas — §3.1 linha 44: `| KPI Concluídas · 7 dias (check verde, "5", "Últimos 7 dias") | PARCIAL | 020 |`. Feito: rótulo "Concluídas · 7 dias", subtítulo "Últimos 7 dias", tile verde. `TasksKpiStrip.tsx:154,156`.
- Etapa 022 — Card Tempo médio — §3.1 linha 45: `| KPI Tempo médio ("1,4 dias", "Das tarefas concluídas") | PARCIAL (arredonda para "1d") | 021–022 |`. Feito: `avgLeadTimeDays` + `formatLeadTime` (D13, cartão T03) e subtítulo "Da criação à conclusão", relógio neutro. `TasksKpiStrip.tsx:162,163`.

## Provas

- Verde (rodado agora, neste workspace): `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts src/components/inbox/tabs/__tests__/TasksTab.test.tsx` → `Test Files 4 passed (4)`, `Tests 106 passed (106)`.
- Vermelho antes (medido na rodada do refazer 1, mesma base `dia/2026-10-11` e mesmo teste, com `TasksKpiStrip.tsx`/`workItemAggregates.ts` ainda sem a correção): `bunx vitest run …/kpiStripTarefas.test.tsx …/workItemAggregates.test.ts` → `Test Files 2 failed (2)`, `Tests 13 failed` (ex.: subtítulo "Requer atenção" recebido como `<sem elemento>`; `avgLeadTimeDays` recebido como `undefined`; `formatLeadTime is not a function`).
- Casos de comportamento do cartão (`kpiStripTarefas.test.tsx`, 11): "com atrasadas: tile vermelho e subtítulo 'Requer atenção' em tom destrutivo", "sem atrasadas: tile neutro e subtítulo 'Tudo em dia', sem tom destrutivo", "tile âmbar e 'Vencem hoje' quando há algo para hoje", "com 0 diz 'Nada vence hoje' e mantém o tile âmbar", "mostra 'n/3', anel azul de progresso e 'Limite atingido' no limite", "abaixo do limite: 'Em andamento' e anel proporcional (1/3)", "usa o rótulo novo, o subtítulo 'Últimos 7 dias' e o tile verde", "usa avgLeadTimeDays com a formatação pt-BR do cartão T03, não o ciclo", "sem dados mostra o travessão (—)", "um dia exato escreve '1 dia' no singular", "não tem violação de axe e mantém os 5 cards".
- `git diff --check`: exit 0, sem saída.

## Autorrevisão de escopo

- Diff do commit de código: 6 arquivos, 345 inserções, 21 remoções, 1 commit sobre a base do dia.
- Nenhum arquivo de guarda, manifesto, workflow, migration, Edge Function, exportação/importação ou edição em massa.
- Sem migration, sem dependência nova, sem escrita em banco/rede e sem tratamento de erro novo.
- O único arquivo fora de `tasks/` é um teste de chamador (`TasksTab.test.tsx`), ajustado ao campo novo obrigatório da interface; os outros fora da lista restrita do cartão são o próprio T03 declarado em `DEPENDÊNCIA` (`workItemAggregates.ts` + teste).
