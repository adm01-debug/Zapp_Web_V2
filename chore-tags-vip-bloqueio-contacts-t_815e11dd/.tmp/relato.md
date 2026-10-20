Especialista: semisenior (hugo)

## O que mudou e por quê
- `src/hooks/inbox/useContactQuickActions.ts`: VIP via coluna própria `contacts.is_vip` (RPC `set_contact_vip`) e bloqueio via bloqueio real na Evolution + coluna `contacts.blocked_at` (RPC `set_contact_blocked`, com reversão na Evolution se a RPC falhar). Nenhuma escrita direta em `contacts` restante no hook (era o defeito do pedido). Retorno `{ isVip, blockedAt, markVip, block }` — sem `tags`/`addTag`/`removeTag`.
- `src/types/chat.ts`: `ConversationContact` ganha `is_vip` e `blocked_at` (+4 linhas), os campos que o hook lê.
- `src/hooks/inbox/__tests__/useContactQuickActions.test.tsx`: 12 testes do comportamento novo (VIP idempotente + Desfazer, bloqueio Evolution+RPC, reversão em falha de RPC, sem conexão = zero escrita, API sem tags).
- `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx`: painel real — Bloquear chama Evolution + RPC e nunca `contacts.update`; falha de RPC reverte na Evolution; Desfazer do bloqueio chama `set_contact_blocked(p_blocked:false)`; Arquivar e ausência de Tags/"Marcar VIP" preservados.

## Prova
- vermelho antes (hook antigo, testes novos): `npx vitest run src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` → `Test Files 1 failed (1); Tests 12 failed (12)`
- vermelho antes (hook antigo, painel novo): `npx vitest run src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` → `Test Files 1 failed (1); Tests 3 failed | 3 passed (6)`
- verde depois: `npx vitest run src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` → `Test Files 2 passed (2); Tests 18 passed (18)`
- `npx tsc -b --force` → saída vazia, exit 0
- `npx eslint` nos 3 arquivos de código/teste do hook e painel → limpo; `src/types/chat.ts` tem 1 erro pré-existente (`lastMessage?: any`, já no dia, fora do meu hunk)

## Pontos do revisor
- Ponto 1 (diff de 103.890 chars com arquivos dos pais): RESOLVIDO. O diff agora tem exatamente 4 arquivos (hook + chat.ts + 2 testes), 24.900 chars. Nenhuma migration, nenhum `supabase/tests`, nenhum types gerado, nenhum adapter, nenhum `.tmp/relato.md` no diff. Fiz diferente da receita: em vez de cherry-pick do commit (que nasceu de base antiga), reconstruí as 4 mudanças sobre a ponta atual da branch do dia.
- Ponto 2 (sem ContactDetails): RESOLVIDO. `src/components/inbox/ContactDetails.tsx` não está no diff; o único chamador do hook no dia usa só `.block()`, assinatura preservada.
- Ponto 3 (tags/addTag/removeTag só saem se a ContactDetails parar de chamar): RESOLVIDO — na ponta do dia a ContactDetails já não chama `tags`/`addTag`/`removeTag` nem tem ação "Marcar VIP" (saíram em cartão anterior do dia), então o hook novo sem tags compila e o painel segue verde.
- Desvio que fiz diferente da recusa e por quê: (a) o teste do painel do trabalho anterior clicava em "Marcar VIP", item que NÃO existe na UI do dia — adaptei o teste à UI real do dia (Bloquear/Arquivar/ausência de Tags-VIP) em vez de trazer UI de base antiga; (b) `supabase.rpc('set_contact_vip'/'set_contact_blocked')` não tipa contra o types gerado do dia (pais TG-k/g não integrados) — chamo as RPCs por um helper `callContatoRpc` com cast local e comentário, no mesmo idioma já usado em `src/hooks/analytics/useAIUsageDashboard.ts` ("o cast some quando a regeneração rodar"); os nomes/args conferem byte a byte com as migrations dos pais (`set_contact_vip(p_contact_id, p_is_vip)`, `set_contact_blocked(p_contact_id, p_blocked)`).

## O que NÃO fiz e por quê
- Não trouxe migrations, `supabase/tests/*.sql`, `src/integrations/supabase/types.ts`, `src/adapters/evolutionAdapter.ts` nem `.sh` dos pais: são de outros cartões (a recusa mandou tirar).
- Não reintroduzi ação "Marcar VIP" no painel: UI é de outro cartão; o hook expõe `markVip` para quando o chamador existir.
- Não rodei `hermes-tarefa-fechar`/`iniciar`: `MODO_V2` ausente + `CONGELADO` presente bloqueiam ambos para agentes (exit 75); sem `git worktree/clone/init` permitidos na sessão, trabalhei em cópia de arquivos espelhada na ponta de `dia/2026-10-14` (705 arquivos sincronizados via `git show`, só-leitura) e entrego o patch pronto para o integrador aplicar com `patch -p1`.

## Arquivos do diff (4, contra `dia/2026-10-14`)
- src/hooks/inbox/useContactQuickActions.ts
- src/types/chat.ts
- src/hooks/inbox/__tests__/useContactQuickActions.test.tsx
- src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx
