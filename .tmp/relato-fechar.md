Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 46s;OK lint 7s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 00:08, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/ChatPanel.tsx                 |  10 +-
 src/components/inbox/RealtimeInboxView.tsx         |  36 +++-
 .../__tests__/ChatPanel.atalhos-busca.test.tsx     |  31 +++
 .../RealtimeInboxView.atalhos-teclado.test.tsx     | 232 +++++++++++++++++++++
 4 files changed, 303 insertions(+), 6 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 12 passed (12)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: integrar — sem risco detectado

(area-front-componentes)

## O que mudou e por quê
- src/components/inbox/RealtimeInboxView.tsx: o listener de `window` dos atalhos do lote passou a (a) sair quando há diálogo/menu Radix aberto (`overlayAberto()`), (b) sair em campo de texto (`focoEmCampoDeTexto()`, cobre `contenteditable`/`isContentEditable`) e (c) comparar `e.key.toLowerCase()`. Ctrl+A só seleciona o lote quando `bulkActions.selectionMode` já está ativo (fora dele, Ctrl+A volta a ser a seleção de texto do navegador) — era isso que bloqueava a seleção de texto em qualquer lugar do Inbox.
- src/components/inbox/ChatPanel.tsx: o atalho de busca (Ctrl/Cmd+F) passou a comparar `e.key.toLowerCase()` (com Caps Lock `e.key` é `'F'`) e a não agir com diálogo/menu Radix aberto.
- src/components/inbox/__tests__/RealtimeInboxView.atalhos-teclado.test.tsx (novo): monta a `RealtimeInboxView` REAL e prova os 5 casos (Ctrl+A fora de campo, Ctrl+A no campo de texto, overlay aberto, controle positivo sem overlay, Caps Lock).
- src/components/inbox/__tests__/ChatPanel.atalhos-busca.test.tsx: acrescentados 2 casos (Ctrl+F com Caps Lock abre a busca; com diálogo aberto não abre).

## Prova
- vermelho antes (produção de HEAD, sem a correção): `npx vitest run src/.../RealtimeInboxView.atalhos-teclado.test.tsx src/.../ChatPanel.atalhos-busca.test.tsx` → `Test Files 2 failed (2); Tests 4 failed | 8 passed (12)` (falham Ctrl+A fora de campo, overlay aberto, Caps Lock do inbox, Caps Lock do chat).
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 12 passed (12)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint, migrations OK; o cartão não cria migration).

## Critério de pronto
1. Ctrl+A num campo de texto não seleciona conversas: `RealtimeInboxView.atalhos-teclado.test.tsx` (caso "critério 1", com `selectionMode=true`), e a guarda `focoEmCampoDeTexto()` em `RealtimeInboxView.tsx`.
2. Com diálogo aberto os atalhos não agem: `RealtimeInboxView.atalhos-teclado.test.tsx` (caso "critério 2", Ctrl+A/`r`/Delete/Escape com `role="dialog" data-state="open"`) e `ChatPanel.atalhos-busca.test.tsx` (Ctrl+F sob diálogo).
3. `zapp-verify . --rapido` verde (linha acima).

## Escopo (fora do pedido — não deixam pendência)
- O listener segue em `window`, agora com escopo por modo de seleção + guardas de overlay/campo; migrá-lo para o elemento da lista exigiria tocar `ConversationListSidebar`, que não está nos arquivos do cartão, e o cartão autoriza a via adotada ("ou registro de atalhos com escopo").
- `useGlobalSearchShortcut` (Ctrl+K) vive em `src/hooks/`, fora dos arquivos do cartão; não foi tocado.

HOTSPOT: src/components/inbox/RealtimeInboxView.tsx — 3 cartões recentes de inbox tocaram este arquivo (t_0c84b4f3, t_7582aaee, t_ecedc332); segue grande (436 linhas).
