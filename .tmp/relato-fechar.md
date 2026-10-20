- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 80s;OK lint 5s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 12:48, gerados por máquina: valem mais que números escritos à mão)
```
 .../__tests__/ContactDetails.quickActions.test.tsx |  30 ++--
 ...useChatPanelHandlers.sem-falso-sucesso.test.tsx |  37 ++++-
 src/components/inbox/chat/useChatPanelHandlers.ts  |  18 +-
 .../chat/__tests__/useConversationActions.test.ts  |  51 ++++--
 src/hooks/chat/useConversationActions.ts           |  20 ++-
 .../inbox/__tests__/useInboxBulkActions.test.ts    | 183 +++++++++++++--------
 src/hooks/inbox/useInboxBulkActions.ts             | 103 ++++++++----
 7 files changed, 306 insertions(+), 136 deletions(-)
```
- Testes alterados neste cartão (4 arquivo[s]) rodados AGORA no seu commit: Test Files 4 passed (4);Tests 64 passed (64)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:SECURITY DEFINER

Especialista: hugo

## O que mudou e por quê
- src/hooks/chat/useConversationActions.ts: `archiveContact` deixa de zerar `assigned_to` e passa a chamar `supabase.rpc('set_conversation_status', { p_contact_id, p_next: 'archived', p_reason: 'arquivada_no_chat' })`; o Desfazer reabre pela mesma RPC com `p_next: 'open'` e, se a reabertura falhar, o erro sobe para o undoToast. Antes a conversa saía das listas sem nunca virar 'archived'.
- src/hooks/inbox/useInboxBulkActions.ts: `bulkArchive` arquiva cada contato pela RPC (no máximo 5 em voo), o desfazer reabre SÓ as que foram arquivadas de verdade, e falha parcial/total informa "X arquivadas, Y falharam" mantendo a seleção das que falharam.
- src/components/inbox/chat/useChatPanelHandlers.ts: o `case 'archive'` do slash `/archive` deixa de escrever `conversation_status` direto em `contacts` e passa a chamar a MESMA RPC (`p_reason: 'arquivada_no_chat'`), com o toast de erro já existente. Era a terceira implementação paralela da transição.
- testes: os dois hooks em src/hooks/**/__tests__, mais `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` (cobria o caminho "menu" e afirmava a semântica antiga de `assigned_to = null`) e `src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx` (cobria o slash, agora com um caso novo de erro na RPC). Os dois últimos estão fora da lista literal de arquivos do cartão: entraram porque o critério 1 pede menu e slash, e porque mantê-los como estavam deixaria o zapp-verify vermelho.
- removidos na base, portanto fora do diff: `src/hooks/inbox/useBulkActions.ts` e seu teste (apagados em 1ad0af52c7) — o item 3 do cartão não se aplica mais.

## Prova
- vermelho antes (hooks): com o código de d723a90107 nos dois hooks, `npx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/hooks/inbox/__tests__/useInboxBulkActions.test.ts src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` → `Test Files  3 failed (3)` / `Tests  9 failed | 45 passed (54)`; as 9 falhas são exatamente os casos novos (archiveContact pela RPC, erro/desfazer, teto de 5 RPCs em voo, falha parcial, falha total, retrato da seleção, menu).
- vermelho antes (slash): com o código de d723a90107 em `useChatPanelHandlers.ts`, `npx vitest run src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx` → `Tests  2 failed | 8 passed (10)`.
- verde depois: `npx vitest run <os 4 arquivos>` → `Test Files  4 passed (4)` / `Tests  64 passed (64)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (282s)` com `OK tipos`, `OK lint`, `OK db_guard`, `OK migrations`. O passo `banco_local` sai como `NÃO VERIFICADO: sem nome de conjunto` (o comando não recebeu o nome do conjunto); nenhum SQL foi tocado neste cartão.
- trocar/restaurar código para a prova não deixou resíduo: cada arquivo reposto foi conferido por `sha256sum -c` e `git status --short` ficou limpo antes do commit.

## Como todos os caminhos passam a arquivar (item 4)
`git grep -n` mostra os cinco caminhos desembocando nos três arquivos: `ContactDetails.tsx:75` (menu → archiveContact), `ConversationListSidebar.tsx:202` e `:286` (individual e em massa), `RealtimeInboxView.tsx:371` (individual) e `:194` (atalho Delete/Backspace → bulkArchive), e `useChatPanelHandlers.ts:527` (slash `/archive`). A conversa sai das listas abertas porque lista e chips filtram por `conversation_status !== 'archived'` (`conversation-list/StatusChips.tsx:39` e `:49`), e agora os três caminhos gravam esse estado pela RPC (antes gravavam só `assigned_to = null`).

## Ponto do juiz adversarial (Critério 1)
Critério 1: o slash `/archive` não estava no diff e ainda escrevia direto em `contacts`. Ponto PROCEDE e foi resolvido: novo commit `89bb541cbe` troca a escrita direta pela RPC em `src/components/inbox/chat/useChatPanelHandlers.ts` e amplia o teste do caminho (vermelho `Tests  2 failed | 8 passed (10)` → verde `Tests  10 passed (10)`). O spray de "duas implementações paralelas" agora não existe: individual, massa e slash chamam a mesma RPC.

## FAIXA DO PAI
FAIXA DO PAI: commits `a47e79c571` (fix) e a cauda `a6d2a09739`/`9305240ff` (só `.tmp/relato.md`) da branch `v2/arquivar-grava-estado-arquivada-rebase-26101301191d6d` — é a entrega ANTERIOR do mesmo pedido deste cartão, trazida por `git cherry-pick` e adaptada à base `dia/2026-10-16`; não é código de outro cartão. Os dois commits de relato foram descartados (não trouxe `.tmp/relato.md` de execução antiga).

## Arquivos fora da lista do cartão (aviso do juiz)
Os três arquivos fora de "ARQUIVOS QUE PODE TOCAR" foram indispensáveis, um a um:
`src/components/inbox/chat/useChatPanelHandlers.ts` é o caminho do slash `/archive`, citado no CRITÉRIO 1 ("Arquivar (individual, em massa, atalho, menu, slash) grava archived via RPC") — sem ele o critério 1 fica pela metade, e foi o próprio juiz adversarial que apontou isso (ponto resolvido no commit 89bb541cbe);
`src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` é o teste que já existia para o caminho "menu" e afirmava a semântica antiga (`assigned_to = null`) — mantê-lo sem ajuste deixaria o zapp-verify vermelho;
`src/components/inbox/chat/__tests__/useChatPanelHandlers.sem-falso-sucesso.test.tsx` é o teste que já existia para o slash e provava a escrita direta removida — sem ajustá-lo o teste passaria a documentar exatamente o que o cartão proíbe.
Nos três casos é ajuste do MESMO defeito do cartão (a transição de arquivamento), não assunto novo; não toquei em nenhum outro arquivo.

## O que NÃO fiz e por quê
- `src/hooks/inbox/useBulkActions.ts`: não existe mais na base; nada a fazer no ramo archive.
- Escrevi `.tmp/relato.md` de novo em vez de reaproveitar o da branch antiga: aquele relato descrevia a base de 13/10.
- nenhum DDL, Edge Function, dependência nova ou token de cor: o diff é hook/handler + testes.