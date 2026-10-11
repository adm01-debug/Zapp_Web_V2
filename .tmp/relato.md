Especialista: Íris (area-front-componentes)

## Como a branch foi montada (leia primeiro)
Meu código CONSOME o dado `subtitle` (etapa 081, card `t_15507eb6`) — sem ele o `BoardColumn` não
compila. O pai não estava integrado na `dia/2026-10-11`, então a branch tem 2 commits:
1. o HUNK de dependência do pai `t_15507eb6` (o `subtitle` em `KANBAN_COLUMNS`, só
   `src/hooks/tasks/workItem.types.ts`; commit `9c01d7ed6`);
2. a minha entrega (`113bf61f0`).
Os outros dois pais citados no cartão (`t_2a65fbc1` = T16 barra de filtros e `t_a332243d` = T11
primitivos) são de OUTRO escopo e não são usados por nenhuma linha do meu diff: trazidos inteiros
levavam o diff a 113886 caracteres e o próprio `hermes-tarefa-fechar` recusou por regra (>90000).
Eles ficam para o integrador, como manda "um cartão = um defeito".

## O que mudou e por quê
Etapas 080, 082 e 083 do Quadro.

- `src/components/tasks/board/BoardColumn.tsx`
  - 080: o cabeçalho passou a mostrar o SUBTÍTULO curto (`KANBAN_COLUMNS.subtitle`) ao lado do
    rótulo ("Caixa de entrada · A organizar", "Fazendo · Conclua uma para iniciar outra"…). O
    rótulo continua sendo o PRIMEIRO `<span>` da coluna — é por ele que a medição de contraste do
    cabeçalho (`quadroLarguraFocoContraste`) resolve a cor. A política LONGA continua só no
    tooltip do botão "Política da coluna" (ⓘ), sem virar texto do cabeçalho.
  - 082: na coluna de limite duro ("Fazendo") entraram a barra de progresso SEGMENTADA (um
    segmento por vaga, `WIP_LIMITS.doing.hard`, azul/primária até encher e destrutiva quando
    cheia, com `role="progressbar"` e aria-valuenow/max) e o rodapé "Seu limite é de 3 tarefas em
    execução." com ícone de informação. O preenchimento é limitado a `Math.min(doingCount, hard)`:
    quem estourou o limite pinta a barra CHEIA, nunca uma barra maior que o teto. Colunas sem
    limite duro não recebem barra nem rodapé.
  - 083: a coluna ganhou a prop `shake`. Enquanto ligada, a BORDA fica destrutiva (aviso que não
    depende de animação) e o tranco curto usa `motion-safe:animate-wiggle` — com movimento
    reduzido o `motion-safe` não existe e só a borda muda, como o plano pede.
- `src/components/tasks/board/TasksBoardMode.tsx`
  - 083: o `handleDragEnd`, no caso `blocked/wip_full`, agora dá o tranco curto na coluna de
    destino (`result.destination.droppableId`) por 600 ms além do toast explicativo que já
    existia. O drop continua recusado: o card volta à origem e nada é escrito (`onMove` não roda).
    O timer é limpo no unmount.

## Prova
- Teste novo: `src/components/tasks/board/__tests__/BoardColumn.subtitulo-limite.test.tsx` (8 casos).
  Renderiza o componente REAL (`BoardColumn`/`TasksBoardMode`) e dispara o drop pelo `onDragEnd`
  registrado (mock do `@hello-pangea/dnd`, mesmo padrão de `taskComponents.test.tsx`); o toast é o
  espião compartilhado do `@/test/mocks/tarefas`.
- vermelho antes (BoardColumn e TasksBoardMode voltados à `dia/2026-10-11`): `6 failed | 2 passed`
  (os 2 verdes são asserções negativas: "coluna sem limite não ganha barra" e "reorganizar por
  dentro não treme", que já valiam).
- verde depois: `Test Files 1 passed (1); Tests 8 passed (8)`.
- regressão dos vizinhos da área (mesma execução): `src/components/tasks/__tests__/quadroLarguraFocoContraste`,
  `movimentoEContraste`, `taskComponents`, `TasksBoardMode`, `TasksBoardMode.a11y`,
  `src/components/tasks/board/__tests__/BoardColumn.politica-coluna` e `contratosVisiveis` →
  `Test Files 8 passed (8); Tests 68 passed | 1 todo (69)`.
- `npx eslint` nos 3 arquivos: sem saída (limpo); `npx tsc --noEmit -p tsconfig.json`: saída vazia.

## Avisos do juiz automático (já conferidos)
- "teste novo não chama o código real": NÃO PROCEDE. O teste renderiza `BoardColumn`/`TasksBoardMode`
  reais e dispara o `onDragEnd` real do quadro; nenhum mock devolve a resposta pronta (o único mock
  é o `@hello-pangea/dnd`, que o jsdom não roda, e o espião de `toast`).
- "arquivo fora de ARQUIVOS QUE PODE TOCAR" (`src/hooks/tasks/workItem.types.ts`): é o HUNK de
  dependência do pai `t_15507eb6` (etapa 081), que o cartão manda trazer por cherry-pick do pai não
  integrado e sem o qual o `BoardColumn` não compila. Trouxe só ele; o resto do pai (filtros,
  agregados, testes) ficou de fora.

## O que NÃO fiz e por quê
- Não mexi em `resolveDragEnd.ts` (fora dos arquivos que o cartão cita): o alvo do tranco é lido de
  `result.destination` no próprio `TasksBoardMode`.
- Não toquei em tokens/`tailwind.config.ts`: o tranco usa a animação `wiggle` que já existe.
- Não trouxe os pais T16 (barra de filtros) e T11 (primitivos): fora do escopo deste cartão e
  furavam o teto de revisão; não são referenciados por nenhuma linha do meu diff.
