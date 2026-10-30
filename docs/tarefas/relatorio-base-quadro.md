# Relatório — base dos cartões pai + estado atual do Quadro

- Cartão: **t_38dd27ce** — "Consolidar base dos pais e mapear estado atual do Quadro" (filhos: `t_e840b070` = etapa 099, `t_426e784f` = etapa 100)
- Base: `dia/2026-10-16` @ **d723a90107** (`feat(contatos): busca por nome do contato ou da empresa na primeira letra (CT-011)`)
- Workspace: `~/hermes-workspaces/Zapp_Web_V2/base-quadro-pais-consolidar-26101602121ffc` (branch `v2/base-quadro-pais-consolidar-26101602121ffc`)
- Data da conferência: 2026-10-16 02:17 (-03)
- Cópia do plano conferida por md5 `a89f83e44c8db2e92859dd7ef01ff378` — idêntica em `~/hermes-workspaces/.assets/tarefas/` e em `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (648 linhas)
- Linhas do plano citadas aqui: **099** e **100** (linhas 358 e 359), seção 3 (imagens) e seção 8-bis (decisões vigentes)

## 0. Resumo

1. **Nada a trazer dos pais: os quatro cartões pai já estão na base do dia**, por replay do integrador. Dos 16 artefatos de produto das faixas, **10 estão byte a byte iguais** (mesmo blob) e **6 evoluíram depois na base** (prova na seção 1.2). Por isso **não rodei `git cherry-pick`**: as faixas (5, 1, 20 e 11 commits) carregam trabalho de **outros** cartões já integrados, e reaplicá-las em `dia/2026-10-16` reintroduziria versões antigas de arquivos que a base já tem mais novos (seção 1.3).
2. **O Quadro já tem código das etapas 080 a 098.** `rg -o 'Etapa [0-9]{2,3}' src/components/tasks/board` cita 080, 081, 082, 083, 087 e 091–098 (mais 028/029/033/051/052/103, de trabalho anterior); o redesenho do cartão está em `shared/WorkItemCard.tsx` (285 linhas, último commit `94c0c144f9`). Em uma frase: cabeçalho, subtítulo, limite WIP com barra segmentada, captura, coluna Concluído com toggle, vazios, alvo de soltura, pressão longa, teclado, rolagem e anúncio em região viva já existem.
3. **Etapa 099 (t_e840b070): parcial e com uma lacuna numérica.** Existe uma coluna por vez por *scroll-snap* com setas ‹ › e dots abaixo de 768px, mas **não existem abas** (`role="tab"`/`tablist` não aparece em nenhum arquivo do módulo) e o requisito "sem rolagem horizontal" **não fecha em 1280px**: com a sidebar aberta as cinco colunas pedem 1376px (seção 3.1).
4. **Etapa 100 (t_426e784f): praticamente pronta.** A faixa compacta de KPIs existe e já é usada no Quadro (`mode === 'board'` → `'compact'`, `TasksModule.tsx:86-88`), com a variante compacta em `TasksKpiStrip.tsx:414-433`; o "estilo das abas conforme D3" (seletor preenchido com ícone) já está em `ModeSwitcher.tsx:35,41`. O que sobra para a 100 é a convivência com as abas novas da 099.
5. **Nenhum código de feature foi escrito neste cartão.** O diff é só este arquivo (`docs/tarefas/relatorio-base-quadro.md`).

## 1. (a) Shas dos pais integrados

### 1.1 Onde o trabalho de cada pai aparece na base

O integrador **reescreve** os commits ao pôr na branch do dia (sha novo), então comparar sha não prova nada; o que prova é (i) o **blob do arquivo** e (ii) o **commit de replay** dentro do histórico de `dia/2026-10-16`.

| Cartão pai | Branch de origem | Tip na fila | Commit de replay na base | O que o replay traz |
|---|---|---|---|---|
| `t_a332243d` (primitivos + contexto de UI) | `v2/primitivos-compartilhados-tarefas-contex-2610111442cedd` | `8f96fa5c79` | **`2824a59405`** `docs(tarefas): remove frase residual do relato` | 17 arquivos, +1278 linhas: `shared/{TaskCheckbox,PriorityPill,StatusPill,DateLabel,ContactAvatar,TasksUiContext,tasksUi}.tsx`, `__tests__/primitivosCompartilhados.test.tsx` |
| `t_3d9b0963` (datas e presets de prazo/lembrete) | `v2/regra-datas-presets-prazo-lembrete-taref-2610111426d22d` | `74c5c89f5b` | **`2824a59405`** (mesmo replay) | `hooks/tasks/workItemFormat.ts` (113 linhas), `hooks/tasks/workItemPresets.ts` (113) + os dois testes |
| `t_0c220fdd` (KPIs clicáveis e faixa compacta) | `v2/kpi-strip-interativo-261011-2610111514033f` | `06e81c9c68` | **`efa5e74ae4`** `feat(tarefas): KPIs clicáveis, faixa compacta no Quadro, responsivo e contagem animada` | `shared/TasksKpiStrip.tsx`, `__tests__/kpiStripTarefas.test.tsx`, `hooks/tasks/workItemAggregates.ts` |
| `t_5b572e5a` (arrastar, teclado e rolagem do Quadro) | `v2/arrastar-polido-quadro-teclado-rolagem-261011192359f6` | `8d6dd714aa` | **`dacbbdbed1`** `feat(tarefas): arrastar polido, alvo de soltura, Aguardando, teclado e rolagem do Quadro` | `board/{BoardColumn,TasksBoardMode,MoveToMenu}.tsx`, `board/{boardInteracao,resolveDragEnd}.ts`, `shared/pointerMedia.ts` + testes |

Saída real (dentro do workspace):

```
$ git log --oneline dia/2026-10-16 | rg -i 'tarefas|tasks' | rg 'KPIs clic|arrastar polido|remove frase residual'
efa5e74ae4 feat(tarefas): KPIs clicáveis, faixa compacta no Quadro, responsivo e contagem animada
dacbbdbed1 feat(tarefas): arrastar polido, alvo de soltura, Aguardando, teclado e rolagem do Quadro
2824a59405 docs(tarefas): remove frase residual do relato

