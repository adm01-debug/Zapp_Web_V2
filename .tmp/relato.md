Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/lib/emailThreadQuery.ts`: `emailThreadSearchOr(term, contactIds, threadIds)` ganha um
  terceiro parâmetro opcional que acrescenta `id.in.(...)` ao `.or` — a lista de `thread_id` que
  a RPC de busca casou. Como o parâmetro é opcional (default `[]`), o contrato antigo da função
  continua idêntico e a cláusula é só somada. Somam-se também `EMAIL_THREAD_SEARCH_PAGE_SIZE`,
  `EMAIL_THREAD_SEARCH_MAX_PAGES`, o tipo `EmailThreadSearchMatch` e o coletor de cursor
  `collectEmailSearchThreadIds`, que percorre a RPC por `p_after` (cursor = `last_message_at` da
  última linha) até a página vir incompleta ou o teto de páginas cair.
- `src/hooks/integrations/useGmail.ts`: quando há termo, além do `.or` de colunas que já existia
  (assunto/trecho/remetente + contatos), o hook chama a RPC `search_email_threads` (SECURITY
  INVOKER, respeita a RLS) e junta os `thread_id` que ela achou — é o que faz o termo aparecer no
  CORPO (`email_messages.body_text`) e no NOME DO ANEXO (`email_attachments.filename`), que a
  consulta PostgREST da lista não alcançava. Os `id.in.(...)` entram no MESMO `.or`, então os
  filtros estruturais (pasta, estado, período, anexos) continuam valendo para a busca, como o
  cartão pede. Erro da RPC é propagado (`if (error) throw error`), vira `threadsError` da lista.
- Sem termo: nada muda — a RPC e a consulta de contatos nem rodam; a consulta da lista é byte a
  byte a de antes.

Por que ADITIVO e não substituindo o `.or` antigo: assunto/remetente/trecho já eram encontrados e
precisam continuar sendo mesmo se a RPC truncar no teto de páginas ou se o cursor empatar um
`last_message_at`. Assim o diff é puramente soma de alcance (corpo/anexo) e não troca um canal por
outro — evita a regressão clássica desta área.

`p_after` é o cursor de `last_message_at`; a paginação por cursor fica toda dentro de
`collectEmailSearchThreadIds`. O cancelamento de resposta antiga continua por conta da React Query:
a chave é `['gmail-threads', activeAccount?.id, effectiveListQuery]` e `effectiveListQuery` inclui o
termo, então a resposta de um termo velho é descartada e não mexe no `loading` do termo novo.

## Prova
- vermelho antes: `npx vitest run src/hooks/integrations/__tests__/useGmail.threadListQuery.test.tsx`
  (com `src/hooks/integrations/useGmail.ts` na versão da base) →
  `Test Files 1 failed (1); Tests 3 failed | 7 passed (10)` — as 3 falhas são exatamente as que
  dependem da RPC (`records.rpc` com 2 chamadas de cursor, casamento por `id.in.`, erro da RPC).
- verde depois: `npx vitest run src/lib/__tests__/emailThreadQuery.test.ts src/hooks/integrations/__tests__/useGmail.threadListQuery.test.tsx`
  → `Test Files 2 passed (2); Tests 25 passed (25)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (122s)` (tipos OK, lint OK).
- testes que proveem o comportamento novo (arquivos tocados): `useGmail.threadListQuery.test.tsx`
  (RPC chamada com `p_account`/`p_q`; `id.in.(t9)` somado ao `.or`; sem casamento na RPC o `.or`
  mantém `subject.ilike` e NÃO ganha `id.in.`; erro da RPC vira `threadsError`; cursor percorre 2
  páginas com `p_after` correto) e `emailThreadQuery.test.ts` (o `or` soma `id.in.`; o coletor para
  no fim e no teto de páginas). Testes existentes de busca/contatos ficaram intactos — não afrouxei
  nenhum.

## Dependência (handoff)
Este cartão depende do `t_59d66c7a`. Os commits do pai não estavam no meu workspace; puxei-os por
`git cherry-pick -x` (`dia/2026-10-13..8a7d5fd6c`, 5 commits — a migration
`20261013230000_search_email_threads.sql`, os types e o teste de banco). O integrador precisa
considerar essa base ao integrar.

## O que NÃO fiz e por quê
- A busca por corpo/anexo é limitada (2 páginas × 50 = 100 casamentos) de propósito: um termo de
  uma letra não pode virar varredura ilimitada (mesmo espírito do OTH-005).
- A RPC ordena por `last_message_at DESC` e só aceita esse cursor; se dois casamentos empatarem o
  `last_message_at` na borda de página, o `<` estrito pode pular linhas. É limitação do contrato da
  RPC definido pelo pai; por isso o `.or` de colunas ficou junto, cobrindo assunto/remetente/trecho.
- Não mexi na RPC, na migration nem nos types (fora da minha área/handoff do pai).
