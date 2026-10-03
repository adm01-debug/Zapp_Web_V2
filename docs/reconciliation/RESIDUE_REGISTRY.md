# Residue Registry — inicial

Nenhum item abaixo está autorizado para exclusão.

## Tarefas
- work-items-badge sem consumidor → DEAD_CANDIDATE; provar via Graphify/busca/testes.
- Bell/Filter sem uso no TasksModule → confirmar HEAD.
- índices completed_at/position ausentes → performance debt; medir antes de DDL.
- update() ignora input.status → functional debt; verificar vigência.
- WIP global, não por contato → product/design debt.
- workItemAggregates × TasksBoardMode → duplicate logic candidate.
- e2e/reactions.spec.ts crônico → known flaky; reconciliar PRs posteriores.

## Telefonia
Arquivos com @deprecated incluem useCalls/useCallHistory/CallDialog. Não marcar morto automaticamente: existem consumidores legados documentados.

## Banco
supabase/migrations/_superseded/ = HISTORICAL_REQUIRED / DELETE-X. Não apagar/reaplicar.
Limitações históricas sem prova completa = HISTORICAL_UNVERIFIABLE.

## Busca inicial
Code search mostrou centenas de TODOs, referências legacy/deprecated, dezenas de eslint-disable e um ts-expect-error observado em src/hooks/team-chat/useDepartmentManagement.ts. Normalizar e ler individualmente antes de classificar.

## Git
CLAUDE.md registra auditoria anterior com 22 worktrees prunable. Investigação atual observou dezenas de branches claude/codex/devin/hermes/automation. Classificar merge/PR/conteúdo exclusivo antes de apagar.