$ git log --oneline dia/2026-10-16 -- src/components/tasks/shared/TaskCheckbox.tsx
2824a59405 docs(tarefas): remove frase residual do relato

$ git log --oneline dia/2026-10-16 -- src/hooks/tasks/workItemPresets.ts
2824a59405 docs(tarefas): remove frase residual do relato

$ git log --oneline dia/2026-10-16 -- src/components/tasks/shared/TasksKpiStrip.tsx
efa5e74ae4 feat(tarefas): KPIs clicáveis, faixa compacta no Quadro, responsivo e contagem animada
af89069dbe feat(tarefas): KPIs de 88px no padrao da casa com WIP n/3 (etapa 44) (#1286)

$ git show --stat --format='' 2824a59405 | tail -3
 src/hooks/tasks/workItemFormat.ts                  | 113 ++++++
 src/hooks/tasks/workItemPresets.ts                 | 113 ++++++
 17 files changed, 1278 insertions(+), 30 deletions(-)
```

### 1.2 Artefato por artefato: blob do pai vs blob da base

Script de leitura: `.tmp/prova-base.py` (só leitura; saída em `.tmp/prova-base.md`). `IGUAL` = mesmo blob no tip do pai e na base; `DIFERE` = a base tem commits posteriores no mesmo arquivo.

| Artefato | Pai | Blob no tip do pai | Blob na base @ d723a901 | Veredito | Commit da base que trouxe |
|---|---|---|---|---|---|
| `shared/StatusPill.tsx` | t_a332243d | `69518e86cd` | `69518e86cd` | IGUAL | `2824a59405` |
| `shared/DateLabel.tsx` | t_a332243d | `64937a95fb` | `64937a95fb` | IGUAL | `2824a59405` |
| `shared/ContactAvatar.tsx` | t_a332243d | `e833d35a4f` | `e833d35a4f` | IGUAL | `2824a59405` |
| `shared/TasksUiContext.tsx` | t_a332243d | `0cb7b61dbb` | `0cb7b61dbb` | IGUAL | `2824a59405` |
| `shared/tasksUi.ts` | t_a332243d | `2180dd1477` | `2180dd1477` | IGUAL | `2824a59405` |
| `hooks/tasks/workItemFormat.ts` | t_3d9b0963 | `7e58997aa1` | `7e58997aa1` | IGUAL | `2824a59405` |
| `hooks/tasks/workItemPresets.ts` | t_3d9b0963 | `a3c1c27beb` | `a3c1c27beb` | IGUAL | `2824a59405` |
| `board/boardInteracao.ts` | t_5b572e5a | `f627e386ff` | `f627e386ff` | IGUAL | `dacbbdbed1` |
| `board/resolveDragEnd.ts` | t_5b572e5a | `7c9a79656e` | `7c9a79656e` | IGUAL | `902e7907f6` |
| `shared/pointerMedia.ts` | t_5b572e5a | `be915a688b` | `be915a688b` | IGUAL | `dacbbdbed1` |
| `shared/TaskCheckbox.tsx` | t_a332243d | `05a7aa6d57` | `b5dbd67ef0` | DIFERE (+22/−7) | `2824a59405` |
| `shared/PriorityPill.tsx` | t_a332243d | `bfc4731056` | `c8ef93938f` | DIFERE (+6/−1) | `2824a59405` |
| `shared/TasksKpiStrip.tsx` | t_0c220fdd | `42bf5fbf43` | `c62d8070c9` | DIFERE (+19/−7) | `efa5e74ae4` |
| `hooks/tasks/workItemAggregates.ts` | t_0c220fdd | `4dbc2fbe28` | `f99c57125e` | DIFERE (+4/−15) | `efa5e74ae4` |
| `board/TasksBoardMode.tsx` | t_5b572e5a | `bb56d349f4` | `696b5bebb5` | DIFERE (+28/−5) | `590ce65a6e` (último que tocou) |
| `board/BoardColumn.tsx` | t_5b572e5a | `b01786ba87` | `3afbe217d0` | DIFERE (+18/−16) | `466f5fc215` (último que tocou) |

**Totais: 10 IGUAL, 6 DIFERE, 0 AUSENTE.** Números medidos com `git diff --numstat <pai>:<arquivo> HEAD:<arquivo>`.

Leitura das 6 divergências (todas conferidas com diff completo em `.tmp/diffs-pais.txt` e `.tmp/diffs-quadro.txt`):

- **5 são estritamente aditivas** — a base tem tudo do pai **e mais**:
  - `TasksBoardMode.tsx`: a base acrescenta o levantamento por pressão longa no trilho (`liftingId`/`board-longpress-hint`) sobre a versão do pai;
  - `BoardColumn.tsx`: a base acrescenta o realce âmbar da coluna Aguardando (etapa 096), o alvo de 40px no botão ⓘ em `max-md` e o mesmo contrato de soltura do pai;
  - `TasksKpiStrip.tsx`: a base acrescenta o `compactValue` (decimais do tempo médio, D13);
  - `TaskCheckbox.tsx`: a base acrescenta o ajuste do alvo de 40px no compacto;
  - `PriorityPill.tsx`: a base acrescenta `role="img"` no caminho compacto, porque `aria-label` em elemento sem papel é ignorado por leitor de tela (comentário no próprio arquivo).
- **1 não é aditiva** — `workItemAggregates.ts`: a base **remove** o curto-circuito do filtro por **estado** (`f.status`), que entrou na faixa do pai por cherry-pick de outro cartão (o primeiro commit da faixa do pai de KPIs é `0d56c72100 feat(tarefas): filtro de estado e prazo, …`, etapa 037). Na base, `TasksFilters` (`workItemFilters.ts:16-27`) tem `q`, `prio`, `contact`, `alarm`, `done` e `due`, **sem** campo de estado, e `TasksFilterBar.tsx` não oferece filtro de estado. Fica registrado como **observação** (fora do escopo deste cartão — a etapa 037 não é pai destes filhos; ver seção 4).

### 1.3 Por que **não** fiz `git cherry-pick` da faixa

O passo 1 do cartão manda `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges dia/2026-10-11..<sha>)`. Antes de decidir, medi o tamanho dessas faixas:

```
$ for s in 8f96fa5c7 74c5c89f5 06e81c9c6 8d6dd714a; do printf "%s: " $s; git rev-list --count "dia/2026-10-11..$s"; done
8f96fa5c7: 5
74c5c89f5: 1
06e81c9c6: 20
8d6dd714a: 11
```

Essas faixas **não são só o trabalho do pai**: como cada pai já tinha trazido a faixa dos pais dele, o intervalo carrega outros cartões, por exemplo dentro de `8d6dd714a`:

```
77fb11e24a chore(tarefas): subtitulo curto em KANBAN_COLUMNS (dado da etapa 081 do pai t_15507eb6)
2246f4352e chore(tarefas): traz a faixa dos pais — primitivos compartilhados, base do painel (t_2456ca64) e formatos (T04)
6b697b51a1 feat(tarefas): captura na Caixa de entrada, coluna Concluido, toggle e vazios do Quadro
```

Reaplicar isso em `dia/2026-10-16` significaria **reintroduzir versões antigas** de arquivos que a base já tem mais novos (o conflito é certo em `TasksBoardMode.tsx` e `BoardColumn.tsx`, cujos blobs na base são posteriores à faixa) e inflar o diff com feature de outros cartões. O critério de pronto deste cartão é explícito: *"relatório escrito com o inventário e shas; **nenhum código de feature novo**; se algo dos pais já estava integrado, isso está provado no relato"*. As seções 1.1 e 1.2 são essa prova. **Decisão: não cherry-pickar.**

Para qualquer um reconferir a presença sem escrever nada:

```
git -C <workspace> log --oneline -1 -- src/hooks/tasks/workItemPresets.ts     # 2824a59405
git -C <workspace> log --oneline -1 -- src/components/tasks/shared/TasksKpiStrip.tsx  # efa5e74ae4
git -C <workspace> log --oneline -1 -- src/components/tasks/board/BoardColumn.tsx     # dacbbdbed1 + refinos
git -C <workspace> diff 8d6dd714aa:src/components/tasks/board/BoardColumn.tsx HEAD:src/components/tasks/board/BoardColumn.tsx
```

`.tmp/` é ignorado pelo git (`.gitignore:124`), então os scripts de prova não entram no commit.

## 2. (b) Inventário do Quadro atual (arquivo por arquivo)

Base `d723a90107`; linhas medidas com `wc -l`.

| Arquivo | Linhas | Papel | Superfície |
|---|---|---|---|
| `src/components/tasks/board/TasksBoardMode.tsx` | 362 | Orquestra o Quadro: cabeçalho, trilho das 5 colunas, região viva, arrasto | props: `byStatus`, `isLoading`, `doingCount`, `byStatusFull`, `onMove`, `onMoveTo`, `onRequestWaitingReason`, `onReorder`, `onOpen`, `onDelete`, `onCreate`, `actions` |
| `src/components/tasks/board/BoardColumn.tsx` | 307 | Uma coluna: cabeçalho, limite WIP, corpo com drop, vazios, rodapé do Concluído | props: `status`, `title`, `subtitle`, `items`, `count`, `limit`, `limitKind`, `full`, `collapsed`, `dropping`, `lifting`, `onToggleCollapse`, … |
| `src/components/tasks/board/MoveToMenu.tsx` | 105 | "Mover para" (teclado e toque), alvos por estado com WIP | exports `MoveToMenu`, `MoveTargets` (`data-testid="move-to-menu"`) |
| `src/components/tasks/board/boardInteracao.ts` | 62 | Regra pura de interação (sem React) | `BOARD_ORDER`, `colunaVizinha`, `resolverMoverPorTeclado`, `bordasDeRolagem` |
| `src/components/tasks/board/resolveDragEnd.ts` | 135 | Decide o destino do arrasto | `indiceDeDestino`, `resolveDragEnd`, tipos `DragEndMoveOpts`/`DragEndResolution` |
| `src/components/tasks/shared/pointerMedia.ts` | 91 | Media queries vivas e pressão longa | `useMedia`, `usePointerCoarse`, `useNarrowViewport` (**`(max-width: 767px)`**, linhas 39-40), `usePressaoLonga` |
| `src/components/tasks/shared/TasksKpiStrip.tsx` | 498 | Faixa de KPIs nas duas densidades + esqueleto | `TasksKpiStrip({kpis, density, …})`, `TasksKpiStripSkeleton({density})` |
| `src/components/tasks/shared/WorkItemCard.tsx` | 285 | Cartão do Quadro (redesenho 084–090) | `WorkItemCard`, `WorkItemCardSkeleton` |
| `src/components/tasks/shared/TasksUiContext.tsx` | 42 | Contexto de UI (densidade/compacto) | `TasksUiProvider`, `useTasksUi` |
| `src/components/tasks/shared/BoardColumnSkeleton.tsx` | 13 | Esqueleto de coluna com a mesma geometria | `BoardColumnSkeleton` |

**Testes que tocam o Quadro** — `src/components/tasks/__tests__/`: `TasksBoardMode.test.tsx`, `TasksBoardMode.a11y.test.tsx`, `quadroArrastarTecladoRolagem.test.tsx`, `quadroLarguraFocoContraste.test.tsx` (E16), `quadroCapturaConcluidoToggleVazios.test.tsx`, `kpiStripTarefas.test.tsx`, `kpiDependencias.test.tsx`, `primitivosCompartilhados.test.tsx`, `movimentoEContraste.test.tsx`, `contagensReaisVsFiltradas.test.tsx`, `contratosVisiveis.test.tsx`. Em `board/__tests__/`: `BoardColumn.politica-coluna.test.tsx`, `BoardColumn.subtitulo-limite.test.tsx`, `resolveDragEnd.limites.test.ts`.

**Tokens de cor usados no board** (nenhuma cor literal): `bg-card`, `bg-card/50`, `bg-card/95`, `bg-muted`, `bg-muted/40`, `bg-primary`, `bg-primary/5`, `bg-primary/10`, `border-border`, `border-primary`, `border-destructive`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `text-success`, `text-warning`, `ring-primary`, `ring-destructive`, `ring-warning`; mais `rounded-[14px]`, `var(--shadow-lg)` e tons de movimento com prefixo `motion-safe:`.

**Breakpoints já tratados**:

- `< 768px`: `useNarrowViewport()` → `(max-width: 767px)` (`pointerMedia.ts:39-40`); é ele que liga a faixa de navegação do Quadro (setas ‹ › em `TasksBoardMode.tsx:263` e `board-dots` em `:343`), conforme o comentário *"as setas/‹› e os dots existem só no corte mobile de `pointerMedia.ts`"* (`BoardColumn.tsx:88`).
- `< 768px` (Tailwind `max-md:`): botão ⓘ do cabeçalho da coluna com alvo de 44px (`BoardColumn.tsx:121`).
- `768px–1279px`: **nada explícito** no board.
- `≥ 1280px`: **nada explícito** no board — a largura sai de `flex-1 min-w-[200px]` por coluna dentro de um trilho `overflow-x-auto snap-x` (`TasksBoardMode.tsx`).
- Na faixa de KPIs: `md:grid-cols-3 xl:grid-cols-5` na densidade confortável (`TasksKpiStrip.tsx:436`) e `flex-wrap` na compacta (`:414-433`).

**Abas: AUSENTES.** `rg 'role="tablist"|role="tab"' src/components/tasks` não retorna nada. O que existe hoje é (i) o seletor de modos do módulo (`ModeSwitcher.tsx`, `aria-pressed` na linha 35 e pílula `layoutId="tasks-mode-pill"` na 41 — decisão **D3**) e (ii) a navegação estreita do Quadro por setas e dots (`data-testid="board-dots"`, com nome acessível e marcação da coluna à vista — `TasksBoardMode.a11y.test.tsx:204-209`). Peça pronta para reuso: `src/components/ui/tabs.tsx` exporta `Tabs, TabsList, TabsTrigger, TabsContent` (Radix) — **não alterar** esse arquivo (regra do cartão).

**Faixa de KPIs: PRESENTE no Quadro**, densidade compacta ligada pelo modo (`TasksModule.tsx:86-88`):

```
// Etapa 025 (D2): a densidade da FAIXA acompanha o modo — no Quadro ela é a
// faixa compacta da imagem 05 (ganha altura para as colunas).
const densidadeKpis: TasksDensity = mode === 'board' ? 'compact' : 'comfortable';
```

A variante compacta renderiza `data-density="compact"`, uma linha com separadores verticais (`border-l border-border/70`), `flex-wrap` para quebrar em 360px sem rolar, `min-w-[104px]` por leitura e alvo mínimo de 44px (`TasksKpiStrip.tsx:206, 280, 414-433`).

## 3. (c) Etapas 099 e 100: o que já existe e onde

### 3.1 Etapa 099 (`t_e840b070`) — responsivo do Quadro

Plano, linha 358: *"Abaixo de 768 px uma coluna por vez com abas no topo; a partir de 1280 px as cinco colunas sem rolagem."*

| Elemento pedido | Existe hoje? | Onde / prova |
|---|---|---|
| Uma coluna por vez abaixo de 768px | **Parcial** | Trilho `flex w-full min-w-0 gap-3 h-full overflow-x-auto snap-x snap-mandatory` (`TasksBoardMode.tsx:312`); coluna `flex-1 min-w-[200px] … snap-start` (`BoardColumn.tsx:83-94`, com o comentário E16 ali mesmo); a coluna à vista sai de `ResizeObserver` + `resize` (`TasksBoardMode.tsx:107-121`), as setas ficam em `data-testid="board-nav"` (`:263`) e os dots em `board-dots` (`:343`), com nome acessível por coluna (`TasksBoardMode.a11y.test.tsx:204-209`). "Uma coluna por vez" acontece por *snap* — **com** rolagem horizontal. |
| Abas no topo para alternar os estados | **NÃO existe** | `rg 'role="tablist"\|role="tab"' src/components/tasks` → vazio. `ui/tabs.tsx` disponível para reuso. |
| Sem rolagem horizontal em 360px | **NÃO** | O trilho é `overflow-x-auto snap-x` (`TasksBoardMode.tsx:312`), e isso é defendido por teste: `quadroLarguraFocoContraste.test.tsx:255-257` exige `overflow-x-auto` + `snap-x` + `min-w-0`. |
| Sem rolagem horizontal em 768px | **NÃO** | Mesma razão; entre 768 e 1279 não há tratamento explícito. |
| Sem rolagem horizontal em 1280px | **NÃO (não fecha numericamente)** | Piso de 200px por coluna + `gap-3` (12px) → trilho = 5×200 + 4×12 = **1048px**. Com sidebar aberta (`--sidebar-w: 256px`, `tokens.css:307`) e `--layout-gutter: 2.25rem = 36px` (`tokens.css:310`): 256 + 2×36 + 1048 = **1376px > 1280**. Sem gutter: 256 + 1048 = **1304 > 1280**. Para as cinco caberem em 1280 com sidebar + gutter, o piso por coluna tem de cair para **≤ 180px** ((1280−256−72−48)/5 = 180,8). Com a sidebar recolhida (64px) cabem 219px por coluna — ou seja, 200px só fecha com a sidebar recolhida. |
| Cobertura de teste da largura | **Parcial** | `quadroLarguraFocoContraste.test.tsx:222-248` (E16) afirma `5×200+4×12` e prova **1440** (cabe: 1376) e **1024** (não cabe) — **não** assere 1280. |
| Estado da aba ativa acessível e persistente na sessão | **Não aplicável hoje** | Não há abas; a coluna visível hoje é estado local da coluna, que se perde ao remontar. |

Consequência para o cartão 099: ele vai **mexer em expectativas do E16** (`quadroLarguraFocoContraste.test.tsx:255-257`), que hoje defende o carrossel. Isso é legítimo — o próprio cartão 099 pede "sem rolagem horizontal em 360, 768 e 1280 px" —, mas **precisa ser justificado no relato citando a frase do cartão**, e o caso novo tem de provar o piso que fecha em 1280.

### 3.2 Etapa 100 (`t_426e784f`) — faixa compacta e estilo das abas (D3)

Plano, linha 359: *"Faixa compacta de KPIs (imagem 05) e estilo das abas conforme D3."*

| Elemento pedido | Existe hoje? | Onde / prova |
|---|---|---|
| Faixa compacta de KPIs alinhada ao topo do Quadro, sem competir com as colunas | **Sim** | `TasksModule.tsx:86-88` (`mode === 'board'` → `'compact'`); `TasksKpiStrip.tsx:206` (`const compacta = density === 'compact'`) e `:414-433` (linha com separadores, `flex-wrap`, `min-w-[104px]`) |
| Esqueleto com a mesma geometria (nada pula quando o dado chega) | **Sim** | `TasksKpiStripSkeleton({density})`, `TasksKpiStrip.tsx:448-463` (`data-density="compact"`, `role="status"`, `aria-busy`) |
| Cálculo existente, sem lógica duplicada | **Sim** | `hooks/tasks/workItemAggregates.ts` + `workItemFormat.formatLeadTime` (tempo médio da criação à conclusão, D13 — usado em `TasksKpiStrip.tsx:404-410`) |
| Estilo das abas conforme D3 (preenchido com ícone) | **Já implementado** | `ModeSwitcher.tsx:35` (`aria-pressed={active}`) e `:41` (pílula `layoutId="tasks-mode-pill"`) — a decisão D3 da seção 6 do plano já está no código |
| Comportar-se bem em 360/768/1280 e conviver com as abas da 099 | **Parcial** | A compacta já quebra em 2 linhas (`flex-wrap`) sem rolar em 360px; falta a convivência com as **abas novas** da 099 (que não existem ainda) |

Ou seja: **a 100 não deve reescrever a faixa nem o `ModeSwitcher`** — mexer em `ModeSwitcher.tsx` sem o cartão mandar é defeito novo. O trabalho real da 100 é a **convivência** no topo do Quadro (abas + faixa compacta) e os testes nos três breakpoints.

## 4. (d) Bloqueios

**Nenhum bloqueio técnico. Nada precisa de decisão do Joaquim**; o trabalho dos pais está na base e o mapa está feito. Três pontos para os cartões filhos levarem em conta (não são bloqueios):

1. **Lacuna numérica da 099 em 1280px** (seção 3.1): com o piso de 200px a base rola em 1280 — o cartão filho precisa baixar o piso (≤180px com sidebar + gutter; 219px com a sidebar recolhida) ou dispensar o gutter, e provar com teste. É conta, não decisão de produto.
2. **Vocabulário "abas"**: o plano usa a palavra em dois sentidos — o seletor de modos do módulo (imagens 01–04, resolvido em D3) e as abas do corte estreito do Quadro. O que falta é o segundo; o primeiro está pronto e **não** deve ser mexido.
3. A faixa `dia/2026-10-11..<pai>` **não** deve ser cherry-pickada (seção 1.3) — os filhos devem nascer de `dia/2026-10-16`, que já contém tudo.

Observação fora do escopo deste cartão (registrada em `kanban_comment` no próprio cartão): o filtro por **estado** em `TasksFilters` (etapa 037 do plano, cartão de outro agente) que existia na faixa dos pais **não** está na base — hoje `workItemFilters.ts:16-27` tem `q`, `prio`, `contact`, `alarm`, `done`, `due`, e `TasksFilterBar.tsx` não expõe estado. Não afeta as etapas 099/100 (o Quadro é o recorte por estado, decisão D1).

## 5. Comandos prontos para os dois cartões filhos

```bash
# 0) base comum aos dois (a base do dia já contém os pais)
export PATH="$HOME/.local/libexec/hermes-guard:$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
hermes-tarefa-iniciar Zapp_Web_V2 <slug-do-cartao>       # devolve WORKSPACE; use workdir absoluto em toda chamada
WS=<WORKSPACE impresso>; git -C "$WS" log -1 --format='%h %s'   # tem de ser d723a901 do dia/2026-10-16

