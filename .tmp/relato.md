Especialista: worker (design)

## O que mudou e por quê
- src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts: acrescentei `useReducedMotion: () => false` ao mock parcial de `framer-motion` (com 2 linhas de comentário dizendo o motivo). A entrega de t_101698ac (399d3fc59) passou a chamar `useReducedMotion()` dentro do `VoiceChangerPicker`, que ESTE teste renderiza de verdade (mesma fiação ChatPanel → ChatInputArea → ChatInputToolbars → VoiceChangerPicker); o mock parcial não expunha esse export, então o render do picker quebrava com `No "useReducedMotion" export is defined on the "framer-motion" mock` antes de qualquer asserção rodar. Nenhuma asserção do teste foi tocada.

## Pontos do [refazer] (o "O QUE FAZER" do cartão)
Ponto 1: parto do commit da entrega por cherry-pick, não recomeço. Cherry-pick de `5f3bc6650`, `d9274addc` e `360b90562` (os 3 commits de código da branch da entrega) sobre a ponta atual do workspace (BASE=dia/2026-10-13, que inclui a dia/2026-10-12 do cartão); `399d3fc59` é só o relato (.tmp). Conflito em `.tmp/relato.md` resolvido com `git checkout --theirs`. Arquivo que prova: `.git` — `git log --oneline` mostra os 3 commits empilhados sobre a base.
Ponto 2: reproduzo e corrijo a causa sem afrouxar asserção. Vermelho antes em `bun run test src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` → `Test Files 1 failed; Tests 2 failed | 4 passed (6)`, erro `No "useReducedMotion" export is defined on the "framer-motion" mock` em VoiceChangerPicker.tsx:65. Corrigi o mock parcial do teste (único arquivo alterado, src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts); verde depois → `Test Files 1 passed; Tests 6 passed (6)`. Prova de que nada foi afrouxado (mutação no teste que prova): movi `setOpen(false); cleanup();` para antes do `await onSendAudio` em VoiceChangerPicker.tsx e a asserção real falhou (`expect(estado.popoverAberto).toBe(true)` → `received false`); restaurei com `git checkout --` e voltou a verde.
Ponto 3: provo o comando verde, o zapp-verify --rapido verde e o sha. `bun run test src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` → `Test Files 1 passed; Tests 6 passed (6)`. `zapp-verify . --rapido` → `VERIFY: VERDE` (OK db_guard, OK tipos, OK lint, OK migrations). SHA do commit da correção: `448d03444` (empilhado sobre a entrega `399d3fc59`).

## Arquivos do diff da branch (conferência mecânica do fechar)
- src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts — ÚNICA alteração MIA: o mock parcial do framer-motion desta suíte ganha `useReducedMotion: () => false`.
- src/components/inbox/VoiceChanger.tsx, src/components/inbox/VoiceChangerPicker.tsx, src/components/inbox/__tests__/VoiceChanger.falhas.test.tsx, src/components/inbox/__tests__/VoiceChanger.reduced-motion.test.tsx, src/components/inbox/__tests__/VoiceChangerPicker.falhas.test.tsx, src/components/inbox/__tests__/VoiceChangerPicker.reduced-motion.test.tsx — herdados INTEIROS do cherry-pick da entrega (t_101698ac / 399d3fc59), sem alteração minha; são o código sob teste deste cartão.
- src/components/inbox/__tests__/VoiceChangerPicker.preview-send.test.tsx — herdado do cherry-pick; a entrega já tinha posto `useReducedMotion: () => false` no mock daquele arquivo (o ajuste que ela deixou faltar no arquivo do áudio meme).
- .tmp/relato.md — este relato; a entrega também versionava o .tmp (conflito resolvido com `git checkout --theirs`).

## Prova (o fechar completa com os FATOS MEDIDOS)
- vermelho antes da correção: `bun run test src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` → 6 tests | 2 failed, com `Error: [vitest] No "useReducedMotion" export is defined on the "framer-motion" mock` em VoiceChangerPicker.tsx:65 (`const reduceMotion = useReducedMotion() ?? false;`).
- verde depois: o mesmo comando → 6 passed (6).
- `zapp-verify . --rapido` → VERDE (db_guard, tipos, lint, migrations).

## Por que a correção é no teste e não no código de produção
- `useReducedMotion` é export real do `framer-motion`; o componente está certo em consumi-lo (é o padrão do projeto — ver Collapse, SendErrorBanner, ConversationDeliverySummary e os próprios testes da entrega). O que ficou desalinhado foi o mock PARCIAL do framer-motion neste teste antigo, que enumerava só `motion.div` e `AnimatePresence`. A entrega atualizou o mock do preview-send mas não o deste arquivo; completei o mock que faltava.

## O que NÃO fiz e por quê
- Não alterei o código de produção (VoiceChanger.tsx / VoiceChangerPicker.tsx) nem qualquer asserção: o defeito do empilhamento era só o mock parcial do teste.
- Não mexi nos outros testes do inbox; a suíte inteira em src/components/inbox/__tests__/ passa (o único ruído é um erro não-tratado de WebSocket em RealtimeInboxView.selectedMessagesError.test.tsx, do ambiente jsdom, alheio a este cartão e preexistente).
