Especialista: iris

# feat(tarefas): arrastar polido, alvo de soltura, Aguardando, teclado e rolagem do Quadro

Etapas 094 a 098 do plano de design (T24). Nada fora da área do cartão.

## O que mudou e por quê
- `src/components/tasks/board/boardInteracao.ts` (NOVO) — a decisão que saiu do JSX: `BOARD_ORDER` (a ordem das colunas numa fonte só), `colunaVizinha` (vizinha de cada coluna, `null` nas pontas), `resolverMoverPorTeclado` (monta o `DropResult` que o teclado representa e REUSA `resolveDragEnd`, então a trava de WIP e o portão do Aguardando valem iguais ao arrasto — nenhuma regra de transição nova) e `bordasDeRolagem` (somas do trilho para as sombras). Etapas 097 e 098.
- `src/components/tasks/board/TasksBoardMode.tsx` — `aplicarDecisao` separado do `handleDragEnd` (arrasto e teclado interpretam o MESMO veredito); `handleTeclado` no trilho (←/→ andam de coluna em coluna pulando as vazias, ↑/↓ entre os cartões, Alt+←/→ move pela decisão acima, e o handler se retira enquanto há arrasto em curso para não brigar com a lib de DnD); o trilho ganhou `motion-safe:scroll-smooth` (encaixe animado do snap, etapa 094) e foi embrulhado pelas sombras de borda (etapa 098). `BOARD_COLUMNS` passou a ler `BOARD_ORDER` (uma fonte só).
- `src/components/tasks/board/BoardColumn.tsx` — dica do alvo de soltura `Solte para mover para Fazendo (2 de 3)`, com a contagem DEPOIS do drop e travada no teto duro (`Math.min(doingCount + 1, hard)`, nunca "4 de 3") + anel primary no corpo da coluna de destino (etapa 095); realce âmbar (`ring-warning/60`, `data-testid="board-waiting-emphasis"`) na coluna Aguardando enquanto há arrasto (etapa 096 — quem pede o motivo continua sendo o painel de sempre, intocado); placeholder embrulhado num slot tracejado e o cartão levantado num overlay com `--shadow-lg` (etapa 094); no toque, `usePressaoLonga` arma o arrasto (etapa 094).
- `src/components/tasks/shared/pointerMedia.ts` — `usePressaoLonga` (300 ms), na MESMA `(pointer: coarse)` do `usePointerCoarse`; ponteiro fino nasce armado, então mouse e teclado não mudaram.

## Prova
- vermelho antes (mesmo teste, com os 3 arquivos de tela restaurados de `HEAD`, via `git show HEAD:<arquivo>`): `npx vitest run src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx` → `Tests  9 failed | 4 passed (13)` — falha exatamente o que as etapas 094–098 acrescentam (os 4 que passam são as funções puras de 097/098 e os casos que já existiam: Enter e a trava de WIP).
- verde depois (no commit deste cartão): `npx vitest run src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx` → `Test Files  1 passed (1); Tests  13 passed (13)`.
- regressão da vizinhança do módulo: `npx vitest run src/components/tasks` → `Test Files  25 passed (25); Tests  260 passed | 1 todo (261)`.
- lint: `npx eslint` nos 5 arquivos do diff → saída vazia, exit 0.

Casos do teste próprio (todos pelo componente REAL — `TasksBoardMode` → `BoardColumn` — com `resolveDragEnd` de verdade; só o ARRASTO é fingido, porque a lib não roda no jsdom, como nos testes vizinhos do módulo):
1. `o cartão levantado ganha o overlay elevado e o lugar da soltura fica tracejado` (094);
2. `no toque o arrasto só pega depois da pressão longa; toque curto desarma` (094);
3. `a coluna de destino mostra a borda primary e a dica com a contagem que fica` (095);
4. `a coluna Aguardando se realça em âmbar durante o arrasto (o painel do motivo é preservado)` (096);
5. `colunaVizinha devolve null nas pontas e a vizinha certa no meio` (097);
6. `←/→ andam entre colunas (pulando as vazias) e ↑/↓ entre os cartões` (097);
7. `Alt+→ move o cartão para a coluna seguinte, com o índice do destino` (097);
8. `Alt+→ para Aguardando abre o painel do motivo em vez de escrever no banco` (097);
9. `Alt+→ para Fazendo 3/3 é recusado pela trava do WIP` (097);
10. `Enter continua abrindo o cartão e, com arrasto em curso, o teclado se retira` (097);
11. `bordasDeRolagem só acende onde ainda há conteúdo escondido` (098);
12. `o trilho rola com snap e encaixe animado, e a coluna rola por dentro` (098);
13. `as sombras das bordas aparecem só onde há coluna escondida` (098).

## Elemento → linha da tabela da seção 3 (e a etapa)
- 094 placeholder tracejado, overlay `--shadow-lg`, encaixe animado e pressão longa no toque → seção 3 **linha 148** (`Alvos e arrasto polidos (alça, destaque da coluna) | PARCIAL | 094–097`); etapa 094 na **linha 353** e a lacuna do toque na **linha 644**.
- 095 alvo de soltura (borda primary + dica com a contagem) → seção 3 **linha 148**; etapa 095 na **linha 354**; a política vigente em 8-bis **linha 523** (entra de fora bloqueado, reordenar por dentro liberado).
- 096 Aguardando abre o painel do motivo + coluna âmbar → seção 3 **linha 148**; etapa 096 na **linha 355**; 8-bis **linha 517** (G-6, Aguardando 5 suave).
- 097 teclado (←/→, ↑/↓, Alt+←/→, Enter) → seção 3 **linha 148**; etapa 097 na **linha 356**; etapa 144 (**linha 144**, alça ⠿/card selecionado) intacta.
- 098 rolagem fluida com snap, sombra nas bordas e rolagem vertical por coluna → etapa na **linha 357**; a seção 3 não tem linha própria para a rolagem (as imagens mostram o módulo parado), então a referência é a **linha 338** (etapa 079, especificação da coluna: cabeçalho fixo e rolagem interna), que é a que o código já seguia.
- Cores: só tokens do tema (`--shadow-lg`, `ring-primary`, `ring-warning/60`, `muted-foreground`); nenhuma cor literal e nenhum selo de canal/origem.
- Imagens 01–05: NÃO foram abertas — este perfil não tem ferramenta de visão nesta máquina. A conferência foi contra a seção 3 (linha 148), a tabela das etapas (353–357) e 8-bis (517, 523).

## O que NÃO fiz e por quê
- Não toquei em `WorkItemCard.tsx` nem em `TasksModule.tsx` (fora dos arquivos do cartão): a sombra elevada do cartão levantado entra no wrapper de `board/` com o token da etapa, e a narração `Movida para … (n de limite)` segue a mesma (critério do cartão).
- Nenhum valor/teto/escala mudou: o teto duro de Fazendo continua 3; a dica só LÊ o teto e trava a contagem nele. `resolveDragEnd` não foi alterado.
- Sem migration, Edge Function, dependência nova, exportação/impressão de dado ou edição em massa.
- Estados conferidos: colunas vazias (as colunas sem cartão do teste não ganham dica nem realce), coluna cheia (3/3 pelo teclado é recusada), sem arrasto (nenhum overlay/placeholder/dica) e sem toque (hint só aparece em `(pointer: coarse)`).
- Observação de convivência (não é pendência): no toque a etapa 81 já tirava o arrasto e deixava o `MoveToMenu`; a pressão longa entra por cima disso e o menu continua no card.
