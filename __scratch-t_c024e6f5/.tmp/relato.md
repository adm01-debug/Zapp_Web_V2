Especialista: semisenior
Skill de área usada: area-front-hooks (src/hooks, src/services, src/components/inbox/chat).

## O que mudou e por quê (3 pontos da recusa, ponto a ponto)
- Ponto 1 — src/hooks/chat/sendQueue.ts:35-41: o `task()` da primeira tarefa da fila ociosa agora roda em `try/catch`; lançamento síncrono vira `Promise.reject` da própria entrega em vez de exceção síncrona do `enqueue`. O ramo de fila ocupada (`anterior.then(() => task())`) já convertia sozinho; o compositor (`useChatPanelHandlers.ts:346`) consome a fila só com `await`, então rejeição é o único canal de erro que ele trata.
- Ponto 2 — src/components/inbox/chat/useChatPanelHandlers.ts:363-366 (bloco `catch` do envio de texto): rascunho agora `atual.startsWith(originalText) ? atual : originalText + atual` e `if (wasReply) setReplyToMessage(wasReply)` incondicional — exatamente a correção aceita pela recusa. O `onUndo` do toast (linha 357) já era assim e não foi tocado.
- Ponto 3 — teste antigo `src/hooks/inbox/__tests__/useRealtimeInbox.sem-refetch-no-envio.test.tsx` APAGADO; novo `src/hooks/inbox/__tests__/useRealtimeInbox.sem-refresh-no-envio.test.tsx` (nome e describe ajustados como a recusa mandou). O novo usa os módulos REAIS do caminho (`useRealtimeMessages`, `useMessages`, `messageSender`, `outbound-message.service`, `ChatService`, `RealtimeService`) e finge só a fronteira de rede (`supabase`: `rpc`/`functions.invoke`/`from` espiados) + efeitos colaterais (transporte realtime, som/notificação, auth, UI). `src/hooks/inbox/useRealtimeInbox.ts` NÃO tem diff: varredura completa do caminho (`handleSendMessage` → `sendMessageToContact` → `sendOutboundMessage` = RPC `enqueue_outbound_message` + Edge `message-delivery`) mostra que não existe fetch/refresh na janela do envio de texto — a remoção mandada era vácua, e a prova é o teste que quebraria se qualquer fetch fosse reintroduzido (controle negativo abaixo).

## Prova (saída real, sem número à mão)
- Ponto 1 vermelho antes (código da entrega + teste novo): `bun x vitest run src/hooks/chat/__tests__/sendQueue.test.ts` → `FAIL … tarefa que lança em vez de rejeitar … AssertionError: expected [Function] to not throw an error but 'Error: falha síncrona' was thrown` (1 failed | 4 passed). Verde depois: `Tests 5 passed (5)`.
- Ponto 2 vermelho antes (código da entrega + testes novos): `bun x vitest run src/components/inbox/chat/__tests__/useChatPanelHandlers.fila-serial.test.tsx` → `FAIL … AssertionError: expected ' segunda' to be 'primeira segunda'` (1 failed | 5 passed). Verde depois: `Tests 6 passed (6)`.
- Ponto 3 verde: `bun x vitest run src/hooks/inbox/__tests__/useRealtimeInbox.sem-refresh-no-envio.test.tsx` → `Tests 2 passed (2)` (módulos reais: `rpc` chamado com `enqueue_outbound_message`, `invoke` com `message-delivery`, `from` zero vezes). Controle negativo (mutação temporária `await refreshActiveConversation()` no envio, revertida em seguida): o teste 1 quebra em `expect(rede.from).not.toHaveBeenCalled()` (1 failed | 1 passed) — o teste guarda a propriedade de verdade.
- Conjunta dos 4 arquivos de teste do cartão: `Test Files 3 passed, 1 skipped (4); Tests 13 passed, 7 todo (20)` (o skipped é `paridade06-envio.pendentes.test.ts`, com 7 `it.todo` de PK-22 pré-existentes, arquivo não tocado).
- ESLint nos 5 arquivos da entrega: 0 errors, 1 warning pré-existente (`useChatPanelHandlers.ts:3` importa o client Supabase — herdado da entrega, fora dos pontos).
- Typecheck global no meu scaffold: 4 erros de deriva HEAD×branch (ChatPanel:424, r2-inb-003.test:12/79, handler:622/642), ZERO nas minhas linhas; são deriva porque a base não tem `interactiveSendUnavailableReason` (0 ocorrências) e o HEAD tem (1) — no branch da entrega os 3 arquivos são da mesma linhagem.

