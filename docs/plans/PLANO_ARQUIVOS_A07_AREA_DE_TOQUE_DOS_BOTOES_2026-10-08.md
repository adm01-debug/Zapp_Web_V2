# PLANO — ÁREA DE TOQUE DOS BOTÕES DE AÇÃO DO CARTÃO DE ARQUIVO NO CELULAR (A07) — 2 ETAPAS

> **Data:** 2026-10-08 · **Escopo:** front-end · **Sem DDL, Edge Function, migration nem dependência nova.**
> **Decisão:** "escolha por mim" (Joaquim, 08/10). Origem: a verificação do A06 mostrou botões de ação de 28×28 px (padrão `w-7 h-7`) na aba Arquivos, abaixo do alvo confortável de toque (44 px) em tela de dedo.

## Decisão de desenho (reversível)
- O **tamanho visível NÃO muda** (28 px) e o desktop (mouse) fica idêntico. Só em **ponteiro de toque** (`@media (pointer: coarse)`, o mesmo critério já usado em `src/components/tasks/shared/pointerMedia.ts`) a **área clicável** cresce para pelo menos **44 px de altura** e **32 px de largura**, por uma extensão invisível do próprio botão (pseudo-elemento), sem mexer no layout.
- As áreas de botões vizinhos **não podem se sobrepor** (hoje o espaço entre eles é de 4 px: a extensão horizontal máxima é de 2 px para cada lado).
- Uma **constante única** (`FILE_ACTION_BUTTON`) substitui as 5 cópias da classe, para o padrão não divergir de novo.
- Sem cor nova e sem efeito novo; o foco visível continua o mesmo.

## Onde (5 usos do mesmo botão de 28 px)
`AudioPlayButton.tsx` (play), `FileActionsMenu.tsx` (⋮), `FileCard.tsx` (olho e o botão desabilitado), `FilesListView.tsx` e `FilesTableView.tsx` (`ACTION_BUTTON`).

## Etapas
- **A07a** [iris] criar `src/components/inbox/tabs/fileActionButton.ts` (constante + comentário do porquê), trocar as 5 cópias por ela, e teste que prova: a classe contém a extensão de toque só sob `pointer: coarse`, o tamanho visível segue `w-7 h-7`, e os 5 usos importam a constante (sem cópia solta).
- **A07b** [Claude] verificação na pré-visualização com toque emulado (`hasTouch`/`isMobile`): `elementFromPoint` a 8 px acima/abaixo do botão devolve o próprio botão (área ≥ 44 px de altura) e a 6 px ao lado do botão vizinho não "rouba" o toque; no mouse, nada muda.

## Arquivos permitidos (A07a)
Os 5 acima, o novo `fileActionButton.ts` e os testes existentes desses componentes (ajustes mínimos) mais um teste novo `fileActionButton.test.ts`. Qualquer outro arquivo = recusa por "diff maior que o título".
