Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/inbox/useContactQuickActions.ts`: `markVip` agora grava `contacts.is_vip` pela RPC `set_contact_vip` e `block`/desfazer grava `contacts.blocked_at` pela RPC `set_contact_blocked`; o estado de VIP/bloqueio saiu de `contacts.tags` e o hook deixou de ler/escrever `tags` (não expõe mais `tags`/`addTag`/`removeTag`). Todas as guardas e o desfazer/rollback continuam: idempotência (já VIP / já bloqueado não escreve nem oferece Desfazer), trava de dois cliques concorrentes no bloqueio, rollback do bloqueio real na Evolution quando a RPC falha e Desfazer que executa a reversão real.
- `src/types/chat.ts`: `ConversationContact` ganhou `is_vip?` e `blocked_at?` (campos próprios que substituíram a etiqueta; são o que o hook lê para a idempotência).
- `src/components/inbox/ContactDetails.tsx`: removi a seção "Tags" (componente `ContactTagsSection` e o seu props) e parei de passar `tags` ao cabeçalho — eram os únicos consumidores dos membros removidos do hook; sem isso o painel não compila.
- `src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` e `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx`: as expectativas que provavam a escrita em `contacts.tags` foram trocadas pelas que provam as RPCs (e a ausência de escrita em `contacts`).

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useContactQuickActions.test.tsx` (com o hook da base) → `Tests 12 failed (12)`
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useContactQuickActions.test.tsx src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` → `Test Files 2 passed (2); Tests 19 passed (19)`
- regressão da área: `npx vitest run src/components/inbox/__tests__ src/hooks/inbox` → `Test Files 95 passed (95); Tests 598 passed | 1 expected fail (599)` (um `Uncaught Exception` de WebSocket do undici em `RealtimeInboxView.selectedMessagesError.test.tsx`, ruído pré-existente fora do meu diff)

## Integração (faixa dos pais)
- Os dois cartões pais (VIP t_84b84230, bloqueio t_3d2d385e) não estavam em `dia/2026-10-13`; trouxe a faixa de cada um pelo JSON da fila com `git cherry-pick -x` (merge-base `177db83c88`), resolvendo um conflito em `src/integrations/supabase/types.ts` (mantidas as duas RPCs, `set_contact_vip` e `set_contact_blocked`). Os commits cherry-picked aparecem no diff da branch com `(cherry picked from ...)`, como manda a regra.

## O que NÃO fiz e por quê
- Os arquivos de componente (`ContactDetails.tsx` e o seu teste) não estão na lista do cartão, mas são os únicos consumidores dos membros que o cartão manda remover; sem essa edição o painel não compila. Fica registrado como a única saída de `src/hooks`/`src/types`.
- O título "Marcar VIP" do menu continua roteando para o hook (`case 'vip'`), agora pela RPC — era o resquício que o portão do TG-G apontou em `src/`. A remoção da seção "Tags" do cabeçalho compacto (`ContactHeaderSection`) e das etiquetas em contatos/Talk X é dos cartões TG-A/TG-B/TG-D, fora da minha área.
- Não toquei em `supabase/**` (migrations/RPCs já vieram prontas na faixa dos pais).

Concluí.
