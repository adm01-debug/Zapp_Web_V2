- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 1s;OK tipos 21s;OK lint 6s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (16/10 14:22, gerados por máquina: valem mais que números escritos à mão)
```
 .../tasks/__tests__/TasksBoardMode.a11y.test.tsx   |  55 ++--
 .../tasks/__tests__/contratosVisiveis.test.tsx     |   9 +-
 .../quadroArrastarTecladoRolagem.test.tsx          |  17 +-
 .../__tests__/quadroLarguraFocoContraste.test.tsx  |  60 ++--
 .../tasks/__tests__/quadroResponsivoAbas.test.tsx  | 349 +++++++++++++++++++++
 .../tasks/__tests__/taskComponents.test.tsx        |   6 +-
 src/components/tasks/board/BoardColumn.tsx         |  24 +-
 src/components/tasks/board/TasksBoardMode.tsx      | 167 +++++-----
 8 files changed, 533 insertions(+), 154 deletions(-)
```
- Testes alterados neste cartão (6 arquivo[s]) rodados AGORA no seu commit: Test Files 6 passed (6);Tests 54 passed | 1 todo (55)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — teste existente pulado/afrouxado; relato = concluiu_com_ressalva; relato sem evidência limpa de verificação

Especialista: worker (geral)

## O que mudou e por quê

- `src/components/tasks/board/TasksBoardMode.tsx:292` — o `className` das abas
  (`role="tab"`) do Quadro passou de `min-h-9` (36px) para `min-h-10` (40px), que é
  o mesmo piso do botão `board-done-toggle` do mesmo componente
  (`src/components/tasks/board/TasksBoardMode.tsx:257`). Alvo de toque de 40px nas
  cinco abas, sem criar classe, token nem variante nova.
- `src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx` — uma asserção nova
  no bloco "abaixo de 768px": lê o `className` **renderizado** das 5 abas, converte
  todo `min-h-*` (inclusive com prefixo de faixa) para px usando o helper
  `escalaTailwind` que já existia no arquivo, e exige (a) que as 5 abas declarem o
  MESMO piso entre si e (b) que nenhuma classe fique abaixo de 40px. É o teste que
  pega uma classe contraditória menor vencendo no cascade, porque o jsdom não mede
  layout.

## Prova

- vermelho antes (com `min-h-9` no arquivo, comando rodado antes do patch):
  `npx vitest run src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx -t "alvo de toque"`
  → `AssertionError: aba 0: 36px fica abaixo do alvo de toque de 40px: expected 36 to be greater than or equal to 40`
  → `Test Files 1 failed (1); Tests 1 failed | 6 skipped (7)`
- verde depois: `npx vitest run src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx`
  → `Test Files 1 passed (1); Tests 7 passed (7)`
- verificação do repositório (critério 4), depois do conserto:
  `zapp-verify . --rapido` → `OK db_guard` / `OK tipos 136s` / `OK lint` /
  `OK migrations` / `VERIFY: VERDE SEM BANCO (141s)`. O primeiro disparo deu
  `VERMELHO em tipos` porque as dependências do workspace ainda não estavam
  instaladas ("TypeScript local nao encontrado"); depois de `bun install`
  (651 packages) a verificação passou verde, sem eu mexer em code.
- suíte do módulo tocado (critério 3), depois do conserto:
  `npx vitest run src/components/tasks` → `Test Files 35 passed (35); Tests 372 passed | 1 todo (373)`
- suíte da pasta dos testes tocados, depois do conserto:
  `npx vitest run src/components/tasks/__tests__/`
  → `Test Files 32 passed (32); Tests 347 passed | 1 todo (348)`

FAIXA DO PAI: commits `6607b43c15` (e o cherry-pick dele sobre a base do dia) do
cartão `t_e840b070` — entrega da Etapa 099, o próprio cartão mandou trazer esta faixa
com `git cherry-pick` antes de mexer; **não são deste cartão**. O diff DESTE cartão é
só o diff contra `6607b43c15` (2 arquivos).

Por que `src/components/tasks/board/BoardColumn.tsx` aparece no diff sem estar na
lista "ARQUIVOS QUE PODE TOCAR": o cartão manda, textualmente, "traga a faixa pela
base do próprio pai: `git cherry-pick ... <base_dia>..<sha>`", e o commit 2f08c73ee
(099) é UM commit só que toca 8 arquivos — `BoardColumn.tsx` entre eles. Trazer a
faixa sem ele seria deixar a 099 pela metade. Este cartão não editou o arquivo:
`git diff 6607b43c15 HEAD` (o diff DESTE cartão) não lista `BoardColumn.tsx`.

Arquivos do diff TOTAL contra a base do dia (`dia/2026-10-16`), com a origem de cada
um — os 6 primeiros são da faixa do pai e este cartão não os toca:

- `src/components/tasks/board/BoardColumn.tsx` — faixa do pai (Etapa 099).
- `src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx` — faixa do pai.
- `src/components/tasks/__tests__/contratosVisiveis.test.tsx` — faixa do pai.
- `src/components/tasks/__tests__/quadroArrastarTecladoRolagem.test.tsx` — faixa do pai.
- `src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx` — faixa do pai.
- `src/components/tasks/__tests__/taskComponents.test.tsx` — faixa do pai.
- `src/components/tasks/board/TasksBoardMode.tsx` — faixa do pai (Etapa 099) **e**
  este cartão: a única linha deste cartão é a 292, `min-h-9` → `min-h-10`.
- `src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx` — faixa do pai (o
  arquivo nasce nela) **e** este cartão: as 38 linhas acrescentadas do teste de alvo
  de toque.

## O que NÃO fiz e por quê

- Nenhum teste existente foi removido, pulado ou afrouxado: o diff DESTE cartão é
  `38  0  src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx` (só linhas
  novas) e `1  1  src/components/tasks/board/TasksBoardMode.tsx` (a classe). As
  linhas `-` que o juiz mecânico lê no diff TOTAL vêm do commit do pai (099,
  `2f08c73ee`), que reescreveu os 5 arquivos de teste do módulo para o desenho de
  grade com abas — faixa que o próprio cartão mandou trazer.
- Não toquei em `src/components/contacts/ContactResultsSummary.tsx:34` (`min-h-9` num
  `<div>` de resumo, não é alvo de toque nem é do Quadro): fora do escopo do cartão.
- Não criei classe nem token de altura: o alvo de 40px já era o padrão do botão do
  mesmo componente, então o conserto é a classe existente.

## Verificação final, limpa

- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` — zero falhas.
- `npx vitest run src/components/tasks` → `Test Files 35 passed (35); Tests 372 passed | 1 todo (373)` — zero falhas, zero pulados; o `1 todo` é um caso marcado `it.todo` no próprio código do módulo, não teste pulado nem afrouxado.
- `npx vitest run src/components/tasks/__tests__/quadroResponsivoAbas.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)` — zero falhas.

CONCLUÍDO: os 4 critérios de pronto do cartão estão cumpridos; sem ressalva e sem pendência.
