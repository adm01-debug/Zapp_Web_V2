Especialista: iris

## O que mudou

Título: fix(inbox): barra de acoes em lote so fecha o dialogo depois do resultado

- `src/components/inbox/BulkActionsToolbar.tsx`
  - Saiu o `handleTransfer` local, que chamava `onTransfer(...)` sem `await` e
    fazia `setShowTransferDialog(false)` na hora.
  - `onTransfer` vai direto para a `TransferDialog`, que espera a promise
    (`isTransferring`, botão "Transferindo…") e só fecha no sucesso
    (`onOpenChange(false)`); na falha ela fica aberta e o `catch` dela trata a
    rejeição. O resumo do lote (transferidos/falharam) sai no toast do hook.
  - Tipo da prop `onTransfer` virou `void | Promise<void>`, que é o contrato real
    (o lote rejeita em falha). Saiu o cast
    `as (type: "agent" | "connection" | "queue", …)`, que escondia a
    incompatibilidade: o contrato público da `TransferDialog` é `agent | queue`.
- `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` (novo)
  - Renderiza os componentes REAIS (`BulkActionsToolbar` + `TransferDialog`) com
    `TooltipProvider`/`QueryClientProvider`; as fronteiras dubladas são só auth,
    agentes, filas, Supabase e o `onTransfer`.
  - Caso 1: transferência que FALHA → o diálogo continua aberto ("Transferir
    Chat" presente) e o botão destrava.
  - Caso 2: transferência em voo → diálogo aberto com o botão "Transferindo…"
    desabilitado; só sai de tela depois que a promise resolve.

## Prova (comando e linha de resultado)

1. Vermelho antes (código antigo da barra + teste novo):
   `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`
   → `Test Files 1 failed (1)`, `Tests 2 failed (2)`; os dois casos morriam em
   `Unable to find role="dialog"` porque a barra fechava o diálogo na hora.
2. Verde depois, mesmo comando:
   → `Test Files 1 passed (1)`, `Tests 2 passed (2)`. Duration 5.84s.
3. Verificação do cartão: `zapp-verify . --rapido`
   → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`,
   `VERIFY: VERDE SEM BANCO (193s)`.

## Nota sobre o aviso do juiz (escopo)

O juiz aponta `src/hooks/inbox/useInboxBulkActions.ts` e o teste dele. Esses
arquivos são os commits do cartão pai t_2901d317, que o próprio cartão manda
trazer como pré-requisito ("cherry-pick a faixa dia/2026-10-12..94539ff04 (ou
merge)"), e trazido no cherry-pick. Meu commit é só `7bcf35c3d`
(BulkActionsToolbar.tsx 15+/7- e o teste novo). Sem a faixa do pai o `onTransfer`
seria `() => void` e a espera/resultado não teria como ser provada. Não há
mudança minha naqueles dois arquivos.
