Especialista: Íris (area-front-componentes)

## O que encontrei (defeito já resolvido no código atual)

O cartão pede para conferir se as ações rápidas da busca embutida executam a intenção e, se já resolvido, fechar sem commit de código. Conferi e o defeito NÃO existe mais na base do dia: a entrega anterior entrou por merge do PR #314.

Evidências de que a correção está presente:
- `git log --oneline -1 94b243954` → `fix(inbox): ações rápidas e busca embutida executam intenção (#314)`; o stat do commit lista exatamente os arquivos do defeito (GlobalSearch.tsx, RealtimeInboxView.tsx, ChatPanel.tsx, chat/ChatDialogs.tsx e os testes da busca).
- `git diff --stat f0b03bb56 HEAD -- src/components/inbox/GlobalSearch.tsx` → saída VAZIA: o GlobalSearch.tsx da base do dia é idêntico ao da entrega de 07/10 (f0b03bb56, extras/refazer). O conteúdo do pedido já está na árvore atual.
- `git grep -n "onNewConversation" HEAD -- src/components/inbox/` → GlobalSearch.tsx declara e usa `onNewConversation`, e RealtimeInboxView.tsx:231 passa `onNewConversation={() => inbox.setShowNewConversation(true)}`; ChatDialogs.tsx:67 passa `onManageQuickReplies={() => openDialog('quickReplies')}`. As ações rápidas chamam a intenção em vez de ficar inertes.
- `git grep -n "onSelectConversation" HEAD -- src/components/inbox/chat/ChatDialogs.tsx` → linha 66 `onSelectResult={(result) => { if (result.contactId) onSelectConversation?.(result.contactId); }}` e ChatPanel.tsx:455 `onSelectConversation={onSelectPinned}`: a seleção de resultado também executa a intenção, nos dois caminhos (busca embutida no chat e popup).

## Prova (verde, rodado agora)

- `npx vitest run src/components/inbox/__tests__/GlobalSearch.r2-inb-018.test.tsx src/components/inbox/__tests__/GlobalSearch.navigation.test.tsx`
  → `Test Files  2 passed (2)` / `Tests  8 passed (8)` — inclui o teste de regressão R2-INB-018 criado na entrega original.
- Nenhum arquivo de código mudou: o único arquivo do diff desta tarefa é este `.tmp/relato.md` (o repositório rastreia o relato). Variação de `git diff --stat HEAD` = só `.tmp/relato.md`.

## O que NÃO fiz e por quê

- Não commitei código e não criei "controle novo": o cartão manda fechar sem commit de código quando o defeito do pedido já foi corrigido no código atual.
- Não toquei em nenhum arquivo de código: as mudanças do pedido já estão na base do dia (commit 94b243954). O diff desta tarefa não tem código, só o próprio relato.
