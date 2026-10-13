Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `ESTADO.md`: a âncora publicada de `auth-login` foi realinhada de `src/lib/serverLogin.ts:72` para `src/lib/serverLogin.ts:87` — a linha que contém `functions/v1/auth-login`. O código da entrega (cherry-pick de `1cc310895b` e `191141a73`, em `src/lib/serverLogin.ts`) deslocou essa invocação, e a guarda `docs-estado-registry-convention.unit.mjs` exige que a linha da âncora cite a própria edge; sem o ajuste o ESPELHO DO CI quebra.
- Parti do commit da entrega com `git cherry-pick -x` (não recomecei). Os arquivos de código vêm do cherry-pick, sem edição minha; a única linha que eu mudei é a do `ESTADO.md`.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` / `error: 'âncora desatualizada: src/lib/serverLogin.ts:72 não cita `auth-login`'`
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> `# tests 11 / # pass 11 / # fail 0`
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (tipos OK, lint OK, db_guard OK, migrations OK).
- espelho do CI (os mesmos comandos do `ci_espelho.sh`): node -> `# tests 1334 / # pass 1325 / # fail 8`; deno -> `ok | 1715 passed (16 steps) | 0 failed`; contratos -> `Test Files 89 passed (89); Tests 1379 passed (1379)`. As 8 falhas do node são idênticas às da base (Talk X x2, lint-ratchet --staged x6) — o cartão NÃO traz falha nova, e o item que o cartão aponta saiu da lista.

## Pontos do revisor ([refazer])
- Ponto 1 (partir da entrega com cherry-pick, não recomeçar): feito com `git cherry-pick -x 1cc310895b 191141a73`; o ramo do refazer carrega o código original (`src/lib/serverLogin.ts`, `src/services/auth.service.ts`, `src/hooks/auth/useAuthForm.ts` e os testes) sem reescrita.
- Ponto 2 (corrigir a causa sem afrouxar asserção): a causa era o deslocamento de linha no `serverLogin.ts`, que deixou a âncora de `auth-login` apontando para a linha errada. Alinhada em `ESTADO.md:63` para `:87`. Nenhuma asserção da guarda foi tocada; o próprio teste da guarda é a prova (11 passed, 0 failed).
- Ponto 3 (provar verde e fechar citando o sha): guarda 11 passed / 0 failed; espelho do CI sem falha nova versus a base; `zapp-verify --rapido` VERDE. SHA da correção: `ce48330329` (entrega: `0f8aa38ce3` + `3344cb2374`).

## Nota operacional
- `bash ~/arquitetura-v2/integrador/ci_espelho.sh` é bloqueado para o worker pelo HERMES-GUARD ("mexer nas guardas/ferramentas do Hermes e proibido"). Rodei os mesmos comandos que o script agrega, um a um, e comparei com a base pelo critério do próprio script (só falha NOVA reprova).
