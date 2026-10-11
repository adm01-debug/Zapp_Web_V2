Especialista: worker (geral)

## O que mudou e por quê
- Fatos do diff (base `32c68d56a`, a ponta de dia/2026-10-11): 4 arquivos de projeto — ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md e `scripts/ci/docs-estado-registry-convention.unit.mjs` (1 arquivo de teste, com 11 casos) — 804 inserções, 0 remoções.
- ESTADO.md: reposicionei as âncoras `arquivo:linha` do documento para a ponta atual de dia/2026-10-11 — 12 âncoras apontavam para uma linha que **não** contém a própria edge (o doc só é verdadeiro no estado isolado de quando foi escrito). A guarda continua exigindo o mesmo critério: toda âncora citada tem de existir e a linha citada tem de conter a edge.
- `scripts/ci/docs-estado-registry-convention.unit.mjs` e TESTING_CONVENTION.md: a entrega apontava a quarentena do E2E para um caminho inexistente (`e2e/quarantine.json`); corrigi para `e2e/quarantine.js`, que é o módulo real.
- Os três documentos (ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md) e a guarda entram nesta branch pelo cherry-pick da entrega `2e674b5da` (não recomecei), mais os reposicionamentos acima.

## Prova
- vermelho antes (doc da entrega contra as fontes da ponta atual, mesma lógica da guarda): `node .tmp/diag-ancoras.mjs .tmp/ESTADO.delivery.md` → `TOTAL ANCORAS RUINS: 12` (ex.: `ai-proxy (A) src/hooks/inbox/useObjectionDetector.ts:163`, `talkx-send (A) src/hooks/integrations/useTalkX.ts:442`).
- verde depois (a guarda real do item): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `ℹ tests 11 / ℹ pass 11 / ℹ fail 0`.
- verde depois (ancoragem): `node .tmp/diag-ancoras.mjs ESTADO.md` → `TOTAL ANCORAS RUINS: 0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (51s)` (tipos, lint, migrations, dependências e db_guard OK).
- O item do espelho é um teste node; rodei a mesma porção node do `ci_espelho.sh` (`node --test --test-reporter=tap scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs`): `# tests 1319 / # pass 1309 / # fail 9 / # skipped 1` e `node: ESTADO.md cita só âncoras reais...` NÃO aparece entre os 9 (são falhas de base: fixtures do lint-ratchet e 2 do Talk X, que o `ci_espelho` desconta por já falharem na base).

## Pontos do revisor (corrigir do cartão)
- Ponto 1: parti do commit da entrega — cherry-pick de `2e674b5da` sobre a ponta de dia/2026-10-11 (commit `ea2f2eecc` na branch, seguido de `c9911d117` e `a5f46c0b6`); não recomecei.
- Ponto 2: reproduzi o item sobre a ponta atual (`TOTAL ANCORAS RUINS: 12` com o doc da entrega) e corrigi a causa — reposicionei as âncoras no ESTADO.md e alinhei TESTING_CONVENTION.md/guarda à quarentena real; o critério da guarda não foi tocado nem afrouxado (continua `arquivo:linha` com a edge na linha citada).
- Ponto 3: provei verde — `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11 / pass 11 / fail 0` e `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`; fecho citando o sha.
- Nota do juiz automático ("5 arquivos, 6 casos de teste novos"): o diff real tem 4 arquivos de projeto (1 de teste, 11 casos) + o próprio `.tmp/relato.md`; os 11 casos são os que a guarda executa (`tests 11 / pass 11 / fail 0`).

## O que NÃO fiz e por quê
- Não rodei `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` direto: o HERMES-GUARD bloqueou a chamada duas vezes ("mexer nas guardas/ferramentas do Hermes"); não contornei a guarda — repliquei a porção node, que é exatamente onde está o item.
- Não mudei o critério da guarda nem removi asserção: o teste continua exigindo `arquivo:linha` com a edge na linha citada e comparando grupo/totais/órfãs com o código; só reposicionei os números no documento.
- Não toquei em banco, Edge, segredo nem produção.
