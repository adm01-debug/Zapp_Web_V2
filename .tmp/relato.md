Especialista: senior (area-edge-api)

## Pontos da recusa
- Ponto 1: o inventário `ESTADO.md` agora registra a edge `automation-suggest-reply` como grupo A, com a âncora real `src/hooks/chat/useAutomationSuggestions.ts:192`. Também corrigi os totais do próprio inventário para a ponta atual (`82` edges, grupo A `55`) e mantive a linha na ordem da tabela (`auto-close-conversations` → `automation-suggest-reply` → `batch-fetch-avatars`), sem mexer na guarda. Prova vermelha: removendo essa linha do `ESTADO.md` com a Edge presente, `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` saiu com `RED_STATUS=1`, `pass 9`, `fail 2` e `ESTADO.md não tem linha para a edge automation-suggest-reply`. Prova verde: o mesmo comando passou com `pass 11`, `fail 0`.
- Ponto 2: preservei a implementação e a prova funcional do pedido original nos arquivos da Edge (`supabase/functions/automation-suggest-reply/index.ts` e `supabase/functions/automation-suggest-reply/index.test.ts`), sem trazer outros módulos do trabalho anterior. Prova verde: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` passou com `ok | 13 passed | 0 failed`.

## O que mudou e por quê
- `ESTADO.md`: registra `automation-suggest-reply` no inventário de Edge Functions, grupo A, usando a âncora real do hook que chama a edge. Este arquivo não aparece no bloco "ARQUIVOS QUE PODE TOCAR", mas a recusa pediu exatamente a inclusão da edge no inventário; sem esse arquivo a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` fica vermelha. Por isso ele é indispensável para corrigir a recusa e não é achado fora de escopo.
- `supabase/functions/automation-suggest-reply/index.ts`: reaplicada a Edge Function do trabalho anterior, que resolve contexto pelo client autenticado do chamador, usa a última mensagem recebida na consulta `search_knowledge_base`, chama o roteador real de IA e devolve no máximo 3 sugestões com fonte carimbada no servidor.
- `supabase/functions/automation-suggest-reply/index.test.ts`: reaplicada a prova offline que chama `handleAutomationSuggestReply` real e substitui só as fronteiras de banco/IA. O fechar mede este diff como 1 arquivo de teste e 10 casos de teste novos; o comando Deno roda o arquivo completo e mostra 13 casos passando.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` com a linha de `automation-suggest-reply` removida de `ESTADO.md` → `RED_STATUS=1`, `pass 9`, `fail 2`, `ESTADO.md não tem linha para a edge automation-suggest-reply`.
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `pass 11`, `fail 0`.
- Edge real: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed`.
- verificação final: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (267s)`; banco não verificado porque este cartão não altera migration nem SQL. A primeira tentativa caiu em typecheck por processo `tsc` morto com exit 137; `jev-juiz falha` classificou como ambiente (certeza 0.88) e a repetição passou.

## Arquivos do diff
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts

## O que NÃO fiz e por quê
- Não alterei `scripts/ci/docs-estado-registry-convention.unit.mjs`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`, migrations, dependências, CI ou outros módulos.
- Não fiz deploy, push, PR nem acessei produção.

## Avisos do fechar que não procedem
- O primeiro aviso disse que `supabase/functions/automation-suggest-reply/index.ts` não tinha teste novo/alterado, mas o próprio diff contém `supabase/functions/automation-suggest-reply/index.test.ts` e ele foi executado pelo Deno com `ok | 13 passed | 0 failed`.
- O aviso sobre `ESTADO.md` fora da lista de arquivos não procede porque o motivo da recusa exige justamente registrar a edge nova no inventário; sem essa linha, a guarda de docs falha com `ESTADO.md não tem linha para a edge automation-suggest-reply`.
