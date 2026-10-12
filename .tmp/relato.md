Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Nada. O defeito do cartão (geração de TTS duplicada ao desmontar o chat) JÁ está corrigido no código atual da base do dia (dia/2026-10-12) e já vem acompanhado dos dois testes do pedido. O cartão manda, nesse caso, fechar sem commit de código.

Prova de que já está na base (não é só "passa no meu workspace"):
- git merge-base --is-ancestor e13ee43c3 HEAD → ANCESTRAL. O commit `e13ee43c3 fix(tts): cancela fala do chat ao desmontar` (Wed Oct 7 23:24:52 2026 -0300) já está integrado à base do dia; ele toca exatamente os 4 arquivos do pedido — src/components/inbox/TextToSpeechButton.tsx, src/hooks/communication/useTextToSpeech.ts e os dois testes.
- O commit original 6a0840dae NÃO é ancestral, mas o conteúdo dele está presente: `git diff --stat 6a0840dae HEAD -- src/components/inbox/TextToSpeechButton.tsx` → vazio (idêntico), e o restante é a versão já evoluída na base.

Onde está o fix no código atual:
- src/hooks/communication/useTextToSpeech.ts:37-39 — refs de geração: `requestIdRef` (R2-INB-040), `abortRef` (AbortController) e `mountedRef`.
- src/hooks/communication/useTextToSpeech.ts:90-96 — `invalidatePending()` incrementa a geração e aborta o fetch em voo.
- src/hooks/communication/useTextToSpeech.ts:109-116 — effect de unmount: `mountedRef.current=false`, `invalidatePending()` e `releasePlayback()`; nenhuma resposta atrasada cria/toca Audio depois.
- src/hooks/communication/useTextToSpeech.ts:191 — `if (requestIdRef.current !== requestId || !mountedRef.current) return;` descarta a resposta obsoleta.
- src/hooks/communication/useTextToSpeech.ts:205-211 — `releaseOwnPlayback` só solta o player se ainda for a geração vigente.

## Prova
- verde agora: `npx vitest run src/hooks/__tests__/useTextToSpeech.lifecycle.test.ts src/components/inbox/__tests__/TextToSpeechButton.cancel.test.tsx` → `Test Files 2 passed (2); Tests 9 passed (9)` (0 falhas, 0 pulados), 2.70s.
- Vermelho-antes: não aplicável aqui — não há mudança minha para reverter. O verde é da base, provado acima ser a base do dia (e13ee43c3 ancestral de HEAD), e o `git diff --stat` do meu workspace é vazio.

## O que NÃO fiz e por quê
- Não commitei código: o cartão manda fechar sem commit quando o pedido já está resolvido, e não há diff meu (evitaria duplicar o fix).
- Não toquei em arquivos fora dos citados no cartão.

## Diff
`git status --short` → vazio (nenhuma alteração de código neste workspace).
