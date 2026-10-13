Especialista: workertestes

CONCLUÍ. Três arquivos de teste NOVOS, nenhum byte de código de produção meu (o diff de produção é só este relato). Testes verdes e estáveis em 3 rodadas seguidas; a verificação `zapp-verify . --rapido` é rodada pelo próprio `hermes-tarefa-fechar` (o bloco FATOS MEDIDOS PELO FECHAR traz o resultado dela e o `git diff --stat`).

## O que mudou e por quê
- `src/hooks/voice/__tests__/retry.test.ts` (28 casos, o "hooks/voice/retry.ts" que o cartão lista): funções REAIS de `src/hooks/voice/retry.ts` — o que PODE ser repetido (network/timeout/aborted/fetch/429/5xx) × o que nunca deve (permissão negada, 401, payload inválido, valor que não é Error), teto de tentativas (maxRetries+1, propaga o ÚLTIMO erro), backoff exponencial medido em relógio falso (100ms e depois 200ms) e as mensagens amigáveis + fallback.
- `src/hooks/realtime/__tests__/realtimeUtils.conversas.test.ts` (11 casos, o "hooks/realtime/realtimeUtils.ts" do cartão): `dedupeContacts` (colisão de id mantém a ÚLTIMA versão e a ordem da 1ª aparição), `chunkArray`, `buildConversation` (ordem por created_at; não lidas só de `sender==='contact' && !is_read`; agregado POR CONTATO cobrindo a amostra global vazia — R2-INB-005) e `buildConversations` (agrupa, deduplica, ignora mensagem sem contact_id, ordena pela última mensagem).
- `src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx` (6 casos, o "batcher no realtime" do cartão): hook REAL — N eventos rápidos viram 1 commit, o último do mesmo id vence, contato fora da lista delega a `hydrateConversationForMessage` sem commit, evento sem contact_id é descartado, o normalizador real é aplicado (`poll` cru vira `unsupported`) e mensagem inexistente devolve o MESMO array.

## Prova
- vermelho antes (mutação nos 3 alvos: `isRetryableError` fora da condição do retry; `dedupeContacts` sem Map; `setTimeout` do batcher trocado por flush imediato):
  `npx vitest run src/hooks/voice/__tests__/retry.test.ts src/hooks/realtime/__tests__/realtimeUtils.conversas.test.ts src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx` → `Test Files 3 failed (3)` | `Tests 5 failed | 40 passed (45)`
- vermelho antes da regra R2-INB-005 (`semAmostra` forçado a `false` em `realtimeUtils.buildConversation`) → `Test Files 1 failed (1)` | `Tests 2 failed | 9 passed (11)`
- verde depois (produção restaurada, 3 rodadas): mesmo comando → `Test Files 3 passed (3)` | `Tests 45 passed (45)` na 1ª, na 2ª e na 3ª rodada.

## Aviso do juiz sobre ARQUIVOS QUE PODE TOCAR — não procede
O cartão permite `src/hooks/**/__tests__/ (novos)`; os três caminhos entregues são exatamente `src/hooks/voice/__tests__/retry.test.ts`, `src/hooks/realtime/__tests__/realtimeUtils.conversas.test.ts` e `src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx`. O 4º arquivo que aparecia no aviso (`src/services/__tests__/realtime.service.mark-as-read.test.ts`) foi REMOVIDO no commit `chore(inbox): retira teste de services fora dos arquivos permitidos do cartao`.

## Itens do cartão que não executei (motivo, registrado também em kanban_comment)
- `markMessagesAsRead` (`src/services/realtime.service.ts`): fora do allowlist (`src/hooks/**/__tests__/`); worker (hooks) faz num cartão que permita `src/services/**/__tests__/`.
- RLS `scripts/db-tests/*.sql` (reação, templates globais, storage por fila): prova de banco é do worker (sql); não escrevo SQL com papel real.
- `useAgentPresence` pagehide/aba oculta: a produção não tem esse listener (conferido em `src/hooks/crm/useAgentPresence.ts`); teste verde ali só passaria fingindo o comportamento — lacuna de produto (worker hooks).
- E2E de voz (vídeo SIP, retomada de áudio): o cartão não fixa falha reproduzível; sem defeito alvo o E2E seria falso positivo.
- Já cobertos por testes existentes, não reescritos: `normalizeMessage`/`classifyMessageType` (`messageTypeClassification.test.ts`) e `useBatchReactions` (`useBatchReactions.uma-consulta.test.tsx`).
- Faixa do pai `9a5ed42b1` (migration/RLS de `message_reactions`): não trazida — não é base destes testes e seus arquivos estão fora do allowlist.
