Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- Nenhuma linha de código: a parte 2/3 do cartão já está integrada na base do dia. O filtro da aba Arquivadas vive em `src/hooks/inbox/useInboxFilters.ts` (ramo `chipTab === 'archived'`, guardado por `isArchived` de `./chipCounts`) e entrou no commit 32c68d56a, que é ancestral do HEAD desta branch. O teste do hook `src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` (mesmo commit) prova o comportamento. Conferi o código e a suíte, e fecho sem diff redundante — exatamente o caminho que o pai (t_02d47e19) prescreveu para "já resolvido".

## Prova
- `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts` → `Test Files 2 passed (2); Tests 39 passed (39)`.
- `git merge-base --is-ancestor 32c68d56a HEAD` → ok (implementação já na base).

## O que NÃO fiz e por quê
- Não criei o ramo `mainTab === 'archived'`: o tipo `MainTab` (`src/components/inbox/conversation-list/StatusChips.tsx:8`) é `'open' | 'resolved' | 'search'` e não inclui `'archived'` — a parte 1/3 fechou o tipo assim. A implementação aceita na base resolve pelo chip (`chipTab === 'archived'`), que dá o mesmo resultado funcional nas abas e é o que o teste do hook prova; trocar para `mainTab` exigiria mexer no tipo fora do escopo deste cartão.
- Não há ramos de flag `inbox.status-fsm`: o flag foi aposentado e não existe em `src/` (FSM é o padrão).
- Não toquei em banco, Edge, produção, credenciais nem dependência nova.
