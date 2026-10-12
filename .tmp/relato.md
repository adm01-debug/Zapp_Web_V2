Especialista: Hugo (area-front-hooks)

Cartão CT-F (P2): 4 correções na ficha do contato — estado da lista de Contatos na URL, "Hoje" = 00:00 do fuso do app, campos personalizados no React Query com guarda de UUID, enriquecidos sem `undefined`, e o hook de atribuição deixando de gravar sem avisar o cache.

## O que mudou e por quê
- src/hooks/crm/useContactsSearch.ts — busca/aba/empresa/cargo/período/ordem/página espelhados na URL (`?q,tab,company,job,date,sort,p`) via `useSearchParams` + `replace`: recarregar (ou abrir um link) mantém o estado da lista e filtrar não empilha histórico. A URL é lida só na montagem e reescrita quando algo muda (só quando difere, então não há laço de navegação). Parâmetro vindo da URL passa por validação/corte (período e ordem por whitelist, texto cortado em 120, `p` inteiro ≥ 1). `tag` fica de fora de propósito (etiqueta de contato é função excluída do sistema; `filterTag` segue em memória). O `case 'today'` passou de `now - 24h` para `appDayStart(0)` (00:00 em America/Sao_Paulo, `src/lib/localDay.ts`) — às 09h o balcão espera ver tudo desde 00:00.
- src/hooks/crm/useContactCustomFields.ts — trocado o `useState`+`fetch` manual por `useQuery` (`queryKey: ['contact-custom-fields', id]`, `staleTime: 30s`), com guarda `isValidContactId` (UUID): id texto/vazio/`undefined` não consulta o banco e não fica "carregando" (o PostgREST devolvia 400 com id inválido). Erro do banco sobe para a query em vez de virar lista vazia em cache; `addField`/`removeField` invalidam a lista e mantêm o `throw` que já existia. Contrato de retorno preservado (`fields`, `isLoading`, `addField`, `removeField`, `refetch`).
- src/hooks/crm/useContactEnrichedData.ts — `normalizeEnrichedData` preenche com `null` explícito as 16 colunas do enriquecido quando vierem ausentes, em vez de `undefined`: o tipo promete `string | null` e o painel deixa de ter dois "vazios" diferentes.
- src/hooks/crm/useContactAssignment.ts — o cartão oferece remover o órfão **ou** invalidar os caches; escolhi invalidar (apagar arquivo exige `rm`/`git rm`, proibido no modo sem humano — registrei em comentário). `assignAgent`/`assignQueue` agora invalidam `contacts-kpi`, `contacts-type-counts`, `contacts-search`, `contact-enriched:<id>`, `contact-crm-360:<id>` e `conversation-tab-counts:<id>` depois do UPDATE — antes a lista, os KPIs e o Crm360 mostravam o responsável antigo até recarregar.

## Prova
Vermelho antes (fonte revertida para a base `dia/2026-10-12` com os testes novos no lugar):
`npx vitest run src/hooks/crm/__tests__/useContactsSearch.test.tsx src/hooks/crm/__tests__/useContactsSearch.urlReplace.test.tsx src/hooks/crm/__tests__/useContactAssignment.test.tsx src/hooks/crm/__tests__/useContactEnrichedData.test.tsx src/hooks/__tests__/useContactCustomFields.test.tsx src/hooks/crm/__tests__/contactsAggregatesRefetchOnMount.test.tsx`
→ `Test Files 5 failed | 1 passed (6); Tests 14 failed | 34 passed | 1 expected fail (49)` — falham exatamente a URL (`monta busca, aba...`, `cada mudança reescreve a URL...`, `clearFilters...`, `escreve com { replace: true }...`), o período (`date_from por período...`), o UUID (`contact_id que não é UUID...`, `addField com id inválido...`), a invalidação (`removeField apaga pelo id e reconsulta`, os dois `assignAgent/assignQueue`) e a normalização (`coluna ausente vira null explícito`).

Verde depois (mesmo comando, fonte com a correção):
→ `Test Files 6 passed (6); Tests 48 passed | 1 expected fail (49)`

Sem regressão nas áreas vizinhas:
`npx vitest run src/components/contacts/__tests__ src/components/tasks/__tests__` → `Test Files 62 passed (62); Tests 568 passed | 1 todo (569)`
`npx vitest run src/components/inbox src/components/talkx src/hooks/chat src/hooks/crm` → `Test Files 356 passed | 1 failed (357); Tests 3000 passed` — a única falha é um websocket (`ERR_INVALID_ARG_TYPE`, `RealtimeInboxView.selectedMessagesError.test.tsx`) que passa isolado (`1 passed (1); Tests 3 passed`) e não toca nenhum arquivo deste diff.

O hook passou a exigir `Router` no `useSearchParams`: o único consumidor de teste que o chamava sem Router (`contactsAggregatesRefetchOnMount.test.tsx`) passou a envolver em `MemoryRouter`; `useContactsCRUD.test.tsx` já dubla o hook.

## O que NÃO fiz e por quê
- useContactAssignment continua órfão (nenhum importador) e exportado pelo barril `src/hooks/crm/index.ts`: apagar exigiria `rm`/`git rm`, bloqueado neste modo. Comentado no cartão.
- `ContactCombobox` (src/components/tasks) compartilha `useContactsSearch`, então a busca dele agora também aparece em `?q=` na URL da tela de Tarefas. É arquivo de componentes (fora da minha área): comentado no cartão para quem cuida da tela decidir se quer passar a sincronização só na tela de Contatos.
