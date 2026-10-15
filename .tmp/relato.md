Especialista: iris

## O que mudou e por quê

Nenhum arquivo de código neste refazer. O fix do cartão (commit 7bcf35c3d:
`src/components/inbox/BulkActionsToolbar.tsx` + o teste novo
`src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`) continua
idêntico ao já integrado em `dia/2026-10-14` (commit 2175bcb5cc, que cita este
cartão): `git diff 7bcf35c3d9 dia/2026-10-14 --` nos dois arquivos sai vazio.
Não há defeito no escopo para corrigir; mexer em arquivo de outro assunto só
para "fazer o full passar" repetiria o erro medido nº 1 (diff maior que o título).

## Prova (comando e linha de resultado)

- `zapp-verify full .` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`,
  `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto` (igual à entrega
  anterior), `FALHOU testes`: `Test Files 3 failed | 1313 passed (1316)`,
  `Tests 4 failed | 11903 passed | 25 expected fail | 14 todo (11946)`.
- Escopo do cartão, em isolamento, verde:
  `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx`
  → `Test Files 1 passed (1)`, `Tests 2 passed (2)`.
  `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`
  → `Test Files 1 passed (1)`, `Tests 27 passed | 1 expected fail (28)`.

## Pontos do revisor

- Ponto 1 (espelho do CI no empilhamento; reproduzir a falha com
  `zapp-verify full .`, corrigir e fechar): REPRODUZI o vermelho acima e ele
  NÃO PROCEDE como defeito deste cartão, com prova por item: (a) a falha
  determinística é
  `src/components/talkx/__tests__/RuleValueInput.test.tsx > "em breve": Lead score
  e Risco de churn ficam desabilitados no catálogo` — falha também isolada
  (`Tests 1 failed | 4 passed (5)`), arquivo fora de ARQUIVOS QUE PODE TOCAR, e a
  base do dia já traz esse teste corrigido (limpeza de rota X111 + ESPERA_MOUNT);
  (b) as demais falhas passam em isolamento e são flakes sob a carga do full:
  `message-reactions` + `TasksListMode` →
  `Test Files 2 passed (2)`, `Tests 25 passed (25)`;
  `RealtimeInboxView.selectedMessagesError` → `Test Files 1 passed (1)` em
  isolamento; (c) a versão do dia do teste talkx rodada nesta árvore falha em
  4 de 10 porque as fontes irmãs do outro cartão não estão nesta branch — a
  correção é do outro cartão (t_c4195aa9) e não cabe neste diff. Nenhum item do
  vermelho toca `BulkActionsToolbar.tsx`, `TransferDialog.tsx` ou o chamador
  `ConversationListSidebar.tsx` (que passa `bulkActions.bulkTransfer`,
  compatível com `void | Promise<void>`).

## O que NÃO fiz e por quê

- Não alterei talkx/tasks/ui e não rebaseei a branch sobre a base do dia: fora
  do escopo do cartão, e o rebase traria milhares de linhas alheias ao diff. O
  vermelho do full é pré-existente nesta base e já corrigido a montante; o
  experimento com a versão do dia foi revertido (`git status` limpo depois).

## FAIXA DO PAI

FAIXA DO PAI: commits b451e4d4a3 (código do hook + teste dele) e relatos
9f9ac2aa11..baed1988ef do cartão t_2901d317 — não são deste cartão. Commit de
código deste cartão: 7bcf35c3d. Este refazer adiciona só este relato.

## Arquivos (`git diff --name-only 96dd72dc...HEAD`, colado)

- .tmp/relato.md
- src/components/inbox/BulkActionsToolbar.tsx
- src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx
- src/hooks/inbox/__tests__/useInboxBulkActions.test.ts
- src/hooks/inbox/useInboxBulkActions.ts
