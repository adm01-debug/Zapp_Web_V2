Especialista: designer (worker (design), skill `design-system-zapp`) — retomada do cartão aberto por iris (telas) por rebase.

# [refazer 1] colunas do Quadro: subtítulo curto + limite de Fazendo (080, 082, 083)

## Ponto 1 (o único item do "corrigir"): conflito com a ponta de dia/2026-10-12
O workspace já nasceu na ponta `dia/2026-10-12` (BASE=dia/2026-10-12), então não houve rebase de
branch: trouxe a FAIXA do trabalho anterior por `git cherry-pick 9c01d7ed6 113bf61f0 2f6cf568e`
(SHA anterior = 2f6cf568e, fila `v2/colunas-quadro-subtitulo-limite-fazendo-2610111753c50b`).
Conflitos em `BoardColumn.tsx` (5 hunks) e `TasksBoardMode.tsx` (2 hunks) — resolvidos preservando o
que já entrou na base:
- `BoardColumn.tsx`: mantive o lado da ponta — `pressaoArrasto` (etapa 094), `realceEspera`/
  `ring-warning` (etapa 096), `colapsada`/`flex-none` (etapa 093) e o rodapé do Concluído (etapa 092);
  descartei a versão antiga que reescrevia essas mesmas linhas.
- `TasksBoardMode.tsx`: mantive o lado da ponta inteiro (`alvoTranco` + `tremerColuna` + deps
  `[onMove, onRequestWaitingReason, onReorder, tremerColuna]` e `pressaoArrasto={pressaoArrasto}`),
  porque a ponta já tinha toast de limite cheio (`toast.error('Fazendo está cheio (máx. 3)…')`) e o
  tranco por coluna de destino. Resultado: `TasksBoardMode.tsx` ficou IDÊNTICO à base (0 linhas no
  diff) — o arquivo não entra no meu diff.
- Só a parte que a base ainda NÃO tinha foi mantida do trabalho anterior: o subtítulo vem do dado
  canônico `KANBAN_COLUMNS.subtitle` (`col.subtitle`), acrescentado em `workItem.types.ts`
  (etapa 081, dado do pai t_15507eb6). Removi o mapa local `SUBTITULOS_COLUNA` que a ponta havia
  criado no cabeçalho, porque os 5 textos dele (`Capture primeiro`/`Próximo passo`/`Até 3 agora`/
  `Com motivo`/`7 dias à vista`) CONTRADIZEM a seção 3 do plano e o destino do guarda-chuva do
  cartão. Deixei comentário no cartão para o revisor conferir essa escolha.

## Ponto 2: rodar o teste do cartão e a verificação
- Teste do cartão: `npx vitest run src/components/tasks/board/__tests__/BoardColumn.subtitulo-limite.test.tsx`
  → `Test Files 1 passed (1)` / `Tests 8 passed (8)`.
- Regressão do módulo inteiro: `npx vitest run src/components/tasks` → `Test Files 29 passed (29)` /
  `Tests 329 passed | 1 todo (330)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (109s)` (o banco local não foi verificado: não
  há nome de conjunto neste cartão). Antes disso o typecheck ficou vermelho por dependência ausente
  (`TypeScript local nao encontrado`) — resolvido com `bun install` (651 packages), não era código.

## O que mudou e por quê (contra a seção 3 do plano)
- `src/components/tasks/board/BoardColumn.tsx`: o cabeçalho imprime `col.subtitle`, o subtítulo curto
  do dado canônico, no lugar do mapa local. Linha da tabela da seção 3: "Colunas Caixa de entrada
  (A organizar), A fazer (Próximas ações), Fazendo 3/3 (Conclua uma para iniciar outra), Aguardando
  (Dependências externas), Concluído (Últimos 7 dias)" → etapas 080–081 (tabela de etapas, linhas
  339 e 340). A política longa continua só no tooltip do ⓘ (não duplica texto).
- `src/hooks/tasks/workItem.types.ts`: `KANBAN_COLUMNS` ganha `subtitle` (5 textos da linha 138 da
  seção 3), mantendo a `policy` longa — etapa 081.
- `src/components/tasks/board/__tests__/BoardColumn.subtitulo-limite.test.tsx` (novo): trava as
  etapas 080, 082 e 083 medindo o DOM renderizado (não texto solto): os 5 subtítulos presentes, o
  primeiro `<span>` da coluna sendo o rótulo, contador "3/3", `role="progressbar"` com
  `aria-valuenow`/`aria-valuemax` = 3 e 3 segmentos `bg-destructive` quando cheio (1 primário + 2
  `bg-muted` com 1/3), rodapé `col-limit-footer-doing` com svg, tranco
  `motion-safe:animate-wiggle` + `border-destructive` na coluna de destino, toast
  `Fazendo está cheio (máx. 3). Conclua um item antes.`, `onMove` não chamado, volta ao normal aos
  700 ms e reorder interno da coluna cheia sem tranco.

