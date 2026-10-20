Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/connections/ConnectionCard.tsx: o botão de ícone do menu (MoreVertical) ganhou `aria-label="Mais opções da conexão"` — antes era só ícone, sem nome para leitor de tela.
- src/components/groups/GroupsView.tsx: o card de grupo selecionável para broadcast ganhou `role="button"`, `tabIndex={0}`, `aria-pressed={isSelected}` e `onKeyDown` (Enter/Espaço → `toggleGroupSelection`) — antes tinha só `onClick`, inalcançável por teclado.
- src/components/docs/SystemFeaturesView.tsx: o cabeçalho de seção clicável ganhou `role="button"`, `tabIndex={0}`, `aria-expanded={isExpanded}` e `onKeyDown` (Enter/Espaço → `toggleSection`), respeitando `!searchTerm` igual ao `onClick`.
- src/components/inbox/conversation-list/StatusChips.tsx: a faixa de chips virou `role="tablist" aria-label="Filtros de conversa"` e cada chip virou `role="tab" aria-selected={isActive}` — mesmo padrão já existente em src/components/team-chat/TeamConversationList.tsx:104-119.
- src/components/chatbot/ChatbotFlowsView.tsx: os três botões de ícone do card de fluxo ganharam `aria-label` "Editar fluxo", "Duplicar fluxo" e "Excluir fluxo".
- src/components/catalog/ExternalProductManagement.tsx: os botões Grade/Lista ganharam `aria-pressed={viewMode === 'grid'|'list'}` — o estado do toggle passa a ser anunciado; o `title` ("Grade"/"Lista") continua como estava.

Nenhum valor, teto, escala, cor ou texto de tela mudou; nenhuma animação nova. Só nome acessível, papel e estado nos 6 pontos que o cartão cita.

## Prova
- vermelho antes: `npx vitest run <os 6 arquivos .a11y.test.tsx>` com os 6 componentes na versão da base (HEAD, extraída com `git show 6bc63c78a:<arquivo> > <arquivo>`; sem `git stash`) → `Test Files 6 failed (6)` / `Tests 9 failed (9)`.
- verde depois: `npx vitest run src/components/.../{StatusChips,ConnectionCard,SystemFeaturesView,GroupsView}.a11y.test.tsx ...` → `Test Files 6 passed (6)` / `Tests 9 passed (9)`.
- regressão: os 6 arquivos novos + os 4 testes que já existiam dos mesmos componentes (StatusChips.test, ConnectionCard.sem-integracoes.test, SystemFeaturesView.test, GroupsView.broadcast.test) → `Test Files 10 passed (10)` / `Tests 22 passed (22)`.
- Os testes renderizam o componente REAL (sem mock que já traz a resposta) com testing-library; o de SystemFeaturesView e o de GroupsView disparam `fireEvent.keyDown` com Enter e Espaço para provar o teclado.

## O que NÃO fiz e por quê
- Não criei controle novo nem regra nova além do nome/papel/estado dos 6 pontos.
- Não toquei em outros arquivos (nem em testes de outros assuntos): os únicos arquivos mudados são os 6 citados no cartão + 6 testes `.a11y.test.tsx` novos para prová-los.
