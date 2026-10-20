- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 109s;OK lint 3s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (11/10 15:11, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  25 ++-
 .../tasks/__tests__/workItemAggregates.test.ts     | 151 +++++++++++++++++-
 .../tasks/__tests__/workItemBoardGroups.test.ts    | 175 +++++++++++++++++++++
 src/hooks/tasks/workItemAggregates.ts              | 110 ++++++++++++-
 src/hooks/tasks/workItemBoardGroups.ts             | 111 +++++++++++++
 5 files changed, 552 insertions(+), 20 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 75 passed (75)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: integrar — sem risco detectado

Especialista: Hugo (area-front-hooks)

Concluí a etapa 101 (D1): o selector puro que monta as colunas por PRAZO do Quadro (Atrasadas, Para hoje, Fazendo, Concluídas, da imagem 03), somente leitura, com os testes que provam a partição e a ordem. A tela que consome o selector é o cartão filho t_0f94ac34 (iris) — aqui só o dado.

## O que mudou e por quê
- `src/hooks/tasks/workItemBoardGroups.ts` (novo): `boardByDue(items, now)` monta as quatro colunas e `boardDueColumns(items, now)` devolve essas colunas já na ordem de render, com rótulo, mais `BOARD_DUE_COLUMNS` (ordem/rótulo/legenda). **Nenhuma regra de prazo nova**: reusa `bucketByDue` e `splitDoneByRecency` de `workItemAggregates.ts`, então o veredito de atraso é o MESMO `isOverdue` do badge/KPI (R2-MOD-058). Cada item cai em UMA coluna: concluída (7 dias, inclusive sem carimbo) em Concluídas; aberta vencida em Atrasadas; aberta que vence hoje em Para hoje; o resto do aberto (prazo futuro ou sem prazo) em Fazendo. Cancelada e concluída com mais de 7 dias ficam FORA das colunas (igual ao módulo: cancelada é escondida e a antiga é o recorte do "ver mais 30 dias"). Ordem determinística: prazo → prioridade → criação → `id`. Somente leitura: devolve arrays novos, não muda a ordem da lista recebida e não arrasta/grava.
- `src/hooks/tasks/__tests__/workItemBoardGroups.test.ts` (novo): 14 testes — a partição não soma nem duplica; prazo com hora que já passou vai para Atrasadas e NÃO para Para hoje; dia inteiro de hoje segue em Para hoje ao meio-dia; o resto do aberto (amanhã/futuro/sem prazo) fica em Fazendo (com o "sem prazo" no fim); concluída recente e sem carimbo entram; concluída há mais de 7 dias e cancelada não aparecem; ordem e desempate (prazo → prioridade → criação → id); e que a entrada não é mutada nem reordenada.
- Faixa da mãe: `git cherry-pick -x 89d1048a4` (pai t_17bbbc0f, commit novo `34b03465d`) porque o pai não estava na ponta de `dia/2026-10-11`. O cartão novo só consome o que o pai deixa pronto; a faixa não foi reescrita.

## Prova
- vermelho antes: na base o módulo não existe — `git cat-file -e dia/2026-10-11:src/hooks/tasks/workItemBoardGroups.ts` → `fatal: path 'src/hooks/tasks/workItemBoardGroups.ts' exists on disk, but not in 'dia/2026-10-11'`; o teste novo importa esse módulo, então falha na base (o fechar confirma vermelho→verde dos testes alterados).
- verde depois: `npx vitest run src/hooks/tasks/__tests__/` → `Test Files 9 passed (9); Tests 145 passed (145)`.

## O que NÃO fiz e por quê
- Não montei a tela (as colunas no Quadro, o seletor "agrupar por prazo", sem arrastar): é o cartão filho t_0f94ac34 (iris), que depende deste e de t_52e80bd2. Aqui ficou só o selector puro e seu teste.
- Não trouxe a faixa do irmão t_a3b84995 (memoização dos selectors): o cartão só pede a faixa da mãe e ele toca o mesmo `workItemAggregates.ts` — registrei como hotspot no cartão.
