# feat(tarefas): cards de KPI no nível da imagem 01 (subtítulos, anel do limite, tempo médio)

Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/TasksKpiStrip.tsx`: os cinco cartões da faixa de KPIs passaram a ter o estado da imagem 01.
  - **Atrasadas** (§3.1 linha 41, etapa 017): com >0 o tile é o de alerta (`bg-destructive/15`) e o subtítulo é "Requer atenção" em `text-destructive`; com 0 o tile fica **neutro** (`bg-muted`) e o subtítulo é "Tudo em dia".
  - **Para hoje** (§3.1 linha 42, etapa 018): tile âmbar (`bg-kpi-yellow`, antes azul) e subtítulo "Vencem hoje"; com 0 o subtítulo é "Nada vence hoje" e o tile continua âmbar.
  - **Fazendo** (§3.1 linha 43, etapa 019): o ícone deu lugar a um **anel SVG de progresso** (`data-testid="kpi-ring"`, `strokeDasharray/offset` = fração `doing/limite`) no tile azul (`bg-kpi-blue`, antes roxo); subtítulo "Em andamento" abaixo do limite e "Limite atingido" em `text-destructive` em `n >= limite` (o limite é lido de `WIP_LIMITS.doing.hard`, sem número à mão).
  - **Concluídas · 7 dias** (§3.1 linha 44, etapa 020): o rótulo era "Concluídas (7d)"; agora traz o subtítulo "Últimos 7 dias" no tile verde.
  - **Tempo médio** (§3.1 linha 45, etapas 021–022): deixou de mostrar `Math.round(avgCycleTimeDays)+'d'` (o ciclo) e passou a usar **`avgLeadTimeDays`** formatado por **`formatLeadTime`** do T03 — "1,4 dias" / "1 dia" / "—" (D13: da criação à conclusão), com o subtítulo "Da criação à conclusão" e o ícone de relógio no tile neutro.
- `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` (NOVO): prova de comportamento do cartão.
- `src/components/tasks/__tests__/TasksModule.test.tsx`: o contrato antigo da faixa foi atualizado para o novo — rótulo "Concluídas · 7 dias", tile âmbar no "Para hoje", tile azul no "Fazendo" e o tamanho do valor (ver decisão abaixo). Nenhuma asserção foi removida; os subtítulos e o anel ganharam asserções novas.

## Decisão declarada (escala do valor)
A imagem 01 pede o valor dos KPIs em 26px, mas o guard-rail de tipografia do repo proíbe tamanho arbitrário acima de 16px — o teto é a escala do Tailwind. Mantive **24px (`text-2xl`)** nos quatro contadores e **20px (`text-xl`)** só no **Tempo médio**, porque "1,4 dias" é o único valor com unidade e estoura a coluna de ~80px em 360px (evita rolagem horizontal). É a menor mudança que cabe na escala e preserva a leitura.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx` → `Test Files 1 failed (1); Tests 11 failed (11)` (o card ainda mostrava `9d` do ciclo e não existia `kpi-subtitle`).
- verde depois: `npx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx` → `Test Files 2 passed (2); Tests 45 passed (45)`.
- regressão da área: `npx vitest run src/components/tasks` → `Test Files 24 passed (24); Tests 259 passed | 1 todo (260)`.
- typecheck/lint: `npx eslint <3 arquivos>` ESLINT=0 e `npx tsc --noEmit` TSC=0.
- casos do teste novo (kpiStripTarefas.test.tsx): Atrasadas vermelho/"Requer atenção" com 1 e neutro/"Tudo em dia" com 0; Para hoje âmbar/"Vencem hoje" e "Nada vence hoje" com 0; Fazendo "3/3" com subtítulo destrutivo e anel com `offset = 0`, e "1/3" com "Em andamento" e `offset = c*2/3`; Concluídas · 7 dias com "Últimos 7 dias"; Tempo médio com `avgCycleTimeDays=9` e `avgLeadTimeDays=1.4` mostrando "1,4 dias" (e "—"/"1 dia"); e `axe` sem violações.

## O que NÃO fiz e por quê
- Não acrescentei clique/filtro (etapa 023), faixa compacta (025), esqueleto (027) nem animação com mola (028): são do cartão filho `t_0c220fdd`; o anel é SVG estático, sem `framer-motion`.
- Não toquei em `src/components/tasks/TasksSeasonStrip.tsx` (t_173a1e12) nem em `TasksModule.tsx`.
- Sem migration, sem dependência nova, sem arquivo fora da lista do cartão.
