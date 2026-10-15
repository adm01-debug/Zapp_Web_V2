Especialista: iris
## O que mudou e por quê
- ESTADO.md:116: âncora de `send-scheduled-report` de `src/hooks/chat/useScheduledReports.ts:142` para `:171` — o cherry-pick do cartão pai deslocou o `supabase.functions.invoke('send-scheduled-report', ...)` para a linha 171 e a âncora antiga parou de citar a edge (exigência da recusa: cada âncora contém a própria edge).
- docs/DB-INVENTORY.md:182: removido `src/components/reports/ScheduledReportConfigs.tsx` dos consumidores de `scheduled_report_configs` — o arquivo foi excluído pelo cherry-pick do cartão pai; restam os dois citantes reais (`src/hooks/dashboard/useScheduledReportConfigs.ts`, `scripts/ci/dashboard-readme-drift.unit.mjs`) e o status `ativo` se mantém (exigência da recusa: inventário sem mentir).
- Não mexi em ScheduledReportsManager.tsx nem nos testes: o funcional da rodada 1 está intacto (Test Files 2 passed, Tests 9 passed).
## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` (`âncora desatualizada: src/hooks/chat/useScheduledReports.ts:142 não cita send-scheduled-report`); `node --test scripts/ci/db-inventory-doc.unit.mjs` → `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` (`"scheduled_report_configs" lista "src/components/reports/ScheduledReportConfigs.tsx", que não existe no repositório`).
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `# pass 11, # fail 0`; `node --test scripts/ci/db-inventory-doc.unit.mjs` → `# pass 15, # fail 0`.
- `zapp-verify "$WS" --rapido` → `VERIFY: VERDE SEM BANCO (18s)` (tipos 13s, lint 5s; sem banco porque não há migration).
- `./node_modules/.bin/vitest run src/components/dashboard/__tests__/ScheduledReportsManager.test.tsx src/hooks/dashboard/__tests__/useScheduledReportConfigs.test.tsx` → `Test Files 2 passed (2), Tests 9 passed (9)`.
## Pontos do revisor
- Ponto 1 (ESTADO.md cita só âncoras reais, cada âncora contém a própria edge): resolvido — ESTADO.md:116 agora aponta `:171`, linha do `invoke` real; prova: docs-estado-registry-convention 11/11.
- Ponto 2 (DB-INVENTORY.md cobre o catálogo, sem mentir): resolvido — DB-INVENTORY.md:182 sem o caminho excluído; prova: db-inventory-doc 15/15.
## O que NÃO fiz e por quê
- Não alterei código nem testes do produto: a recusa era só espelho do CI sobre documentos; o funcional da rodada 1 segue verde.
- Não usei `hermes-tarefa-iniciar`/`hermes-tarefa-fechar`: bloqueados pelo CONGELADO de 04/10 (sem MODO_V2); trabalhei no workspace da entrega anterior, no topo do commit recusado 95dcdf56c, e entrego por este relato + commit.
