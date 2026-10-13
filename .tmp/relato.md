Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/email/EmailChatInbox.tsx`: a busca do cabeçalho ganha estado visível, ligado à MESMA
  consulta da lista (o termo digitado entra em `listQuery` pela espera curta de 300 ms):
  `busca-global-buscando` («Buscando por "termo"…», `role=status` e `aria-busy` no campo),
  `busca-global-erro` (título de `emailLoadErrorCopy` + botão "Tentar novamente" que chama
  `refetchThreads`, a consulta exata da lista) e `busca-global-vazia` («Nenhum resultado para "termo"»).
  Antes a área do campo ficava muda: nada dizia se a consulta estava em curso, falhou ou não achou
  nada. Os três estados são exclusivos entre si (o vazio só aparece sem erro e sem carregamento) e só
  aparecem com termo digitado — campo vazio não inventa estado nem rótulo.
- Teclado, no próprio campo (sem escuta global): `Escape` limpa o termo e devolve a consulta sem busca;
  `Enter` antecipa a espera curta (envia o termo digitado agora); o botão "Limpar busca do Email"
  (ícone X) limpa e devolve o foco ao campo. O placeholder é mantido — «Buscar e-mails, remetentes,
  assuntos, anexos…» — porque agora é verdade: a RPC do cartão pai (`search_email_threads`) acha termo
  no corpo e no nome do anexo.
- `src/components/email/EmailChatInbox.tsx` (1 linha): o "Limpar" que a lista recebe passa a usar o
  mesmo `clearGlobalSearch`, tirando o termo da consulta de uma vez em vez de só esvaziar o campo
  digitado (o termo velho ficava até a espera curta vencer). Não removi nenhum comportamento do
  componente: só somei estado, teclado e o botão de limpar.

## Prova
- vermelho antes: `npx vitest run src/components/email/__tests__/EmailChatInbox.buscaEstados.test.tsx`
  com `src/components/email/EmailChatInbox.tsx` restaurado da base
  (`git show HEAD~1:src/components/email/EmailChatInbox.tsx > src/components/email/EmailChatInbox.tsx`)
  → `Test Files 1 failed (1); Tests 6 failed | 2 passed (8)` — as 6 falhas são exatamente as que
  dependem dos estados novos, do Escape, do Enter e do Limpar imediato.
- verde depois: `npx vitest run src/components/email/__tests__/EmailChatInbox.buscaEstados.test.tsx
  src/components/email/__tests__/EmailChatInbox.test.tsx
  src/components/email/__tests__/EmailChatInbox.contato.test.tsx
  src/components/email/__tests__/EmailChatInbox.contextoPainel.test.tsx` →
  `Test Files 4 passed (4); Tests 28 passed (28)`. Testes existentes intactos — não afrouxei nenhum.
- o teste novo monta a tela REAL (`EmailChatInbox`), com `useGmail` mockado devolvendo o mesmo
  `listQuery` que o hook recebe; cada asserção confere também a consulta que foi ao servidor, e o
  teste do erro usa um erro de verdade (`new Error('offline')`) pela copy `emailLoadErrorCopy`.
- leitura do diff: o `--stat` do fechar inclui a FAIXA do cartão pai (trazida por cherry-pick —
  `useGmail.ts`, `emailThreadQuery.ts`, `types.ts`, a migration, o teste de banco e os 2 testes que ele
  alterou). DESTE cartão o diff é só `src/components/email/EmailChatInbox.tsx` e
  `src/components/email/__tests__/EmailChatInbox.buscaEstados.test.tsx` (+ este `.tmp/relato.md`). Os
  testes do pai aparecem como alterados pelo cherry-pick, não porque eu os tenha tocado.

## Dependência (handoff)
Este cartão depende do `t_493e3851`. Os commits do pai não estavam no meu workspace; puxei-os por
`git cherry-pick -x` (`dia/2026-10-13..v2/busca-email-rpc-termo-261013041884c7`, 8 commits — migration
`search_email_threads`, types, testes de banco/front e relatos). O integrador precisa considerar essa
base ao integrar.

## O que NÃO fiz e por quê
- Escopo selecionável (tudo / assunto / remetente / anexo): o cartão o marca como opcional e ele não é
  implementável só nesta área — nem a RPC `search_email_threads` nem `emailThreadSearchOr` têm
  parâmetro de escopo (`src/hooks/integrations/useGmail.ts`, `src/lib/emailThreadQuery.ts`, worker
  (hooks)). Um seletor que não muda a consulta seria exatamente o rótulo desonesto que o cartão
  combate; deixei fora e registrei em `kanban_comment`.
- Captura (e2e visual): a fixture visual mora em `e2e/`, fora dos ARQUIVOS QUE PODE TOCAR do cartão.
  A prova de tela aqui são os testes que montam a tela real e capturam os três estados.
