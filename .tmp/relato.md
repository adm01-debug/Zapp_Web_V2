Especialista: worker (design) (design-system-zapp) — cartão da área iris/telas, encaminhado ao designer pela triagem; assino como worker (design).

Concluí: o motivo da recusa está resolvido, o componente do cartão segue verde e a verificação completa passou.

## O que mudou e por quê
- `src/components/inbox/chat/MessageBubbleUnsupported.tsx` (novo), `src/components/inbox/chat/MessageBubble.tsx` e `src/components/inbox/chat/__tests__/MessageBubbleUnsupported.test.tsx`: fallback visual da mensagem `unsupported` (glifo por tipo, movimento com `motion-safe:`, tokens do sistema, `role="note"`) — trazidos por `git cherry-pick` dos 3 commits da branch anterior (`72932851b`, `d2cf044cc`, `96fd1a15e`); nada de novo nesta rodada.
- `ESTADO.md` linha 70: a âncora de `classify-sticker` passou de `src/components/inbox/chat/MessageBubble.tsx:317` para `:325` — a linha do chamador mudou porque o arquivo do cartão cresceu, e sem isso a guarda do CI reprova.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `fail 1` — `AssertionError: âncora desatualizada: src/components/inbox/chat/MessageBubble.tsx:317 não cita \`classify-sticker\``
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11; pass 11; fail 0`
- verde depois: `npx vitest run src/components/inbox/chat/__tests__/MessageBubbleUnsupported.test.tsx` → `Test Files 1 passed (1); Tests 16 passed (16)`
- verde depois: `zapp-verify full .` → `OK db_guard 0s; OK tipos 17s; OK lint 166s; OK migrations 1s; OK testes 921s; OK build 14s` → `VERIFY: VERDE SEM BANCO (1119s)`

## Pontos do revisor
- Ponto 1: quebra do ESPELHO DO CI no empilhamento (`ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`) — reprojetei a âncora de `classify-sticker` para a linha real do chamador (`MessageBubble.tsx:325`, medido com `grep -n "classify-sticker" src/components/inbox/chat/MessageBubble.tsx`), sem tocar no critério do teste nem remover âncora; provado pelo vermelho antes → verde depois acima.

## O que NÃO fiz e por quê
- Não afrouxei a guarda e não alterei `scripts/ci/docs-estado-registry-convention.unit.mjs`.
- Só o número da âncora mudou no `ESTADO.md` (fora da lista do cartão, mas é a causa direta da recusa: a linha publicada só mudou porque o arquivo do cartão cresceu); qualquer outro arquivo fora do cartão ficaria como comentário.
- Sem migration, sem Edge Function, sem dependência nova.
