Especialista: workertestes

## O que mudou e por quê
- `src/components/email/__tests__/EmailChatInbox.reconectarBusca.integracao.test.tsx` (novo, único arquivo que eu criei): teste de costura de tela — monta o `EmailChatInbox` REAL com o `useGmail` REAL e dubla só a rede (`supabase` + `callGmailFunction`). Prova as correntes inteiras que o cartão pede e que nenhum teste dos pais cobria.
  Na prática ele fecha o vão entre duas famílias de testes que existem na faixa: `EmailChatInbox.reconectar.test.tsx` e `EmailChatInbox.buscaEstados.test.tsx` dublam `useGmail` (testam só a casca), enquanto `useGmail.syncStatus.test.tsx` e `useGmail.threadListQuery.test.tsx` exercitam o hook real sem a tela. Nenhum prova a costura `sync_status real -> hook real -> faixa -> botão` nem `busca -> RPC real -> OR -> tela`.

## O que o teste prova (4 casos)
1. conta ativa com `sync_status='reauth_required'` acende a faixa (`role=alert`, texto "Sua conta Gmail precisa ser reconectada") e o "Reconectar" abre a autorização da MESMA conta ativa (`gmail-oauth get-auth-url`). A faixa é conferida amarrada à conta que o cabeçalho mostra como ativa (`admin@example.com`).
2. a faixa é da conta ATIVA: com a conta ativa saudável e OUTRA conta em `reauth_required`, o aviso NÃO acende (distingue "a mesma conta" de "qualquer conta da lista").
3. a busca leva o termo à RPC `search_email_threads` com `p_account` da conta ativa e o que a RPC achou (corpo/anexo, `thread-body`) entra no `or(...)` da consulta da lista, que continua presa à mesma conta (`eq(gmail_account_id,"account-1")`) — escopo.
4. erro da busca ampliada (RPC devolve erro) chega à tela como `busca-global-erro` ("Você está offline"), e não como "vazia".

## Prova vermelho -> verde (mutei o comportamento alvo e restaurei; código de produção igual ao dos pais ao final)
- needsReconnect forçado a `false` em `useGmail.ts`:
  `npx vitest run src/components/email/__tests__/EmailChatInbox.reconectarBusca.integracao.test.tsx`
  -> `TestingLibraryElementError: Unable to find an element by: [data-testid="gmail-sync-banner"]` — `Tests 1 failed | 3 passed (4)` (falha o caso 1).
- needsReconnect trocado por "qualquer conta" (`accounts.some(...)`):
  -> `expected document not to contain element` — `Tests 1 failed | 3 passed (4)` (falha o caso 2).
- `p_account` fixado em `'outra-conta'`:
  -> `AssertionError: expected { p_account: 'outra-conta', …(2) } to match object { p_account: 'account-1', …(1) }` — falha o caso 3.
- ids do corpo/anexo descartados (`[]` no lugar de `matches.map(...)`):
  -> `AssertionError: expected 'or(subject.ilike."%fatura%",snippet.i…' to contain 'id.in.(thread-body)'` — falha o caso 3.
- erro da RPC engolido (`void error` no lugar de `if (error) throw error`):
  -> `TestingLibraryElementError: Unable to find an element by: [data-testid="busca-global-erro"]` — falha o caso 4.
- verde depois (3 rodadas seguidas do arquivo, sem mudar nada entre elas):
  -> `Test Files 1 passed (1); Tests 4 passed (4)` nas 3 rodadas.
- sem corrida com os vizinhos (suítes de e-mail/hook/lib, com o merge resolvido):
  -> `Test Files 23 passed (23); Tests 220 passed (220)`.

## Merge (transparência)
As duas faixas dos pais (t_bb4f0887 e t_2b97523f) conflitavam em `src/components/email/EmailChatInbox.tsx`; a prescrição do cartão é trazer as duas. Resolvi a união dos dois lados (ícones `AlertTriangle...X` e `refetchThreads` no `useGmail`), sem descartar mudança de nenhum pai. As suítes acima (220 verdes) cobrem o arquivo reconciliado.

## O que NÃO fiz e por quê
- Não mexi em código de produção: o único arquivo criado por mim é o teste; `git diff` do meu commit mostra só ele.
- Não criei prova em `supabase/tests/`: a busca no corpo/anexo e o escopo (RLS/`p_account`, termo vazio, paginação, índice) já estão provados no nível de banco por `scripts/db-audit/search-email-threads.test.sh` (BLOCO B), entregue pela faixa do pai. Duplicar seria teste que finge cobertura nova.
- Não apaguei, pulei nem afrouxei teste existente.

Premissa: `p_account` da RPC é o id da conta ATIVA (a tela consulta a conta ativa); o caso 3 confere isso contra `account-1`.
