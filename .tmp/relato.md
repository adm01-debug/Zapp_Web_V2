Especialista: semisenior (area-front-hooks)
Cartao: t_e868e243 — [refazer 1] hook digitando lista debounce parada

Ponto 1 da recusa — estado preso na troca de contato (A digitando -> B herdava true).
O que mudei: src/hooks/chat/useContactTyping.ts — reset sincronico setIsTyping(false)
direto no inicio do efeito (sem startTransition; import removido), com
eslint-disable-next-line react-hooks/set-state-in-effect no padrao do repo. O cleanup
anterior ja limpava os dois timers, entao nenhum timer velho ressuscita o aviso.
Teste que prova: 'troca de contato zera o aviso imediatamente (sem arrastar true do
anterior)' em src/hooks/chat/__tests__/useContactTyping.test.ts — liga true em A,
rerender para B, espera false SEM avancar nenhum timer.
Vermelho antes (sem a correcao): npx vitest run src/hooks/chat/__tests__/useContactTyping.test.ts -> 9 tests | 1 failed — AssertionError: expected true to be false (linha 139).
Verde depois (com a correcao): npx vitest run src/hooks/chat/__tests__/useContactTyping.test.ts src/hooks/__tests__/useTypingPresence.identidade.test.tsx src/hooks/__tests__/useTypingPresence.test.tsx -> Test Files 3 passed (3); Tests 20 passed (20).

Ponto 2 da recusa — relato citava comandos inexistentes (7 E2E) e numero errado (5 passed).
O que mudei: este .tmp/relato.md reescrito do zero contendo SOMENTE saidas reais
colhidas neste refazer (vermelho e verde acima + eslint abaixo). Nenhum E2E citado,
nenhum numero de outra suite.
Teste que prova: o proprio diff deste arquivo — so texto, sem codigo.

Segunda passada (defeito novo do meu diff): rg por useContactTyping em src mostra
que o unico consumidor alem dos testes e src/hooks/chat/useTypingPresence.ts, que so
importa as constantes TYPING_AUTO_CLEAR_MS/TYPING_STOP_DEBOUNCE_MS (intocadas) —
nenhum chamador muda de comportamento. Nenhum arquivo de guarda, manifesto, CI,
migration ou tela tocado. Sem ref de producao no diff.

Arquivos (git diff --name-only dia/2026-10-12...HEAD, apos commit):
.tmp/relato.md
src/hooks/__tests__/useTypingPresence.identidade.test.tsx
src/hooks/chat/__tests__/useContactTyping.test.ts
src/hooks/chat/useContactTyping.ts
src/hooks/chat/useTypingPresence.ts

Comandos de verificacao (resultados reais):
- npx vitest run src/hooks/chat/__tests__/useContactTyping.test.ts (antes da correcao) -> 9 tests | 1 failed (AssertionError: expected true to be false, linha 139)
- npx vitest run src/hooks/chat/__tests__/useContactTyping.test.ts src/hooks/__tests__/useTypingPresence.identidade.test.tsx src/hooks/__tests__/useTypingPresence.test.tsx (depois) -> Test Files 3 passed (3); Tests 20 passed (20)
- npx eslint src/hooks/chat/useContactTyping.ts src/hooks/chat/__tests__/useContactTyping.test.ts -> exit 0
- zapp-verify . --rapido -> VERIFY: VERDE SEM BANCO (db_guard OK, tipos OK, lint OK, migrations OK; banco_local nao verificado — sem DDL no cartao)
