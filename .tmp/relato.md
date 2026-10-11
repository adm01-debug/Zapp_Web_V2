Especialista: worker (design) (design-system-zapp)

# feat(tarefas): cards de KPI no nível da imagem 01 (subtítulos, anel do limite, tempo médio) — refazer 1

## Ponto 1 (do "corrigir" do revisor): diff grande demais
O revisor recusou com "diff de 98179 caracteres é grande demais para revisão completa" e mandou remover do commit arquivos irrelevantes.
A causa era a faixa de pais inteira cherry-pickada (primitivos do T11, presets do T04, régua de datas do T03, tipo do contato do T05): o cartão não lê nada disso além do T03.
Correção: **descartei os cherry-picks irrelevantes e trouxe só a fatia do T03 que o `TasksKpiStrip` usa** — `avgLeadTimeDays` em `KpiSnapshot`/`kpis()` e `formatLeadTime` (`src/hooks/tasks/workItemAggregates.ts`, com o teste do agregado). Módulos não lidos pela faixa saíram do diff. O curto reduziu de ~95 mil para ~34 mil caracteres (unified=2), abaixo do teto de 60 mil do nível "normal".

## O que mudou e por quê
- `src/components/tasks/shared/TasksKpiStrip.tsx`: os cinco cartões ganharam o estado da imagem 01.
  - **Atrasadas** (etapa 017): com valor > 0 o tile é o de alerta (`bg-destructive/15`) e o subtítulo "Requer atenção" em `text-destructive`; com 0 o tile fica **neutro** (`bg-muted`) e o subtítulo é "Tudo em dia".
  - **Para hoje** (etapa 018): tile âmbar (`bg-kpi-yellow`, antes azul) e subtítulo "Vencem hoje" / "Nada vence hoje".
  - **Fazendo** (etapa 019): o ícone deu lugar a um **anel SVG** (`data-testid="kpi-ring"`, `aria-hidden="true"`, `strokeDasharray/offset` = fração `doing/limite`) no tile azul; subtítulo "Em andamento" abaixo do limite e "Limite atingido" em `text-destructive` no teto lido de `WIP_LIMITS.doing.hard` (sem número à mão).
  - **Concluídas · 7 dias** (etapa 020): rótulo novo + subtítulo "Últimos 7 dias" no tile verde.
  - **Tempo médio** (etapas 021–022): deixou de mostrar `Math.round(avgCycleTimeDays)+'d'` e passou a usar `avgLeadTimeDays` com `formatLeadTime` do T03 — "1,4 dias" / "1 dia" / "—" —, subtítulo "Da criação à conclusão" e ícone de relógio.
- `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` (NOVO): prova de comportamento do cartão.
- `src/components/tasks/__tests__/TasksModule.test.tsx`: contrato antigo da faixa atualizado (rótulo "Concluídas · 7 dias", tile âmbar no "Para hoje", tile azul no "Fazendo", tamanhos, subtítulos e anel). Nenhuma asserção removida.

## Decisão declarada (escala do valor)
A imagem 01 pede o valor em 26px, mas o guard-rail de tipografia do repo proíbe tamanho arbitrário acima de 16px fora de `kpi-value`/`page-title`. Mantive **24px (`text-2xl`)** nos quatro contadores e **20px (`text-xl`)** só no **Tempo médio**, porque "1,4 dias" é o único valor com unidade e estoura a coluna em 360px (evita rolagem horizontal).

## Prova
- vermelho antes (com `TasksKpiStrip.tsx` na versão da `dia`, o teste novo): `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx` → `Test Files 1 failed (1)` / `Tests 11 failed (11)`.
- verde depois: `npx vitest run .../kpiStripTarefas.test.tsx .../TasksModule.test.tsx src/hooks/tasks/__tests__/workItemAggregates.test.ts` → `Test Files 3 passed (3)` / `Tests 106 passed (106)`.
- regressão da área: `npx vitest run src/components/tasks src/hooks/tasks` → `Test Files 31 passed (31)` / `Tests 364 passed | 1 todo (365)`.
- `npx tsc --noEmit` → TSC=0; `npx eslint` nos 5 arquivos → ESLINT=0.
- classes/tokens usados existem em `dia/2026-10-11`: `text-2xs` em `tailwind.config.ts` linha 28 (11px), `bg-kpi-*`/`text-kpi-*-fg` já usados em `ContactKpiCard`/`KpiStrip`, `bg-muted`/`text-muted-foreground`/`bg-destructive/15`/`text-destructive` do tema.
- jsdom não calcula layout/cor (armadilha da `design-system-zapp` §3): a asserção de anel mede os atributos do SVG que o componente REAL aplica, e o contraste de token já é coberto pelo gate do CI; não afirmo contraste medido em navegador.

## O que NÃO fiz e por quê
- Não trouxe o resto da faixa não integrada (T11 primitivos, T04 presets, T05 tipo do contato): não são lidos por `TasksKpiStrip`.
- Não acrescentei clique/filtro (023), faixa compacta (025), esqueleto (027) nem animação com mola (028): são do cartão filho `t_0c220fdd`. O anel é SVG estático, sem `framer-motion`.
- Sem migration e sem dependência nova.