# 1) reconferir os pais na base
git -C "$WS" log --oneline -1 -- src/hooks/tasks/workItemPresets.ts              # 2824a59405
git -C "$WS" log --oneline -1 -- src/components/tasks/shared/TasksKpiStrip.tsx   # efa5e74ae4
git -C "$WS" log --oneline -1 -- src/components/tasks/board/BoardColumn.tsx      # dacbbdbed1 + refinos

# 2) rechecar o que este relatório afirma sobre o estado atual
rg -n 'role="tablist"|role="tab"' "$WS/src/components/tasks"                      # vazio hoje
rg -n 'useNarrowViewport|max-width: 767px' "$WS/src/components/tasks/shared/pointerMedia.ts"
rg -n "mode === 'board' \? 'compact'" "$WS/src/components/tasks/TasksModule.tsx"  # :88
rg -n 'min-w-\[200px\]|overflow-x-auto|snap-x' "$WS/src/components/tasks/board/TasksBoardMode.tsx"
rg -n -- '--sidebar-w|--layout-gutter' "$WS/src/styles/tokens.css"                # 256px / 2.25rem

# 3) rodar os testes do Quadro durante o trabalho (uma suite por vez, nunca duas)
cd "$WS" && bunx vitest run src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx
cd "$WS" && bunx vitest run src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx
cd "$WS" && bunx vitest run src/components/tasks/__tests__/kpiStripTarefas.test.tsx

