Especialista: senior (area-front-hooks)
## O que mudou e por quê
- `src/services/contact.service.ts` (fetchStats, linhas 240-248, 267-268, 285-286): expõe `responseSampleCount` (`response_samples` da RPC) e `medianResponseTimeMinutes` (`median_response_minutes`), nos dois ramos (linha e conjunto vazio); atualiza o comentário de contrato que citava o subtítulo antigo.
- `src/hooks/crm/useContactStats.ts` (linhas 12-15): interface `ContactStats` ganha os dois campos como opcionais — nenhum consumidor quebra (ContactDetailPanel, JourneyTab, monitoramento usam mocks parciais ou só os campos antigos).
- `src/components/inbox/tabs/ContactStatsStrip.tsx` (linha 58): subtítulo do tile "Tempo médio" passa a "Resposta ao cliente · todo o histórico".
- `src/services/__tests__/contact.service.stats.test.ts` (linhas 79, 117, 145): contrato 7→9 campos, conjunto vazio com os novos zeros, amostra NULL com mediana null.
- `src/components/inbox/tabs/__tests__/ContactStatsStrip.test.tsx` (linha 41): teste do subtítulo passa a exigir o texto novo e a ausência do antigo. Teste existente ajustado porque a recusa manda trocar o texto: "o subtítulo ('200 primeiras msgs') está desatualizado".
- Nenhum arquivo de migration foi editado. A função aplicada no conjunto local estava divergente do arquivo (filtro de janela nos pares); reapliquei o conteúdo do próprio arquivo `supabase/migrations/20261013230002_contact_response_stats.sql` no conjunto `v2-crs-refazer1` (CREATE OR REPLACE idempotente).

## Prova
- vermelho antes (só `src/services/contact.service.ts` revertido via stash): `bunx vitest run src/services/__tests__/contact.service.stats.test.ts` → `Test Files 1 failed (1); Tests 3 failed | 5 passed (8)` (contrato de 9 campos, conjunto vazio e amostra NULL falham sem a correção).
- verde depois: `bunx vitest run src/services/__tests__/contact.service.stats.test.ts src/components/inbox/tabs/__tests__/ContactStatsStrip.test.tsx` → `Test Files 2 passed (2); Tests 15 passed (15)`.
- vizinhos: `ContactDetailPanel.activity.test.tsx` → `Tests 5 passed (5)`; `JourneyTab.test.tsx` + `ContactStatsCards.test.tsx` → `Tests 20 passed (20)`.
- banco local (`v2-crs-refazer1`): `supabase/tests/contact_response_stats.sql` com `ON_ERROR_STOP=1` → `NOTICE: contact_response_stats: suite OK — 7 grupo(s) verificado(s)` (T4: 300 pares de 90 dias atrás, média 3.67, mediana 5.00 — histórico inteiro, sem corte).

## Pontos do revisor
- Ponto 1 (contrato de 7 campos quebrava a RPC de 13: amostra e mediana descartadas): resolvido — `src/services/contact.service.ts:285-286` mapeia `response_samples`→`responseSampleCount` e `median_response_minutes`→`medianResponseTimeMinutes` (zeros/null no ramo vazio, linhas 267-268); tipo em `src/hooks/crm/useContactStats.ts:12-15`; prova: `contact.service.stats.test.ts:79` (contrato de 9 campos) e `:145` (NULL→0/null) — vermelhos sem a correção, verdes com ela.
- Ponto 2 (fetchStats removeu tratamento de erro nas consultas restantes): verificado no código real — em `fetchStats` resta UMA consulta (a RPC) e ela verifica `.error` (`if (error) throw error`, linha ~256); não há consulta PostgREST restante sem checagem; prova: `contact.service.stats.test.ts:167` (erro 42501 rejeita, painel recebe estado de erro em vez de zeros) — passa.
- Ponto 3 (subtítulo "200 primeiras msgs" desatualizado): resolvido — `ContactStatsStrip.tsx:58` agora diz "todo o histórico"; prova: `ContactStatsStrip.test.tsx:41` exige o texto novo e a ausência do antigo (troca mandada pela frase da recusa citada acima).
- Ponto 4 (tempo de resposta ignorava o resto do histórico): resolvido do jeito correto — em vez da paginação no cliente sugerida, a RPC já mede os pares contato→agente sobre todo o histórico por window function, e o defeito restante estava no ESTADO do banco local (a função aplicada no conjunto tinha filtro de janela nos pares, divergindo do arquivo); reapliquei o arquivo e provei com dado real: `supabase/tests/contact_response_stats.sql` T4 (600 mensagens/300 pares de 90 dias atrás) → suite OK, 7 grupos.

## O que NÃO fiz e por quê
- Não exibi mediana/amostra na tira nem mudei `src/types/contact.ts` (ContactStats de lá não é usado pelo fluxo de stats) — fora dos 4 pontos, seria diff maior que o título.
- Não toquei na query sem checagem de erro em `fetchNotes` (linha dos autores) — pré-existente, fora do fetchStats, fora da recusa.
- Não editei a migration (só apliquei o conteúdo existente no banco local) — editar invalidaria o sha aplicado.
