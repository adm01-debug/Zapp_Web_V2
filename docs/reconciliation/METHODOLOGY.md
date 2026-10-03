# Metodologia

## Quatro fontes de verdade
1. **Document Truth** — planos, auditorias, status, fechamentos, handoffs, ADRs e runbooks.
2. **Git Truth** — PRs, commits, branches e alterações posteriores aos documentos.
3. **Code Truth** — implementação no HEAD: componentes, hooks, libs, services, edges, testes, rotas, flags, dependências e Graphify.
4. **Database Truth** — migrations, ledger, schema catalog/manifest, grants, RLS/RPC, types e guards.

Ordem: documento → Git → código → testes/guards → runtime quando exigido → classificação.

## Cinco dimensões de conclusão
- IMPLEMENTATION: not_started | partial | complete
- TESTING: none | partial | complete
- RUNTIME: not_required | not_verified | verified | failed
- DOCUMENTATION: stale | partial | current
- ACCEPTANCE: not_required | pending | accepted | rejected

"Feito" sem evidência não vira DONE_VERIFIED. PR mergeada prova entrega Git, não necessariamente aceite. Falha medida contra uma meta é VALIDATED_FAIL, não NOT_IMPLEMENTED. Dependência humana/externa não vai automaticamente a coding agent.

## Limpeza futura
Reconciliar → classificar → provar dead code → SAFE CLEANUP separado → migrar LEGACY_USED → targeted tests → typecheck/lint/contracts/build → commit reversível.

## Infra já existente
Graphify já está integrado por .graphifyignore, scripts/graphify/setup.sh, graph:setup, graph:update e AGENTS.md. Há também .claude/, .codex/, .agents/, CLAUDE.md e AGENTS.md; reconciliar antes de criar outra camada de skills.
