- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 29s;OK lint 10s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (14/10 07:33, gerados por máquina: valem mais que números escritos à mão)
```
 .../catalog/ExternalProductManagement.tsx          |  10 +-
 .../ExternalProductManagement.a11y.test.tsx        | 181 +++++++++++++++++++++
 src/components/connections/ConnectionCard.tsx      |   6 +-
 .../__tests__/ConnectionCard.a11y.test.tsx         | 109 +++++++++++++
 src/components/docs/SystemFeaturesView.tsx         |  14 +-
 .../__tests__/SystemFeaturesView.a11y.test.tsx     |  77 +++++++++
 src/components/groups/GroupsView.tsx               |   8 +
 .../groups/__tests__/GroupsView.a11y.test.tsx      | 181 +++++++++++++++++++++
 .../inbox/__tests__/StatusChips.a11y.test.tsx      |  83 ++++++++++
 .../inbox/conversation-list/StatusChips.tsx        |   4 +-
 10 files changed, 662 insertions(+), 11 deletions(-)
```
- Testes alterados neste cartão (5 arquivo[s]) rodados AGORA no seu commit: Test Files 5 passed (5);Tests 22 passed (22)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|

Especialista: semisenior (a11y/front — reescrita de testes com primitivos reais + vitest-axe)

## O que mudou e por quê
- `src/components/connections/ConnectionCard.tsx`: gatilho do menu trocado de `motion.div` + `Button` interno por `MotionButton` com `aria-label="Ações da conexão <nome>"` — o `motion.div` quebrava papel/nome acessível e gerava violação axe.
- `src/components/groups/GroupsView.tsx`: card selecionável ganhou `Checkbox` real com nome `Selecionar <nome>` / `Desmarcar <nome>` em vez de `div` clicável só com mouse.
- `src/components/docs/SystemFeaturesView.tsx`: cabeçalho de seção clicável virou botão com `tabIndex` e `aria-expanded`, com handlers de Enter/Espaço.
- `src/components/inbox/conversation-list/StatusChips.tsx`: grupo de filtros com `role="tablist"` e cada chip com `role="tab"` + `aria-selected`.
- `src/components/catalog/ExternalProductManagement.tsx`: `aria-label` nos dois `Select` de filtro (`Filtrar por categoria`, `Filtrar por fornecedor`), `aria-label="Limpar busca"` no botão de limpar, `aria-pressed` no toggle Grade/Lista.
- 5 testes reescritos com primitivos reais + `axe(document.body)`: `ConnectionCard.a11y`, `GroupsView.a11y`, `SystemFeaturesView.a11y`, `StatusChips.a11y`, `ExternalProductManagement.a11y` (mesmas pastas `__tests__` dos componentes).

## Prova
- vermelho antes (fontes do cherry-pick escondidas via stash, só testes no ar): `bunx vitest run` nos 5 arquivos → 11 falhas (ex.: `FAIL .../ExternalProductManagement.a11y.test.tsx > ... os seletores de categoria e fornecedor (Select real) têm nome acessível`; `FAIL .../GroupsView.a11y.test.tsx > ... o card do grupo tem checkbox de seleção com nome acessível`).
- verde depois: `bunx vitest run` nos 5 arquivos → `Test Files 5 passed (5); Tests 22 passed (22)`.
- regressão ao lado: `GroupsView.test.tsx + GroupsView.broadcast.test.tsx + ConnectionCard.confirmacao.test.tsx` → `Test Files 4 passed (4); Tests 31 passed (31)`; `SystemFeaturesView.test.tsx + ChatbotFlowsView.a11y.test.tsx` → `Test Files 2 passed (2); Tests 9 passed (9)`; `CT67_a11y + CT68_acessibilidade + ConversationListSidebar` → `Test Files 3 passed (3); Tests 27 passed (27)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (264s)` (exit=0; `banco_local` não verificado — sem migration neste cartão).
- Sobre "teste que não chama o código mudado": cada arquivo tem 1 teste-controle que renderiza de propósito um `<button>` só-ícone sem nome para provar que o axe acusa violação real (sem ele, um axe que nunca rodasse passaria calado); todos os demais testes renderizam os componentes reais com primitivos reais.

