Especialista: iris

## O que mudou e por quê

Título: fix(inbox): barra de acoes em lote so fecha o dialogo depois do resultado

- `src/components/inbox/BulkActionsToolbar.tsx`:
  - removido o `handleTransfer` local, que chamava `onTransfer(...)` sem `await` e
    fazia `setShowTransferDialog(false)` na hora. Com o lote do cartão pai
    (t_2901d317) REJEITANDO em falha (`useInboxBulkActions.bulkTransfer`), isso
    fechava o diálogo antes do resultado: o usuário não via o resumo
    (quantas conversas transferiram / quantas falharam) e a promise rejeitada
    ficava sem tratamento.
  - `onTransfer` agora vai direto para a `TransferDialog`, que é quem espera a
    promise: mostra "Transferindo…" enquanto o lote roda em série e só fecha no
    sucesso (`onOpenChange(false)`); na falha ela permanece aberta (o `catch`
    dela é o tratamento da rejeição). O resumo vem do toast do hook.
  - removido o cast `as (type: "agent" | "connection" | "queue", …)` que escondia
    a incompatibilidade: o contrato público da `TransferDialog` é `agent | queue`
    (item 88 / R2-INB-009) e o `onTransfer` da barra é o mesmo. O tipo da prop
    ficou `void | Promise<void>` para documentar que a promise pode rejeitar.
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` (novo):
  renderiza o componente REAL (`BulkActionsToolbar` + `TransferDialog`) com
  `TooltipProvider`/`QueryClientProvider`; a fronteira dublada é só auth,
  agentes, filas, Supabase e o `onTransfer`. Dois casos: (1) transferência que
  FALHA → o diálogo continua aberto com "Transferir Chat" e o botão destrava;
  (2) transferência em voo → diálogo aberto com o botão "Transferindo…"
  desabilitado, e só desaparece depois que a promise resolve.

## Prova

- vermelho antes (código antigo da barra, com o teste novo aplicado) — comando
  `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`,
  saída: `Test Files 1 failed (1); Tests 2 failed (2)` — nos dois casos a barra
  fechava o diálogo na hora e `screen.getByRole('dialog')` não achava nada
  (`Unable to find role="dialog"`).
- verde depois — mesmo comando, saída:
  `Test Files 1 passed (1); Tests 2 passed (2)`.
- verificação do cartão — comando `zapp-verify . --rapido`.

## O que NÃO fiz e por quê

- Não mexi no hook `useInboxBulkActions`: o resumo por conversa (contagens no
  toast) e a rejeição são o trabalho do cartão pai t_2901d317, já feito. Aqui só
  garanto que o diálogo não desaparece antes do resultado.
- Nada novo que exporte, baixe, copie ou imprima; nenhum log de telefone/token.

## Sobre o aviso do juiz (arquivos do cartão pai no diff)

O juiz aponta `src/hooks/inbox/useInboxBulkActions.ts` e o teste dele como fora
de escopo. Eles NÃO são trabalho meu: são os commits do cartão pai t_2901d317,
que o próprio cartão manda trazer antes de começar ("Pré-requisito ... cherry-pick
a faixa dia/2026-10-12..94539ff04 (ou merge) ... Enquanto ele não estiver
integrado, não dá para provar a espera/resultado"). Sem essa faixa no worktree,
`onTransfer` ainda seria `() => void` e a espera/resultado não teria como ser
provada. Reverter esses arquivos quebraria o pré-requisito e o teste da barra.
Minha entrega é só o commit `fix(inbox): barra de acoes em lote so fecha o
dialogo depois do resultado` (`git diff --stat`: BulkActionsToolbar.tsx 15+7-,
mais o teste novo).
