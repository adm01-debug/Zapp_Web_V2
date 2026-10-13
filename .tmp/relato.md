Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- ESTADO.md: a âncora publicada de `auth-login` passou de `src/lib/serverLogin.ts:72` para `src/lib/serverLogin.ts:87`. A entrega original (t_3f45844b, cherry-pick de 1cc310895b e 191141a73) inseriu linhas acima da invocação `functions/v1/auth-login` no `serverLogin.ts`, deslocando-a; a guarda `docs-estado-registry-convention.unit.mjs` exige que a linha da âncora contenha o próprio nome da edge, e sem isso o ESPELHO DO CI quebra.
- Parti da entrega com `git cherry-pick -x` dos dois commits de código (não recomecei), para o ramo do refazer carregar o código original + a âncora alinhada.
- Correção é só de documento/causa; nenhuma asserção da guarda foi afrouxada e nenhum arquivo de `src/` foi tocado.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge / error: 'âncora desatualizada: src/lib/serverLogin.ts:72 não cita `auth-login`'`
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` -> `# tests 11 / # pass 11 / # fail 0`
- espelho do CI (mesmos comandos do `ci_espelho.sh`): node -> `# tests 1334 / # pass 1325 / # fail 8`, com exatamente as MESMAS 8 falhas da base (Talk X x2, lint-ratchet --staged x6) — nenhuma falha nova, o item do cartão saiu da lista; deno -> `ok | 1715 passed (16 steps) | 0 failed`; contratos -> `Test Files 89 passed (89); Tests 1379 passed (1379)`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (tipos, lint, db_guard, migrations: OK).

## Ponto 1 ([refazer]): ESPELHO DO CI vermelho em `ESTADO.md cita só âncoras reais`
- A causa era o deslocamento de linha em `serverLogin.ts` deixando a âncora de `auth-login` apontando para a linha errada. Alinhada em `ESTADO.md:63` para `:87` (a linha que contém `functions/v1/auth-login`). Prova: a guarda passa em isolamento (11/11) e a falha sai da lista do espelho, que fica idêntica à base.

## O que NÃO fiz e por quê
- Não executei `bash ~/arquitetura-v2/integrador/ci_espelho.sh`: bloqueado pelo HERMES-GUARD ("mexer nas guardas/ferramentas do Hermes e proibido"). Rodei os mesmos comandos que o script agrega, um a um, e comparei com a base pelo mesmo critério (só falha NOVA reprova).
- Não alterei `src/lib/serverLogin.ts` nem os testes: a entrega já vinha correta (`zapp-verify` verde nos tipos); o defeito era apenas a âncora do documento.
