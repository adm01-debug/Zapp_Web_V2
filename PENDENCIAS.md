# Pendências de CI — adm01-debug/Zapp_Web_V2

> Gerado em 2026-10-25. Itens que precisam de ação humana para serem resolvidos.

---

## 1. E2E Talk X — Regressão visual "Régua visual Talk X" (PR #2219)

**Workflow:** `E2E Talk X (visual/launch + Auth smoke)`  
**Branch:** `claude/fix-unit-tests-pre-existentes-261024-1700`  
**Step falhando:** `🖼️ Régua visual Talk X (17 telas, deslogado)`  
**Runs com falha:** 40186201003 (SHA `590862c32b`), 40185535832 (SHA `284f97c3e5`), 40184398716 (SHA `0eefb3ce6f`)  
**Run em andamento:** 40186665408 (SHA `c9279454`, resultado ainda desconhecido no momento do relatório)

**Causa:** O spec `e2e/talkx-visual.spec.ts` captura screenshots das telas do Talk X
(projeto `chromium-talkx-visual`, viewport 1672×941, tema escuro) e verifica que cada
captura existe no disco e tem mais de 1 KB. Um dos testes de tela falha com exit code 1.
Os artefatos de diagnóstico foram enviados ao CI (artifact `regua-visual-talkx.zip`,
Artifact ID 12596342954, run 40186201003).

**Por que não foi corrigido automaticamente:**  
O teste não usa `toMatchSnapshot()` — ele verifica existência e tamanho mínimo da
captura. A falha indica que um componente não carregou ou renderizou uma tela de erro.
Determinar qual tela falhou e por quê requer baixar o artifact de screenshots do CI e
revisar visualmente as imagens. Isso exige ação humana.

**Ação necessária:**  
1. Baixar o artifact `regua-visual-talkx.zip` do run 40186201003 (ou do run mais recente).
2. Identificar qual `captura-NN.png` está ausente ou com < 1 KB.
3. Reproduzir localmente com `bun run test:e2e -- --project=chromium-talkx-visual`.
4. Corrigir o componente ou a navegação que impede a captura.

---

## 2. types-sync — Gate 1 TypeScript (drift de schema)

**Workflow:** `Types Sync`  
**Branch:** `main` (roda em schedule/dispatch na main)  
**Gate que falha:** Gate 1 — `typecheck-ratchet.mjs` detecta novos erros de TypeScript
introduzidos pelo `types.ts` regenerado a partir do banco.

**Causa:** O schema do banco (tabelas, tipos, funções) avançou desde a última sync;
a regeneração do `types.ts` produz tipos que quebram o typecheck em arquivos do projeto.
Gate 1b confirmou `awaiting_apply=false` — não há migrations pendentes que
expliquem o drift; a diferença está no schema ao vivo.

**Por que não foi corrigido automaticamente:**  
Corrigir requer inspecionar quais arquivos TypeScript quebraram com o novo `types.ts`,
entender se as mudanças de schema são intencionais, e ajustar os consumidores dos tipos.
Isso envolve decisão de produto/arquitetura sobre o schema.

**Ação necessária:**  
1. Rodar `node scripts/ci/types-sync-gate.mjs` (ou equivalente) localmente contra o
   banco oficial para ver quais erros de TS são gerados.
2. Corrigir os arquivos que quebram (ou ajustar o schema se foi aplicado por engano).
3. Confirmar `novas: 0` no usage-guard após a sincronização.

---

## 3. DB Guard TC-009 — estado inconclusivo

