Especialista: worker (testes) (area-testes-do-produto)

CONCLUÍDO: [refazer 1] da Etapa 047 — os 10 testes de teclado da barra em `src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` passam; cada grupo tem mutação vermelha→verde em produção; cabeçalho com linhas do plano conferidas por `grep -n`; relato espelhando o diff.

## O que mudou e por quê
- `src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` (único arquivo de código do diff): reescrito só o cabeçalho de comentário (linhas 1–33) com as linhas exatas do plano verificadas por `grep -n` (292, 516, 520, 524) e a origem das teclas citada pelo código (`defaultShortcuts.ts` linhas 9, 53–54; `useGlobalKeyboardShortcuts.ts` linhas 113–137). Nenhum `it` foi alterado — só comentário. Produção: zero linhas.

## Prova
- verde depois: `npx vitest run src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)` (rodadas 18:49, 18:53; mais `TasksModule.atalhosDeModo` junto: `Test Files 2 passed (2); Tests 13 passed (13)`).
- M1 vermelha: `defaultKey: '/'`→`'z'` em `defaultShortcuts.ts:54` → `1 failed | 9 passed`, falha só em "`/` leva o foco à busca..." (timeout no `waitFor`).
- M2 vermelha: `alternateKeys: ['2','3']`→`[]` em `defaultShortcuts.ts:53` → `1 failed | 9 passed`, falha só em "as teclas 2, 3 e 1 acionam Quadro, Agenda e Lista...".
- M3 vermelha: `'tasks-search','tasks-mode'` dentro de `allowedInInputs` em `useGlobalKeyboardShortcuts.ts:116` → `2 failed | 8 passed`, falhas só nos 2 testes de guarda de input.
- após cada mutação a produção foi restaurada do backup (working tree limpo antes do commit do refazer); o verde final é com produção intacta.

## Pontos do revisor
- Ponto 1: resolvido em parte com divergência documentada. Conferi com `grep -n` no plano: a linha 047 é a 292 (não 291) e as linhas G-5/B13/Fase F são 516/520/524 (a tabela 514–524 as contém). Mantive esses números e corrigi o que estava errado de fato: o cabeçalho atribuía os atalhos à "Etapa 77" do plano, mas a linha 077 do plano é "Revisão visual da Lista" — por isso a origem das teclas agora é citada pelo ARQUIVO (`defaultShortcuts.ts:9,53-54`, `useGlobalKeyboardShortcuts.ts:113-137`), não pelo plano.
- Ponto 2: reconhecido. O passo 7 citado na recusa ("os testes da 046 passam e cobrem ... incluindo a ordem dos controles da barra e os rótulos") corresponde ao teste de ordem aqui (`expect(focaveis.map(nomeDe)).toEqual(['Buscar tarefa','Prioridade','Contato','Com alarme','Mostrar concluídas'])`) e aos de recorte/URL (B13/Fase F). Nenhum arquivo da 046 foi tocado — ela nem está no tronco (`git ls-tree dia/2026-10-12` não lista `TasksFilterBar.test.tsx`) nem no diff.
- Ponto 3: o despacho é real, não simulado por mock. `teclar` dispara `KeyboardEvent('keydown')` de verdade na janela/campo; o registry REAL está montado (`Registry`) e a cadeia tecla → registry → `tasks-shortcut` → módulo é a da app. Prova: M1/M2/M3 acima — cada quebra de uma linha de produção falha exatamente nos testes correspondentes. O único mock é o da fronteira (cliente Supabase falso com contador de `select`); Radix/cmdk são os reais.
- Ponto 4: prova por mutação entregue acima (M1/M2/M3 vermelhas pela razão certa, verde depois com produção restaurada). As mutações foram revertidas, então o diff de produção é vazio — comprovável pelo `diff --stat` abaixo.
- Ponto 5: relato espelha o diff. `git diff --name-only dia/2026-10-12...HEAD`: `src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` (329 linhas novas, só teste) + `.tmp/relato.md` (este relato). Produção: 0 arquivos, 0 linhas.

## O que NÃO fiz e por quê
- Não converti `teclar` para `userEvent`: o despacho atual é provado real pelas mutações M1–M3; trocar o mecanismo sem defeito seria churn fora do título.
- Não transcrevi o passo 7 integral do pedido original: ele não está no meu workspace; usei a citação da própria recusa e mapeei cada item a um teste (Ponto 2).

## Arquivos (`git diff --name-only dia/2026-10-12...HEAD`, colado do comando)
- src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx
- .tmp/relato.md

## Comandos de verificação (resultado real)
- `npx vitest run src/components/tasks/__tests__/TasksFilterBar.teclado.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)` (18:49 e 18:53).
- `npx vitest run .../TasksModule.atalhosDeModo.test.tsx .../TasksFilterBar.teclado.test.tsx` → `Test Files 2 passed (2); Tests 13 passed (13)` (18:53).
- Mutações M1/M2/M3: `1 failed | 9 passed`, `1 failed | 9 passed`, `2 failed | 8 passed` (falhas exatamente nos testes-alvo).
- `git diff --stat dia/2026-10-12...HEAD` → 2 arquivos (teste 329 linhas + relato); produção intacta.
