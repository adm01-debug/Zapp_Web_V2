Especialista: iris — Íris (area-front-componentes)

## O que mudou e por quê
- src/components/tasks/board/TasksBoardMode.tsx: abaixo de 768 px o rótulo central da faixa de navegação deu lugar a um `tablist` (`data-testid="board-tabs"`) com uma ABA por coluna à vista (role="tab", `aria-selected`), no estilo do ativo conforme D3 — preenchido com a cor primária, a mesma linguagem do seletor de modos e do toggle "Concluídas". Clicar numa aba leva a faixa até a coluna E marca a coluna à vista na hora (`setColunaVisivel` dentro de `irParaColuna`), sem depender do evento de rolagem. As setas (081) e os dots não sofrem remoção: continuam ali para teclado e toque. → etapa 099, plano linha 358; etapa 100, linha 359; D3, linha 159.
- src/components/tasks/board/BoardColumn.tsx: abaixo de 768 px a coluna passa a tomar a largura inteira do trilho (`max-md:basis-full max-md:shrink-0`), então o snap mostra UMA coluna por vez (etapa 099, linha 358); o `flex-1 min-w-[200px]` segue valendo de `md` para cima — o piso de 200 px e o carrossel ficam intactos e, a partir de 1280 px, as cinco colunas (5×200 + 4×12 = 1048 ≤ 1280) cabem sem rolagem (a variante `max-md:*` é a que vence no cascade).
- src/components/tasks/__tests__/quadroAbasResponsivo.test.tsx: novo — quatro casos, renderizando o TasksBoardMode REAL (não mock): (1) "as abas só existem abaixo de 768px e nomeiam cada coluna"; (2) "clicar na aba muda a coluna à vista, mantém o dot em sincronia e usa o estilo ativo do D3"; (3) "abaixo de 768px a coluna toma a largura do trilho (uma por vez) sem perder o piso flexível"; (4) "a partir de 1280px as cinco colunas cabem sem rolagem (o trilho rola só como válvula)".

Etapa 100 — a FAIXA COMPACTA de KPIs (imagem 05, plano linha 133; etapa 025, linha 263) já entra no Quadro: TasksModule passa `density='compact'` no modo board e a faixa sai com `data-density="compact"`, já provado em kpiStripTarefas.test.tsx:219. A parte que faltava da 100 ("estilo das abas conforme D3") é o que este commit entrega; provei a mesma linguagem visual (aba ativa = `bg-primary text-primary-foreground`) no caso 2.

## Prova
- verde depois: `npx vitest run src/components/tasks/__tests__/quadroAbasResponsivo.test.tsx` → `Test Files  1 passed (1); Tests  4 passed (4)`
- vermelho antes, mutação 1 (tirado o `max-md:basis-full max-md:shrink-0` de BoardColumn.tsx) → `Tests  1 failed | 3 passed (4)`, falha só o caso 3
- vermelho antes, mutação 2 (`aria-selected={false}` nas abas de TasksBoardMode.tsx) → `Tests  2 failed | 2 passed (4)`, falham os casos 1 e 2
- sem regressão na área: `npx vitest run src/components/tasks/__tests__/` → `Test Files  24 passed (24); Tests  263 passed | 1 todo (264)`
- `npx eslint` nos três arquivos → exit 0

Concluí as etapas 099 e 100 dentro dos meus arquivos (src/components/tasks/board/** e src/components/tasks/__tests__/**).

## O que NÃO fiz e por quê
- Não toquei em TasksModule.tsx, no TasksKpiStrip nem em src/hooks/tasks/** — a faixa compacta do Quadro e o dado dos KPIs são de outros cartões e já vieram no meu worktree pela faixa dos pais (t_0c220fdd e t_5b572e5a), cherry-pickada na ordem dos pais como o cartão manda.
- Não mexi em banco, Edge Function, migration, dependência ou produção; nenhuma informação sai do sistema.
- Não removi as setas nem os dots da faixa estreita: é contrato de acessibilidade provado em TasksBoardMode.a11y.test.tsx (E22) e o plano (081) os prevê; as abas entram como condução adicional no topo.
