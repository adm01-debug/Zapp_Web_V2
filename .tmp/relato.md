Especialista: Íris (area-front-componentes)

## O que fiz e por quê
O cartão pede para retomar `fix(grupos): manter grupo selecionado no menu de envio`, mas manda conferir ANTES se o defeito ainda existe no código atual — e, se já corrigido por outra entrega, fechar SEM commit de código, só com a prova.

O defeito (R2-API-061 / #233) JÁ está corrigido no código atual (base `dia/2026-10-11`):
- `src/components/groups/GroupsView.tsx:240` — o item "Enviar mensagem" do menu do card chama `selectGroup(group.id)` e abre o diálogo (antes chamava `toggleGroupSelection`, que retirava o grupo já selecionado dos destinatários).
- `src/hooks/chat/useGroupsManager.ts:56-63` — o hook expõe `selectGroup`, adição idempotente que NUNCA remove (se já está no `Set`, devolve o mesmo estado).
- `src/components/groups/__tests__/GroupsView.test.tsx:197-227` — os dois testes de regressão do #233 já existem (grupo já selecionado continua nos destinatários; com A e B selecionados, o menu de A não converte o público em só B).

A correção entrou no histórico pelo commit `c633a5ca6` ("fix(grupos): manter grupo já selecionado no menu \"Enviar mensagem\""), que é ancestral do HEAD desta tarefa (`git merge-base --is-ancestor c633a5ca6 HEAD` → verdadeiro). Por isso NÃO recriei a correção e NÃO criei commit de código: o diff desta entrega é vazio de propósito.

## Prova
- verde depois: `npx vitest run src/components/groups/__tests__/GroupsView.test.tsx` → `Test Files 1 passed (1); Tests 16 passed (16)` (inclui os 2 testes de regressão do #233).
- defeito ausente no código atual: `GroupsView.tsx:240` usa `selectGroup`; `useGroupsManager.ts:56` define `selectGroup`. Conferido por `git grep -n "selectGroup" -- src/hooks/chat/useGroupsManager.ts src/components/groups/GroupsView.tsx`.
- correção já integrada: `c633a5ca6` é ancestral de HEAD.

## O que NÃO fiz e por quê
- NÃO commitei código: o cartão manda fechar sem commit quando o defeito já está resolvido no código atual.
- NÃO recriei `selectGroup`/os testes: já presentes e verdes; recriar seria diff alheio ao cartão.
- NÃO toquei em nenhum arquivo além dos três do escopo (#233): não havia nada a alterar.
