Especialista: worker (design) — trabalho visual (componente de tela). O pedido original pedia `iris`; o
revisor de entrada roteou para `designer` ("Rebase e conflito de um componente visual (WorkItemCard.tsx) e
seus testes"), e é este o perfil que assina.

## Ponto da recusa
- Ponto 1: "aprovado, mas CONFLITA com a ponta de dia/2026-10-12; retomada por rebase" — RESOLVIDO, e o
  conflito era de API, não de texto.
  BASE: o workspace novo parte de `dia/2026-10-12` (ponta `96dd72dc5`). Ela JÁ CONTÉM a ponta de 11-10 —
  `git merge-base --is-ancestor dia/2026-10-11 dia/2026-10-12` → verdadeiro (10-11 é `9372aeb6a`). Logo o
  "traga dia/2026-10-11" já está satisfeito pela base; o que faltava era casar o trabalho com o que entrou
  DEPOIS, em 12-10.
  CHERRY-PICK: o trabalho anterior (branch `v2/redesenhado-cartao-quadro-urgente-atrasa-2610111909ad9f`,
  761764d91) foi trazido só nos 2 commits DO CARTÃO — `5649bd60a` (redesenho, etapas 084–090) e `eddbf557b`
  (refazer 1) — que aplicaram sem conflito textual.
  Os commits da FAIXA DOS PAIS que aquele branch carregava (`ef329b26c`, `35e0b7473`, `907596719`,
  `00d745edf` — subtítulo das colunas e os primitivos compartilhados) foram PULADOS de propósito: o que
  importa deles JÁ está em dia/2026-10-12 (primitivos em `src/components/tasks/shared/`, `TasksUiProvider`,
  `workItemFormat` etc.).
  CONFLITO REAL: o `TaskCheckbox` da ponta JÁ garante sozinho o alvo ≥ 40 px — o `<button>` mede 40x40
  (`h-10 w-10` + `-m-[11px]`) e o círculo de 18 px é um `<span>` interno
  (`data-testid="task-checkbox-circle"`). A versão antiga ampliava o alvo por um pseudo-elemento
  `before:-inset-[11px]` passado DENTRO do card, e o teste do cartão media essa estrutura antiga. Era essa a
  incompatibilidade: 1 teste vermelho só. Preservei o primitivo que já entrou na ponta e ajustei o cartão e o
  teste a ele — este é exatamente o conteúdo do commit `e9e82cc60` (o diff abaixo).

## O que mudou e por quê
- `src/components/tasks/shared/WorkItemCard.tsx`: o `<TaskCheckbox>` do card deixa de receber
  `relative before:absolute before:-inset-[11px] before:content-['']` e fica só com o posicionamento
  (`mt-0.5` na lista/quadro, `shrink-0` na agenda). O alvo ≥ 40 px continua atendido — agora pelo PRIMITIVO
  compartilhado (`h-10 w-10` com margem `-11px`) que já está em dia/2026-10-12, sem o card repetir o truque do
  pseudo-elemento. Comentário de código atualizado para descrever esse desenho novo.
- `src/components/tasks/__tests__/WorkItemCard.test.tsx`: o caso "alvo ≥ 40 px" passa a medir a estrutura REAL
  renderizada — o botão do primitivo com `h-10`/`w-10` (alvo de 40 px) e o `<span task-checkbox-circle>` com
  `h-[18px]`/`w-[18px]` (o círculo visível de 18 px do D16) — em vez do pseudo-elemento `before:-inset-[…]`
  que só existia na versão antiga.

## Etapas do plano (linhas 343–349 de PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md)
Entregues pelos commits `5649bd60a` + `eddbf557b` (trazidos no rebase); neste commit só alinhei o checkbox.
- 084 (linha 343): card redesenhado com TaskCheckbox CIRCULAR, título em 2 linhas (`line-clamp-2`), kebab ⋮,
  PriorityPill e a linha de contexto (contato/avatar + prazo), altura adaptativa.
- 085 (linha 344): Urgente junto ao título; prioridade padrão na linha de contexto.
- 086 (linha 345): tag "Atrasada" (`data-testid="overdue-tag"`, ícone AlertCircle) ao lado do prazo vencido.
- 087 (linha 346): DateLabel ("Hoje, 14:00") e RemindChip com sino âmbar; rótulos "Prazo"/"Lembrete" em duas
  colunas no card em Fazendo/selecionado.
- 088 (linha 347): descrição curta em 2 linhas no card em Fazendo/selecionado.
- 089 (linha 348): chip de espera (`data-testid="waiting-chip"`) com ponto âmbar, motivo truncado + tooltip.
- 090 (linha 349): card selecionado com borda primary, fundo `primary/10`, alça ⠿ e foco sincronizado com o
  painel de detalhes (`data-selected`, `isSelected`/`selectedId`).

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/WorkItemCard.test.tsx` com a versão da base
  em `WorkItemCard.tsx` (card antigo, sem o redesenho) → `Tests 15 failed | 10 passed (25)`.
- verde depois: `npx vitest run src/components/tasks/__tests__/WorkItemCard.test.tsx` →
  `Test Files 1 passed (1); Tests 25 passed (25)`.
- suíte do módulo: `npx vitest run src/components/tasks` →
  `Test Files 28 passed (28); Tests 333 passed | 1 todo (334)`.
- tipos: `npx tsc -b --force` → exit 0.
- verificação (critério 3, o mesmo que o fechar roda): `zapp-verify . --rapido` →
  `OK db_guard 1s`, `OK tipos 27s`, `OK lint 4s`, `OK migrations 1s` e `VERIFY: VERDE SEM BANCO (33s)`.

## O que NÃO fiz e por quê
- Não trouxe os commits dos pais que mexem em `BoardColumn.tsx`/`TasksBoardMode.tsx`/`workItem.types.ts`
  (subtítulo das colunas): pertencem a outros cartões e não são necessários a este — `tsc` e a suíte ficaram
  verdes sem eles, e tocar nesses arquivos sairia da lista de arquivos deste cartão.
- Não alterei `TaskCheckbox.tsx` nem `src/components/ui/*`: preservei o primitivo que já entrou na ponta.
- Sem migration, Edge Function, dependência nova, produção ou qualquer saída de informação do sistema.
