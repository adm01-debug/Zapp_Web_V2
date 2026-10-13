Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/groups/GroupsView.tsx: o card do grupo é clicável mas não tinha nome/papel acessível nem teclado. Ganhou `role="button"`, `tabIndex={0}`, `aria-pressed={isSelected}` e `onKeyDown` (Enter/Espaço selecionam/desmarcam).
- src/components/docs/SystemFeaturesView.tsx: o cabeçalho de seção expande por clique e não anunciava estado. Ganhou `role="button"`, `tabIndex={0}`, `aria-expanded={isExpanded}` e `onKeyDown` (Enter/Espaço; ignorado quando há busca ativa, igual ao onClick).
- src/components/inbox/conversation-list/StatusChips.tsx: os chips de filtro não tinham papel. O container ganhou `role="tablist"` + `aria-label="Filtros de conversa"`; cada chip ganhou `role="tab"` e `aria-selected={isActive}`.
- src/components/catalog/ExternalProductManagement.tsx: o alternador Grade/Lista não anunciava o modo ativo. Os dois botões ganharam `aria-pressed` (`viewMode === 'grid'` / `'list'`).
- Testes novos (renderizam o componente REAL, não mock): groups/__tests__/GroupsView.a11y.test.tsx, docs/__tests__/SystemFeaturesView.a11y.test.tsx, inbox/__tests__/StatusChips.a11y.test.tsx, catalog/__tests__/ExternalProductManagement.a11y.test.tsx.

## Itens do pedido já corrigidos na base (conferidos, sem commit de código aqui)
- item 1 (ConnectionCard.tsx): já tem `aria-label={`Ações da conexão ${connection.name}`}` e teste em connections/__tests__/ConnectionCard.sem-integracoes.test.tsx ("o botão do menu do card tem aria-label com o nome da conexão").
- item 5 (ChatbotFlowsView.tsx): já tem `aria-label` em "Editar/Duplicar/Excluir fluxo <fluxo>" e teste em chatbot/__tests__/ChatbotFlowsView.a11y.test.tsx (Editar/Duplicar/Excluir).
Não criei controle novo nesses dois: já estavam resolvidos por outro cartão.

## Prova
- vermelho antes: `npx vitest run <os 4 a11y.test.tsx>` com os 4 componentes na versão da base 453e6b69f9 → `Test Files  4 failed (4)` / `Tests  7 failed (7)`
- verde depois: mesmo comando com o diff aplicado → `Test Files  4 passed (4)` / `Tests  7 passed (7)`
- regressão vizinha: `npx vitest run src/components/groups/__tests__/ src/components/docs/__tests__/ src/components/catalog/__tests__/CT67_a11y.test.tsx src/components/catalog/__tests__/CT68_acessibilidade.test.tsx src/components/catalog/__tests__/ExternalProductManagement.test.tsx src/components/catalog/__tests__/CT74_headerSemTroca.test.tsx` → `Test Files  9 passed (9)` / `Tests  83 passed (83)`

## O que NÃO fiz e por quê
- Nada de mudança de valor, token, escala ou banco: são só atributos ARIA/teclado nos controles citados.
- Não toquei em src/hooks/**, src/services/**, supabase/**.

Concluí o escopo do cartão.
