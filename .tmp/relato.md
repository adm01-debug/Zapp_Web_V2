Especialista: senior (área-testes-do-produto/CI; refazer da entrega originalmente feita por Vera)

Estado final entregue
- Criei a spec e2e/a11y-inbox-teams.spec.ts com 4 casos (Inbox desktop, Teams desktop, Inbox mobile, Teams mobile) no projeto chromium-a11y.
- A spec usa sessão falsa e backend mockado; os mocks devolvem dados reais o bastante para renderizar itens antes do axe: contatos+mensagens no Inbox e conversas+tabela+membros no Teams.
- O axe roda restrito a button-name e list em document.body, depois de esperar item visível na lista da tela.
- Ajustei só a linha testMatch do projeto chromium-a11y em playwright.config.ts para incluir a11y-inbox-teams sem remover contraste nem config-admin.

Como os 5 pontos da recusa original ficam resolvidos
1. Prova vermelho->verde: refiz a prova na base atual. Com o aria-label do botão de favoritar do Inbox removido temporariamente em src/components/inbox/VirtualizedRealtimeList.tsx, o comando abaixo falhou em Inbox desktop e Inbox mobile com button-name (critical): 2 no(s). Depois restaurei o arquivo e o mesmo spec passou com 4 passed.
   Vermelho: ./node_modules/.bin/playwright test --project=chromium-a11y e2e/a11y-inbox-teams.spec.ts --grep "Inbox" --reporter=line -> 2 failed / 2 passed; log .tmp/e2e-vermelho-n078.log.
   Verde: ./node_modules/.bin/playwright test --project=chromium-a11y e2e/a11y-inbox-teams.spec.ts --reporter=line -> 4 passed (35.8s); log .tmp/e2e-verde-final-n078.log.
2. Mocks com dados e espera por item: mockInboxComDados devolve 2 contatos e 2 mensagens, com conversation_status open e assigned_to igual ao usuário falso; mockTeamsComDados devolve 2 conversas, registros de team_conversations e membros. Antes do axe, o Inbox espera page.getByTestId('conversation-item').first() visível e o Teams espera page.getByRole('list', { name: 'Conversas' }).getByRole('listitem').first() visível.
3. Sem código morto: não há mockTeamVazio nem parâmetro seletor na spec. A medição usa sempre document.body e as rotas de Teams usadas pela tela estão mockadas.
4. Mensagem e tipos batem com o teste: a mensagem do expect diz "zero violacoes de button-name, list", sem falar em SERIOUS/CRITICAL; o tipo ViolacaoAxe usa impact: string | null; o arquivo termina com newline.
5. Caminhos do mesmo defeito foram varridos com git grep e estão listados abaixo. Corrigi/cobri só os caminhos do cartão (Inbox e Teams nas views exercitadas); os demais são achados fora de escopo e não foram alterados.

Detalhe da regra list
- No Teams atual, a lista coberta pela spec é uma list acessível chamada "Conversas" com filhos listitem; por isso a regra list é exercitada de verdade antes do axe zerar violações.
- No Inbox, a régua cobre os itens de conversa renderizados e os botões das linhas; a regra list também roda sobre document.body, mas a prova de regressão explícita do defeito de botão é a remoção temporária do aria-label.
- Controle isolado do axe para a regra list: node .tmp/prova-list.mjs -> CONTROLE: [] e QUEBRA: ["list (serious): 1 no(s)"]. Esse controle prova que a regra está ativa no harness; não é usado para dizer que Teams zera "por construção".

Caminhos do mesmo defeito encontrados por git grep
Comando salvo em .tmp/git-grep-n078.txt.
- role="tab" ou role="listbox" em src/components/inbox e src/components/team-chat: ChatSearchFilters, ConversationTabs, SuggestionList, CategorySelector, StickerCategoryBar, AddMembersDialog, DepartmentManagementDialog, NewConversationDialog, TeamConversationList, TransferConversationDialog e testes relacionados.
- <ul> ou <ol> em src/components/inbox e src/components/team-chat: FileUploader, ForwardMessageDialog, KeyPointsTab, MessageSendHistorySheet, ContactIntelligencePanel, SummaryResult, AiTab, Crm360Tab, NotesTab, OpenDealsList, JourneyFilters/JourneyStatsHero/JourneyTimeline e GroupManagementDialog/TransferConversationDialog.
- Dentro deste cartão, a cobertura nova mira as views Inbox e Teams pedidas; não corrigi abas, diálogos, stickers, jornadas ou testes fora do escopo.

Arquivos no diff final contra dia/2026-10-14
- .tmp/relato.md: este relato refeito como estado final.
- e2e/a11y-inbox-teams.spec.ts: spec nova com 235 linhas e 4 casos.
- playwright.config.ts: 1 linha do testMatch do projeto chromium-a11y, preservando config-admin e adicionando inbox-teams.

Comandos executados nesta retomada
- bun install -> instalou dependências no workspace.
- ./node_modules/.bin/playwright install chromium -> instalou navegador local que faltava no workspace/cache.
- ./node_modules/.bin/playwright test --project=chromium-a11y e2e/a11y-inbox-teams.spec.ts --reporter=line -> primeiro falhou porque o browser não existia; depois do install, verde com 4 passed (35.8s).
- ./node_modules/.bin/playwright test --project=chromium-a11y e2e/a11y-inbox-teams.spec.ts --grep "Inbox" --reporter=line com aria-label removido temporariamente -> vermelho esperado: 2 failed / 2 passed, button-name (critical): 2 no(s).
- node .tmp/prova-list.mjs -> CONTROLE: [] / QUEBRA: ["list (serious): 1 no(s)"].
- git diff --stat dia/2026-10-14...HEAD -> antes de registrar este relato no commit: e2e/a11y-inbox-teams.spec.ts e playwright.config.ts, 236 insertions e 1 deletion; após registrar o relato, o diff final terá também .tmp/relato.md, como pedido na devolução.
- jev-juiz pronto .tmp/relato.md -> jev-juiz (pronto-5): nada a apontar no diff (3 arquivos) nem no relato. Pode fechar.

O que não fiz
- Não alterei telas do Inbox/Teams nem corrigi achados laterais fora das views pedidas.
- Não usei produção, sessão salva, projeto chromium-authenticated nem credenciais reais.
- Não removi config-admin do chromium-a11y.
