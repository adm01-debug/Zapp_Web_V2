Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Onda 6 do redesign do card de contato: 4 achados menores no mesmo grupo de arquivos.

1. Hover (3 intensidades → 1). `CRMContactCard.tsx` trocou
   `hover:border-primary/30 hover:bg-primary/[0.02] transition-all` por `card-lift card-glow`;
   `ContactListItem.tsx` trocou `hover:bg-muted/40 hover:border-primary/30 transition-all duration-150`
   pelas mesmas `card-lift card-glow`. `ContactCard.tsx` já usava o token — nada mudou nele aqui.
   O token é o de efeito do sistema (`src/styles/utilities.css:127`), e ele já zera a transição e o
   transform sob `prefers-reduced-motion` (`utilities.css:182`), então o "reduzir movimento" está coberto.
2. Vão vazio (`ContactCard.tsx`). Sem telefone e sem e-mail o bloco do meio ficava vazio e o
   `min-h-[164px]` mantinha um buraco no meio do card. Agora a altura mínima é condicional:
   com telefone ou e-mail continua `min-h-[164px]` (grade uniforme), sem os dois cai para
   `min-h-[120px]` — o rodapé é `mt-auto`, então sem folga não sobra vão.
3. Ações duplicadas (`ContactCard.tsx`). O menu "⋮" tinha Conversar/Editar/Excluir e o rodapé repetia
   Conversar/Editar (4 alvos para 2 ações). O menu ficou só com o Excluir (o único item exclusivo
   dele); Conversar/Editar ficam apenas no rodapé. Sem permissão de exclusão o menu não tem mais
   nenhum item, então o botão "⋮" não é renderizado (o gate `contact.can_delete` continua sendo o
   que decide).
4. Espaçamento (`ContactGroupedList.tsx`). O container dos itens agrupados era `space-y-1`; virou
   `space-y-2`, igual ao `ContactContentArea.tsx:111` — é o mesmo `ContactListItem` nos dois casos.
   (`ContactContentArea.tsx` não precisou mudar: já estava em `space-y-2`.)

## Prova
- Teste novo `src/components/contacts/__tests__/ContactPolimento.test.tsx` (7 casos, componente REAL).
- vermelho antes (fonte revertida para a base via `git checkout` das 4 fontes; patch restaurado depois):
  `npx vitest run src/components/contacts/__tests__/ContactPolimento.test.tsx`
  → `Tests  5 failed | 2 passed (7)` — ex.: `expected 'border-t border-border/20 space-y-1 p…' to contain 'space-y-2'`.
- verde depois (fonte com a correção):
  `npx vitest run src/components/contacts/__tests__/ContactPolimento.test.tsx src/components/contacts/__tests__/ContactDeletePermission.test.tsx src/components/contacts/__tests__/ContactOpenChat.test.tsx`
  → `Test Files  3 passed (3); Tests  18 passed (18)`.
- regressão da pasta inteira: `npx vitest run src/components/contacts/__tests__/`
  → `Test Files  30 passed (30); Tests  243 passed (243)`.

## Teste existente que mudei (motivo explícito)
`ContactDeletePermission.test.tsx` (bloco `ContactCard · item Excluir`): ele abria o menu e esperava o
texto "Editar" ali dentro. Como o cartão manda tirar Conversar/Editar do menu, essa premissa deixou de
existir. Reescrevi os 2 casos mantendo/fortalecendo a asserção: com `can_delete: false` agora prova que
o botão "⋮" NEM é montado (`document.querySelector('button[aria-haspopup="menu"]')` é `null`) e que o
rodapé segue com o Conversar; com `can_delete: true` abre o menu, clica no Excluir e confere
`onDelete` chamado com o contato. Não pulei nem esvaziei teste.

## O que NÃO fiz e por quê
- `ContactContentArea.tsx` está na lista de arquivos que posso tocar, mas não precisou: o espaçamento
  dele já era o padrão (`space-y-2`) — só o `ContactGroupedList` estava fora.
- Não troquei a intensidade do `ContactCard` (já era `card-lift card-glow`): o critério é igualar as
  outras 2 views a ele.

## Rebase em cima da dia de 12/10
- Conflito: `src/components/contacts/ContactListItem.tsx` (classes do item). A dia trocou o estado selecionado para `ring-1 ring-primary border-primary/60 bg-primary/5`; a entrega trocou o hover para `card-lift card-glow` e tinha reescrito o selecionado. Resolvi preservando os dois: hover `card-lift card-glow` (entrega) e selecionado com o `ring-1 ring-primary border-primary/60 bg-primary/5` da dia. Os outros 3 arquivos de código e os 2 de teste aplicaram sem conflito (as 2 commits da entrega foram comprimidas em 1 antes do rebase).
- Provas (um vitest por vez): `vitest run ContactPolimento.test.tsx ContactDeletePermission.test.tsx` -> `Test Files 2 passed (2); Tests 15 passed (15)`; `vitest run ContactGroupedList.typography` -> `1 passed`; `vitest run controlesToque ContactSelectionConsistency ContactOpenChat tipografiaPisoEscalaContatos` -> `Test Files 4 passed (4); Tests 17 passed (17)`.
- Vermelho preservado: com os 4 arquivos de código na versão da dia, `ContactPolimento.test.tsx` -> `Tests 5 failed | 2 passed (7)`; restaurado o código da entrega, passa.
- Não rodei typecheck, lint completo nem suíte completa.
