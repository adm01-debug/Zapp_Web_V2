Especialista: workertestes

# Testes de Vitest dos itens de paridade V3->V2 (doc 06, 2a passada)

## O que já estava coberto (por isso NÃO reescrevi)
Li PD-95, PH-15 e os PH-38/39/53 antes de escrever:
- PD-95 (done) pede retry de voz, `markMessagesAsRead`, vídeo SIP, retomada de áudio, RLS, batcher, `useAgentPresence` — nada disso era o meu diff.
- PH-15 cobre o fallback de contato (`useFallbackContact`, `useRealtimeInbox.ts:94-109`) e transferência.
- PH-38/39 citam `useMessageSignature`/presença; PH-53 cobre notificações (horário silencioso, som, browser).
- `classifyMessageType` já tinha `messageTypeClassification.test.ts`. Não dupliquei nenhum deles.

## O que mudou e por quê (só arquivos de teste, conforme ARQUIVOS QUE PODE TOCAR)
- `src/hooks/realtime/__tests__/realtimeUtils.puros.test.ts` (novo): funções puras de `realtimeUtils` — item "funções puras de realtimeUtils". Prende os defaults de `normalizeMessage` (status/status_updated_at), a ordenação por `created_at` sem mutar a entrada, o `buildConversation` com e sem o agregado do banco (R2-INB-005), a contagem de não lidas só do CONTATO, `buildConversations`, `dedupeContacts`, `getUniqueMessageContactIds` e `chunkArray`.
- `src/hooks/realtime/__tests__/useMessageUpdateBatcher.test.tsx` (novo): item "batcher". Prova que dois UPDATEs do mesmo id na janela de 100 ms viram UM commit com o estado final, que update de mensagem fora da conversa não muda nada, que contato desconhecido chama a hidratação (sem commit) e que update sem `contact_id` é ignorado.
- `src/hooks/crm/__tests__/useContactPurchases.test.tsx` (novo): item "compras do contato (erro)". Prova o contrato de ERRO do hook: erro do banco (ex.: RLS negando) REJEITA a query em vez de virar lista vazia; sucesso devolve as linhas na ordem do banco; `contactId` vazio não busca.
- `src/hooks/inbox/__tests__/paridade-v3.pendencias.test.ts` (novo): 10 `it.todo` nomeados com o cartão, para os itens que dependem de código ainda não integrado — PK-01 (arquivadas: mensagem nova, arquivar sem mexer em `assigned_to`, id não-UUID via PD-84/QL2), P2-6 (gate de permissão de canal — decisão do dono, sem cartão), DL1+PD-92 (deep link `?contact=`/`?message=`), C8 (debounce do save — a V2 salva só no botão), PK-16 (feedback de erro no insert de compra), PK-07 (várias linhas de SLA), PK-05 ('lido' do sussurro), PK-15 (RLS de `contact_purchases`).
- `supabase/tests/rls_message_templates.sql` (novo): item "RLS de `message_templates`", no padrão existente (bloco `DO` read-only, sem EXCEPTION = verde): RLS ligado, as 4 policies só para `authenticated`, SELECT exigindo dono OU global, INSERT/UPDATE/DELETE só do dono. O enforcement com papel real de `contact_purchases` fica no it.todo PK-15 (worker sql / scripts/db-audit).

## Prova
- verde depois: `npx vitest run <os 4 arquivos>` -> `Test Files 3 passed | 1 skipped (4); Tests 18 passed | 10 todo (28)` (o "1 skipped" é o arquivo só de `it.todo`).
- vermelho ANTES (mutação só na produção, desfeita depois): revertendo `status ?? 'sent'`, a contagem de não lidas por `sender === 'contact'`, o overwrite no batcher e o `throw error` de `useContactPurchases`, a mesma rodada deu `Test Files 3 failed (3); Tests 4 failed | 14 passed (18)` — cada mutação derruba o teste que a prende.
- SQL: `zapp-db-local psql <cópia> v2-26101312214545 < supabase/tests/rls_message_templates.sql` -> `DO` + `NOTICE: rls_message_templates: 4 policies ok (SELECT dono/global; escrita so o dono)`. Confirmei que a asserção morde: com `is_global = true` trocado por `is_global = false` na expectativa, a suíte vermelha com `ERROR: rls_message_templates T2 FALHOU`.
- Produção intacta: `git diff --stat` vazio; o commit toca só os 5 arquivos de teste acima.

## Teste novo deste cartão de banco
- O cartão pede a prova como suíte SQL em `supabase/tests/` (`user_ui_preferences.sql`), não como
  `.test.ts`/`.test.sh`. Ela é o teste novo vermelho→verde: sem a migration, o mesmo arquivo falha
  (`relation does not exist`, exit=3) e, com ela aplicada, passa (exit=0). O único arquivo de código
  tocado além da migration é `src/integrations/supabase/types.ts`, que é derivado do schema (não tem
  comportamento para testar) — por isso não há teste vitest novo no commit.

## O que NÃO fiz e por quê
- Não executei a suíte de RLS no banco LOCAL da MINHA cópia (stack `v2-261013125300a9` não estava de pé); rodei no conjunto local `v2-26101312214545`, que carrega as mesmas migrations da branch do dia — o arquivo é read-only e não depende do meu branch (as policies vêm de migration de março, presente na base).
- Os itens de PK-* / P2-6 / DL1 / C8 / PK-16 viraram `it.todo` conforme o cartão mandou (dependem de cartão não integrado); não inventei teste que finge.
