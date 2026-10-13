Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- Cherry-pick da entrega `e4fc7620d` para esta branch (commit `3a99bb23be`), sem recomeçar. O diff desta branch tem 8 arquivos (2 de teste, 5 casos de teste novos):
  - código: `supabase/functions/_shared/cron-secret-auth.ts`, `supabase/functions/batch-fetch-avatars/index.ts`, `supabase/functions/webauthn/index.ts`;
  - testes: `supabase/functions/_shared/__tests__/cron-secret-authz-l5.test.ts`, `supabase/functions/webauthn/index.test.ts`;
  - manifesto: `supabase/deployment-manifest.json`;
  - doc regenerado: `docs/audits/edge-functions-authz-coverage.md`;
  - relato: `.tmp/relato.md`.
- Causa do desalinhamento: a entrega alterou `supabase/functions/_shared/cron-secret-auth.ts` (29→48 linhas cobertas, 30→51 totais) e o agregado foi de 83.6% para 84.0%; a régua N217 (teste "N217: docs bate com medição fresca e segunda execução é idêntica") compara o doc em disco com a medição fresca via deno, então `docs/audits/edge-functions-authz-coverage.md` ficou stale e reprovava.
- Correção: regenerei `docs/audits/edge-functions-authz-coverage.md` pela rota oficial do próprio gerador (REGENERAR_EDGE_AUTHZ_COV=1, o mesmo que a régua usa). O diff da correção é só a tabela do doc. Nenhum código de produção foi alterado por mim e nenhuma asserção foi afrouxada (nem o teste nem `scripts/ci/edge-coverage-authz.unit.mjs` foram tocados).

## Pontos do cartão (O QUE FAZER) — ponto a ponto
- Ponto 1: parti do commit da entrega com `git cherry-pick e4fc7620d` sobre a ponta de dia/2026-10-13 (`96dd72dc5`, que é exatamente o pai de e4fc7620d) → aplicou limpo e virou o commit `3a99bb23be`. Arquivos no diff: os 3 de código, os 2 de teste e o `supabase/deployment-manifest.json` listados acima. Sem recomeçar.
- Ponto 2: reproduzi na ponta atual e a causa é o doc derivado que a própria entrega deixou stale. Corrigi em `docs/audits/edge-functions-authz-coverage.md` (regenerado). O teste que prova é `N217: docs bate com medição fresca e segunda execução é idêntica`, que antes dava `# fail 1` e agora passa. Nenhuma asserção do teste ou do gerador foi alterada.
- Ponto 3: prova de execução — sha da entrega `e4fc7620d` (cherry-pick `3a99bb23be`) e base `96dd72dc5`; o HEAD da branch v2/edge-3funcoes-cron-espelho-ci-2610131045b9d8 é o sha desta correção. `node --test scripts/ci/edge-coverage-authz.unit.mjs` → `tests 8; pass 8; fail 0`; `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (OK dependencias/db_guard/tipos/lint/migrations). Esta evidência é saída de comando verde, não pode morar no diff de código — o cartão pede justamente isto. Ressalva: o cartão pede `bash ~/arquitetura-v2/integrador/ci_espelho.sh .`, que a guarda do Hermes bloqueia executar (`HERMES-GUARD: mexer nas guardas/ferramentas do Hermes ... é proibido`) em duas tentativas de caminho; não contornei a guarda e provei o item apontado rodando o próprio arquivo N217.

## O que NÃO fiz e por quê
- Não alterei `supabase/functions/_shared/cron-secret-auth.ts` nem os testes da régua: a entrega está correta; o que faltava era o doc derivado.
- Não regenerei `supabase/deployment-manifest.json` além do que a entrega já trouxe (o integrador regenera).
