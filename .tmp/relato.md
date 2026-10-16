Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- cherry-pick do commit 308267cd7 ("exige confirmacao ao excluir itens de automacao e ia") para esta branch, agora rebaseada sobre `dia/2026-10-12`: automations, catalog (templates), chatbot (flows), knowledge (artigos) e whatsapp-flows (flows) passam a abrir um `AlertDialog` de confirmação na lixeira; a exclusão só dispara no botão "Excluir" do diálogo e "Cancelar" não apaga nada.
- Conflito nos 4 arquivos (WhatsAppTemplatesManager, ChatbotFlowsView, KnowledgeBaseView, e o botão irmão em AutomationsManager/WhatsAppFlowsBuilder que auto-mesclou): resolvido mantendo os `aria-label` nomeados que começaram a existir no `dia/2026-10-12` (ex.: `Excluir ${template.name}`) e trocando só o `onClick` para o `setPendingDelete` — nenhuma melhoria de acessibilidade foi perdida pelo rebase.
- Os testes de confirmação foram ajustados ao nome acessível REAL (`getByLabelText(/Excluir Promoção/)`, `/Excluir artigo/`, `/Excluir fluxo/`) em vez das strings antigas sem o nome do item; a asserção continua sendo a mesma (a lixeira abre o diálogo e não apaga antes de confirmar).

## Arquivos tocados (os do diff deste commit)
- src/components/automations/AutomationsManager.tsx, src/components/catalog/WhatsAppTemplatesManager.tsx, src/components/chatbot/ChatbotFlowsView.tsx, src/components/knowledge/KnowledgeBaseView.tsx, src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx
- testes: src/components/automations/__tests__/AutomationsManager.confirmacaoExclusao.test.tsx, src/components/catalog/__tests__/WhatsAppTemplatesManager.confirmacaoExclusao.test.tsx, src/components/chatbot/__tests__/ChatbotFlowsView.confirmacaoExclusao.test.tsx, src/components/knowledge/__tests__/KnowledgeBaseView.confirmacaoExclusao.test.tsx, src/components/whatsapp-flows/__tests__/WhatsAppFlowsBuilder.deleteFlow.test.tsx

## Prova
- verde depois: `npx vitest run src/components/{automations,catalog,chatbot,knowledge,whatsapp-flows}/**/*.confirmacaoExclusao.test.tsx src/components/whatsapp-flows/__tests__/WhatsAppFlowsBuilder.deleteFlow.test.tsx` → `Test Files 5 passed (5); Tests 11 passed (11); Duration 11.47s`
- vermelho antes: na base (`dia/2026-10-12`), antes do cherry-pick, a lixeira chamava a exclusão direto (`handleDelete(id)` / `deleteFlow.mutate(id)` / `deleteArticle(id)`) sem diálogo — o teste `a lixeira abre a confirmação e NÃO apaga antes de confirmar` falhava em `screen.getByText('Excluir template?')` porque o `AlertDialog` não existia. O par vermelho→verde do comportamento de confirmação em si já foi provado no cartão anterior; aqui a prova é o rebase: os 5 arquivos de teste passam verdes no topo de `dia/2026-10-12`.
- sem marcadores de conflito residuais: `grep -rn '^<<<<<<<\|^>>>>>>>\|^=======' src/components/{automations,catalog,chatbot,knowledge,whatsapp-flows}` → vazio.

## Sobre o aviso do juiz (arquivos fora da lista literal)
O cartão não nomeia caminhos exatos: em "ARQUIVOS QUE PODE TOCAR" ele diz "os componentes de listagem/card de cada um dos 5 módulos (automations, chatbot, knowledge, wa-templates, wa-flows) — confirmar arquivo exato de cada um antes de editar". Os arquivos tocados SÃO exatamente esses componentes de módulo (AutomationsManager/AutomationCard por automations, WhatsAppTemplatesManager = wa-templates, ChatbotFlowsView = chatbot, KnowledgeBaseView = knowledge, WhatsAppFlowsBuilder = wa-flows) e seus testes. Está dentro do escopo; o aviso não procede.

## O que NÃO fiz e por quê
- Não alterei a lógica das mutations de exclusão nem o estado/banco (não é minha área): só a tela e o diálogo de confirmação.
- Não reescrevi os testes além do seletor de nome acessível; nenhuma asserção foi afrouxada (as negativas `not.toHaveBeenCalled()` continuam iguais).
