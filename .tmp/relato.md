Especialista: hugo

O QUE MUDOU
- `src/hooks/system/useRateLimitLogs.ts`: a listagem passou a ser resolvida no servidor — `.select('*', { count: 'exact' })` + `.range(from, to)` (página/tamanho, padrão 25), filtros por IP e endpoint via `.ilike` com `escapeOrFilterValue` e "só bloqueados" via `.eq('blocked', true)`, ordenação por campo/direção com desempate por `id`. O hook devolve `total`, `totalPages`, `error`, `filters`/`setFilters`/`resetFilters`; trocar filtro, ordem ou tamanho de página volta para a página 1 e só um `page` explícito mantém a página pedida. O erro da consulta deixou de ser engolido: sobe para o estado `error` que o chamador lê.
- Corrida: a resposta da consulta antiga é descartada depois de um `await` (sinal de aborto checado) e não sobrescreve o resultado novo nem prende o `loading`. Todos os canais do hook (poll de visibilidade e `refetch` manual) usam a mesma consulta filtrada e paginada, porque ambos passam pelo mesmo `refresh`.
- A janela recente que alimenta os cartões de estatística continua separada da listagem paginada (`.limit(100)`), preservando o comportamento anterior da tela.
- Teste novo `src/hooks/system/__tests__/useRateLimitLogs.test.ts`, com 7 casos: recorte de página no servidor (`range` + `count: 'exact'`), filtros com o escape de `escapeOrFilterValue`, ordem com desempate por `id`, volta à página 1 ao mudar filtro, erro exposto ao chamador, resposta obsoleta descartada quando o filtro muda no meio da consulta e a janela de estatística separada.

PROVA
- `npx vitest run src/hooks/system/__tests__/useRateLimitLogs.test.ts` — Test Files 1 passed, Tests 7 passed.
- Vermelho antes: com o hook da base `dia/2026-10-13`, o mesmo teste dá Test Files 1 failed, Tests 6 failed | 1 passed.
- `zapp-verify . --rapido` — resultado nos FATOS MEDIDOS abaixo.
