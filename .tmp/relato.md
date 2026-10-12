Especialista: worker (telas)
Agente: Íris (area-front-componentes)

RETOMADA (conflito com dia/2026-10-12). Trouxe o commit 6392bcfe3 da branch
`v2/t-69817e72-2610091343d93a` com `git cherry-pick` e resolvi os 2 arquivos em
conflito PRESERVANDO o que já tinha entrado na ponta.

## Como resolvi o motivo da retomada (conflito)
- `git cherry-pick 6392bcfe3` → CONFLICT em `TalkXCampaignRunning.tsx` e
  `TalkXLiveMonitor.tsx`; os 4 arquivos novos (tabela + 3 testes) entraram sem conflito.
- Confirmei antes que o defeito ainda existia na ponta ATUAL:
  `git cat-file -e 96dd72dc5:src/components/talkx/tracking/TalkXRecipientsTable.tsx`
  → `fatal: ... not in '96dd72dc5'`. Ou seja, a tabela unificada não existia na ponta:
  cada tela ainda tinha a própria tabela e o próprio mapa de estado
  (`STATUS_LABEL` local em `TalkXCampaignRunning.tsx`, mapa divergente do kit).
- `TalkXCampaignRunning.tsx`: mantive TUDO o que a ponta tinha (imports de
  `recentMinuteSeries`/`MinuteBucket`, `TalkXCampaignActionsCard`, `TalkXLimitsDialog`,
  `talkxCampaignRules`, e `segmentName` do `TabLogs`) e apliquei só a troca da aba
  Destinatários para `TalkXRecipientsTable` (o cherry-pick tinha a versão antiga do
  arquivo, sem essas features). Removi só o que a troca tornou morto:
  `type RecipRow`, os estados `statusFilter`/`search`, o `useMemo filtered` e a prop
  `segmentName` do `TabRecipients` (a tabela unificada já tem busca/filtro internos).
- `TalkXLiveMonitor.tsx`: mantive `onOpenHelp` + `TalkXHealthCard`/`talkxHealth` da
  ponta e apliquei a tabela unificada em "Entregas em Tempo Real" (mantendo
  `statusFilter`, o aviso de recorte `RECIPIENTS_CUTOFF_NOTE` e o `TalkXQueryBoundary`).
- `TalkXCampaignRunning.segmentoPico.test.tsx` (teste da ponta da mesma tela): ajustei
  ao componente novo — fixtures com `id` e `segments: { name }`, e os seletores reais do
  componente (`aria-label` "Buscar destinatário", "Filtrar por estado", paginação
  "Mostrando 1 a 1 de 1 destinatários"). Mesmas 3 asserções de comportamento
  (coluna Segmento, busca por nome, filtro de status) — nada afrouxado.

## O que mudou e por quê
- `src/components/talkx/tracking/TalkXRecipientsTable.tsx` (novo): tabela única sobre
  colunas configuráveis; tela 11 (`live`) = Contato/Origem/Segmento/Status/Horário/Ações;
  tela 12 (`deliveries`) = + Tiques/Mensagem; mapa de estado do kit (fim do rótulo
  divergente entre as telas); busca (300 ms), filtro de estado e paginação.
- `src/components/talkx/TalkXCampaignRunning.tsx`: aba Destinatários passa a usar a
  tabela unificada (mesmo estado exibido da tela 12).
- `src/components/talkx/TalkXLiveMonitor.tsx`: "Entregas em Tempo Real" usa a mesma tabela.
- 3 testes novos + ajuste do `segmentoPico.test.tsx` (acima).

## Prova
- vermelho antes: `git cat-file -e 96dd72dc5:src/components/talkx/tracking/TalkXRecipientsTable.tsx`
  → `fatal: path 'src/components/talkx/tracking/TalkXRecipientsTable.tsx' ... not in '96dd72dc5'`
  (o módulo não existia na ponta; os testes novos não coletavam).
- verde depois: `npx vitest run src/components/talkx/tracking/__tests__/TalkXRecipientsTable.test.tsx src/components/talkx/__tests__/TalkXCampaignRunning.destinatarios.test.tsx src/components/talkx/__tests__/TalkXLiveMonitor.entregas.test.tsx`
  → `Test Files 3 passed (3); Tests 19 passed (19)`.
- `npx vitest run src/components/talkx/__tests__/TalkXCampaignRunning.segmentoPico.test.tsx`
  → `Test Files 1 passed (1); Tests 8 passed (8)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (68s)`.
- `npx tsc --noEmit` sem saída; `npx eslint` nos 3 arquivos sem saída.

## Estados da tela (X047) e recorte
- carregando/erro/vazio: o `TalkXRecipientsTable` usa `TalkXQueryBoundary` (props
  `isLoading`/`isError`/`error`/`onRetry`); a falha de leitura continua lançando
  (`if (error) throw error`), não vira lista vazia.
- recorte: `limit(RECIPIENTS_READ_LIMIT)` com aviso visível quando a lista encosta no
  teto (`note` no monitor, `Mostrando X de Y` + página no componente).

## O que NÃO fiz e por quê
- `src/components/talkx/__tests__/RuleValueInput.test.tsx` falha na ponta
  (`Unable to find role="button" and name "Novo segmento"`), mas é PRÉ-EXISTENTE: o teste
  e os arquivos que ele importa não estão no meu diff e o teste é idêntico à base
  (`git diff HEAD~1 -- src/components/talkx/__tests__/RuleValueInput.test.tsx` vazio).
  Registrado em `kanban_comment`; não é da tabela de destinatários.
