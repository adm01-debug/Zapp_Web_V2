Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/inbox/useInboxFilters.ts: o `useMemo` de `filteredConversations` ganhou um ramo `chipTab === 'archived'` ANTES do ramo `mainTab === 'open'`. O chip deriva `mainTab 'open' | subTab null` (setChipTab), e esse ramo exige `conversation_status open|waiting` — sem o ramo novo a lista de Arquivadas ficava vazia. O ramo novo filtra `contact.conversation_status === 'archived'` e, como busca/tipo de contato/status/tags/agente/data são aplicados depois, mantém esses filtros por cima; o filtro de fila (`selectedQueueId`), que hoje só existe no ramo 'open', foi replicado nele.
- src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx (novo): 5 testes chamando o hook REAL via renderHook — Arquivadas lista só arquivadas; arquivadas ausentes de Todas/Não lidas/Em atendimento/Aguardando/Resolvidas; busca dentro de Arquivadas; fila dentro de Arquivadas; e lista vazia sem erro quando não há arquivadas.

## O que conferi no código atual (dia/2026-10-11)
- Item 2 (arquivadas fora dos outros chips): os chips Todas/Não lidas/Em atendimento/Aguardando derivam `mainTab 'open'` (status open|waiting) e Resolvidas usa `mainTab 'resolved'` — nenhum deles conhece 'archived', então já excluíam as arquivadas; o teste cobre os cinco chips e confirma. Não havia ramo vazando arquivadas para os chips.
- Item 3 (persistência): `chipTab` é `useState` local (useInboxFilters.ts:19), não é persistido em URL/storage (só `search`, `type` e os `filters` vão para a URL). Logo o comportamento de 'archived' ao trocar de chip e voltar é o mesmo dos outros chips (reinicia), e não há valor guardado que possa quebrar a lista. Nada a mudar.
- Item 4 (estado vazio): com o chip ativo e nenhuma arquivada, `filteredConversations` fica vazio e a sidebar cai no estado vazio com a microcopy neutra "Sem conversas" (ConversationListSidebar.tsx:251 — fallback, não é "sem conversas abertas"). Já é coerente; não alterei o arquivo (está fora dos caminhos permitidos do cartão e a mudança seria visual, que é do B1).

## Prova
- vermelho antes (só o teste novo, sem a correção): `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` → `Tests 4 failed | 1 passed (5)` (Arquivadas devolvia 'aberta' etc.).
- verde depois (com a correção): `npx vitest run src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx src/hooks/inbox/__tests__/useInboxFilters.fsm-padrao.test.tsx src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` → `Test Files 3 passed (3); Tests 10 passed (10)`.
- regressão da pasta inteira: `npx vitest run src/hooks/inbox` → `Test Files 19 passed (19); Tests 92 passed | 1 expected fail (93)`.

## Sobre o aviso do juiz (arquivo fora de 'ARQUIVOS QUE PODE TOCAR')
- `src/components/inbox/__tests__/StatusChips.test.tsx` (e `StatusChips.tsx`) aparecem no diff da branch porque o cartão PAI t_2bcde689 não estava em `dia/2026-10-11`: segui a instrução do próprio cartão ("traga com git cherry-pick <sha>") e apliquei `git cherry-pick -x 452075a32` (commit f14f8de63). Não editei esses arquivos — são 100% do B1 e indispensáveis aqui porque o chip `archived` (tipo `ChipTab`) vem deles. Meu diff de código é só em `useInboxFilters.ts` + teste novo.

## O que NÃO fiz e por quê
- Não mexi em archiveContact/bulkArchive/useBulkActions (proibido pelo cartão), nem em migration/banco/Edge.
- Não alterei a microcopy de lista vazia nem o StatusChips: fora dos caminhos permitidos e é do B1.
- Não apliquei exclusão de arquivadas no ramo `mainTab 'search'` (deep-link de contato pendente de RealtimeInboxView, que não é chip): mudar ali sairia do escopo dos cinco chips e poderia quebrar o deep-link; o cartão lista os chips Todas/Não lidas/Em atendimento/Aguardando, cobertos.
