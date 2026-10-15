Especialista: semisenior (area-edge-api)

## O que mudou e por quê
- `docs/audits/edge-functions-authz-coverage.md`: regenerado pela rota oficial do próprio gerador (`REGENERAR_EDGE_AUTHZ_COV=1`, a mesma que a régua N217 usa). A entrega `e4fc7620d` alterou `supabase/functions/_shared/cron-secret-auth.ts` (29→48 linhas cobertas, 30→51 totais; agregado 83.6%→84.0%) e deixou este doc derivado stale, reprovando o espelho do CI. O restante do diff é a entrega anterior intacta (`e4fc7620d`: cron-secret-auth, batch-fetch-avatars, webauthn + testes + manifesto).
- Nenhuma asserção da régua nem o gerador foram tocados; nenhum código de produção alterado por mim.

## Prova
- vermelho antes: `node --test scripts/ci/edge-coverage-authz.unit.mjs` → `fail 1` em `N217: docs bate com medição fresca e segunda execução é idêntica` (disco 255/305/83.6% vs medição fresca 274/326/84.0%).
- verde depois: `node --test scripts/ci/edge-coverage-authz.unit.mjs` → `tests 8; pass 8; fail 0` (inclui a 2ª execução idêntica, que o próprio teste confere).
- doc regenerado byte-idêntico à correção oficial (`a4d6049576`, blob `090bb803da`).
- `deno test` do webauthn da entrega: `3 passed | 0 failed`.
- `zapp-verify full .` → `VERIFY: VERMELHO em testes`: 1 failed em `RuleValueInput.test.tsx` (talkx) + 1 erro de worker em `RealtimeInboxView.selectedMessagesError.test.tsx` (inbox). Ambos fora do meu diff (`git diff 96dd72dc5f HEAD --stat -- src/components/talkx/ src/components/inbox/` vazio); `jev-juiz falha` → `pre_existing (0.99)`; o RuleValueInput falha igual isolado (1 failed | 4 passed) e o RealtimeInboxView passa isolado (3 passed). Não mexi fora do escopo. Demais etapas do full verdes (dependencias, db_guard, tipos, lint, migrations).

## Pontos da recusa ([refazer 1])
- Ponto 1 (único: espelho do CI quebrado no empilhamento, nó N217; correção em t_e3beeacb): resolvido — reproduzi com a régua N217 (fail 1 antes), regenerei o doc pela rota oficial (pass 8/8 depois), idêntico à correção de referência. Sem recomeçar: parti da entrega `e4fc7620d` sobre a base `96dd72dc5f` e somei 1 commit (`0faabb3d7e`).

## O que NÃO fiz e por quê
- Não alterei `supabase/deployment-manifest.json` além do que a entrega já trouxe (o integrador regenera).
- Não corrigi as 2 falhas do `zapp-verify full` (talkx/inbox): pré-existentes, fora do escopo deste cartão.
- Não toquei em guarda, CI, migration, banco ou produção.

## Arquivos (`git diff --name-only 96dd72dc5f...HEAD`)
- docs/audits/edge-functions-authz-coverage.md (minha correção)
- supabase/deployment-manifest.json (entrega anterior)
- supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts (entrega anterior)
- supabase/functions/_shared/cron-secret-auth.ts (entrega anterior)
- supabase/functions/batch-fetch-avatars/index.ts (entrega anterior)
- supabase/functions/webauthn/index.test.ts (entrega anterior)
- supabase/functions/webauthn/index.ts (entrega anterior)
