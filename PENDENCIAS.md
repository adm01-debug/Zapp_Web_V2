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

## 3. DB Guard TC-009 — check constraint `department_audit_logs_action_check`

**Workflow:** `DB Guard (offline)`  
**Branch:** `main` (e também PR #2219, PR #2246)  
**Step:** `Simular conversation_id derivado da mensagem em recibos e reacoes (TC-009)`  
**Run confirmado na main:** 40122006482 (SHA `2d97c44`, 2026-10-24)  
**Erro exato:**
```
ERROR:  new row for relation "department_audit_logs" violates check constraint "department_audit_logs_action_check"
DETAIL:  Failing row contains (…, aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa, access_requested, null, {}, null, …).
```

**Causa:** A função `request_department_access` existe (erro anterior de "function does not exist"
foi corrigido), mas ao tentar inserir em `department_audit_logs` com `action = 'access_requested'`,
a constraint `department_audit_logs_action_check` rejeita esse valor — `access_requested` não está
na lista de valores aceitos pelo `CHECK`.

**Por que não foi corrigido automaticamente:**  
Requer DDL: `ALTER TABLE department_audit_logs DROP CONSTRAINT department_audit_logs_action_check`
seguido de `ADD CONSTRAINT` com os valores corretos. Envolve leitura do schema atual de produção e
escrita em banco (regra 8 do fluxo Git: DDL necessita aprovação de Joaquim).

**Ação necessária:**  
1. `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'department_audit_logs_action_check'` no banco oficial para ver os valores aceitos atualmente.
2. Criar migration que adicione `'access_requested'` ao CHECK ou corrija o valor que a função usa.
3. Seguir o fluxo: arquivo em `supabase/migrations/` → PR → merge → apply com aprovação de Joaquim.

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

## 6. Unit Tests Shard 3/3 — `useCampaignRowActions.test.tsx` (falha pré-existente)

**Workflow:** `ci.yml` — `🧪 Unit Tests (3/3)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246) — e também na `main`  
**Run confirmando pré-existência na `main`:** 40122006424 (commit `2d97c44`, 2026-10-24)  
**Arquivo de teste:** `src/components/talkx/__tests__/useCampaignRowActions.test.tsx`

**Erro exato:**  
`Unable to find an accessible element with the role "button" and name "Ações de Campanha pausada"`

**Causa:** O teste busca um botão com nome acessível "Ações de Campanha pausada" no DOM
renderizado, mas o componente `useCampaignRowActions` (ou o componente que o usa) não produz
esse elemento com esse nome acessível na versão atual do código.

**Por que não foi corrigido automaticamente:**  
A correção exige entender o contrato de acessibilidade esperado para ações em campanhas
pausadas — se o botão foi removido, renomeado ou se o atributo `aria-label`/texto foi alterado.
Envolve decisão de UX/produto sobre o nome correto do controle.

**Ação necessária:**  
1. Inspecionar `src/components/talkx/__tests__/useCampaignRowActions.test.tsx` e o componente
   real para identificar se o botão existe com nome diferente ou foi removido.
2. Atualizar o teste para refletir o nome acessível real, ou corrigir o componente para ter
   `aria-label="Ações de Campanha pausada"`.

---

## 7. E2E logado — jobs Playwright falhando na main

**Workflow:** `E2E Tests (Playwright — logado)`  
**Branch:** `main`  
**Run com falha:** [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) (SHA `2d97c44`, 2026-10-24)  
**Jobs falhando:** 3 jobs Playwright (chromium, firefox, webkit) — todos falham no step `Run Playwright E2E (login real)`

**Causa:** Os testes E2E logados rodam contra a produção com credenciais reais. A falha não está
nos scripts de CI (nenhuma mudança nesta branch os tocou), mas em comportamento do produto que
os testes cobrem. Para identificar qual spec falha é necessário inspecionar os artefatos de
`test-results` do run.

**Por que não foi corrigido automaticamente:**  
Determinar a causa exige inspecionar os artefatos Playwright do run (traces, screenshots, logs de
falha de cada spec). Os specs E2E logados testam fluxos de UI contra dados reais de produção;
corrigir requer reprodução local com `bun run test:e2e -- --project=chromium-authenticated` e
revisão visual dos resultados.

**Ação necessária:**  
1. Baixar artefato `test-results` do run 40122006547 (ou disparar novo run e baixar desse).
2. Identificar quais specs falham e com qual erro.
3. Corrigir o spec ou o componente correspondente conforme a causa.

---

## 8. Deploy Functions — requer dispatch manual + aprovação humana

**Workflow:** `Deploy Edge Functions`  
**Branch:** `main`  
**Último run:** [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) (2026-10-24) — `failure`

**Causa:** O workflow `deploy-functions.yml` é `workflow_dispatch` exclusivamente — não roda em
push nem em merge. A falha no último run indica que o deploy das edge functions não foi concluído.
Merge em `main` NÃO sobe edge functions automaticamente (ver CLAUDE.md, seção "Deploy e edge functions").

**Por que não foi corrigido automaticamente:**  
Deploy de edge functions requer `workflow_dispatch` manual + aprovação humana no environment
`producao-edge-functions`. Não há trigger automático e o agente não pode aprovar environments.

**Ação necessária:**  
1. Verificar quais funções precisam ser (re)deployadas: comparar `supabase/functions/` com o
   estado atual em `https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/functions`.
2. Disparar `workflow_dispatch` do `deploy-functions.yml` na `main`.
3. Aprovar o job no environment `producao-edge-functions` no GitHub Actions.

---

## 9. DB Live Guard — falha na main (run 2026-10-19)

**Workflow:** `DB Live Guard`  
**Branch:** `main` (roda em push e agendado diariamente)  
**Último run:** [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) (2026-10-19) — `failure`

**Causa:** O `db-live-guard.yml` compara o schema ao vivo do banco com `schema-manifest.json`,
verifica paridade migrations↔ledger, regenera catálogo e manifesto, e abre/comenta uma issue com
label `db-live-guard` quando encontra divergência. O último run falhou — pode ser drift de schema
(novo DDL aplicado fora do fluxo), paridade quebrada, ou falha de conectividade com o banco oficial.

**Por que não foi corrigido automaticamente:**  
O diagnóstico requer ver os logs do run ao vivo e comparar com o estado atual do banco. Se houver
drift real, corrigir implica migration + registro no ledger, o que envolve decisão sobre o schema
(regra 8 quando for DDL destrutivo ou em produção).

**Ação necessária:**  
1. Inspecionar os logs do run 39212157834 para identificar qual step falhou e a mensagem exata.
2. Se for drift de schema: identificar a diferença entre `schema-manifest.json` e o banco ao vivo.
3. Corrigir a divergência: arquivo em `supabase/migrations/` → PR → merge → apply.
4. Disparar `workflow_dispatch` do `db-live-guard.yml` para confirmar green após a correção.

---

## 10. Unit Tests Shard 2/3 — falhas de timezone/config no CI (pré-existentes)

**Workflow:** `ci.yml` — `🧪 Unit Tests (2/3)`  
**Branch:** `claude_05/festive-carson-ub43wu` (PR #2246) — e também na `main`  
**Arquivo de teste 1:** `src/hooks/tasks/__tests__/workItemFormat.test.ts:123`  
**Arquivo de teste 2:** `src/components/configuracoes/__tests__/configuracoes.leituraErro.test.tsx:73`  
**Arquivo de teste 3:** `src/hooks/system/__tests__/useDiagnosticsData.select.test.ts:79`

**Erros exatos (run 40211737149):**
- `workItemFormat.test.ts:123` — `expected 'Hoje, 20:00' to be 'Hoje, 17:00'` — timezone: o CI roda em UTC; `2026-10-11T17:00:00-03:00` é 20:00 UTC. O teste usa horário local (UTC-3 Brazil) que passa na máquina do desenvolvedor.
- `configuracoes.leituraErro.test.tsx:73` — `expected undefined to be true`
- `useDiagnosticsData.select.test.ts:79` — `expected undefined to be 'down'`

**Nota:** O CI log do shard 2/3 apresentou erro em `useInboxFilters.type-url.test.tsx:137` — isto é misatribuição. O arquivo `useInboxFilters.type-url.test.tsx` em `ee05fe0` não tem assertion de data ("Hoje"); a falha real é `workItemFormat.test.ts:123`. Os 9 testes de PK-14 em `useInboxFilters.type-url.test.tsx` passam.

**Por que não foi corrigido automaticamente:**  
- `workItemFormat.test.ts`: o teste usa `now: AGOR_A` (data fixa) mas formata o resultado com fuso local — corrigir requer passar `timeZone` explícito para a função de formatação ou mockar o fuso no teste. Envolve decisão sobre a API de `formatWorkItemDate` (aceitar `timeZone` ou não).
- `configuracoes.leituraErro` e `useDiagnosticsData`: pré-existentes na `main`; causa não investigada nesta sessão (fora do escopo).

**Ação necessária:**  
1. Corrigir `workItemFormat.test.ts` para não depender do timezone do processo: usar `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` ou fixar o timezone no teste.
2. Investigar `configuracoes.leituraErro.test.tsx:73` e `useDiagnosticsData.select.test.ts:79`.

---

*Este arquivo deve ser atualizado ou removido após cada item ser resolvido.*
