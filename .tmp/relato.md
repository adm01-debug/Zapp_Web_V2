Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/hooks/voice/__tests__/retry.test.ts` (novo): 28 testes das funções REAIS de `src/hooks/voice/retry.ts` — o que PODE ser repetido (network/timeout/aborted/fetch/429/5xx) × o que nunca deve (permissão negada, 401, payload inválido, valor que não é Error), o teto de tentativas (maxRetries+1), o backoff exponencial medido em relógio falso (100ms e depois 200ms, não intervalo fixo) e as 6 mensagens amigáveis + o texto de fallback.
- `src/hooks/realtime/__tests__/realtimeUtils.conversas.test.ts` (novo): 11 testes de `dedupeContacts` (colisão de id mantém a ÚLTIMA versão e a ordem da 1ª aparição), `chunkArray` (blocos de 200 sem perder item/ordem), `buildConversation` (ordem por created_at, não lidas só de `sender==='contact' && !is_read`, agregado por contato cobrindo a amostra global vazia — R2-INB-005 — sem sobrescrever quem está na amostra) e `buildConversations` (agrupa por contato, deduplica, ignora mensagem sem contact_id, ordena pela última mensagem).
- `src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx` (novo): 6 testes do hook REAL — N eventos rápidos viram 1 único commit, o último evento do mesmo id vence, contato fora da lista delega a `hydrateConversationForMessage` sem commit, evento sem contact_id é descartado, o normalizador real é aplicado (`poll` cru vira `unsupported`) e mensagem inexistente na conversa devolve o MESMO array (sem re-render).
- `src/services/__tests__/realtime.service.mark-as-read.test.ts` (novo): 2 testes de `RealtimeService.markMessagesAsRead` — o UPDATE vai para `messages` com `{is_read:true}` e os TRÊS filtros (`contact_id`, `sender='contact'`, `is_read=false`), e o erro do banco é registrado no log e propagado (não vira sucesso silencioso).

Nenhum arquivo de produção foi alterado (ver o diff: só testes novos).

## Prova
- vermelho antes (mutação de produção, cada arquivo de teste falha pela razão certa):
  `npx vitest run <4 arquivos>` com `isRetryableError` fora da condição do retry + `dedupeContacts` sem Map + `setTimeout` do batcher trocado por flush imediato + `.eq('is_read', false)` removido →
  `Test Files 4 failed (4) | Tests 6 failed | 41 passed (47)`
- vermelho antes da regra do agregado (R2-INB-005): `semAmostra` forçado a `false` em `realtimeUtils.buildConversation` →
  `Test Files 1 failed (1) | Tests 2 failed | 9 passed (11)`
- verde depois (3 rodadas seguidas, produção restaurada):
  `npx vitest run src/hooks/voice/__tests__/retry.test.ts src/hooks/realtime/__tests__/realtimeUtils.conversas.test.ts src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx src/services/__tests__/realtime.service.mark-as-read.test.ts` →
  rodada 1: `Test Files 4 passed (4) | Tests 47 passed (47)`; rodada 2: `4 passed | 47 passed`; rodada 3: `4 passed | 47 passed`
- `git diff --stat` antes do commit: vazio nos arquivos de produção (git status só com os 4 arquivos `??` novos).

## O que NÃO fiz e por quê
- RLS de `reactions`, templates globais e `storage` por fila (`scripts/db-tests/*.sql`): não é minha área — prova de banco é do worker (sql). Deixei `kanban_comment` no cartão.
- E2E de voz (vídeo SIP, retomada de áudio): não escrevi E2E novo. A prova de E2E desta máquina depende de boot de Chromium sob carga alta e o cartão não fixa uma falha concreta de produto a reproduzir; teste E2E sem defeito alvo é o que o revisor recusa. Os itens de unidade dos mesmos módulos foram cobertos onde é determinístico.
- `useAgentPresence` com `pagehide`/aba oculta: a produção NÃO tem esse listener (grep em `src/hooks/crm/useAgentPresence.ts`), então o teste só passaria fingindo o comportamento. O que existe (heartbeat/leave) já está coberto em `useAgentPresence.test.ts`. Registrar em `kanban_comment` como lacuna de produto (worker hooks), não de teste.
- Itens já cobertos por testes existentes e por isso não reescritos: `normalizeMessage`/`classifyMessageType` (`messageTypeClassification.test.ts`) e `useBatchReactions` (`useBatchReactions.uma-consulta.test.tsx`).
