Especialista: Íris (area-front-componentes)

# [retomar] redesenho do cartao do quadro (etapas 084 a 090)

## Como resolvi o motivo da retomada (conflito com a ponta do dia)
- Base do workspace: `dia/2026-10-13` (o cartão falava de 12/10; a ponta andou um dia).
- Trouxe o trabalho anterior por `git cherry-pick` (não recomecei):
  - `1a9a149355` = `feat(tarefas): redesenha o cartao do quadro (etapas 084 a 090)` (era c278528253);
  - `8715c4259f` = `fix(tarefas): foco sincronizado no card selecionado, alvo de 40px no checkbox e sino ambar do lembrete (refazer 1)` (era fe024462dc).
- Conflito real: só `.tmp/relato.md` (arquivo de relato, não é código) — resolvi com `git cherry-pick --skip`: o relato é reescrito agora, nada de código se perdeu.
- Os arquivos de código entraram sem conflito. Conferi que NADA da ponta foi perdido: o `TaskCheckbox` novo da base (alvo de 40x40 com o círculo de 18 px dentro) e o `PriorityPill` com `role="img"` continuam intactos — ver a prova vermelho→verde abaixo.

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemCard.tsx`: o card parou de ampliar o alvo do checkbox com pseudo-elemento (`before:absolute before:-inset-[11px] before:content-['']`) e passa a só alinhar a peça (`mt-0.5` na Lista/Quadro, `shrink-0` na Agenda) — a ponta do dia já entrega o alvo de 40 px pelo próprio `TaskCheckbox` (`h-10 w-10` com o círculo de 18 px desenhado dentro). Motivo: o pseudo-elemento somava ao alvo novo e criava uma área clicável de ~62 px por cima do título — regressão que o visual da ponta já resolvia.
- `src/components/tasks/__tests__/WorkItemCard.test.tsx`: o caso do alvo de 40 px deixou de medir o pseudo-elemento (implementação que não existe mais) e passa a medir o comportamento real: botão de 40x40 e o círculo visível de 18 px no `data-testid="task-checkbox-circle"`.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/WorkItemCard.test.tsx` (no estado pós-cherry-pick, antes do ajuste) → `FAIL ... alvo ≥ 40 px ... AssertionError: expected 'group relative -m-[11px] inline-flex …' to contain 'h-[18px]'` / `Tests  1 failed | 24 passed (25)`.
- verde depois: `npx vitest run src/components/tasks/__tests__/WorkItemCard.test.tsx src/components/tasks/__tests__/TasksListMode.test.tsx src/components/tasks/__tests__/agendaGroups.test.tsx` → `Test Files  3 passed (3); Tests  44 passed (44)`.
- regressão do módulo inteiro: `npx vitest run src/components/tasks` → `Test Files  28 passed (28); Tests  333 passed | 1 todo (334)` (o todo é pré-existente).

## Testes PRÓPRIOS deste cartão (nome de cada caso)
- `084 — checkbox CIRCULAR nas três superfícies e título em até 2 linhas`
- `085 — Urgente fica junto ao título e a prioridade padrão desce para a linha de contexto`
- `086 — prazo vencido pinta o texto de destrutivo e acrescenta a tag "Atrasada"`
- `087 — no card em "Fazendo" o prazo e o lembrete ganham rótulos em duas colunas`
- `087 — o prazo de hoje sai no formato único ("Hoje, 14:00") e o lembrete traz o sino âmbar`
- `088 — a descrição curta (2 linhas) só aparece em "Fazendo"/selecionado`
- `089 — em "Aguardando" o motivo vira chip âmbar, truncado e com tooltip`
- `090 — card selecionado: borda primary, fundo primary/10, alça ⠿ e data-selected`
- `090 — a seleção do painel (TasksUiProvider.selectedId) também marca o card`
- `090 — o card selecionado RECEBE FOCO quando a seleção do painel muda`
- `090 — card que já NASCE selecionado (deep link ?task=) não rouba o foco da página`
- `alvo ≥ 40 px: o botão do checkbox mede 40x40 e o círculo visível segue 18 px` (reescrito nesta retomada)

## Elementos das etapas (referência: seção 3 do plano em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, imagens 01–05)
- 084: checkbox circular + título 2 linhas + ⋮ + pílula de prioridade + contato com avatar + linha de prazo — `WorkItemCard.tsx:110-135` (`imagem 05`).
- 085: Urgente junto ao título, prioridade padrão na linha de contexto — `WorkItemCard.tsx:126-140` (card "Enviar orçamento", imagem 05).
- 086: tag "Atrasada" com ícone de alerta ao lado do prazo em destrutivo — `WorkItemCard.tsx:133-146`.
- 087: prazo/lembrete com rótulos em duas colunas no card em Fazendo/selecionado; sino âmbar — `WorkItemCard.tsx` (bloco "Fazendo"/selecionado).
- 088: descrição curta (2 linhas) só em Fazendo/selecionado.
- 089: chip de espera âmbar com motivo truncado e tooltip.
- 090: borda primary, fundo primary/10, alça ⠿, foco sincronizado com o painel.

## O que NÃO fiz e por quê
- Não commitei o `.tmp/relato.md` anterior (veio do cartão antigo): o relato é este arquivo, reescrito nesta retomada.
- Nada fora de `WorkItemCard.tsx` e `src/components/tasks/__tests__/` foi tocado; `src/components/ui/*` segue intocado, sem migration, Edge ou dependência nova.
