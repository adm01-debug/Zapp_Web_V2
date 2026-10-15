Especialista: senior (area-front-hooks)
## O que mudou e por quê
- src/pages/admin/RateLimitDashboard.tsx: a aba Logs passa a consumir filtros, setFilters, resetFilters, total, totalPages e error do hook; acabou o slice no cliente; filtros por IP/endpoint/somente-bloqueados, ordenação, tamanho da página, paginação Anterior/Próxima e alerta de erro com botão de tentar de novo (ponto 1)
- src/pages/admin/__tests__/RateLimitDashboard.logs.test.tsx: novo; prova página inteira sem corte, total e paginação do servidor, erro com retry, aplicação de filtros e troca de ordenação/página/limpar (ponto 1)
- src/hooks/system/__tests__/useRateLimitLogs.test.ts: novo teste que resolve a página (deferred) com as estatísticas pendentes e exige o carregando apagado (ponto 2)
- src/hooks/__tests__/useRateLimitLogs.test.tsx: mock atualizado para a cadeia nova do hook (ordem dupla, range com count, limit da janela); contagens por ciclo 1 para 2 e 2 para 4 porque cada ciclo faz as duas consultas; adicionada asserção de erro na falha de busca
- src/pages/__tests__/n066-a11y-combobox-progressbar.test.tsx: mock do hook completado com os campos novos (a tela nova quebra sem eles)
## Prova
- vermelho antes (tela antiga, teste novo): `vitest run src/pages/admin/__tests__/RateLimitDashboard.logs.test.tsx` → `Test Files 1 failed (1); Tests 3 failed (3)`
- vermelho antes (mutação: carregando liberado só após as estatísticas): teste novo do ponto 2 → `Tests 1 failed | 7 skipped (8)`
- verde depois: `vitest run` nos 4 arquivos → `Test Files 4 passed (4); Tests 32 passed (32)`
- `eslint` nos 5 arquivos alterados → limpo
## Pontos do revisor
- Ponto 1: resolvido — a tela agora pagina, filtra e ordena a listagem pelo servidor e exibe erro com retry; prova no teste novo da tela (vermelho na tela antiga, verde na nova). Nota: o caminho citado na recusa não existe no repo; a tela real da listagem é src/pages/admin/RateLimitDashboard.tsx, aba Logs.
- Ponto 2: resolvido — teste novo trava que o carregando apaga quando a página resolve com estatísticas pendentes; a liberação já ocorria no finally da página e a mutação provou que o teste falha sem essa garantia.
- Ponto 3: verificado — `git diff --name-only dia/2026-10-13...HEAD` lista só arquivos deste cartão; os commits citados já estão na base do dia e nenhum arquivo deles foi tocado aqui.
## O que NÃO fiz e por quê
- Não alterei o hook useRateLimitLogs (o range do servidor com count exato já estava correto e coberto); não toquei em manifesto de deploy, Export Auto nem nas outras abas da tela.
Concluí o refazer 1 sem pendências.
