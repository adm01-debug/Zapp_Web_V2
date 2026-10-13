Especialista: Hugo (area-front-hooks)
Resultado: CONCLUÍDO. O defeito do cartão (SEC-FRONTEND-05) não existe mais no código atual e os quatro critérios de pronto estão cumpridos, provados pelos testes abaixo.

## Como resolvi o motivo da retomada (conflito com a ponta)
A retomada foi pedida porque a entrega anterior (branch v2/busca-livre-url-poe-pii-2610102039abeb, commit f62cab300) conflitava com dia/2026-10-12. Criei o workspace a partir da ponta ATUAL (dia/2026-10-13, HEAD 96dd72dc5f) e conferi o código do pedido antes de mexer.

O defeito já está corrigido na ponta atual por trabalho independente já integrado: commit cc9c6cae94 "fix(inbox): texto da busca não vai mais para a URL (?q=) [refazer 1]" (11/10, cartão V2 2610101713e9cb), o último que toca src/hooks/system/useUrlFilters.ts e src/hooks/inbox/useInboxFilters.ts. O cartão manda fechar sem commit de código quando o defeito já está resolvido, então o diff é vazio (commit vazio registra a retomada). Cherry-pick de f62cab300 foi dispensado: ele traria o estado intermediário (search dentro de useUrlFilters) contra a correção já integrada, que é a melhor — mantém o texto em estado local do hook da tela, não do hook compartilhado de URL.

## Verificação no código atual (arquivos do cartão)
- src/hooks/system/useUrlFilters.ts: PARAM_KEYS só tem status/tags/agent/from/to; não existe mais `search: 'q'`. LEGACY_SEARCH_KEY = 'q' serve só para APAGAR o `q` de link antigo em clearFilters; nunca lê nem grava o texto.
- src/hooks/inbox/useInboxFilters.ts: o texto da busca vive só em `const [search, setSearch] = useState('')` (linha 74) e sai no retorno do hook; `setFilters` não repassa busca para a URL. O consumidor src/components/inbox/ConversationListSidebar.tsx:282 lê inboxFilters.search (contrato preservado).
- src/hooks/tasks/workItemFilters.ts: searchWithFilters faz `params.delete('q')` (linha 90) e nunca `set`; o estado q existe só no reducer, em memória.
- src/hooks/tasks/useTasksFilters.ts: a URL recebe o resultado de searchWithFilters (linha 108), logo sem `q`.
- src/hooks/dashboard/useDashboardUrlFilters.ts: não conhece `q` em nenhum ponto (0 ocorrências); só period/queue/agent/from/to.

## Prova (comando rodado agora e linha de resultado)
- `npx vitest run src/hooks/__tests__/useUrlFilters.test.tsx src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/hooks/dashboard/__tests__/useDashboardUrlFilters.test.tsx` → `Test Files 4 passed (4); Tests 42 passed (42)` (zero falhas, zero pulados). Cobre "does not read search text from ?q=", "setFilters writes status/agent but never ?q=", a rota espelhada de Tarefas e o hook do dashboard.

## Critério de pronto
1. Buscar telefone/e-mail no Inbox não altera a URL: useUrlFilters não tem chave de busca e useInboxFilters guarda o texto em useState local; provado por "setFilters writes status/agent but never ?q=".
2. Filtros não-PII (status/tags/data) seguem na URL: PARAM_KEYS mantém status/tags/agent/from/to; o mesmo teste confere status e agent escritos.
3. Teste de rota espelhada de Tarefas passa: useTasksFilters.test.tsx e workItemFilters.test.ts verdes.
4. zapp-verify . --rapido: executado pelo fechar (FATOS MEDIDOS abaixo).

## Escopo
Só os arquivos do cartão foram considerados; nenhum deles tocou o defeito porque ele já estava resolvido na ponta. Fora do escopo deste cartão, a Telefonia ainda escreve texto de busca na URL (src/hooks/calls/useTelefoniaFilters.ts:68, mesmo padrão em src/hooks/voice/voiceActionPlan.ts:26) — não é arquivo que este cartão pode tocar; registrei em kanban_comment para virar cartão próprio do worker (hooks).