**Workflow:** `DB Guard (offline)`  
**Branch:** `claude/fix-unit-tests-pre-existentes-261024-1700` (PR #2219)  
**Step:** `Simular conversation_id derivado da mensagem em recibos e reacoes (TC-009)`  
**Run com falha confirmada:** 40184398774 (SHA `0eefb3ce6f`)  
**Runs mais recentes:** cancelado em `284f97c3e5` e `590862c32b`; `in_progress` em `c9279454`

**Status:** Inconclusivo. O TC-009 falhou no SHA mais antigo da branch, mas foi cancelado
(não falhou) nos SHAs mais recentes. O run no HEAD atual (`c9279454`) estava em andamento
no momento da análise. Pode estar resolvido nas commits mais novas da PR.

**Ação necessária (se TC-009 ainda falhar em `c9279454`):**  
1. Verificar o log do step TC-009 no run mais recente da branch.
2. O teste simula `conversation_id` derivado de mensagem em recibos/reações;
   investigar se há mudança de constraint ou trigger no banco que quebrou a simulação.

---

## 4. Contrato DB offline — TC-009 em execução (PR #2246)

**Workflow:** `DB Guard (offline)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246)  
**Step:** `Simular conversation_id derivado da mensagem em recibos e reacoes (TC-009)` — passo 147 de 188  
**Run com falha histórica (SHA anterior):** 40184398774 (SHA `0eefb3ce6f`)  
**Erro exato da falha histórica:** `ERROR:  function public.request_department_access(unknown) does not exist`  
**Run atual:** 40190996529 (SHA `d3dc8a30`) — `in_progress` ao registrar este item; passos 1–101 todos `success`

**Status:** O step TC-009 ainda não havia executado no run atual (40190996529) no momento deste
registro. Os 101 passos anteriores passaram sem falha. A falha histórica em run anterior (SHA
`0eefb3ce6f`) foi `function public.request_department_access(unknown) does not exist` — indica que
o step tentou chamar uma função que não existe na assinatura esperada. Não há mudança de DDL nesta
PR que pudesse ter corrigido ou agravado isso; o resultado do TC-009 no run atual é desconhecido.

**Por que não foi corrigido automaticamente:**  
A função `request_department_access` é DDL de banco — corrigir requer verificar a assinatura atual
da função em produção, identificar o tipo esperado pelo teste e, se divergir, aplicar migration ou
corrigir o teste. Isso envolve escrita em banco de produção (regra 8 do fluxo Git: DDL necessita
aprovação humana).

**Ação necessária:**  
1. Verificar o resultado do run 40190996529 no step TC-009 após conclusão.
2. Se falhar: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'request_department_access'` no banco oficial para ver a assinatura real.
3. Ajustar o teste ou criar migration que corrija a assinatura com aprovação do Joaquim.

---

## 5. Unit Tests Shard 1/3 — `useTalkXSegments.test.ts` (falha pré-existente)

**Workflow:** `ci.yml` — `🧪 Unit Tests (1/3)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246) — e também na `main`  
**Run confirmando pré-existência na `main`:** 40122006424 (commit `2d97c44`, 2026-10-24)  
**Arquivo de teste:** `src/hooks/integrations/__tests__/useTalkXSegments.test.ts`  
**Linhas falhando:** 347, 371, 384, 398

**Erros exatos:**
- `:347` — `expected [Function] to throw` — esperava exceção ao chamar `buildSegmentQuery` com `real_sector`, mas a função não lança
- `:371` — `promise resolved "7"` — `buildRpcQuery` deveria rejeitar para `real_sector`, mas resolveu com `"7"`
- `:384` — `promise resolved "[]"` — `buildRpcQuery` deveria rejeitar para `real_uf`, mas resolveu com `"[]"`
- `:398` — `promise resolved "7"` — idem para `real_uf`

**Causa:** Os testes esperam que `real_sector` e `real_uf` usem a bridge Singu (`p_contact_ids`),
que deveria lançar/rejeitar quando não implementada. A implementação atual em
`src/hooks/integrations/useTalkXSegments.ts` (linha ~77–78) não tem guard `comingSoon: true`
nesses campos e processa como enum/eq normal — resolve em vez de lançar.

**Por que não foi corrigido automaticamente:**  
Adicionar `comingSoon: true` para `real_sector`/`real_uf` alteraria comportamento de produto
(filtros de campanha passariam a ser bloqueados para esses campos). Implementar a bridge Singu
(`p_contact_ids`) requer decisão de arquitetura sobre o endpoint correto. Ambas as opções
envolvem decisão de produto.

**Ação necessária:**  
Escolher: (a) implementar a bridge Singu para `real_sector`/`real_uf` ou (b) marcar com
`comingSoon: true` até a bridge estar pronta. Ambos requerem decisão de produto pelo Joaquim.

---

## 6. Unit Tests Shard 2/3 — `ChatMessagesArea` `data-testid="bubble"` (falha pré-existente)

**Workflow:** `ci.yml` — `🧪 Unit Tests (2/3)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246) — e também na `main`  
**Run confirmando pré-existência na `main`:** 40122006424 (commit `2d97c44`, 2026-10-24)  
**Erro exato:** `TestingLibraryElementError: Unable to find an element by: [data-testid="bubble"]`

