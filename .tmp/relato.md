# fix(ci): reancora a guarda de tipografia na tabela da Lista (etapa 050)

Especialista: worker (design) (design-system-zapp)

## Pontos do [refazer] (o "O QUE FAZER" do cartao)
- Ponto 1 (partir do commit da entrega 6e5240688 com cherry-pick, nao recomecar): feito.
  `git cherry-pick b1492e4986 6cb4d63a09 6e5240688` aplicou a cadeia da entrega sobre
  dia/2026-10-13; nao reescrevi nada da entrega. Shas: entrega 6e5240688 (ponta da pilha),
  minha correcao 34750b2ac5.
- Ponto 2 (reproduzir sobre a ponta de dia/2026-10-13 e corrigir a causa sem afrouxar
  assercao): feito. Vermelho reproduzido (log abaixo) e causa corrigida com o teste ainda
  mordendo (3 mutacoes vermelhas, abaixo).
- Ponto 3 (provar o mesmo comando VERDE e zapp-verify . --rapido verde; fechar citando o sha):
  feito. os blocos do espelho do CI rodam sem falha NOVA (o item do subcabecalho sumiu) e
  `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (235s)`. Shas citados: entrega
  6e5240688, correcao 34750b2ac5.

## Arquivos no diff dia/2026-10-13...HEAD (numstat real)
Cadeia da entrega empilhada por cherry-pick (Ponto 1) — NAO sao meu codigo, vieram de
6e5240688/b1492e4986/6cb4d63a09 e nao foram tocados por mim:
- src/components/tasks/list/TasksListTable.tsx (415/0)
- src/components/tasks/list/TasksListMode.tsx (22/151)
- src/components/tasks/__tests__/TasksListTable.test.tsx (386/0)
- src/components/tasks/__tests__/TasksListMode.test.tsx (4/4)
- src/components/tasks/__tests__/TasksModule.entrada.test.tsx (1/1)
- src/components/tasks/__tests__/TasksModule.test.tsx (24/9)
- src/components/tasks/__tests__/WorkItemSheet.test.tsx (5/3)
- src/components/tasks/__tests__/cardAcoes.test.tsx (8/4)
- src/components/tasks/__tests__/zen.tarefas.test.tsx (2/2)
Meu commit (34750b2ac5) — so estes 2 arquivos:
- scripts/ci/docs-design-drift.unit.mjs (21/14)
- docs/design/TAREFAS_QUADRO_STATUS.md (1/1)

## Causa
O espelho do CI reprovava exatamente 1 item novo: "node: doc de Tarefas/Quadro cita a classe
do subcabecalho que o codigo usa". A guarda docs-design-drift.unit.mjs ancorava o subcabecalho
dos grupos ("Amanha"/"Hoje"/"Seg 05/10") em `src/components/tasks/list/TasksListMode.tsx`
(LISTA_DE_TAREFAS). A etapa 050 (commit b1492e4986 da propria entrega) virou a Lista em TABELA
e moveu esse rotulo para o `<th>` de `src/components/tasks/list/TasksListTable.tsx` (linhas
287-290). O texto do relatorio (docs/design/TAREFAS_QUADRO_STATUS.md, linha 165) continuou
citando TasksListMode.tsx. A guarda procurava a linha com `className` E `{g.label}` no arquivo
antigo e falhava fechado: `TasksListMode.tsx: nao achei o subcabecalho dos grupos`.

## Correcao (sem afrouxar assercao)
- Guarda reancorada no arquivo que RENDERIZA o rotulo: `ARQUIVO_DO_SUBCABECALHO =
  src/components/tasks/list/TasksListTable.tsx`; o matcher da linha do doc passou a exigir
  TasksListTable.tsx + "subcabe".
- `tipografiaDoSubcabecalho` passou a ler o `className` no proprio elemento do `{g.label}`
  (a linha do rotulo e ate 2 linhas acima), porque em `<th>` a tag de abertura ocupa a linha
  anterior. Continua exigindo o token REAL de tamanho e continua falhando fechado quando o
  token some (mutacao M2).
- Doc: a linha 165 da tabela de Mudancas da etapa 49 agora aponta o arquivo da tabela e cita
  o token `text-xs` (12px) que o codigo usa, registrando que o rotulo era inline em
  TasksListMode.tsx na etapa 49 e passou ao `<th>` na etapa 050.

## Prova medida
- vermelho antes (sobre a entrega empilhada, guarda ainda no arquivo antigo):
  `node --test scripts/ci/docs-design-drift.unit.mjs` -> `# tests 11 / # pass 10 / # fail 1`;
  erro em scripts/ci/docs-design-drift.unit.mjs:323: "TasksListMode.tsx: nao achei o
  subcabecalho dos grupos (linha com {g.label})".
- verde depois (mesmo comando) -> `# tests 11 / # pass 11 / # fail 0`.
- mutacoes (o teste nao virou tautologico) — todas `not ok 11`, restaurado verde depois:
  M1 `text-xs`->`text-sm` no `<th>` do codigo; M2 removido o token de tamanho do `<th>`;
  M3 o doc aponta um token que o codigo nao usa.
- blocos do espelho do CI, rodados direto (ver limitacao): node --test nos 148 arquivos de
  scripts/ci+edge-deploy+db-audit+talkx -> a lista de falhas NAO tem o item do subcabecalho;
  os 10 itens restantes sao os mesmos da base (o cartao diz que este era o unico culpado);
  deno test (164 arquivos) verde; contratos vitest 89 arquivos/1379 testes verdes; guardas
  baratas: implicit-any-ratchet rc=0, check-test-inventory pendencia (a propria espelho
  registra como pendencia, nao reprovacao).
- testes da entrega no meu commit: TasksListTable.test.tsx + TasksListMode.test.tsx ->
  2 arquivos, 20 testes verdes.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (235s)` (db_guard/tipos/lint/migrations ok).

## Limitacao registrada (nao contornei guarda)
O comando literal `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` e bloqueado pelo
hermes-guard ("/arquitetura-v2" dentro de um segmento `bash`); nao contornei. Rodei os MESMOS
blocos que a espelho executa (deno + node --test + contratos + guardas baratas) direto no
workspace, com o resultado acima.

## git diff --stat (meu commit)
 docs/design/TAREFAS_QUADRO_STATUS.md  |  2 +-
 scripts/ci/docs-design-drift.unit.mjs | 35 +++++++++++++++++++++--------------
 2 files changed, 22 insertions(+), 15 deletions(-)
