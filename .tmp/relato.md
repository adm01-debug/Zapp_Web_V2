Especialista: Hugo (area-front-hooks)
Cartão: t_51c0ff3d — hook de digitando para a lista + debounce de parada (porta do useContactTyping da V3)

## O que mudou e por quê
- src/hooks/chat/useContactTyping.ts (novo): hook SÓ LEITURA `useContactTyping(contactId, { enabled })` que assina o canal EXATO `typing:${contactId}` — o mesmo que o webhook da Evolution publica em supabase/functions/_shared/evolution-webhook-handlers.ts:217 (`typing:${contact.id}`). Auto-clear de 5 s (`TYPING_AUTO_CLEAR_MS`, ajustável por `VITE_TYPING_AUTO_CLEAR_MS`) e debounce de parada de 600 ms (`TYPING_STOP_DEBOUNCE_MS`) embutidos; ignora `@broadcast` e `@g.us`; canal só nasce com `enabled` verdadeiro (gating por viewport); libera canal e timers no cleanup e desliga o estado quando o contato/espaço de nomes muda.
- src/hooks/chat/useTypingPresence.ts: o STOP do contato deixou de derrubar `isContactTyping` no mesmo instante — agora passa por `TYPING_STOP_DEBOUNCE_MS` (reuso constante do hook novo), cancelado por qualquer reativação. Auto-clear passou a usar `TYPING_AUTO_CLEAR_MS`. Sem mudança de contrato do hook (mesmos campos e assinatura).
- src/hooks/chat/__tests__/useContactTyping.test.ts (novo): 8 testes — canal exato pedido ao provedor, liga/desliga por evento, ignora payload sem `isTyping`, auto-clear de 5 s, debounce de parada, reativação dentro da janela não pisca, `{ enabled: false }` não cria canal, troca de contato zera e limpa o canal.
- src/hooks/__tests__/useTypingPresence.identidade.test.tsx: atualizado o teste de STOP para a janela de debounce e acrescentado o teste anti-flicker composing→paused→composing.

## Item 3 do cartão — conversation.id === contact.id
Confirmado: src/adapters/inboxAdapter.ts:102 devolve `id: rc.contact.id`, então o `conversation.id` que a lista entrega É o id do contato — o canal `typing:${contactId}` do hook novo casa com o que a Evolution publica. Não toquei no adapter (fora do escopo); só registrei.

## Prova
- vermelho antes: `git stash push -- src/hooks/chat/useTypingPresence.ts` + `npx vitest run src/hooks/__tests__/useTypingPresence.identidade.test.tsx` → `Tests 2 failed | 4 passed` (AssertionError: expected false to be true, linha 196) — sem o debounce o aviso pisca.
- verde depois: `npx vitest run src/hooks/chat/__tests__/useContactTyping.test.ts src/hooks/__tests__/useTypingPresence.identidade.test.tsx src/hooks/__tests__/useTypingPresence.test.tsx` → `Test Files 3 passed (3); Tests 19 passed (19)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard OK, tipos OK, lint OK, migrations OK).

## O que NÃO fiz e por quê
- Não exportei o hook em src/hooks/chat/index.ts (arquivo fora da lista do cartão). Comentei o caminho de import direto no cartão do consumidor LS2 (t_7b4012a1).
- Não mexi em inboxAdapter.ts nem em componentes/telas — isso é de LS2/worker (telas).