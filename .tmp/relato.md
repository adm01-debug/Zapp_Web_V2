Especialista: senior (area-edge-api)

## O que mudou e por quê
- `supabase/functions/automation-suggest-reply/index.ts`: reapliquei a Edge Function do trabalho anterior, que expõe o handler autenticado `automation-suggest-reply`, resolve o contexto pelo client autenticado do chamador, usa a última mensagem recebida para consultar `search_knowledge_base`, chama o roteador real de IA e devolve no máximo 3 sugestões com fonte carimbada no servidor.
- `supabase/functions/automation-suggest-reply/index.test.ts`: mantive a prova offline que chama `handleAutomationSuggestReply` real e substitui só as fronteiras de banco/IA; o juiz barato mediu 1 arquivo de teste e 10 casos novos no diff, e o comando Deno rodou o arquivo completo.
- `ESTADO.md`: corrigi o ponto recusado registrando a nova edge no inventário, grupo A, com âncora real `src/hooks/chat/useAutomationSuggestions.ts:192`, e atualizei totais/lista de órfãs sem mexer na guarda. Este arquivo não aparece no bloco "ARQUIVOS QUE PODE TOCAR", mas foi indispensável porque o motivo da recusa pediu exatamente incluir a edge no inventário e a guarda falha sem ele.

## Pontos da recusa
- Ponto 1: a Edge nova existia no diff anterior, mas o inventário `ESTADO.md` não tinha a linha `automation-suggest-reply`. Corrigi em `ESTADO.md`. Prova vermelha: com a Edge aplicada e `ESTADO.md` da base, `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` saiu com `RED_STATUS=1`, `pass 9`, `fail 2` e `ESTADO.md não tem linha para a edge automation-suggest-reply`. Prova verde: o mesmo comando passou com `pass 11`, `fail 0`.
- Ponto 2: preservei a implementação/prova funcional do pedido original sem trazer outros arquivos: `supabase/functions/automation-suggest-reply/index.ts` e `supabase/functions/automation-suggest-reply/index.test.ts`. Prova verde: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` passou com `ok | 13 passed | 0 failed`.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` com `ESTADO.md` da base e a Edge presente → `RED_STATUS=1`, `pass 9`, `fail 2`, `ESTADO.md não tem linha para a edge automation-suggest-reply`.
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `pass 11`, `fail 0`.
- Edge real: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed`.
- verificação final: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (79s)`; banco não verificado porque este cartão não altera migration nem SQL.

## Arquivos do diff
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts

## O que NÃO fiz e por quê
- Não alterei `scripts/ci/docs-estado-registry-convention.unit.mjs`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`, migrations, dependências, CI ou outros módulos.
- Não fiz deploy, push, PR nem acessei produção.
