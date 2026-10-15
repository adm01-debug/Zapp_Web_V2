Especialista: senior (area-edge-api)

Refazer 1 do E43 (SL-075): o codigo do E43 foi mantido (commit c9135e1ab, sem
alteracao); este commit repara so os 2 docs-espelho que o E43 deslocou.

Ponto 1 — ESPELHO N217 (docs bate com medicao fresca): o E43 enxugou
supabase/functions/_shared/evolution-control-authz.ts de 137 para 93 linhas
cobertas e o doc ficou com os numeros velhos.
O que mudei: docs/audits/edge-functions-authz-coverage.md regenerado pela
medicao fresca do zero (REGENERAR_EDGE_AUTHZ_COV=1 node
scripts/ci/edge-coverage-authz.unit.mjs): evolution-control-authz.ts 137/137
-> 93/93, Total 255/305 (83.6%) -> 211/261 (80.8%).
Teste que prova: node --test scripts/ci/edge-coverage-authz.unit.mjs.
Vermelho antes: N217 "docs bate com medicao fresca e segunda execucao e
identica" FAILED (actual disco 137/137 vs expected fresco 93/93). Verde
depois: 8 passed, 0 failed.

Ponto 2 — ESTADO.md (ancoras do evolution-webhook, mesmo espelho, achado ao
reproduzir): o E43 removeu 56 acoes do evolution-api/index.ts e 3 ancoras
deslocaram.
O que mudei: ESTADO.md linha do `evolution-webhook`: index.ts:474 -> 472,
:540 -> :538, :701 -> :699 (cada linha nova contem "evolution-webhook",
conferido por grep).
Teste que prova: node --test scripts/ci/docs-estado-registry-convention.unit.mjs.
Vermelho antes: "ESTADO.md cita so ancoras reais" FAILED (ancora
desatualizada: index.ts:474 nao cita `evolution-webhook`). Verde depois:
11 passed, 0 failed.

Guarda do E43 (sem alteracao, continua verde): node --test
scripts/ci/evolution-edge-fixes.unit.mjs -> 14 passed, 0 failed (inclui
"rotas sem equivalente na GO foram removidas do handler (SL-075 E43)").

Arquivos (git diff --name-only dia/2026-10-13...HEAD, colado do comando):
- ESTADO.md
- docs/audits/edge-functions-authz-coverage.md
- (mais o historico herdado do E43 via c9135e1ab: supabase/functions/evolution-api/index.ts,
  supabase/functions/evolution-api/index.test.ts,
  supabase/functions/_shared/evolution-control-authz.ts,
  supabase/functions/_shared/__tests__/evolution-control-authz.test.ts,
  scripts/ci/evolution-edge-fixes.unit.mjs)

Verificacao:
- node --test scripts/ci/edge-coverage-authz.unit.mjs -> pass 8, fail 0
- node --test scripts/ci/docs-estado-registry-convention.unit.mjs -> pass 11, fail 0
- node --test scripts/ci/evolution-edge-fixes.unit.mjs -> pass 14, fail 0
- zapp-verify full <ws>: em andamento no fechamento; resultado no comentario do cartao
- git diff --stat do meu commit: 2 files changed, 3 insertions, 3 deletions (2971 chars)

O que NAO fiz e por que:
- Nao toquei no handler, no authz nem nos testes do E43: o codigo estava certo,
  so os espelhos envelheceram.
- Nao regenerei manifesto de deploy (do integrador).
- hermes-tarefa-fechar bloqueado pela guarda global (CONGELADO sem MODO_V2,
  sai 75); entrega feita via commit local + kanban. Nenhum push, deploy ou
  banco de producao tocado.
