Especialista: senior (area-front-hooks)

## O que mudou e por quê
- Nada no código: `git status --short` limpo e `git diff --name-only HEAD` vazio (HEAD = dia/2026-10-11 = 32c68d56a). A base já contém a correção aprovada no mérito — `src/hooks/tasks/workItemFilters.ts:68` com `params.delete('q')` incondicional — e os testes novos nos 3 arquivos. Esta rodada manda SÓ O RELATO e proíbe mudar o código, então não commitei nada.

## Prova
- vermelho (código da base + testes novos): reverti temporariamente `searchWithFilters` para a linha da base (`if (f.q.trim() !== '') params.set('q', f.q); else params.delete('q');`, equivalente à worktree da base porque a base só difere nessa linha) e rodei `npx vitest run src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx` → `Test Files 2 failed | 1 passed (3)` e `Tests 5 failed | 47 passed (52)` (log literal em `.tmp/vermelho.log`). Depois restaurei o fix e `git status --short` voltou a limpo.
- verde (com a correção): o mesmo comando → `Test Files 3 passed (3)` e `Tests 52 passed (52)` (log literal em `.tmp/verde.log`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (85s)` — `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; banco local NÃO VERIFICADO (sem nome de conjunto; o cartão não tem migration).

## Pontos do revisor
- Ponto 1 (vermelho real, cenário código-base + testes-novos): as 5 falhas são do tipo pedido — 4× `AssertionError: expected 'liga' to be null` (F3 auditoria A1-1 em useTasksFilters.test.tsx:113; espelhados em useTasksFilters.test.tsx:125; rota espelhada em workItemFilters.test.ts:28; espelhados em workItemFilters.test.ts:65) e 1× `AssertionError: expected 'orçamento' to be '' // Object.is equality` (ida-e-volta em workItemFilters.test.ts:55). Nenhuma mensagem do cenário inverso (`expected '' to be 'orçamento'`, `to contain 'q=liga'`). O 3º arquivo (TasksModule, 34 testes) passa nos dois estados — não discrimina: nesse teste o `window.location.search` não reflete a escrita (MemoryRouter), então `not.toContain('q=')` vale com e sem o fix; os 2 arquivos de hook provam o defeito.
- Ponto 2 (verde + verify literais): colados acima com contagens (`52 passed (52)`; `VERDE SEM BANCO (85s)`) e logs em `.tmp/verde.log` / `.tmp/verify.log`.

## O que NÃO fiz e por quê
- Não mudei código (proibido nesta rodada; diff aprovado no mérito).
- Não toquei em `TasksModule.test.tsx` (fora dos 4 arquivos permitidos; o ajuste dele veio justificado na rodada anterior).
- Caminhos do mesmo defeito (`grep` de `q` no módulo): `workItemFilters.ts:42` (`filtersFromSearch` LÊ `q` da URL — leitura preservada de propósito, para deep-link/antigo não quebrar; a escrita é que nunca emite); `:68` (`params.delete('q')` incondicional); `useTasksFilters.ts:23,35,89` (`setSearch` com debounce de 200ms → `dispatch q`; sem comparar URL — F3/A1-1); efeito Estado→URL via `searchWithFilters` (único escritor); `clear` zera texto + cancela debounce pendente. `isFilterActive` conta `q` preenchido como ativo (filtro em memória, fora da URL — coerente com o contrato).

## Arquivos (`git diff --name-only HEAD`, colado)
(vazio — nenhum arquivo alterado)

## Comandos (resultado real)
- `npx vitest run src/hooks/tasks/__tests__/workItemFilters.test.ts src/hooks/tasks/__tests__/useTasksFilters.test.tsx src/components/tasks/__tests__/TasksModule.test.tsx` com base → `Test Files 2 failed | 1 passed (3); Tests 5 failed | 47 passed (52)` (`.tmp/vermelho.log`)
- mesmo comando com o fix → `Test Files 3 passed (3); Tests 52 passed (52)` (`.tmp/verde.log`)
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (85s)` (`.tmp/verify.log`)
- `git status --short` → limpo; `git diff --name-only HEAD` → vazio
