Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useQuickReplies.ts: `searchTemplates` passa a comparar com `normalizeText` (NFD, mesma regra do `normalizeText` de `src/hooks/chat/useChatSearch.ts`) em título, conteúdo, atalho, categoria e no desempate por título — 'saudacao' agora acha 'Saudação'.
- src/hooks/chat/useQuickReplies.ts: os favoritos saem da chave única do navegador (`quick-reply-favorites`) para `zapp.quickreplies.favorites:<userId>` (convenção `zapp.<area>:<userId>`, a mesma de `useTeamChatDraft`). A lista guardada carrega o seu dono (`key`): se a conta troca no mesmo navegador, a lista é relida do storage do novo dono em vez de vazar a do anterior. `purgeLegacyFavorites` apaga a chave antiga no mount — a lista sem escopo deixa de existir (não há como saber de quem era).
- src/hooks/chat/useQuickReplies.ts e src/hooks/chat/useMessageTemplates.ts: `incrementUseCount` chama a RPC `increment_quick_reply_use` (PH-10) com `{ p_id }` e invalida `['quick-replies']`; erro da RPC vira aviso (`toast.error` / `toast` destrutivo) em vez de falha silenciosa. Assim a resposta GLOBAL de outro dono é contada pelo servidor.
- src/hooks/chat/useMessageTemplates.ts: guarda de montagem (`isMountedRef`) — `fetchTemplates` não vai à rede nem grava estado depois do unmount; `addTemplate`/`updateTemplate`/`deleteTemplate` invalidam `['quick-replies']`.

## Prova
- vermelho antes: `npx vitest run src/hooks/chat/__tests__/useQuickReplies.test.tsx src/hooks/chat/__tests__/useMessageTemplates.test.tsx` com os dois hooks na versão da base → `Test Files 2 failed (2); Tests 12 failed | 2 passed (14)`
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 14 passed (14)`
- consumidor do mesmo botão: `npx vitest run src/components/inbox/__tests__/QuickRepliesManager.r2-inb-063.test.tsx` → `Test Files 3 passed (3); Tests 18 passed (18)`
- regressão da área: `npx vitest run src/components/inbox/__tests__/QuickRepliesManager.r2-inb-063.test.tsx src/components/inbox/__tests__/MessageTemplates.a11y-buttons.test.tsx src/hooks/chat` → `Test Files 40 passed | 1 skipped (41); Tests 364 passed | 2 expected fail | 11 todo (377)`

## Cartão pai
FAIXA DO PAI: commit e373f39399 (cherry-pick -x de fff2173035) do cartão t_32034c99 — a migration `supabase/migrations/20261013235906_quick_replies_uso_e_global.sql` e o teste `supabase/tests/quick_replies_uso_e_global.sql` são do cartão pai, não são deste cartão.

## O que NÃO fiz e por quê
- Não mexi na migration, na RLS nem rodei `hermes-db-migrar`: a RPC e o teste de banco são do cartão pai; este cartão é o hook que passa a chamá-la.
- `useMessageTemplates.fetchTemplates` continua com `select('*')`: escolher colunas não é deste cartão.
