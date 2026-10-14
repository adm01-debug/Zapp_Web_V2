Especialista: hugo

## O que mudou e por quê
- src/hooks/chat/useQuickReplies.ts: `searchTemplates` passa a comparar com `normalizeText` (NFD, mesma regra do `normalizeText` de `src/hooks/chat/useChatSearch.ts`) em título, conteúdo, atalho, categoria e no desempate por título — 'saudacao' agora acha 'Saudação' (critério 1).
- src/hooks/chat/useQuickReplies.ts: os favoritos saem da chave única do navegador (`quick-reply-favorites`) para `zapp.quickreplies.favorites:<userId>` (convenção `zapp.<area>:<userId>`, a mesma de `useTeamChatDraft`). A lista guardada carrega o seu dono (`key`): se a conta troca no mesmo navegador, a lista é relida do storage do novo dono em vez de vazar a do anterior — teste com dois usuários. `purgeLegacyFavorites` apaga a chave antiga no mount (a lista sem escopo deixa de existir: não há como saber de quem era).
- src/hooks/chat/useQuickReplies.ts e src/hooks/chat/useMessageTemplates.ts: `incrementUseCount` chama a RPC `increment_quick_reply_use` (PH-10) com `{ p_id }` e invalida `['quick-replies']`; erro da RPC vira aviso (`toast.error` / `toast` destrutivo) em vez de falha silenciosa. Assim o uso da resposta GLOBAL de outro usuário é contado pelo servidor (teste com `is_global = true` de outro dono).
- src/hooks/chat/useMessageTemplates.ts: guarda de montagem (`isMountedRef`) — `fetchTemplates` não vai à rede nem grava estado depois do unmount; `addTemplate`/`updateTemplate`/`deleteTemplate` invalidam `['quick-replies']`.

## Prova
- vermelho antes: `npx vitest run src/hooks/chat/__tests__/useQuickReplies.test.tsx src/hooks/chat/__tests__/useMessageTemplates.test.tsx` com os dois hooks na versão da base → `Test Files 2 failed (2); Tests 12 failed | 2 passed (14)`
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 14 passed (14)`
- consumidor do mesmo botão: `npx vitest run src/components/inbox/__tests__/QuickRepliesManager.r2-inb-063.test.tsx` → `Test Files 3 passed (3); Tests 18 passed (18)`
- regressão da área: `npx vitest run src/components/inbox/__tests__/QuickRepliesManager.r2-inb-063.test.tsx src/components/inbox/__tests__/MessageTemplates.a11y-buttons.test.tsx src/hooks/chat` → `Test Files 40 passed | 1 skipped (41); Tests 364 passed | 2 expected fail | 11 todo (377)`

## zapp-verify . --rapido (critério 2)
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto`, `VERIFY: VERDE SEM BANCO` (308s).
- Na 1ª corrida o passo `tipos` morreu por OOM (`tsc saiu 137`, máquina com load ~47 — mesma falha de ambiente que o cartão pai relatou). A corrida seguinte apontou os erros reais e eu os corrigi no commit do hook: a RPC nova ainda não está no `types.ts` gerado, então uso o cast no padrão da casa `(supabase as any).rpc(...)` com `eslint-disable-line` e comentário (igual a `src/components/dashboard/useSentimentData.ts`); e os mocks de `rpc` nos testes ganharam assinatura tipada.

## Pontos do juiz
1. Arquivos fora de "ARQUIVOS QUE PODE TOCAR" (`supabase/migrations/20261013235906_quick_replies_uso_e_global.sql`, `supabase/tests/quick_replies_uso_e_global.sql`): PROCEDE, e eu REVERTI como o juiz pede. Eu havia trazido a FAIXA DO PAI (commit e373f39399, cherry-pick -x de fff2173035, do cartão t_32034c99) só para rodar a suíte localmente, porque a RPC `increment_quick_reply_use` que o hook passa a chamar nasce naquela migration. Os dois `.sql` saíram do diff deste cartão no commit deste fechamento (`git rm`, com o pai ainda dono deles no cartão t_32034c99). O hook chama a RPC PELO NOME (`increment_quick_reply_use`) e os testes deste cartão mockam a chamada, então nada deste cartão depende de o arquivo estar aqui; quem junta as duas pontas é o integrador (a faixa do pai está pronta na fila). Diff deste cartão: `src/hooks/chat/useQuickReplies.ts`, `src/hooks/chat/useMessageTemplates.ts`, os dois testes novos em `src/hooks/chat/__tests__/` e este relato.
2. Gatilho de `updated_at` no UPDATE de `message_templates`: NÃO PROCEDE para este cartão e não é corrigido aqui. A migration é do pai e já trata o efeito: o gatilho `zz_message_templates_preserve_updated_at` (BEFORE UPDATE, roda depois do carimbo pela ordem alfabética) restaura `old.updated_at` quando só `use_count` muda, e o pai provou linha antes/depois no teste de banco (`PASS [B11 contar uso preserva updated_at (antes = depois)] -> igual`; `PASS [B11b editar de verdade carimba updated_at (antes <> depois)] -> diferente`). Este cartão não mexe em migration, RLS nem gatilho; o diff do meu lado é só o hook e o teste do hook.

## O que NÃO fiz e por quê
- Não mexi na migration, na RLS nem rodei `hermes-db-migrar`: a RPC e o teste de banco são do cartão pai; a faixa do pai que eu havia trazido para a suíte local foi DEVOLVIDA (o juiz pediu) e segue no cartão t_32034c99 — este cartão é o hook que passa a chamá-la pelo nome.
- `useMessageTemplates.fetchTemplates` continua com `select('*')`: escolher colunas não é deste cartão.
