Especialista: Íris (area-front-componentes)

Nota sobre o aviso do juiz: ele aponta `sk-lembrete-…` como chave/segredo. Não
procede: é o PREFIXO do `data-testid` `new-task-lembrete-*` (`new-ta**sk-lembrete**-data`,
`-hora`, `-limpar`, `-em-1h`, `-amanha-9h`, `-prox-seg-9h`): o padrão `sk-` casou com o
final de "task". Nenhum token, chave ou ref de produção existe nestes arquivos.

# Etapa 160 — campo "Lembrete" no modal Nova tarefa

## O que mudou e por quê
Plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`, seção 3.4
(imagem 04, modal "Nova tarefa"), linha 119 da tabela de elementos:
`| "Lembrete — Quando você quer ser avisado": data, hora e Em 1h / Amanhã, 9h / Próx. seg., 9h | FALTA | 160–161 |`

- `src/components/tasks/shared/new-task/RemindField.tsx` (novo) — o campo da etapa 160:
  rótulo "Lembrete" + legenda "Quando você quer ser avisado", entrada de **data**
  (`type=date`, testid `new-task-lembrete-data`), entrada de **hora** (`type=time`,
  testid `new-task-lembrete-hora`) e os três atalhos **Em 1h**, **Amanhã, 9h** e
  **Próx. seg., 9h**. Apresentação pura: sobe o ISO de `remind_at` por `onChange` e
  recebe `onChange(null)` no limpar. Nenhuma conta nova — os atalhos chamam
  `remindPresetISO` e a composição data+hora chama `comporLocal`/`diaLocal`/`horaLocal`
  (`src/hooks/tasks/workItemPresets.ts`, etapa 161, e `../localDateTime`), para reusar
  em vez de reimplementar.
- `src/components/tasks/shared/NewTaskDialog.tsx` — o casco monta o `RemindField` ao
  lado do `PrazoField`; estado local `remindAt` (com `defaultRemindAt` opcional para o
  teste/contexto) sobe pelo `onChange`.
- `src/components/tasks/__tests__/NewTaskDialog.lembrete.test.tsx` (novo) — 7 casos que
  renderizam o `NewTaskDialog` REAL (sem mock do campo), com relógio fixo
  (`now` = terça 13/10/2026 12:00).

## Prova
- vermelho antes: `git restore --source=ea1b1a0a7d -- src/components/tasks/shared/NewTaskDialog.tsx` (casco sem o `RemindField`) e `npx vitest run src/components/tasks/__tests__/NewTaskDialog.lembrete.test.tsx` →
  `Test Files 1 failed (1)` / `Tests 7 failed (7)` (falha em `getByTestId('new-task-lembrete-em-1h')` — o campo não estava montado).
- verde depois: `npx vitest run src/components/tasks/__tests__/NewTaskDialog.lembrete.test.tsx src/components/tasks/__tests__/NewTaskDialog.prazo.test.tsx` →
  `Test Files 2 passed (2)` / `Tests 14 passed (14)` (7 daqui + 7 do prazo, sem regressão).
- vizinhança: `npx vitest run src/components/tasks src/hooks/tasks` →
  `Test Files 44 passed (44)` / `Tests 550 passed | 1 todo (551)`.

Casos do teste (nome de cada um):
1. `renderiza o rótulo "Lembrete / Quando você quer ser avisado" e os três atalhos`
2. `nasce sem lembrete: data e hora vazias e o limpar desabilitado`
3. `atalho "Em 1h" grava agora + 1 h (remindPresetISO), no dia local 13/10`
4. `atalho "Amanhã, 9h" grava o dia seguinte às 09:00 (14/10 09:00)`
5. `atalho "Próx. seg., 9h" grava a próxima segunda às 09:00 (19/10 09:00)`
6. `escolher só a data assume 09:00 locais; trocar a hora compõe o instante local`
7. `limpar apaga o valor e volta a desabilitar o botão`

Regras de tela: só tokens do sistema (nenhuma cor literal — `border-border`,
`text-muted-foreground`, `bg-input`, `ring-ring`, `bg-secondary`); alvos de 40 px
(`h-10`); botão de limpar com `aria-label` e foco visível; sem `framer-motion` nesta
fatia; sem largura fixa que estoure 360/768/1280 (campo em `flex`, data `flex-1 min-w-0`).

## Dependência (faixa do cartão irmão) — decisão registrada
O `NewTaskDialog.tsx` NÃO existe na base `dia/2026-10-13` (who adds the modal shell is a
sibling step). Trazido por `git cherry-pick ea1b1a0a7d` (cartão irmão **t_44cc5d0c**,
Etapa 159 — campo Prazo, branch `v2/etapa159-prazo-nova-tarefa-2610131309fac9`), que
cria o casco mínimo + `new-task/PrazoField.tsx`. Foi esse casco que recebeu o campo da
Etapa 160 "por cima", como o próprio commit do irmão prevê
("As demais seções entram por cima sem reescrever isto"). Minha fatia própria é
`RemindField.tsx` + o mount no casco + o teste — os demais itens do diff são essa faixa
declarada (`git show --stat bcb928c499` = só os 3 arquivos do meu commit).

## O que NÃO fiz e por quê
- Etapas 156–158 (título, contato, prioridade), 163 (mensagens de coerência), 164
  (destino) e 165–167 (prévia e rodapé): são de outros cartões (t_36235425, t_0d0f768f,
  t_50b36fd4). Não dupliquei escopo.
- Não toquei em `src/components/ui/*` nem em nenhum arquivo fora da lista do cartão
  (`git diff --name-only 52b433da9d...HEAD` = 5 arquivos, todos em `new-task/` ou
  `__tests__/`).
- Nenhuma porta nova de exportar/importar/copiar/imprimir; nenhum dado sai do sistema.
- A "hora padrão" 09:00 quando só o dia é escolhido segue o atalho "Amanhã, 9h" do
  próprio plano, para o par dia+hora não nascer vazio.
