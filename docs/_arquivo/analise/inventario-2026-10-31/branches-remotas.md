# Triagem mecânica de branches remotas — 2026-10-31

Método: clone completo (unshallow). `git merge-tree --write-tree origin/main origin/<b>`: árvore resultante == árvore da main ⇒ SUPERADA; senão mede diff líquido main→resultado, conflitos, migrations e workflows. `novos_src` = arquivos criados pela branch em src/, supabase/functions/ ou supabase/migrations/ que NÃO existem na main (sinal de conteúdo único). main@668d77329

## Contagens

- INTEGRAR-CONFLITO: 108 (com PR aberta: 64; novos_src>0: 22)
- WORKFLOW: 70 (com PR aberta: 41; novos_src>0: 2)
- MIGRATION: 22 (com PR aberta: 19; novos_src>0: 18)
- INTEGRAR-LIMPO: 21 (com PR aberta: 14; novos_src>0: 3)
- SUPERADA: 4 (com PR aberta: 2; novos_src>0: 0)
- Remotas total: 225 (exceto main); do inventário já apagadas do remoto: 34; PRs abertas: 142 (32 MERGEABLE, 110 CONFLICTING); PRs abertas cujo head não existe mais como branch: 0 []

## Tabela

| classe | branch | PR | GH | ahead | conflitos | líquido (main→merge) | novos_src | mig | wf | último commit |
|---|---|---|---|---|---|---|---|---|---|---|
| INTEGRAR-LIMPO | `claude/dreamy-bardeen-m4odyv` | 2397 | M | 21 | 0 | 31 files changed, 2030 insertions(+), 437 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/festive-faraday-kv669k` |  |  | 18 | 0 | 22 files changed, 1976 insertions(+), 283 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/dazzling-cannon-j7iw08` | 2200 | M/A | 16 | 0 | 22 files changed, 1140 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/fix-plano-190-etapas-261019-1200` |  |  | 1 | 0 | 1 file changed, 979 insertions(+) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-LIMPO | `claude/trusting-albattani-9x3ipg` | 2396 | M/A | 9 | 0 | 20 files changed, 793 insertions(+) | 0 | 0 | 0 | 2026-10-31 |
| INTEGRAR-LIMPO | `claude/feat-copiloto-edge-fns-fases8-15-261024-1615` | 2216 | M/D | 1 | 0 | 7 files changed, 653 insertions(+) | 7 | 0 | 0 | 2026-10-24 |
| INTEGRAR-LIMPO | `claude/feat-copiloto-edge-fases8-10-261024-1700` | 2217 | M/D | 1 | 0 | 7 files changed, 524 insertions(+) | 7 | 0 | 0 | 2026-10-24 |
| INTEGRAR-LIMPO | `claude/fix-ci-workflows-261030-0830` | 2372 | M | 9 | 0 | 3 files changed, 495 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/w21-classificar-migration-drift` | 1930 | M/A | 2 | 0 | 2 files changed, 308 insertions(+), 14 deletions(-) | 0 | 0 | 0 | 2026-10-29 |
| INTEGRAR-LIMPO | `docs/ci-relatorio-2026-10-31` | 2411 | M/A | 8 | 0 | 2 files changed, 291 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/feat-teamchat-cid-261021-0758` | 2146 | M/A | 5 | 0 | 2 files changed, 146 insertions(+), 1 deletion(-) | 1 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/fix-deploy-functions-2408` |  |  | 1 | 0 | 2 files changed, 47 insertions(+), 28 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `fix/f1a-lote-b-talkxsuppression-hook-morto` | 2071 | M | 2 | 0 | 1 file changed, 38 insertions(+), 14 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-LIMPO | `claude/w32-w94-migrations-concurrency` | 2042 | M | 7 | 0 | 1 file changed, 24 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/fix-stable-inventory-e09-261027-2359` | 2286 | M | 7 | 0 | 1 file changed, 14 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/fix-types-sync-is-pinned-261029` |  |  | 5 | 0 | 1 file changed, 7 insertions(+), 5 deletions(-) | 0 | 0 | 0 | 2026-10-29 |
| INTEGRAR-LIMPO | `claude/fix-e2e-workers-ci-timeout-271027-0924` | 2279 | M/D | 5 | 0 | 1 file changed, 5 insertions(+), 5 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-LIMPO | `claude/fix-ci-workitem-tz-261025-1350` |  |  | 1 | 0 | 1 file changed, 4 insertions(+) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-LIMPO | `claude/fix-tc009-team-receipts-cid-261024-1730` | 2222 | M/D | 1 | 0 | 1 file changed, 3 insertions(+) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-LIMPO | `claude/fix-unit-tests-inbox-261023-1108` |  |  | 3 | 0 | 1 file changed, 3 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-LIMPO | `claude/pensive-cori-i93zgf` |  |  | 1 | 0 | 2 files changed, 2 insertions(+), 2 deletions(-) | 0 | 0 | 0 | 2026-10-16 |
| MIGRATION | `claude/loving-lovelace-esc3l2` | 2186 | C | 29 | 8 | 58 files changed, 6527 insertions(+), 23 deletions(-) | 3 | 3 | 0 | 2026-10-23 |
| MIGRATION | `claude/ecstatic-bardeen-twiveb` | 2190 | C | 68 | 62 | 89 files changed, 4430 insertions(+), 442 deletions(-) | 1 | 1 | 1 | 2026-10-23 |
| MIGRATION | `claude/radar-motor-copilot-live-301030` | 2381 | C/A | 6 | 1 | 29 files changed, 3766 insertions(+), 3 deletions(-) | 25 | 1 | 0 | 2026-10-30 |
| MIGRATION | `claude_pink/cool-dijkstra-xk9ek2` | 2108 | C/D | 93 | 15 | 83 files changed, 3295 insertions(+), 296 deletions(-) | 1 | 1 | 9 | 2026-10-28 |
| MIGRATION | `claude/feat-copiloto-fases13-15-ddl-261024-1530` | 2214 | C/D | 3 | 1 | 2 files changed, 3200 insertions(+) | 1 | 1 | 0 | 2026-10-24 |
| MIGRATION | `codex/publish-followup-20261021` |  |  | 1 | 33 | 55 files changed, 1963 insertions(+), 455 deletions(-) | 1 | 2 | 7 | 2026-10-21 |
| MIGRATION | `claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025` |  |  | 2 | 1 | 16 files changed, 1891 insertions(+), 1 deletion(-) | 14 | 2 | 0 | 2026-10-25 |
| MIGRATION | `claude/feat-message-delivery-post-iniciado-261024-1719` | 2238 | C/A | 1 | 1 | 6 files changed, 1459 insertions(+), 42 deletions(-) | 1 | 1 | 0 | 2026-10-24 |
| MIGRATION | `claude/feat-copiloto-cv021-030-worker-261016-2100` |  |  | 2 | 1 | 4 files changed, 1007 insertions(+), 3 deletions(-) | 2 | 1 | 0 | 2026-10-25 |
| MIGRATION | `fix/ci-workflows` | 2261 | C/D | 13 | 5 | 5 files changed, 677 insertions(+), 1 deletion(-) | 0 | 1 | 0 | 2026-10-25 |
| MIGRATION | `claude_05/festive-carson-ub43wu` | 2246 | C | 36 | 18 | 21 files changed, 596 insertions(+), 6 deletions(-) | 0 | 1 | 0 | 2026-10-25 |
| MIGRATION | `claude/feat-copiloto-cv011-020-migrations-261016-1930` | 1997 | M/A | 24 | 0 | 9 files changed, 469 insertions(+), 2 deletions(-) | 6 | 6 | 0 | 2026-10-30 |
| MIGRATION | `claude/magical-pasteur-iz2pgy` | 2199 | C/D | 21 | 12 | 23 files changed, 422 insertions(+), 140 deletions(-) | 0 | 1 | 0 | 2026-10-23 |
| MIGRATION | `claude/fix-ga-fase0-banco-e2e-261020-2200` | 2124 | C | 1 | 3 | 13 files changed, 399 insertions(+), 61 deletions(-) | 1 | 1 | 4 | 2026-10-20 |
| MIGRATION | `codex/revoke-public-truncate-grants-20261030` | 2383 | M | 9 | 0 | 11 files changed, 284 insertions(+), 2 deletions(-) | 1 | 1 | 0 | 2026-10-30 |
| MIGRATION | `claude/fix-talkx-cron-startup-timeout-261025-1700` | 2245 | C/D | 2 | 1 | 2 files changed, 277 insertions(+) | 1 | 1 | 0 | 2026-10-25 |
| MIGRATION | `claude_04/clever-ramanujan-xllbpo` | 2277 | C/A | 25 | 6 | 8 files changed, 128 insertions(+), 3 deletions(-) | 1 | 3 | 2 | 2026-10-27 |
| MIGRATION | `codex/tcm-insert-member-a2-20261030` | 2386 | M | 5 | 0 | 2 files changed, 116 insertions(+), 11 deletions(-) | 1 | 1 | 0 | 2026-10-30 |
| MIGRATION | `claude/fix-canonical-receipt-policies-261020-2005` | 2137 | M | 2 | 0 | 1 file changed, 109 insertions(+) | 1 | 1 | 0 | 2026-10-23 |
| MIGRATION | `codex/teamchat-audit-action-contract-20261030` | 2384 | M | 6 | 0 | 6 files changed, 58 insertions(+), 4 deletions(-) | 1 | 1 | 0 | 2026-10-30 |
| MIGRATION | `claude/fix-db-guard-b0c-261024-1527` | 2226 | C | 1 | 1 | 1 file changed, 10 insertions(+) | 0 | 1 | 0 | 2026-10-24 |
| MIGRATION | `claude/fix-revogar-grants-escrita-anon-261025-2115` | 2265 | M/D | 1 | 0 | 1 file changed, 5 insertions(+) | 1 | 1 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/wizardly-meitner-aejx3i` |  |  | 19 | 13 | 75 files changed, 10246 insertions(+), 796 deletions(-) | 0 | 0 | 0 | 2026-10-31 |
| INTEGRAR-CONFLITO | `claude/fix-logger-vitest-mock-261017-1000` | 2035 | C/A | 10 | 283 | 315 files changed, 8847 insertions(+), 148 deletions(-) | 1 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude_pink/dreamy-wright-j0bser` | 2284 | C/A | 4 | 106 | 107 files changed, 3776 insertions(+) | 0 | 0 | 0 | 2026-10-28 |
| INTEGRAR-CONFLITO | `claude/busy-cannon-40szm9` | 2187 | C | 30 | 35 | 66 files changed, 3133 insertions(+), 9 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/optimistic-hypatia-5ormu1` |  |  | 8 | 14 | 19 files changed, 3123 insertions(+), 131 deletions(-) | 0 | 0 | 0 | 2026-10-29 |
| INTEGRAR-CONFLITO | `chore/analise-prs-261024-2325` | 2242 | C/D | 1 | 3 | 3 files changed, 2675 insertions(+) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv071-150-fases-8-15-261024-1400` |  |  | 8 | 10 | 24 files changed, 2336 insertions(+), 1 deletion(-) | 14 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/fix-unit-tests-pre-existentes-261024-1700` | 2219 | C/D | 87 | 67 | 96 files changed, 1942 insertions(+), 311 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv141-150-piloto-261016-2317` |  |  | 1 | 2 | 12 files changed, 1393 insertions(+) | 10 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv041-050-suggest-reply-261016-2145` |  |  | 2 | 1 | 6 files changed, 1392 insertions(+), 1 deletion(-) | 4 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` |  |  | 1 | 5 | 14 files changed, 1372 insertions(+) | 9 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude_05/brave-mccarthy-zvzky4` | 2218 | C | 42 | 22 | 30 files changed, 1179 insertions(+), 21 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv051-060-radar-popup-261016-2130` |  |  | 4 | 2 | 9 files changed, 1099 insertions(+), 165 deletions(-) | 6 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv121-130-supervisor-261016-2304` |  |  | 1 | 4 | 12 files changed, 1079 insertions(+) | 8 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/chore-auditoria-supabase-final-251025-1655` | 2255 | C/A | 3 | 2 | 2 files changed, 1062 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv091-100-lead-signals-261016-2240` |  |  | 1 | 4 | 11 files changed, 1024 insertions(+) | 7 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv091-100-signals-261016-2305` |  |  | 1 | 7 | 14 files changed, 1023 insertions(+) | 7 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/docs-g9-absorb-261019-1300` | 2107 | C/A | 2 | 1 | 2 files changed, 1015 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv101-110-multimodal-261016-0730` |  |  | 1 | 5 | 16 files changed, 938 insertions(+) | 11 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv081-090-catalog-budget-261016-2235` |  |  | 2 | 5 | 9 files changed, 923 insertions(+) | 4 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv141-150-integration-261016-2330` |  |  | 1 | 2 | 8 files changed, 900 insertions(+) | 6 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` |  |  | 1 | 2 | 12 files changed, 895 insertions(+) | 10 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv131-140-analytics-261016-2325` |  |  | 1 | 2 | 8 files changed, 776 insertions(+) | 6 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/fix-talkx-segmentos-estimativa-261025-2110` | 2269 | C | 101 | 13 | 19 files changed, 752 insertions(+), 15 deletions(-) | 2 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-useknowledgebase` |  |  | 3 | 2 | 2 files changed, 737 insertions(+), 223 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv111-120-guardrails-261016-0810` |  |  | 1 | 2 | 12 files changed, 668 insertions(+) | 10 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/fix-paleta-filtros-celebracoes-261025-2110` | 2266 | C/A | 103 | 16 | 20 files changed, 666 insertions(+), 6 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv101-110-multimodal-261016-2310` |  |  | 1 | 3 | 8 files changed, 639 insertions(+) | 5 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/fix-unit-tests-src-261024-1630` | 2221 | C/D | 19 | 25 | 35 files changed, 634 insertions(+), 176 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/keen-galileo-dxai3p` | 2354 | C | 46 | 2 | 6 files changed, 612 insertions(+), 5 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv111-120-guardrails-261016-2315` |  |  | 1 | 2 | 8 files changed, 606 insertions(+) | 6 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-edges-fases8-10-261024-1545` | 2215 | C/D | 2 | 1 | 8 files changed, 593 insertions(+) | 7 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv121-130-supervisor-261016-2320` |  |  | 1 | 2 | 8 files changed, 565 insertions(+) | 6 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/fix-settings-salvar-aparencia-261025-1905` | 2263 | C/A | 101 | 14 | 15 files changed, 553 insertions(+), 4 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-talkx-hook-morto-261025-1915` |  |  | 98 | 12 | 13 files changed, 532 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-fila-offline-sem-dono-261025-2110` | 2267 | C/A | 101 | 10 | 11 files changed, 518 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-templates-supervisor-knowledge-261025-2110` | 2268 | C | 101 | 11 | 12 files changed, 516 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-main-tests-231023-1530` |  |  | 12 | 23 | 31 files changed, 452 insertions(+), 12 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch8` |  |  | 3 | 2 | 2 files changed, 421 insertions(+), 68 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-talkxsegments` | 2072 | C | 2 | 1 | 2 files changed, 341 insertions(+), 70 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-main` | 2058 | C | 2 | 7 | 9 files changed, 268 insertions(+), 65 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-connectioncard-dialog` | 2059 | C | 2 | 1 | 1 file changed, 265 insertions(+), 61 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `feat/media-migration-tool-261024-2336` |  |  | 1 | 1 | 2 files changed, 245 insertions(+), 26 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/fix-ci-tests-261019-1200` | 2098 | C/A | 2 | 7 | 8 files changed, 242 insertions(+), 228 deletions(-) | 0 | 0 | 0 | 2026-10-19 |
| INTEGRAR-CONFLITO | `claude_04/nice-cori-7snz6b` | 2274 | C | 13 | 4 | 5 files changed, 229 insertions(+), 8 deletions(-) | 0 | 0 | 0 | 2026-10-28 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-audiomemes-storage-path` | 2066 | C | 3 | 2 | 2 files changed, 224 insertions(+), 126 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-useteamchatnotifications` | 2080 | C/A | 2 | 2 | 2 files changed, 222 insertions(+), 33 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `claude/feat-e83-entrar-por-codigo-261020-1935` |  |  | 1 | 2 | 5 files changed, 219 insertions(+) | 1 | 0 | 0 | 2026-10-20 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch14` |  |  | 3 | 2 | 4 files changed, 218 insertions(+), 72 deletions(-) | 1 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch12` | 2088 | C/A | 2 | 1 | 1 file changed, 212 insertions(+), 112 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` |  |  | 1 | 8 | 8 files changed, 206 insertions(+) | 0 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-useadmindata-createuser-avatar` | 2070 | C | 3 | 1 | 1 file changed, 196 insertions(+), 170 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `dia/2026-10-23` |  |  | 4 | 14 | 15 files changed, 187 insertions(+) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch10` | 2087 | C/A | 3 | 1 | 1 file changed, 175 insertions(+), 43 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-deno-lock-tslib-261030-1100` |  |  | 1 | 1 | 1 file changed, 162 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/fix-ci-tests-batch2-2610-1830` | 2233 | C | 7 | 6 | 7 files changed, 159 insertions(+), 299 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-realtime-channel-mock` | 2065 | C | 3 | 2 | 2 files changed, 155 insertions(+), 41 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-n011-dinamico-261021-0759` | 2147 | C | 1 | 1 | 1 file changed, 152 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-21 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch9` | 2086 | C/A | 3 | 1 | 1 file changed, 138 insertions(+), 30 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-z011bc-timing-safe-261018-1855` | 2091 | C/A | 2 | 3 | 3 files changed, 136 insertions(+) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch6` | 2083 | C/A | 3 | 1 | 1 file changed, 136 insertions(+), 35 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-typecheck-suppression-261019-1342` | 2111 | C/A | 1 | 1 | 1 file changed, 130 insertions(+) | 0 | 0 | 0 | 2026-10-19 |
| INTEGRAR-CONFLITO | `claude/fix-typecheck-suppression-261023-2230` | 2208 | C/A | 1 | 1 | 1 file changed, 130 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` | 2067 | C | 3 | 1 | 1 file changed, 116 insertions(+), 35 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023` | 2196 | C | 5 | 1 | 6 files changed, 115 insertions(+), 20 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/types-rpc-ausentes-261025` | 2244 | C | 3 | 5 | 5 files changed, 106 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-ci-testes-admin-261025-1709` |  |  | 1 | 7 | 13 files changed, 101 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude_04/trusting-newton-duiglt` | 2273 | C/A | 5 | 7 | 7 files changed, 101 insertions(+), 6 deletions(-) | 0 | 0 | 0 | 2026-10-26 |
| INTEGRAR-CONFLITO | `claude/fix-ci-testes-talkx-251025-1200` |  |  | 1 | 7 | 9 files changed, 99 insertions(+), 7 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch4` | 2081 | C/A | 3 | 1 | 1 file changed, 99 insertions(+), 19 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-ci-testes-ui-261025-1709` |  |  | 1 | 6 | 8 files changed, 83 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch5` | 2082 | C/A | 4 | 1 | 1 file changed, 73 insertions(+), 36 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch7` | 2084 | C/A | 3 | 1 | 1 file changed, 71 insertions(+), 15 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/deploy-functions-deno-auto-2026-10-30` |  |  | 1 | 1 | 3 files changed, 69 insertions(+), 49 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/fix-deploy-functions-deno-none` |  |  | 1 | 2 | 3 files changed, 66 insertions(+), 90 deletions(-) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/test-e2e-contatos-fab-261021-0819` | 2148 | C | 2 | 2 | 2 files changed, 64 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch2` | 2076 | C | 3 | 1 | 1 file changed, 63 insertions(+), 17 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-ci-testes-inbox-261025-1710` |  |  | 1 | 5 | 8 files changed, 57 insertions(+), 5 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-unit-tests-mechanical-261024-1527` | 2228 | C | 1 | 1 | 1 file changed, 57 insertions(+), 21 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/fix-types-rpc-ausentes-251025-1230` | 2250 | C/D | 2 | 1 | 1 file changed, 55 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/fix-testes-unitarios-minimo-251025-1230` | 2249 | C/D | 2 | 5 | 5 files changed, 54 insertions(+), 4 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-ci-testes-geral-261025-1709` |  |  | 1 | 3 | 3 files changed, 51 insertions(+), 9 deletions(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-authprovider` | 2063 | C | 2 | 2 | 2 files changed, 45 insertions(+), 8 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch3` | 2079 | C | 3 | 1 | 1 file changed, 45 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-ci-unit-tests-261025-1230` |  |  | 1 | 3 | 3 files changed, 41 insertions(+) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `f3/strict-false-baseline-20261018` | 2078 | C/A | 2 | 1 | 4 files changed, 40 insertions(+), 8 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `claude/fix-unit-tests-main-261019-1500` | 2097 | C/A | 2 | 2 | 2 files changed, 39 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-batch13` | 2089 | C/A | 3 | 1 | 1 file changed, 38 insertions(+), 5 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-supabase-channel-mock-audiomeme-20261018` | 2064 | C | 3 | 1 | 1 file changed, 38 insertions(+), 11 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-ci-mocks-framer-261025-1700` |  |  | 1 | 7 | 7 files changed, 37 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-usewarroomalerts` | 2075 | C | 2 | 1 | 1 file changed, 37 insertions(+), 4 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/test-toque44-seletores-261021-0853` | 2152 | C | 2 | 1 | 2 files changed, 26 insertions(+), 2 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-ci-talkx-segments-261025-1330` |  |  | 1 | 1 | 1 file changed, 21 insertions(+) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `fix/f1a-order-mock-usecustomemojis-20261018` | 2060 | C | 2 | 1 | 1 file changed, 20 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `claude/fix-ci-teamchat-mount-261025-1340` |  |  | 1 | 1 | 1 file changed, 18 insertions(+) | 0 | 0 | 0 | 2026-10-25 |
| INTEGRAR-CONFLITO | `claude/fix-contatos-cabecalho-fab-261020-1933` |  |  | 5 | 2 | 2 files changed, 17 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `codex/consolida-contatos-fab` |  |  | 6 | 2 | 2 files changed, 17 insertions(+) | 0 | 0 | 0 | 2026-10-28 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-admin-audit-page-size` | 2068 | C | 4 | 3 | 3 files changed, 16 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-useadmindata-select` | 2069 | C | 3 | 1 | 1 file changed, 15 insertions(+), 3 deletions(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/fix-evolution-go-gaps-d6-261019-1548` | 2113 | C/D | 3 | 1 | 3 files changed, 14 insertions(+), 118 deletions(-) | 0 | 0 | 0 | 2026-10-19 |
| INTEGRAR-CONFLITO | `codex/sincronizacao-canonica-20261016` |  |  | 1 | 2 | 2 files changed, 13 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-16 |
| INTEGRAR-CONFLITO | `claude/fix-e2e-mock-app-bootstrap-261024-1527` | 2225 | C | 1 | 1 | 1 file changed, 9 insertions(+), 2 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `fix/f1a-framer-motion-mock-voicechangerpicker-20261018` | 2062 | C | 3 | 1 | 1 file changed, 8 insertions(+), 1 deletion(-) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `fix/f1a-lote-b-hooks-misc-1` | 2074 | C | 1 | 1 | 1 file changed, 6 insertions(+) | 0 | 0 | 0 | 2026-10-18 |
| INTEGRAR-CONFLITO | `claude/fix-known-violations-copilot-feedback-261023-2035` | 2206 | C/D | 1 | 1 | 1 file changed, 5 insertions(+) | 0 | 0 | 0 | 2026-10-23 |
| INTEGRAR-CONFLITO | `claude/chore-regen-edge-manifest-261030-0830` |  |  | 1 | 1 | 1 file changed, 3 insertions(+) | 0 | 0 | 0 | 2026-10-30 |
| INTEGRAR-CONFLITO | `claude/fix-unit-tests-ui-divergent-round2-261024-1541` | 2232 | C | 1 | 1 | 1 file changed, 3 insertions(+) | 0 | 0 | 0 | 2026-10-24 |
| INTEGRAR-CONFLITO | `claude/chore-remove-hook-morto-talksuppression-261024-1541` | 2230 | C | 3 | 1 | 1 file changed, 156 deletions(-) | 0 | 0 | 0 | 2026-10-24 |
| WORKFLOW | `claude/charming-mccarthy-jbxy56` | 2040 | C/A | 126 | 359 | 421 files changed, 22888 insertions(+), 332 deletions(-) | 0 | 0 | 11 | 2026-10-19 |
| WORKFLOW | `claude/ga-ci-verde-261020` | 2138 | C/D | 45 | 68 | 113 files changed, 14043 insertions(+), 213 deletions(-) | 0 | 0 | 3 | 2026-10-23 |
| WORKFLOW | `claude/feat-e75-toolchain-env-281028-0600` | 2298 | C/A | 7 | 2 | 17 files changed, 6503 insertions(+), 68 deletions(-) | 0 | 0 | 11 | 2026-10-28 |
| WORKFLOW | `claude/feat-e71-skip-draft-prs-281026-0250` | 2295 | C/A | 7 | 1 | 5 files changed, 6369 insertions(+), 1 deletion(-) | 0 | 0 | 3 | 2026-10-28 |
| WORKFLOW | `claude/fix-z017-z020-auth-cors-261018-1950` | 2095 | C/A | 10 | 122 | 135 files changed, 5787 insertions(+), 7 deletions(-) | 0 | 0 | 1 | 2026-10-23 |
| WORKFLOW | `fix/ci-verde-261021` | 2155 | C | 7 | 30 | 36 files changed, 4369 insertions(+), 28 deletions(-) | 0 | 0 | 5 | 2026-10-21 |
| WORKFLOW | `claude_pink/nice-hypatia-iikl82` | 2105 | C/A | 37 | 295 | 334 files changed, 3768 insertions(+), 1343 deletions(-) | 9 | 0 | 4 | 2026-10-27 |
| WORKFLOW | `fix/ci-workflows-vermelhos` | 2151 | C | 1 | 305 | 318 files changed, 2327 insertions(+), 66 deletions(-) | 0 | 0 | 8 | 2026-10-21 |
| WORKFLOW | `claude/fix-ga-resto-dbmigrate-20261021-0729` | 2142 | C | 1 | 1 | 21 files changed, 2240 insertions(+), 693 deletions(-) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-ga-fase78-perimetro-custo-261020-2200` | 2129 | C | 1 | 8 | 21 files changed, 1190 insertions(+), 206 deletions(-) | 0 | 0 | 6 | 2026-10-20 |
| WORKFLOW | `claude_05/zen-feynman-29b7ix` | 2211 | C/D | 17 | 11 | 22 files changed, 1146 insertions(+), 87 deletions(-) | 1 | 0 | 1 | 2026-10-25 |
| WORKFLOW | `claude/fix-ga-resto-typessync-20261021-0730` | 2143 | C | 1 | 2 | 11 files changed, 1124 insertions(+), 28 deletions(-) | 0 | 0 | 3 | 2026-10-21 |
| WORKFLOW | `claude/tender-heisenberg-a4jk3s` | 1979 | C/A | 27 | 5 | 16 files changed, 779 insertions(+), 173 deletions(-) | 0 | 0 | 2 | 2026-10-22 |
| WORKFLOW | `claude/fix-ga-fase456-fila-sast-guard-261020-2200` | 2126 | C | 3 | 6 | 224 files changed, 761 insertions(+), 287 deletions(-) | 0 | 0 | 6 | 2026-10-23 |
| WORKFLOW | `claude/fix-ga-fase23-edge-e2e-261020-2200` | 2128 | C | 3 | 1 | 17 files changed, 755 insertions(+), 142 deletions(-) | 0 | 0 | 3 | 2026-10-23 |
| WORKFLOW | `claude/kind-gates-87mwoe` | 2185 | C | 87 | 14 | 16 files changed, 568 insertions(+), 10 deletions(-) | 0 | 0 | 1 | 2026-10-22 |
| WORKFLOW | `claude/confident-bardeen-ndq0ch` | 2195 | C | 35 | 14 | 21 files changed, 481 insertions(+), 133 deletions(-) | 0 | 0 | 1 | 2026-10-23 |
| WORKFLOW | `claude/fix-ga-resto-sonar-contracts-20261021-0726` | 2145 | C/A | 1 | 4 | 26 files changed, 416 insertions(+), 112 deletions(-) | 0 | 0 | 5 | 2026-10-21 |
| WORKFLOW | `codex/fix-failed-workflows-20261020` | 2139 | C/A | 2 | 14 | 15 files changed, 397 insertions(+), 8 deletions(-) | 0 | 0 | 3 | 2026-10-21 |
| WORKFLOW | `claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023` | 2197 | C | 2 | 2 | 12 files changed, 290 insertions(+), 34 deletions(-) | 0 | 0 | 3 | 2026-10-23 |
| WORKFLOW | `claude/focused-hopper-qhavw1` | 2408 | C/A | 13 | 3 | 4 files changed, 265 insertions(+), 1 deletion(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-ga-fase1-lote-banco-261020-2200` | 2125 | C | 1 | 2 | 8 files changed, 232 insertions(+), 28 deletions(-) | 0 | 0 | 2 | 2026-10-20 |
| WORKFLOW | `claude/fix-db-guard-pguser-261019-1430` | 2104 | C/A | 3 | 5 | 7 files changed, 227 insertions(+), 60 deletions(-) | 0 | 0 | 2 | 2026-10-19 |
| WORKFLOW | `claude/fix-deploy-frozen-oct31` | 2409 | M/A | 10 | 0 | 4 files changed, 226 insertions(+), 23 deletions(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-ga-resto-docs-regen-20261021-0726` | 2144 | C | 1 | 6 | 9 files changed, 202 insertions(+), 27 deletions(-) | 0 | 0 | 3 | 2026-10-21 |
| WORKFLOW | `claude/fix-codex-findings-161016-1906` | 1991 | C/A | 21 | 7 | 14 files changed, 166 insertions(+), 19 deletions(-) | 0 | 0 | 1 | 2026-10-16 |
| WORKFLOW | `claude/w85-w86-w87-ossf-scorecard` | 2051 | C | 4 | 6 | 7 files changed, 129 insertions(+) | 0 | 0 | 4 | 2026-10-18 |
| WORKFLOW | `claude/fix-ci-main-verde-261023-1540` |  |  | 7 | 5 | 11 files changed, 122 insertions(+), 7 deletions(-) | 0 | 0 | 1 | 2026-10-23 |
| WORKFLOW | `adm01-debug-patch-2-5` |  |  | 1 | 0 | 1 file changed, 98 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-3-2` |  |  | 1 | 0 | 1 file changed, 93 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-unit-tests-createlogger-261019-1620` | 2110 | C/A | 3 | 21 | 21 files changed, 90 insertions(+) | 0 | 0 | 1 | 2026-10-19 |
| WORKFLOW | `fix/ci-f1b-restaura-workflows-20261018` | 2056 | C | 3 | 4 | 4 files changed, 85 insertions(+) | 0 | 0 | 3 | 2026-10-18 |
| WORKFLOW | `claude/fix-auto-update-pr-branch-261023-1950` |  |  | 5 | 3 | 3 files changed, 75 insertions(+), 37 deletions(-) | 0 | 0 | 1 | 2026-10-23 |
| WORKFLOW | `claude/fix-db-migrate-ga04-ga05-261016-0011` | 2036 | C/D | 1 | 2 | 3 files changed, 74 insertions(+), 1 deletion(-) | 0 | 0 | 1 | 2026-10-17 |
| WORKFLOW | `adm01-debug-patch-2-8` |  |  | 1 | 0 | 1 file changed, 70 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-2` |  |  | 1 | 0 | 1 file changed, 66 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-types-sync-ga20-ga21-261017-0015` |  |  | 1 | 2 | 2 files changed, 63 insertions(+), 9 deletions(-) | 0 | 0 | 1 | 2026-10-16 |
| WORKFLOW | `adm01-debug-patch-1-5` |  |  | 1 | 0 | 1 file changed, 57 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1-4` |  |  | 1 | 0 | 1 file changed, 55 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1-6` |  |  | 1 | 0 | 1 file changed, 55 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1-7` |  |  | 1 | 0 | 1 file changed, 55 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1-3` |  |  | 1 | 0 | 1 file changed, 47 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/w39-w49-w50-ci-cleanup` | 2044 | M | 4 | 0 | 3 files changed, 45 insertions(+), 5 deletions(-) | 0 | 0 | 2 | 2026-10-30 |
| WORKFLOW | `adm01-debug-patch-1-2` |  |  | 1 | 0 | 1 file changed, 43 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1-8` |  |  | 1 | 0 | 1 file changed, 43 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2` |  |  | 1 | 0 | 1 file changed, 42 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-11` |  |  | 1 | 0 | 1 file changed, 40 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-1` |  |  | 1 | 0 | 1 file changed, 39 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-4` |  |  | 1 | 0 | 1 file changed, 36 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-9` |  |  | 1 | 0 | 1 file changed, 34 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-7` |  |  | 1 | 0 | 1 file changed, 33 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-3` |  |  | 1 | 0 | 1 file changed, 32 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-3` |  |  | 1 | 0 | 1 file changed, 31 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-restore-settings-guard-281028-1830` |  |  | 1 | 1 | 1 file changed, 31 insertions(+) | 0 | 0 | 1 | 2026-10-28 |
| WORKFLOW | `adm01-debug-patch-2-10` |  |  | 1 | 0 | 1 file changed, 30 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-12` |  |  | 1 | 0 | 1 file changed, 29 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `adm01-debug-patch-2-1` |  |  | 1 | 0 | 1 file changed, 28 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206` | 2100 | M/D | 3 | 0 | 7 files changed, 27 insertions(+), 10 deletions(-) | 0 | 0 | 2 | 2026-10-30 |
| WORKFLOW | `claude/fix-ci-contratos-cache-261020-2320` | 2123 | C | 2 | 4 | 5 files changed, 22 insertions(+) | 0 | 0 | 4 | 2026-10-20 |
| WORKFLOW | `claude/fix-z029-z015-summary-500-261018-1940` | 2092 | M/D | 4 | 0 | 1 file changed, 21 insertions(+) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/feat-e70-edge-contracts-job-281028-0305` | 2297 | M/D | 4 | 0 | 1 file changed, 20 insertions(+), 6 deletions(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `adm01-debug-patch-2-6` |  |  | 1 | 0 | 1 file changed, 18 insertions(+) | 0 | 0 | 1 | 2026-10-21 |
| WORKFLOW | `claude/fix-ci-reativar-suites-261016-1530` | 1975 | M/A | 2 | 0 | 3 files changed, 12 insertions(+), 14 deletions(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-notify-names-ga10-ga02-261017-0900` | 2034 | M/A | 2 | 0 | 2 files changed, 11 insertions(+), 3 deletions(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-z022-z024-dbguard-ci-261018-1930` | 2093 | C/D | 1 | 2 | 2 files changed, 8 insertions(+) | 0 | 0 | 2 | 2026-10-18 |
| WORKFLOW | `claude/hopeful-knuth-4brqti` | 2407 | M/A | 6 | 0 | 1 file changed, 8 insertions(+), 2 deletions(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-deploy-deno-check-node-modules-261030-1200` | 2380 | C | 4 | 1 | 2 files changed, 5 insertions(+), 1 deletion(-) | 0 | 0 | 1 | 2026-10-30 |
| WORKFLOW | `claude/fix-e2e-logado-ga09-261017-1410` |  |  | 1 | 0 | 1 file changed, 5 insertions(+), 1 deletion(-) | 0 | 0 | 1 | 2026-10-16 |
| WORKFLOW | `claude/w45-draft-fast-exit` | 2046 | M | 1 | 0 | 2 files changed, 3 insertions(+) | 0 | 0 | 2 | 2026-10-18 |
| WORKFLOW | `adm01-debug-patch-4` |  |  | 1 | 0 | 1 file changed, 1 insertion(+) | 0 | 0 | 1 | 2026-10-21 |
| SUPERADA | `automation/types-sync` |  |  | 9 | 0 | 0 | 0 |  |  |  |
| SUPERADA | `claude/fervent-noether-vvq63j` |  |  | 3 | 0 | 0 | 0 |  |  |  |
| SUPERADA | `claude/fix-unit-tests-customemojis-261019-1540` | 2109 | M/A | 1 | 0 | 0 | 0 |  |  |  |
| SUPERADA | `fix/f1a-lote-b-gamificacao-sem-escrita` | 2077 | M | 2 | 0 | 0 | 0 |  |  |  |

## Do inventário já apagadas do remoto

- `claude/sharp-faraday-qfortu`
- `claude/feat-copiloto-cv061-070-ghost-text-261016-2142`
- `devin/1792420175-remove-memoria-orphan`
- `claude/feat-e83-safe-261021-0728`
- `claude/feat-e91-channel-error-logging-261020-1934`
- `claude_juca/practical-rubin-8xnw0u`
- `claude/fix-ordem-abas-a11y-261020-2245`
- `fix/f1a-authprovider-mock-inbox-20261018`
- `claude/docs-p053-regressao-261021-0827`
- `chore/remove-alien-workflows`
- `feat/ci-lint-ratchet-base-f2b`
- `claude/fix-dbguard-dashboard-rls-261023-1048`
- `claude/fix-e2e-talkx-261023-1115`
- `dependabot/bun/deps-semanal-5ea84fa56f`
- `claude/docs-ordem-abas-encerramento-261020-2250`
- `claude/docs-contatos-planos-261020-1938`
- `codex/sincronizacao-ledger-20261016`
- `backup/dia-2026-10-13`
- `backup/dia-2026-10-14`
- `ci/cors-zappweb-app-br`
- `claude/confident-babbage-ivgmmn`
- `claude/w10-mutacao-mapa-so-pr`
- `codex/docs-email-navy-plan-100-20261002`
- `codex/talk-me-carousel-refinement-20260930`
- `dia/2026-10-07`
- `dia/2026-10-08`
- `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30`
- `docs/plano-ordem-banner-20-etapas-2026-09-30`
- `hermes/a11y-aria-hidden-focus-2610021746e07a`
- `hermes/mapa-f4-p3-observabilidade-2610011830d2a2`
- `hermes/plano-volume-50-etapas-finalizacao-2610011018e48d`
- `hermes/sonar-s7773-number-parseint-2610022025ac4f`
- `hermes/telefonia-contrato-dados-26092615475e51`
- `lote/2026-10-16-880-cards`