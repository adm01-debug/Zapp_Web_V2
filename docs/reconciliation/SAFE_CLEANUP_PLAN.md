# Safe Cleanup Plan

Este plano NÃO autoriza exclusões. Define os gates da futura missão de limpeza.

## Wave C0 — Branch hygiene
1. Nunca apagar branch com PR aberta.
2. Compare `main...branch`.
3. `ahead_by > 0` = preservar e reconciliar.
4. `ahead_by = 0` + sem worktree ativo + sem PR aberta = candidato SAFE_TO_DELETE.
5. Candidatos já encontrados: `claude/friendly-mccarthy-g4xd5z` e `hermes/tarefas-b4-concluidas-7d-26093006501293`; confirmar novamente no momento da limpeza.
6. `claude/confident-babbage-ivgmmn` é evidence quarantine (37 commits ahead); NÃO apagar/mergear em bloco.

## Wave C1 — documentação
- Marcar planos predecessores SUPERSEDED/HISTORICAL, sem apagar.
- Manter auditorias/fechamentos/handoffs.
- Reduzir autoridade operacional: MASTER_LEDGER é a fila.
- Não mover/renomear em massa enquanto links internos não forem auditados.

## Wave C2 — imports/exports triviais
Somente unused imports/exports provados por compiler/lint/Graphify. Uma pequena PR, testes targeted + typecheck.

## Wave C3 — dead components/hooks
Para cada candidato: imports estáticos, dynamic imports, router, registries, commands, event bus, feature flags, string references, Graphify, testes. DELETE-A somente se todos aplicáveis forem negativos.

## Wave C4 — legacy used
Não apagar. Criar migration task: consumidor antigo → caminho canônico → teste → remover compatibility layer.

Telefonia `useCalls/useCallHistory/CallDialog` começa aqui, não em dead code.

## Wave C5 — scripts/CI
Scripts aparentemente antigos podem ser guards. Só remover após mapear workflow/package/husky/manual runbook consumers.

## Wave C6 — banco
Não existe "cleanup de migration aplicada". `_superseded` fica. DDL corretiva só por nova migration e fluxo governado.

## Gates por PR de limpeza
- Graphify atualizado/consulta registrada;
- grep/search complementar;
- targeted tests;
- typecheck;
- lint ratchet;
- contract tests quando toca DB/Edge;
- build;
- diff pequeno e reversível;
- zero alteração de comportamento não declarada.
