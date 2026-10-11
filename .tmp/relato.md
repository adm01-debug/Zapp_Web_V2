Especialista: worker (design) (design-system-zapp)

- Verificação rápida (`zapp-verify . --rapido`): OK db_guard 0s; OK tipos 60s; OK lint 1s; OK migrations 1s; AVISO banco_local NÃO VERIFICADO (sem nome de conjunto); VERIFY: VERDE SEM BANCO (62s).

# feat(tarefas): cards de KPI no nível da imagem 01 (subtítulos, anel do limite, tempo médio) — refazer 1

## Como resolvi o motivo da retomada
O motivo registrado foi diff grande demais para revisão completa, com a ordem de remover do commit arquivos irrelevantes.
A causa era a faixa inteira de cartões pai cherry-pickada (primitivos do T11, presets do T04, régua de datas do T03, tipo do contato do T05), mas a faixa de KPIs não lê nada disso além do T03.
Resolução: descartei os cherry-picks irrelevantes e trouxe só a fatia do T03 que o `TasksKpiStrip` usa. O diff caiu para bem abaixo do teto de 60 mil caracteres do nível "normal" (o portão mediu 95277 na entrega anterior).

## Por que os dois arquivos fora da lista de "ARQUIVOS QUE PODE TOCAR" são indispensáveis
`src/hooks/tasks/workItemAggregates.ts` e `src/hooks/tasks/__tests__/workItemAggregates.test.ts` são o próprio cartão T03 declarado em `DEPENDÊNCIA` (a faixa não integrada). São indispensáveis: `TasksKpiStrip.tsx` importa `formatLeadTime` e o campo `avgLeadTimeDays` de `workItemAggregates.ts`, e sem eles o componente nem compila — o critério 1 do cartão ("Tempo médio usa o campo novo e a formatação do cartão T03") não tem como ser cumprido. Trouxe só essa fatia (não o resto da faixa), que é a correção pedida pelo revisor.

## O que mudou e por quê
- `src/components/tasks/shared/TasksKpiStrip.tsx`: os cinco cartões ganharam o estado da imagem 01.
  - **Atrasadas** (etapa 017): com valor maior que 0 o tile é o de alerta (`bg-destructive/15`) e o subtítulo "Requer atenção" em `text-destructive`; com 0 o tile fica neutro (`bg-muted`) e o subtítulo é "Tudo em dia".
  - **Para hoje** (etapa 018): tile âmbar (`bg-kpi-yellow`, antes azul) e subtítulo "Vencem hoje" / "Nada vence hoje".
  - **Fazendo** (etapa 019): o ícone deu lugar a um anel SVG (`data-testid="kpi-ring"`, `aria-hidden="true"`, `strokeDasharray`/`strokeDashoffset` = fração `doing/limite`) no tile azul; subtítulo "Em andamento" abaixo do limite e "Limite atingido" em `text-destructive` no teto, lido de `WIP_LIMITS.doing.hard` (sem número à mão).
  - **Concluídas · 7 dias** (etapa 020): rótulo novo mais subtítulo "Últimos 7 dias" no tile verde.
  - **Tempo médio** (etapas 021–022): deixou de mostrar `Math.round(avgCycleTimeDays)+'d'` e passou a usar `avgLeadTimeDays` com `formatLeadTime` do T03 — "1,4 dias" / "1 dia" / "—" —, subtítulo "Da criação à conclusão" e ícone de relógio.
- `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` (NOVO): prova de comportamento do cartão.
- `src/components/tasks/__tests__/TasksModule.test.tsx`: contrato antigo da faixa atualizado (rótulo "Concluídas · 7 dias", tile âmbar no "Para hoje", tile azul no "Fazendo", tamanhos, subtítulos e anel). Nenhuma asserção removida.
- `src/hooks/tasks/workItemAggregates.ts` + `.../__tests__/workItemAggregates.test.ts`: fatia do T03 (`avgLeadTimeDays` no `KpiSnapshot`/`kpis()` e `formatLeadTime`), com o teste do agregado.

## Decisão declarada (escala do valor)
A imagem 01 pede o valor em 26px, mas o guard-rail de tipografia do repo proíbe tamanho arbitrário acima de 16px fora de `kpi-value`/`page-title`. Mantive 24px (`text-2xl`) nos quatro contadores e 20px (`text-xl`) só no Tempo médio, porque "1,4 dias" é o único valor com unidade e estoura a coluna em 360px.

## Prova
- vermelho antes (com `TasksKpiStrip.tsx` na versão da `dia`, o teste novo): `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx` imprimiu `Test Files  1 failed (1)` e `Tests  11 failed (11)`.
- verde depois: `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` imprimiu `Test Files  3 passed (3)` e `Tests  106 passed (106)`.
- regressão da área: `npx vitest run src/components/tasks src/hooks/tasks` imprimiu `Test Files  31 passed (31)` e `Tests  364 passed | 1 todo (365)`.
- verificação do projeto: `zapp-verify . --rapido` imprimiu `VERIFY: VERDE SEM BANCO (62s)` com `OK db_guard 0s`, `OK tipos 60s`, `OK lint 1s`, `OK migrations 1s`.
- typecheck e lint: `npx tsc --noEmit` imprimiu TSC=0; `npx eslint src/components/tasks/shared/TasksKpiStrip.tsx src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx src/hooks/tasks/workItemAggregates.ts src/hooks/tasks/__tests__/workItemAggregates.test.ts` imprimiu ESLINT=0.
- tokens/classes usados existem: `text-2xs` está em `tailwind.config.ts` linha 28 (11px); `bg-kpi-*`/`text-kpi-*-fg` já são usados em `ContactKpiCard` e `KpiStrip`; `bg-muted`, `text-muted-foreground`, `bg-destructive/15` e `text-destructive` são tokens do tema.
- acessibilidade e anel: o teste renderiza o cartão REAL, confere os atributos SVG que o componente aplica (`strokeDasharray` a partir de `doing/limite`) e roda `axe` com `toHaveNoViolations`.

## Escopo respeitado
- Não trouxe o resto da faixa não integrada (T11 primitivos, T04 presets, T05 tipo do contato): não são lidos por `TasksKpiStrip`.
- Não acrescentei clique/filtro (023), faixa compacta (025), esqueleto (027) nem animação com mola (028): são do cartão filho `t_0c220fdd`. O anel é SVG estático, sem `framer-motion`.
- Sem migration e sem dependência nova.