## Prova (vermelho antes, verde depois)
- verde (teste do cartão): `npx vitest run …/BoardColumn.subtitulo-limite.test.tsx` →
  `Test Files 1 passed (1); Tests 8 passed (8)`.
- vermelho por mutação (o teste mede a classe/texto REAL): trocando `{col.subtitle}` por
  `{'Capture primeiro'}` → `Test Files 1 failed (1)` / `Tests 2 failed | 6 passed (8)`; trocando
  `shake ? 'border-destructive motion-safe:animate-wiggle' : 'border-border/70'` pelo ramo neutro →
  `Tests 2 failed | 6 passed (8)`. Em ambos, a árvore foi restaurada e o teste voltou a
  `Tests 8 passed (8)`; `git status --short` limpo depois das duas.
- As etapas 082 e 083 já existiam na ponta (barra, rodapé, toast e tranco entraram por outro cartão);
  o que este cartão acrescenta na ponta é o subtítulo canônico. O teste novo passa a TRAVAR 082/083.

## O que NÃO fiz e por quê
- Não mexi em `TasksBoardMode.tsx` (ficou igual à base) nem em `src/components/ui/*`.
- Não reimplementei nada de 082/083 já presente na ponta (o cartão manda provar e não reescrever).
- Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema.


## Aviso do juiz sobre o Ponto 1 — NÃO procede (o diff não tem como mostrar rebase)
O `jev-juiz` pede prova de merge/rebase dentro do diff; aqui não existe merge para mostrar: o workspace
JÁ nasceu na ponta `dia/2026-10-12` (BASE=dia/2026-10-12) e a resolução foi trazer só a faixa que
faltava. `git log --oneline dia/2026-10-12..HEAD` devolve exatamente os 3 commits do trabalho anterior
(`e25134fcd`, `6c0171b68`, `a2aadd1e7`) e nenhum outro. A prova VISÍVEL de que o conflito foi resolvido
preservando a ponta é o OPOSTO de um arquivo alterado: `TasksBoardMode.tsx` ficou com ZERO linhas no
diff (o lado da ponta inteiro permaneceu) e `BoardColumn.tsx` conserva `pressaoArrasto` (094),
`realceEspera` (096) e `colapsada` (093). Um merge commit aqui só acrescentaria ruído ao diff.

## Aviso do juiz sobre escopo — por que `src/hooks/tasks/workItem.types.ts` entrou
O cartão manda trazer a faixa do trabalho anterior e este arquivo carrega a etapa 081 (dado do pai
t_15507eb6): sem `KANBAN_COLUMNS.subtitle` não há de onde tirar os 5 subtítulos que a etapa 080 exige no
cabeçalho. São 1 campo no tipo e 5 strings; o componente apenas lê. Sem ele eu teria de inventar um mapa
local dentro do componente — exatamente o que removi por contrariar a seção 3 do plano.

## `zapp-verify full`
`zapp-verify full .` foi tentado e estourou o teto de 420 s da ferramenta (não devolveu VERDE nem
VERMELHO). A verificação que vale como prova, e que é a pedida no critério de pronto 3, é
`zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (109s)`.

## Linhas da tabela do plano (critério de pronto 1)
- Etapa 080 — seção 3, linha 138: "Colunas Caixa de entrada (A organizar), A fazer (Próximas ações),
  Fazendo 3/3 (Conclua uma para iniciar outra), Aguardando (Dependências externas), Concluído
  (Últimos 7 dias)"; tabela de etapas, linha 339.
- Etapa 081 — tabela de etapas, linha 340 ("Acrescentar `subtitle` curto mantendo a `policy` longa em
  `workItem.types.ts`") — dono declarado no plano: hugo; quem trouxe foi o ramo do cartão pai.
- Etapa 082 — seção 3, linha 139 ("Fazendo com barra de progresso azul e rodapé 'Seu limite é de 3
  tarefas em execução.'"); tabela de etapas, linha 341.
- Etapa 083 — tabela de etapas, linha 342 ("Soltar em Fazendo cheio faz a coluna tremer curto
  (em movimento reduzido só a borda muda), mostra toast explicativo e devolve o cartão").

## Casos de teste do cartão (critério de pronto 2), 8 no total
1. Etapa 080 · "cada coluna mostra o próprio subtítulo e o rótulo continua o primeiro span do cabeçalho"
2. Etapa 080 · "a política longa NÃO vira texto do cabeçalho — ela fica no tooltip do botão ⓘ"
3. Etapa 082 · "cheio (3/3): contador, 3 segmentos destrutivos e o rodapé do limite"
4. Etapa 082 · "parcial (1/3): um segmento primário e dois vazios — a barra segue azul, não destrutiva"
5. Etapa 082 · "coluna SEM limite duro não ganha barra nem rodapé"
6. Etapa 083 · "treme (só a borda garante o aviso em movimento reduzido), avisa e NÃO move o card"
7. Etapa 083 · "o tranco é curto: depois do tempo a coluna volta ao normal"
8. Etapa 083 · "reorganizar por dentro da coluna cheia NÃO treme nem avisa (B8 segue valendo)"