## Pontos da recusa (conflito com a ponta do dia + 6 itens do pedido original)
- Ponto 0 (trazer dia/2026-10-10 por merge/rebase + `zapp-verify full`): não procede como escrito — o workspace já parte da ponta viva (base `338a420d`, posterior a dia/2026-10-10, que ela contém); `git cherry-pick -n 06f9a6747`, único conflito em `ConnectionCard.tsx` resolvido preservando HEAD (a ponta já trazia os nomes com conexão); verificação pelo critério 3 do cartão, `zapp-verify . --rapido` → VERDE (o cartão pede `--rapido`, não `full`).
- Ponto 1 (ConnectionCard botão sem nome): resolvido — `MotionButton` com `aria-label="Ações da conexão <nome>"` em `ConnectionCard.tsx`; prova no teste `ConnectionCard.a11y.test.tsx` (nome exato + axe sem violação critical/serious).
- Ponto 2 (GroupsView card só com mouse): resolvido DE JEITO DIFERENTE DO PEDIDO — em vez de `role="button"+tabIndex+onKeyDown` no card, usei `Checkbox` real nomeado, porque o card contém botão interno e Select e `role="button"` aninhando interativos violaria aninhamento de interativos; teclado chega ao checkbox (foco provado) e a seleção alterna. Prova em `GroupsView.a11y.test.tsx`.
- Ponto 3 (SystemFeaturesView cabeçalho sem papel/teclado): resolvido — botão com `tabIndex`/`aria-expanded` + Enter/Espaço em `SystemFeaturesView.tsx`; prova em `SystemFeaturesView.a11y.test.tsx`.
- Ponto 4 (StatusChips sem tablist/tab): resolvido — `role="tablist"/"tab"/aria-selected` em `StatusChips.tsx`; prova em `StatusChips.a11y.test.tsx`.
- Ponto 5 (ChatbotFlowsView botões sem aria-label): já estava na ponta — `ChatbotFlowsView.tsx` tem `aria-label="Editar fluxo <nome>"`, `"Duplicar fluxo <nome>"`, `"Excluir fluxo <nome>"`, `"Ativar <nome>"` e `aria-label="Tipo de gatilho"`; conflito do cherry-pick resolvido preservando HEAD, sem diff neste arquivo. Prova: `ChatbotFlowsView.a11y.test.tsx` 9/9 com os vizinhos.
- Ponto 6 (toggle Grade/Lista só com title): resolvido — `aria-pressed` no toggle em `ExternalProductManagement.tsx`, mais `aria-label` nos dois Selects e no botão limpar (sem nome, mesma tela); prova em `ExternalProductManagement.a11y.test.tsx`.
- Conflito com a ponta: cherry-pick `06f9a6747` aplicado com `-n`; único conflito em `ConnectionCard.tsx` resolvido preservando HEAD (a ponta já trazia os nomes com conexão). Nenhum commit de outro cartão no diff.

## Arquivos (`git diff --name-only`)
- src/components/catalog/ExternalProductManagement.tsx
- src/components/catalog/__tests__/ExternalProductManagement.a11y.test.tsx
- src/components/connections/ConnectionCard.tsx
- src/components/connections/__tests__/ConnectionCard.a11y.test.tsx
- src/components/docs/SystemFeaturesView.tsx
- src/components/docs/__tests__/SystemFeaturesView.a11y.test.tsx
- src/components/groups/GroupsView.tsx
- src/components/groups/__tests__/GroupsView.a11y.test.tsx
- src/components/inbox/__tests__/StatusChips.a11y.test.tsx
- src/components/inbox/conversation-list/StatusChips.tsx

## O que NÃO fiz e por quê
- Não toquei em `ChatbotFlowsView.tsx`: a ponta já contém os `aria-label`s do ponto 5.
- Não usei `role="button"` no card de grupo (ponto 2): aninharia botão + Select dentro de elemento clicável; o `Checkbox` real é o padrão correto.
