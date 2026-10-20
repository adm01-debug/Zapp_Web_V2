Especialista: hugo

## Arquivo fora da lista do cartão: por que foi indispensável

`src/components/agents/AgentsView.tsx` não está em "ARQUIVOS QUE PODE TOCAR" e eu o toquei em 3 linhas, porque o
contrato que o cartão pede (`activeChats: number | null` para "capacidade indisponível = null, nunca 0") não compila
sem elas. Prova com o hook novo e a tela da base:
`git checkout dia/2026-10-15 -- src/components/agents/AgentsView.tsx && npx tsc -b --force`
→ exatamente 1 erro: `src/components/agents/AgentsView.tsx(197,38): error TS18047: 'agent.activeChats' is possibly 'null'.`
Com a tela da base o `zapp-verify . --rapido` fica VERMELHO em `tipos`; nenhuma mudança só nos hooks fecha o cartão.
As 3 linhas não mudam comportamento com dado bom (`AgentsView.capacidade.test.tsx` continua passando).

## O que mudou e por quê

- `src/hooks/crm/useAgents.ts`: cada consulta da lista passou a devolver o PRÓPRIO erro em `errors`
  (`profiles`, `queues`, `members`, `activeChats`) e `error` traz o primeiro deles — antes os erros de filas,
  vínculos e conversas abertas eram descartados e o supervisor via "0/5" e "sem filas" como se fosse verdade.
  As filas e os vínculos saíram de UMA consulta para duas (`['agents-queues']` e `['agents-queue-members']`),
  senão o erro não tinha como ser atribuído a uma ou a outra.
- `src/hooks/crm/useAgents.ts`: capacidade indisponível virou `null`, nunca `0`, e `stats.totalActiveChats`
  virou `null` quando QUALQUER atendente ficou sem leitura (somar só o lido apresentaria subtotal como total).
- `src/hooks/crm/useAgents.ts`: o status vem SÓ de `useAgentPresenceMap`; sem presença publicada é `offline`.
  Removida a estimativa por `updated_at` (a função `getAgentStatus`) — mexer no perfil não é presença.
- `src/hooks/crm/useAgents.ts`: a consulta de perfis pede `.not('is_active', 'is', false)`, então a conta
  desativada sai da lista e não entra em Online/Ausente/Offline nem em `totalAgents`; `is_active` nulo
  (nunca preenchido) continua na lista, como antes.
- `src/hooks/admin/useSupervisorQueue.ts`: o polling para com `document.hidden` e volta no `visibilitychange`
  recarregando uma vez; aba oculta não faz nem a carga inicial. Nova flag `namesUnavailable` quando os perfis
  ou os nomes das filas falham: a linha fica sem nome E a tela sabe que o nome faltou.
- `src/components/agents/AgentsView.tsx` (3 pontos, exigidos pelo tipo novo de `activeChats`): capacidade
  indisponível mostra "Indisponível" e esconde a barra (não vira "0/5"), e o cartão "Chats Ativos" mostra o
  total nulo. Sem isso o `tsc` da tela não compila com `activeChats: number | null`.
- Testes: `src/hooks/__tests__/useAgents.leitura.test.tsx` (novo: uma falha por consulta), 
  `src/hooks/__tests__/useAgents.test.tsx` (desativado fora da lista; 0 de verdade ≠ indisponível),
  `src/hooks/__tests__/useAgents.presence.test.tsx` (perfil editado agora continua offline) e
  `src/hooks/admin/__tests__/useSupervisorQueue.test.tsx` (namesUnavailable e visibilidade da aba).

## Testes existentes que mudaram (endurecidos, não afrouxados)

- `src/hooks/__tests__/useAgents.test.tsx`: o teste-fantasma `'getAgentStatus utility works correctly'`
  (só fazia `expect(true).toBe(true)`) saiu (a função `getAgentStatus` deixou de existir) e entrou teste real;
  a expectativa de lista mudou porque o perfil `is_active: false` da fixture agora sai da lista (item 2 do cartão).
  Comando: `npx vitest run src/hooks/__tests__/useAgents.test.tsx` → `Test Files  1 passed (1)` / `Tests  3 passed (3)`.
- `src/hooks/__tests__/useAgents.presence.test.tsx`: a fixture do atendente sem presença passou a ter `updated_at`
  recente (antes vazio), para provar o critério 1; a asserção de status continua `offline`.
  Comando: `npx vitest run src/hooks/__tests__/useAgents.presence.test.tsx` → `Test Files  1 passed (1)` / `Tests  1 passed (1)`.
- `src/hooks/admin/__tests__/useSupervisorQueue.test.tsx`: só testes NOVOS (visibilidade da aba e
  `namesUnavailable`); nenhum teste anterior foi tocado.
  Comando: `npx vitest run src/hooks/admin/__tests__/useSupervisorQueue.test.tsx` → `Test Files  1 passed (1)` / `Tests  14 passed (14)`.
- Nenhuma asserção existente foi removida ou enfraquecida.

## Prova

- vermelho antes: com a base (`git checkout dia/2026-10-15 --` nos dois hooks e na tela) e os testes novos no
  lugar, `npx vitest run src/hooks/__tests__/useAgents.leitura.test.tsx src/hooks/__tests__/useAgents.test.tsx src/hooks/admin/__tests__/useSupervisorQueue.test.tsx`
  → `Test Files  3 failed (3)` / `Tests  12 failed | 10 passed (22)`, entre eles
  "erro nos chats ativos deixa a capacidade indisponível (null), nunca 0", "erro nos perfis é devolvido"
  e "aba oculta não consulta; ao voltar recarrega uma vez e retoma o polling".
- verde depois: `npx vitest run src/hooks/__tests__/useAgents.test.tsx src/hooks/__tests__/useAgents.presence.test.tsx src/hooks/__tests__/useAgents.leitura.test.tsx src/hooks/admin/__tests__/useSupervisorQueue.test.tsx`
  → `Test Files  4 passed (4)` / `Tests  23 passed (23)`.
- tela: `npx vitest run src/components/agents` → `Test Files  5 passed (5)` / `Tests  24 passed (24)`.
- contrato com quem chama `useAgents` (tipo de `activeChats` mudou): `npx tsc -b --force` → sem saída de erro; 
  `npx vitest run src/components/dashboard ... src/components/inbox/__tests__/WhisperMode.destino.test.tsx ...`
  → `Test Files  42 passed (42)` / `Tests  190 passed (190)`.
- verificação do repositório: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos` (192s), `OK lint`, `OK migrations`,
  `VERIFY: VERDE SEM BANCO (198s)`.
- nenhuma chave de cache foi trocada: `['agents-active-chats']` (invalidada por `useAgentReassignment`) continua
  igual; as duas novas (`['agents-queues']`, `['agents-queue-members']`) não são invalidadas em lugar nenhum.

## O que NÃO fiz e por quê

- A marca visual da capacidade indisponível ficou como o texto "Indisponível" (não `—`) nos `src/components/**`,
  que não é a minha área: o teste do cartão t_2939f5e5 (`AgentsView.pendencias.test.tsx`) usa
  `within(card).getByText('—')` e um segundo `—` no mesmo cartão quebraria aquele teste. O hook devolve `null`
  como o cartão pede; só a marca da tela mudou de forma.
- Nada de banco, Edge, migration ou produção: só hooks, o tipo da tela que o hook alimenta e testes.
