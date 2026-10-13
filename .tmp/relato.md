Especialista: Hugo (area-front-hooks)

## Como resolvi o motivo da retomada (conflito com a ponta)
Retomada pedida porque a entrega anterior (branch v2/busca-livre-url-poe-pii-2610102039abeb, commit f62cab300) conflitava com dia/2026-10-12. Criei o workspace a partir da ponta ATUAL (dia/2026-10-13, HEAD 96dd72dc5f) e conferi o código do pedido antes de mexer.

O defeito do pedido JÁ ESTÁ CORRIGIDO na ponta atual, por trabalho independente já integrado: commit cc9c6cae94 "fix(inbox): texto da busca não vai mais para a URL (?q=) [refazer 1]" (Hermes Senior, 11/10, cartão V2 2610101713e9cb). Ele é o último commit que toca src/hooks/system/useUrlFilters.ts e src/hooks/inbox/useInboxFilters.ts. Por isso NÃO commitei código (o cartão manda fechar sem commit quando já resolvido) e NÃO fiz cherry-pick de f62cab300: ele reintroduziria o estado intermediário (search dentro de useUrlFilters) contra a correção já integrada, que é melhor — mantém o texto em estado local do hook da tela, não do hook de URL compartilhado.

## O que verifiquei no código atual (arquivos do cartão)
- src/hooks/system/useUrlFilters.ts: PARAM_KEYS só tem status/tags/agent/from/to; não existe mais `search: 'q'`. Resta LEGACY_SEARCH_KEY = 'q' usado apenas para APAGAR o `q` de link antigo em clearFilters. Nunca lê nem grava o texto.
- src/hooks/inbox/useInboxFilters.ts: o texto da busca vive só em `const [search, setSearch] = useState('')` (linha 74) e sai no retorno do hook; `setFilters` não repassa busca para a URL. O consumidor src/components/inbox/ConversationListSidebar.tsx:282 lê inboxFilters.search (contrato preservado).
- src/hooks/tasks/workItemFilters.ts: searchWithFilters faz `params.delete('q')` (linha 90) e nunca `set`; o estado q existe só no reducer, em memória.
- src/hooks/tasks/useTasksFilters.ts: a URL recebe o resultado de searchWithFilters (linha 108), logo sem `q`.
- src/hooks/dashboard/useDashboardUrlFilters.ts: não conhece `q` em nenhum ponto (grep = 0 ocorrências); só period/queue/agent/from/to.

## Prova (executada agora, saída real)
- `npx vitest run src/hooks/__tests__/useUrlFilters.test.tsx src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/hooks/inbox/__tests__` → Test Files 22 passed (22); Tests 154 passed | 1 expected fail (155). Cobre os critérios: "does not read search text from ?q=" e "setFilters writes status/agent but never ?q=" (useUrlFilters), a rota espelhada de Tarefas (useTasksFilters/workItemFilters) e os hooks do Inbox.
- `npx vitest run src/hooks/dashboard/__tests__/useDashboardUrlFilters.test.tsx` → Test Files 1 passed (1); Tests 11 passed (11).

## Critério de pronto
1. Busca por telefone/e-mail no Inbox não altera a URL: verdadeiro — useUrlFilters não tem chave de busca e useInboxFilters guarda o texto em useState local. Prova no teste "setFilters writes status/agent but never ?q=".
2. Filtros não-PII seguem na URL: verdadeiro — PARAM_KEYS mantém status/tags/agent/from/to; o mesmo teste confere status e agent escritos.
3. Teste de rota espelhada de Tarefas continua passando: useTasksFilters.test.tsx e workItemFilters.test.ts verdes.
4. zapp-verify --rapido: roda no fechar (FATOS MEDIDOS abaixo).

## O que NÃO fiz e por quê
- Nenhum commit de código: o defeito do cartão já está corrigido na ponta atual (cc9c6cae94); o cartão manda fechar sem commit nesse caso. Diff vazio.
- Não toquei fora da minha área nem nos arquivos permitidos por outro motivo que não o defeito.

## Achado fora do escopo (registrado em kanban_comment, não corrigido)
- src/hooks/calls/useTelefoniaFilters.ts:68 (setFilter) grava em `replaceState` o valor de QUALQUER chave, inclusive 'q' — ou seja a Telefonia ainda pode levar o texto da busca (potencial telefone) para a URL; mesmo padrão em src/hooks/voice/voiceActionPlan.ts:26 (FILTER_PARAM_KEYS inclui 'q'). Não está na lista de arquivos que este cartão pode tocar, então fica como cartão novo.