# 4) fechar
cd "$WS" && hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md       # roda zapp-verify --rapido
```

**Etapa 099** — arquivos e testes:

- tocar: `src/components/tasks/board/TasksBoardMode.tsx` (abas no corte estreito; `<768px` deixa de rolar; `768–1279` grade com quebra; `≥1280` cinco colunas com piso ≤180px), `src/components/tasks/board/BoardColumn.tsx` (piso por faixa; decidir se as setas/dots ficam ou são substituídos pelas abas), `src/components/tasks/shared/pointerMedia.ts` (se precisar de consulta para `768–1279`)
- testes novos em `src/components/tasks/__tests__/`: `quadroResponsivoAbas.test.tsx` (aba padrão = `todo`/Estado: fazer, troca por teclado, `aria-selected`, persistência na sessão) e `quadroSemRolagemHorizontal.test.tsx` (360/768/1280: `scrollWidth <= clientWidth` no trilho); ajustar `quadroLarguraFocoContraste.test.tsx` só com a frase do cartão citada
- reuso obrigatório: `src/components/ui/tabs.tsx` (sem alterar), primitivos de `src/components/tasks/shared/`, `hooks/tasks/workItemFormat.ts` e `workItemPresets.ts`

**Etapa 100** — arquivos e testes:

- tocar o mínimo: `src/components/tasks/board/TasksBoardMode.tsx` (topo do Quadro com abas + faixa compacta convivendo) e `src/components/tasks/__tests__/kpiStripTarefas.test.tsx` (caso novo: faixa compacta dentro do Quadro em 360/768/1280, sem rolagem horizontal)
- **não** tocar `ModeSwitcher.tsx` (D3 já feito) nem `src/components/ui/*`; `TasksKpiStrip.tsx` só se o cartão exigir
- reuso: `useTasksUi`/`TasksUiContext` para densidade, `workItemAggregates.ts` + `workItemFormat.ts` para os números

## 6. Como este relatório foi verificado (comandos e saída real)

```
$ git -C "$WS" log -1 --format='%H %s'
d723a9010796f1ea4aea5270d881da2974328ba4 feat(contatos): busca por nome do contato ou da empresa na primeira letra (CT-011)

$ git -C "$WS" status --porcelain        # antes de escrever este arquivo
(sem saída)

$ md5sum ~/hermes-workspaces/.assets/tarefas/PLANO_..._2026-10-11.md "$WS/docs/plans/PLANO_..._2026-10-11.md"
a89f83e44c8db2e92859dd7ef01ff378  (as duas linhas iguais: cópia do plano = cópia do repositório)

$ python3 .tmp/prova-base.py             # tabela de blobs
Totais: 10 IGUAL, 6 DIFERE (evolucao posterior na base), 0 AUSENTE.

$ git -C "$WS" diff --numstat 8d6dd714aa:src/components/tasks/board/BoardColumn.tsx HEAD:src/components/tasks/board/BoardColumn.tsx
18      16      src/components/tasks/board/BoardColumn.tsx

$ python3 -c "lado=5;piso=200;gap=12;sidebar=256;gutter=36; ..."    # conta da seção 3.1
piso do trilho (5x200 + 4x12) = 1048
1440px: sidebar+gutter2x+trilho=1376 cabe=True | sidebar+trilho=1304 cabe=True
1280px: sidebar+gutter2x+trilho=1376 cabe=False | sidebar+trilho=1304 cabe=False
1024px: sidebar+gutter2x+trilho=1376 cabe=False | sidebar+trilho=1304 cabe=False
piso maximo por coluna para 5 caberem em 1280 com sidebar+gutter = 180.8

$ wc -l src/components/tasks/board/*.tsx src/components/tasks/board/*.ts   # seção 2
307 BoardColumn.tsx | 105 MoveToMenu.tsx | 362 TasksBoardMode.tsx | 62 boardInteracao.ts | 135 resolveDragEnd.ts
```

Verificação deste cartão (rodada no fim do trabalho, depois de `bun install --frozen-lockfile` —
o worktree nasce sem `node_modules`, e sem isso o `zapp-verify` para em "TypeScript local nao encontrado"):

```
$ zapp-verify . --rapido
OK      db_guard        0s
OK      tipos         148s
OK      lint            0s
OK      migrations      1s
AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
VERIFY: VERDE SEM BANCO (149s)

$ bunx vitest run src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx
Test Files  1 passed (1)
     Tests  8 passed (8)
```

O "sem banco" é o esperado: este cartão não cria migration nem toca schema.

Nota de higiene: o `.tmp/` deste workspace veio com arquivos de **outra** tarefa (`evidencia-vitest-*.txt`, `verify*.log`, `vermelho.log`, `verde_final.log`, de um cartão de Gmail, com data de 02:12). Não são meus, o diretório é ignorado pelo git e **nada** deles foi usado aqui; ficam onde estão para não apagar trabalho de terceiros.

Nada em `src/` foi alterado neste cartão; o diff é composto só por `docs/tarefas/relatorio-base-quadro.md`.
