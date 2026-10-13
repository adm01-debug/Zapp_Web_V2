Especialista: workertestes

## O que mudou e por quê
- `src/components/email/__tests__/EmailChatInbox.reconectarBusca.integracao.test.tsx` (novo, arquivo que eu escrevi): teste de costura de tela — monta o `EmailChatInbox` REAL com o `useGmail` REAL e dubla SÓ a rede (`supabase` + `callGmailFunction`). É o único teste que prova a corrente inteira `sync_status real -> hook real -> faixa -> botão` e `busca -> RPC real -> OR -> tela`; as duas famílias de testes que existem nas faixas dos pais dublam um dos lados (casca com `useGmail` dublado, ou hook real sem a tela). Também são os casos de comportamento que o cartão pede:
  1. conta ativa com `sync_status='reauth_required'` acende a faixa (`role=alert`, "Sua conta Gmail precisa ser reconectada") e o "Reconectar" abre a autorização da MESMA conta ativa (`gmail-oauth get-auth-url`); a faixa é conferida amarrada à conta que o cabeçalho mostra como ativa (`admin@example.com`).
  2. a faixa é da conta ATIVA: com a ativa saudável e OUTRA conta em `reauth_required`, o aviso NÃO acende (distingue "a mesma conta" de "qualquer conta da lista").
  3. a busca leva o termo à RPC `search_email_threads` com `p_account` da conta ativa e o que a RPC achou (corpo/anexo, `thread-body`) entra no `or(...)` da consulta da lista, que continua presa à mesma conta (`eq(gmail_account_id,"account-1")`) — escopo.
  4. erro da busca ampliada (RPC devolve erro) chega à tela como `busca-global-erro` ("Você está offline"), e não como "vazia".

## Escopo do diff (por que estes 9 arquivos)
O cartão manda, na DEPENDÊNCIA, trazer as faixas dos pais `t_bb4f0887` e `t_2b97523f` (o hook, a RPC e os componentes vêm delas; sem elas o teste não compila). Trazidas por inteiro, o diff somou 97864 caracteres e o `hermes-tarefa-fechar` recusou (regra >90000). Pela skill `refazer-sem-diff-alheio`, tirei do meu commit o que é produto das faixas dos pais e não é deste cartão: os testes delas (`EmailChatInbox.reconectar.test.tsx`, `EmailChatInbox.buscaEstados.test.tsx`, `useGmail.syncStatus.test.tsx`, `useGmail.threadListQuery.test.tsx`, `emailThreadQuery.test.ts`, `gmail-reauth-required.test.ts`, `gmail-oauth/index.test.ts`), a prova de banco `scripts/db-audit/search-email-threads.test.sh` + o registro no `db-guard.yml`, as Edge Functions (`gmail-helpers.ts`, `gmail-oauth`, `gmail-sync`, `gmail-cron-sync`) e o churn de relato. Fica na minha branch só o que o meu teste exercita:
- `src/components/email/EmailChatInbox.tsx` — a faixa de reconexão e os estados da busca (alvo do teste);
- `src/hooks/integrations/useGmail.ts` + `src/hooks/gmail/gmailTypes.ts` — o hook real (`needsReconnect` a partir de `sync_status`; chamada à RPC e o OR);
- `src/lib/emailThreadQuery.ts` — o `emailThreadSearchOr` que monta o OR;
- `src/components/gmail/GmailAccountSelector.tsx` — o seletor que a tela usa (o teste lê a conta ativa nele);
- `supabase/migrations/20261013230000_search_email_threads.sql` + `src/integrations/supabase/types.ts` — a RPC que o cartão cita como "busca ampliada" e o tipo dela.
Os testes dos pais continuam nas branches deles; o integrador os traz de lá. Eu não os apaguei da base (não existiam na `dia/2026-10-13`).

## Prova vermelho -> verde (mutei o alvo e restaurei; produção final igual à dos pais)
- `needsReconnect` forçado a `false`:
  `npx vitest run .../EmailChatInbox.reconectarBusca.integracao.test.tsx`
  -> `TestingLibraryElementError: Unable to find an element by: [data-testid="gmail-sync-banner"]` — `Tests 1 failed | 3 passed (4)` (caso 1).
- `needsReconnect` trocado por "qualquer conta":
  -> `expected document not to contain element` — `Tests 1 failed | 3 passed (4)` (caso 2).
- `p_account` fixado em `'outra-conta'`:
  -> `AssertionError: expected { p_account: 'outra-conta', …(2) } to match object { p_account: 'account-1', …(1) }` (caso 3).
- ids do corpo/anexo descartados (`[]` no lugar de `matches.map(...)`):
  -> `AssertionError: expected 'or(subject.ilike."%fatura%",snippet.i…' to contain 'id.in.(thread-body)'` (caso 3).
- erro da RPC engolido (`void error` no lugar de `if (error) throw error`):
  -> `TestingLibraryElementError: Unable to find an element by: [data-testid="busca-global-erro"]` (caso 4).
- verde depois (3 rodadas seguidas do arquivo, nada mudado entre elas):
  -> `Test Files 1 passed (1); Tests 4 passed (4)` nas 3 rodadas.
- sem corrida com os vizinhos (arquivo novo + `emailThreadQuery.test.ts`):
  -> `Test Files 2 passed (2); Tests 16 passed (16)`.
- verificação do projeto: `zapp-verify . --rapido` (saída no `.tmp/verify.log`).

## Merge (transparência)
As duas faixas conflitavam em `src/components/email/EmailChatInbox.tsx`; resolvi a união dos dois lados (ícones `AlertTriangle…X` e `refetchThreads` no `useGmail`), sem descartar mudança de nenhum pai.

## O que NÃO fiz e por quê
- Não criei prova em `supabase/tests/`: a busca no corpo/anexo e o escopo (RLS/`p_account`, termo vazio, paginação, índice) já estão provados no nível de banco por `scripts/db-audit/search-email-threads.test.sh` (BLOCO B), que fica na branch do pai `t_2b97523f`. Duplicar seria teste que finge cobertura nova.
- Não toquei em código de produção além de manter o que o teste exercita (não mudei comportamento de produção nenhum: o meu commit é o teste; os arquivos de produção são os dos pais, trazidos pela DEPENDÊNCIA).
- Não apaguei, pulei nem afrouxei teste existente; não mexi em timeout.

Premissa: `p_account` da RPC é o id da conta ATIVA (a tela consulta a conta ativa); o caso 3 confere isso contra `account-1`.
