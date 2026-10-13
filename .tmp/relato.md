# fix(ci): reancora a guarda de tipografia na tabela da Lista (etapa 050)

Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- scripts/ci/docs-design-drift.unit.mjs: a guarda `tipografiaDoSubcabecalho` e o casador da linha
  da doc passam a ler `src/components/tasks/list/TasksListTable.tsx` (arquivo que RENDERIZA o
  subcabecalho dos dias) em vez de `TasksListMode.tsx`. A entrega empilhada (b1492e4986 "Lista em
  tabela", etapa 050) tirou o rotulo da Lista do `<div>` inline e o levou para o `<th>` da tabela;
  a guarda continuava procurando `{g.label}` no arquivo antigo, onde ele nao existe mais.
- scripts/ci/docs-design-drift.unit.mjs: a leitura do className passa a aceitar o elemento JSX cuja
  tag de abertura fica na linha ANTERIOR ao `{g.label}` (um `<th …>` multi-linha), janela de no
  maximo 2 linhas — nunca um className solto mais distante.
- docs/design/TAREFAS_QUADRO_STATUS.md: a linha de "Mudancas" que nomeia o arquivo do subcabecalho
  passa a apontar `TasksListTable.tsx`, mantendo `text-xs` (mesmo token) e registrando que o rotulo
  migrou de `TasksListMode.tsx` na etapa 050.

Nenhuma assercao afrouxada: o invariante continua "a doc cita a classe que o codigo usa", agora
ancorado no arquivo real.

## Pontos do revisor ([refazer] — os 3 itens de "O QUE FAZER" do cartao)
- Ponto 1 (partir do commit da entrega 6e5240688 com cherry-pick, nao recomecar): feito.
  `git cherry-pick b1492e4986 6cb4d63a09 6e5240688` aplicou a cadeia da entrega sobre
  `dia/2026-10-13`; o sha do cartao (6e5240688) e a ponta da pilha, e minha correcao e o commit
  seguinte, `34750b2ac5`.
- Ponto 2 (reproduzir sobre a ponta de dia/2026-10-13 e corrigir a causa sem afrouxar assercao):
  provado abaixo. Reproduzi `node --test scripts/ci/docs-design-drift.unit.mjs` -> `not ok 11`; a
  causa era a ancora da guarda no arquivo movido; corrigi ancorando a guarda no codigo real
  (arquivo + leitura do className do proprio elemento) e a doc junto. As 3 mutacoes continuam
  vermelhas (nenhuma assercao afrouxada).
- Ponto 3 (provar o mesmo comando VERDE e `zapp-verify . --rapido` verde; fechar citando o sha):
  ESPELHO DO CI nos seus blocos -> sem falha nova (item do subcabecalho sumiu); `zapp-verify .
  --rapido` -> `VERIFY: VERDE SEM BANCO (235s)`. Shas citados: entrega `6e5240688`, correcao
  `34750b2ac5`.

## Prova
- vermelho antes (com a entrega empilhada, sem o meu commit): `node --test --test-reporter=tap scripts/ci/docs-design-drift.unit.mjs`
  -> `not ok 11 - doc de Tarefas/Quadro cita a classe do subcabeçalho que o código usa`
     `error: 'src/components/tasks/list/TasksListMode.tsx: não achei o subcabeçalho dos grupos (linha com {g.label})'`
- verde depois: mesmo comando -> `# tests 11 / # pass 11 / # fail 0`
- mutacoes (a assercao ainda morde; cada uma VERMELHA e depois restaurada para verde):
  - M1 codigo usa `text-sm`, doc diz `text-xs` -> `not ok 11`
  - M2 subcabecalho perde o token de tamanho -> `not ok 11`
  - M3 doc aponta token que o codigo nao usa -> `not ok 11`
- ESPELHO DO CI (rodei os MESMOS blocos de comando do `ci_espelho.sh` a partir do workspace; ver
  observacao abaixo):
  - `node --test` sobre os 148 arquivos de scripts/ci, edge-deploy, db-audit, talkx: o item do
    subcabecalho NAO aparece mais; permanecem exatamente os 10 itens ja presentes na base
    (lint-ratchet --staged, Talk X delivery window, FLAG_CHANGES.md, tsconfig any, staged) —
    nenhuma falha NOVA, conforme a bisseccao do proprio cartao (causava um unico item).
  - `deno test --config scripts/ci/deno.json --frozen …` sobre 164 arquivos: verde.
  - contratos: `vitest run --config vitest.contracts.config.ts` -> `Test Files 89 passed (89);
    Tests 1379 passed (1379)`.
  - testes da entrega: `vitest run TasksListTable.test.tsx TasksListMode.test.tsx` -> `2 passed (2);
    20 passed (20)`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (235s)` (db_guard/tipos/lint/migrations OK).

## O que NÃO fiz e por quê
- Nao rodei o `bash ~/arquitetura-v2/integrador/ci_espelho.sh` literal: a guarda do Hermes bloqueia
  qualquer segmento `bash` cujo caminho contenha `/arquitetura-v2` (GUARD_PATH_RE, hermes-guard.py
  linhas 234/310), e o meu papel proibe contornar guarda. Rodei os MESMOS blocos do espelho (deno,
  node --test dos .unit.mjs/.test.mjs, contratos, guardas baratas) no workspace; a comparacao base x
  cartao deu zero falha nova.
- Nao toquei em nenhuma outra guarda nem no codigo da tela: era desalinhamento de ancora da guarda
  com o codigo movido, nao bug de comportamento.
