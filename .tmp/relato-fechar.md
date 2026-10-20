- Verificação rápida (zapp-verify --rapido) no fechar: OK dependencias 0s;OK db_guard 0s;OK tipos 46s;OK lint 1s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (17/10 06:35, gerados por máquina: valem mais que números escritos à mão)
```
 supabase/functions/gmail-cron-sync/index.test.ts | 232 +++++++++++++++++++++++
 supabase/functions/gmail-cron-sync/index.ts      | 138 +++++++++++---
 2 files changed, 348 insertions(+), 22 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial da 1ª entrega: juiz indisponível (não bloqueou)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:\.delete\(\)|\bDELET

Especialista: Edgar (area-edge-api)

## O que mudou e por quê

`supabase/functions/gmail-cron-sync/index.ts` + `supabase/functions/gmail-cron-sync/index.test.ts` (novo).
O incremental do cron rodava `GET /history?startHistoryId=...&historyTypes=messageAdded` e só
consumia `messagesAdded`: exclusão e mudança de rótulo feitas no Gmail nunca chegavam ao local
(o usuário via a mensagem na Entrada mesmo depois de movê-la para Enviados, e a mensagem excluída
ficava no local). Agora:

- **4 historyTypes** (`messageAdded`, `messageDeleted`, `labelAdded`, `labelRemoved`) pedidos na mesma
  consulta; `labelsAdded`/`labelsRemoved` re-sincronizam a mensagem (a thread passa a refletir a pasta
  do Gmail) e `messagesDeleted` é apagado do local SEM re-buscar conteúdo — o ID excluído é retirado de
  `changedMessageIds` antes do `syncMessageIds`, e as threads afetadas são reconciliadas.
- **Teto de páginas por rodada** (`GMAIL_CRON_HISTORY_MAX_PAGES_PER_RUN`): a rodada para dentro do tempo
  da Edge e persiste o cursor (`history_id`) da ÚLTIMA página processada; a rodada seguinte (cron a cada
  5 min) continua de lá. Antes, uma caixa grande devolvia apenas a primeira página e o cursor avançava
  como se tudo tivesse sido aplicado (perda de eventos).
- **Full sync no escopo Entrada+Enviados** (`GMAIL_CRON_SCOPE_QUERY` = `(in:inbox OR in:sent)
  newer_than:365d`): a chamada era `runGmailFullSync(..., "in:inbox", 50)`, ou seja, e-mail enviado pelo
  celular nunca entrava no local.
- **`syncGmailCronAccount` exportada**: só extrai para uma função a escolha "sem cursor → full sync /
  com cursor → incremental" que já estava inline no handler. O `try/catch` do handler continua no mesmo
  lugar, com o mesmo efeito (mesma atualização de `last_error`/`sync_status` na falha). O CAS do cursor
  (R2-API-011B) foi preservado linha a linha: `update(...).eq("id").eq("history_id", ...).select("id")`,
  `0 linhas` = conflito, erro do UPDATE propaga.

Testes (4) no próprio arquivo tocado: exclusão + rótulo chegando ao local, borda do teto de páginas
(histórico que cabe EXATAMENTE no teto não trunca), caixa grande truncando com o cursor continuando na
rodada seguinte, e o escopo do full sync. O teste roda o código REAL com `fetch` falso por URL e cliente
Supabase em memória — sem rede e sem banco.

## Prova

- vermelho antes: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/gmail-cron-sync/index.test.ts` → `TS2339: Property 'deleted' does not exist on type '{ synced: number; cursor_advanced: boolean; }'` / `Found 10 errors.` / `error: Type checking failed.` (a base não devolvia `deleted` nem `history_pages`, e não tinha o teto de páginas nem o escopo).
- verde depois: mesmo comando → `ok | 4 passed | 0 failed (11ms)`
- vizinhos (regressão): `deno test ... supabase/functions/gmail-cron-sync/ supabase/functions/gmail-sync/ .../gmail-helpers.test.ts .../gmail-helpers-account-scope.test.ts .../gmail-cursor-cas-db.test.ts .../gmail-history-cas-db.test.ts .../cron-secret-authz-l5.test.ts` → `ok | 42 passed | 0 failed | 2 ignored (509ms)` (os 2 ignorados são os testes de CAS contra PostgREST real, que só ligam com `GMAIL_CAS_POSTGREST_URL`/`GMAIL_CAS_JWT` — eles continuam chamando `runGmailCronIncrementalSync`, cujo contrato de CAS não mudou)

## Sensibilidade (o diff abre revisão forte)

- Toca `DELETE` (novo: apaga do local as mensagens que o Gmail excluiu) e o caminho com `service_role`
  no handler; o CAS do cursor ficou igual. Nenhuma proteção afrouxada.
- **Prova do caso negado:** o teste assere que a mensagem excluída NÃO é re-buscada no Gmail
  (`/messages/m-del?` ausente nas URLs chamadas) e que o apagado local é exatamente o dono da conta
  (`.eq("gmail_account_id", account.id).in("id", ...)`). Erro de leitura/apagado propaga (fail-closed),
  não é engolido — como o `syncMessageIds` já fazia com `failed > 0`.
- Nenhuma referência ao banco/endpoint de produção. Nada sai da máquina: a API do Gmail é `fetch` falso.
- Para quem chama: nada (o `POST` do cron e o `x-cron-secret` continuam iguais; a resposta ganha os
  campos `deleted`, `cursor_advanced`, `history_pages` e `history_truncated` por conta).

## FAZENDO A FAIXA DO PAI: não trouxe

Este cartão é uma FATIA do cartão raiz (a entrega anterior foi recusada por diff grande demais e virou
cartões menores). O cartão pai `t_2e04e699` (cherry-pick do band da branch anterior, já na fila do
integrador) contém uma mudança EQUIVALENTE neste mesmo arquivo, dentro de uma faixa de ~80 mil
caracteres. Trazer a faixa inteira para cá repetiria o problema que gerou a recusa da raiz: o diff deste
cartão é 1 arquivo tocado + 1 teste novo, sem nada de outro cartão. Se o integrador puser a faixa do pai
primeiro, este ramo fica redundante (o mesmo comportamento já está lá) — a ordem é dele; não toquei em
nenhum outro arquivo e não há dependência de código entre os dois.

## O que NÃO fiz e por quê

- O aviso do juiz ("código alterado sem teste novo/alterado neste commit") não procede: o commit
  `8863655c63` traz `supabase/functions/gmail-cron-sync/index.test.ts` novo (232 linhas) junto com o
  `index.ts`, e os 4 testes passam chamando o código real (`git show --stat HEAD` lista os dois arquivos).

- Não toquei `supabase/functions/_shared/gmail-helpers.ts` nem `gmail-sync/index.ts` (a constante do
  escopo ficou local no cron): são a fatia dos cartões irmãos e evitaram colisão de arquivo.
- Não mexi no `catch` do handler nem no `x-cron-secret`.
- Não rodou `hermes-db-migrar`: nenhuma migration neste cartão.