**Arquivos com este testid nos testes:**
- `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx`
- `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx`
- `src/components/inbox/chat/__tests__/ChatMessagesArea.agrupar-envio.test.tsx`
- `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx`
- `src/components/inbox/chat/__tests__/ChatPanel.entrega-conversa.test.tsx`
- `src/components/inbox/chat/__tests__/ChatPanel.typing-presence.test.tsx`

**Causa:** Os testes buscam `data-testid="bubble"` no DOM renderizado, mas o componente
`ChatMessagesArea` (ou `ChatPanel`) não possui esse atributo no código-fonte atual.
O testid foi removido ou nunca existiu na versão atual do componente.

**Por que não foi corrigido automaticamente:**  
Adicionar `data-testid="bubble"` ao componente real exigiria identificar o elemento correto
na hierarquia do DOM — mudança de UI que deve ser revisada para não quebrar seletores E2E.
Alternativamente, atualizar os testes para refletir a estrutura real do DOM exige conhecimento
do comportamento esperado de cada test case.

**Ação necessária:**  
Adicionar `data-testid="bubble"` ao elemento de bolha de mensagem em `ChatMessagesArea` ou
autalizar os seletores nos testes para usar o testid existente no componente real.

---

## 7. Unit Tests Shard 3/3 — `useTeamChatNotifications.canal-estavel.test.tsx` (falha pré-existente)

**Workflow:** `ci.yml` — `🧪 Unit Tests (3/3)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246) — e também na `main`  
**Run confirmando pré-existência na `main`:** 40122006424 (commit `2d97c44`, 2026-10-24)  
**Arquivo de teste:** `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx`  
**Linhas falhando (na branch):** 154, 176

**Erros exatos:**
- `:154` — `vi.fn() not called with arguments` — mock de notificação não foi chamado com os parâmetros esperados
- `:176` — `vi.fn() not called at least once` — mock de notificação nunca foi chamado

**Causa:** O spec `canal-estavel` configura um canal do tipo "estável" e espera que o hook
emita notificação browser sob certas condições. O mock de `showBrowserNotification` não está
sendo chamado porque as condições de disparo no hook não batem com o estado simulado no teste
(provavelmente `notifSettings`, `isQuietHours` ou configuração do canal difere do esperado).

**Por que não foi corrigido automaticamente:**  
A lógica de quando notificar em "canal estável" é comportamento de produto. Corrigir requer
entender o contrato exato do spec e ajustar o hook ou o setup do teste sem quebrar outros specs.

**Ação necessária:**  
Comparar o setup do teste (linhas ~140–160) com a lógica de disparo no hook
`useTeamChatNotifications.ts` para identificar qual condição não está sendo satisfeita.
Pode ser um bug real ou um setup de mock desatualizado.

---

*Este arquivo deve ser atualizado ou removido após cada item ser resolvido.*