## Pontos do revisor
- Ponto 1: resolvido — sendQueue.ts:35-41, teste `tarefa que lança em vez de rejeitar…` (sendQueue.test.ts:81).
- Ponto 2: resolvido — useChatPanelHandlers.ts:365-366, testes `a falha devolve o rascunho…` (fila-serial.test.tsx:142, vermelho→verde acima), `rascunho já redigitado não duplica…` (:158, trava o 2º ramo do `startsWith`) e `a falha restaura a resposta citada` (:173, trava o restore incondicional). O teste antigo `a falha não sobrescreve…` (esperava `nova`, comportamento recusado) foi substituído.
- Ponto 3: resolvido — teste renomeado para `sem-refresh-no-envio`, describe `useRealtimeInbox — envio de texto sem refresh no caminho (PK-21)`, sem `vi.mock` do caminho de envio, com asserção `expect(rede.from).not.toHaveBeenCalled()` nos testes das linhas 136 e 158. Remoção de código: não havia o que remover (caminho auditado acima); `useRealtimeInbox.ts` sem diff.

## O que NÃO fiz e por quê
- NÃO commitei: sem repo git nesta sessão (a guarda proíbe clonar/criar repo e o `hermes-tarefa-iniciar` V1 está congelado); a entrega vai como patch `refazer1.patch` (16561 bytes, abaixo do teto) + arquivos, com aplicação verificada (ver abaixo).
- NÃO incluí na entrega os 2 arquivos de apoio local `src/hooks/chat/useWhisperMessagesMutation.ts` e `src/hooks/chat/useWhisperCount.ts` (versões da base, trazidas só para rodar a suíte no meu scaffold HEAD; já existem no branch da entrega).
- NÃO toquei em `useRealtimeInbox.ts`, `paridade06-envio.pendentes.test.ts`, `.tmp/relato.md` da entrega, áudio (`handleSendAudio`), nem em Chamadores: `sendQueue` só é usado por `useChatPanelHandlers` (`CallEngine` tem `isBusy` próprio, sem import).

## Arquivos da entrega (exatos, entrega anterior → minha)
- M `src/hooks/chat/sendQueue.ts`
- M `src/hooks/chat/__tests__/sendQueue.test.ts`
- M `src/components/inbox/chat/useChatPanelHandlers.ts`
- M `src/components/inbox/chat/__tests__/useChatPanelHandlers.fila-serial.test.tsx`
- A `src/hooks/inbox/__tests__/useRealtimeInbox.sem-refresh-no-envio.test.tsx`
- D `src/hooks/inbox/__tests__/useRealtimeInbox.sem-refetch-no-envio.test.tsx`

## Comandos de verificação (resultado real)
- `patch -p1 --dry-run < .tmp/refazer1.patch` sobre os 6 arquivos em `c1e898c3fc`: `PATCH_DRY_EXIT:0` (6/6 ok); aplicado, `diff -q` byte a byte contra meus arquivos: idênticos.
- Sem `tnnnlkbymytvtqngbbqh` e sem segredo em código, teste, patch ou relato.
- Concluído o refazer; falta o commit no branch (impedimento de sessão acima) — patch pronto para o integrador aplicar sobre `c1e898c3fc`.
