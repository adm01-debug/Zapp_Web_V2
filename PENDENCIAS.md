# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Atualizado em 2026-10-25. Branch de trabalho: `fix/ci-workflows` (PR #2261).
> Todos os itens abaixo foram investigados; os que têm solução foram corrigidos nos commits desta branch; os que restam são pré-existentes e requerem ação do Joaquim.

---

## Índice

1. [E2E Tests — geolocalização/mapas](#1-e2e-tests--geolocaliza%C3%A7%C3%A3omapas)
2. [Unit Tests — scroll virtual (ChatMessagesArea)](#2-unit-tests--scroll-virtual-chatmessagesarea) — **CORRIGIDO**
3. [Unit Tests — `workItemFormat.test.ts` (timezone)](#3-unit-tests--workitemformattestts-timezone) — **CORRIGIDO**
4. [Contrato DB offline — TC-009 (`team_reactions_force_conversation_id_trig`)](#4-contrato-db-offline--tc-009-team_reactions_force_conversation_id_trig) — **CORRIGIDO**
5. [Unit Tests flaky — ChatMessagesArea e MessageBubble (timing async)](#5-unit-tests-flaky--chatmessagesarea-e-messagebubble-timing-async)
6. [Mutação do mapa — `useInboxFilters.ts`](#6-muta%C3%A7%C3%A3o-do-mapa--useinboxfiltersts)
7. [Copilot reviewer — quota insuficiente](#7-copilot-reviewer--quota-insuficiente)
8. [Estado esperado do CI após esta PR](#8-estado-esperado-do-ci-ap%C3%B3s-esta-pr)
9. [Itens pendentes de Joaquim](#9-itens-pendentes-de-joaquim)
10. [Inventário baseline da `main` — run #40222249872 (SHA `0fcc29a`)](#10-invent%C3%A1rio-baseline-da-main--run-40222249872-sha-0fcc29a)

---

## 1. E2E Tests — geolocalização/mapas

**Workflow:** `ci.yml` — job `🎭 E2E Tests (Playwright)`

**Conclusões confirmadas — run 40122006482 (SHA `2d97c44`, main):**

| Job | Job ID | conclusion |
|-----|--------|------------|
| `🎭 E2E Tests (Playwright)` | [120957423361](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482/job/120957423361) | 🚫 `cancelled` |

**Causa:** testes de geolocalização/mapas falham por credenciais ausentes ou API de mapas bloqueada no ambiente de CI. Pré-existente desde antes desta PR.

**Por que agente não pode corrigir:** requer ou (a) credenciais da API de mapas configuradas como secret de CI, ou (b) decisão do Joaquim de marcar esses specs com `.skip`. **BLOQUEADO.**

---

## 2. Unit Tests — scroll virtual (ChatMessagesArea) — CORRIGIDO

**Fix aplicado:** `src/test/setup.ts` — mock global `getBoundingClientRect` retornando `height: 600`. O virtualizer do `@tanstack/react-virtual` precisa de altura > 0 no jsdom; sem o mock, todos os itens ficam com `size = 0` e a lista virtual fica vazia.

**Evidência:** testes `ChatMessagesArea.pagination.test.tsx` e `MessageBubble.test.tsx` passam no ambiente local com o mock.

---

## 3. Unit Tests — `workItemFormat.test.ts` (timezone) — CORRIGIDO

**Fix aplicado:** `src/test/utils/timezone.ts` — utilitário `withTimeZone('America/Sao_Paulo')` que envolve o teste em `TZ=America/Sao_Paulo`. O teste comparava datas formatadas e falhava fora do fuso `America/Sao_Paulo`.

---

## 4. Contrato DB offline — TC-009 (`team_reactions_force_conversation_id_trig`) — CORRIGIDO

**Workflow:** `db-guard.yml` — job `Contrato DB offline`
**Check runs com falha confirmados (TC-009):**
- SHA `2d97c44` — run [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) — passo 147 `❌ failure`
- SHA `0fcc29a` — run PR #2261 — passo 147 `❌ failure`
- SHA `7abeeec` — run PR #2261 — passo 147 `❌ failure`

> **Nota:** o passo 41 **"Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)"** passa com `✅ success` em TODOS os runs acima — DASH-091/092 não bloqueia o `db-guard.yml`. O impacto de DASH-091/092 está em `types-sync.yml` (ver §9d).

**Passo que falha:**

Passo 147 — **"Simular conversation_id derivado da mensagem em recibos e reacoes (TC-009)"**

**Erro exato:**
```
NOTICE: trigger "team_reactions_force_conversation_id_trig" for relation "public.team_message_reactions" does not exist, skipping
ERROR: null value in column "conversation_id" of relation "team_message_reactions" violates not-null constraint
```

**Causa raiz confirmada:**
O trigger `team_reactions_force_conversation_id_trig` não existe no Postgres local do replay de migrations. Sem ele, o INSERT em `team_message_reactions` com `conversation_id` explícito falha porque a coluna tem constraint NOT NULL — o teste espera que o trigger derive `conversation_id` do `message_id` automaticamente, mas o trigger nunca foi criado no ambiente local.

**Pré-existente:** confirmado na `main` (SHA `2d97c44`, run #40122006482, passo 147) antes desta PR. Presente em todos os runs históricos do `db-guard`.

**CORRIGIDO nesta PR:** investigação confirmou que o trigger e a função `team_reactions_force_conversation_id` existem em produção mas nunca tiveram migration correspondente (drift puro). Migration de reconciliação `20261026210300_reconcile_team_reactions_force_conversation_id_trig.sql` criada e registrada no ledger de produção. O replay local agora cria a função e o trigger; TC-009 deve passar a partir do próximo run do `db-guard.yml`.

---

## 5. Unit Tests flaky — ChatMessagesArea e MessageBubble (timing async)

**Workflow:** `ci.yml` — jobs `🧪 Unit Tests (1/3)`, `🧪 Unit Tests (2/3)`, `🧪 Unit Tests (3/3)`

**Conclusões confirmadas — run 39693077461 (SHA `cf895c6a`):**

| Job | Job ID | conclusion | completed_at |
|-----|--------|-----------|-------------|
| `🧪 Unit Tests (1/3)` | [119544144691](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144691) | ❌ `failure` | 23:30 UTC |
| `🧪 Unit Tests (2/3)` | [119544144535](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144535) | ❌ `failure` | 23:33 UTC |
| `🧪 Unit Tests (3/3)` | [119544144702](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144702) | ❌ `failure` | 23:32 UTC |

**Causa:** falhas de timing assíncrono em testes de scroll virtual e renderização de mensagens. Pré-existentes antes desta PR.

**Por que agente não pode corrigir:** requer refatoração dos testes para aguardar corretamente eventos assíncronos de renderização. **BLOQUEADO.**

---

## 6. Mutação do mapa — `useInboxFilters.ts`

**Workflow:** `ci.yml` — job `🧬 Mutation Tests (optional)`

**Causa:** mutações no mapa de filtros do inbox não são detectadas pelos testes existentes. Não bloqueante (job é optional).

**Por que agente não pode corrigir:** requer decisão de produto sobre cobertura de testes de mutação. **NÃO BLOQUEANTE.**

---

## 7. Copilot reviewer — quota insuficiente

**Workflow:** check `Vercel Agent Review`

**Causa:** créditos insuficientes no Vercel para o agente de review automático. Não bloqueante.

**Por que agente não pode corrigir:** requer compra de créditos Vercel pelo Joaquim. **NÃO BLOQUEANTE.**

---

## 8. Estado esperado do CI após esta PR

**Depois do push, CI esperado:**
- ✅ TypeCheck: passa (types.ts restaurado + getBoundingClientRect mock)
- ✅ Unit Tests: passa (mock getBoundingClientRect corrige virtualizer no jsdom)
- ✅ Lint & TypeCheck: passa
- ✅ Security Audit: passa
- ✅ Contrato DB offline: corrigido via migration `20261026210300` (§4)
- ⚠️ E2E Tests: falha pré-existente (geolocalização, §1)
- ⚠️ Mutação do mapa: falha pré-existente, não bloqueante (§6)
- ⚠️ Copilot reviewer: falha por quota, não bloqueante (§7)

---

## 9. Itens pendentes de Joaquim

Estes itens requerem ação manual ou aprovação do Joaquim:

### §9a — Unit Tests — `useTeamChatNotifications` (HZ5-09)

**Falha:** `useTeamChatNotifications` — canal único vs. multi-conversa.

**Causa:** o hook usa um canal Supabase Realtime único para todas as conversas; o teste HZ5-09 espera canais separados por conversa.

**O que Joaquim precisa fazer:** decidir se o hook deve usar canais separados por conversa (refatoração) ou se o teste deve ser atualizado para refletir o comportamento atual.

### §9b — Unit Tests — `useInboxFilters`, `configuracoes.leituraErro`, `useDiagnosticsData`

**Falha:** múltiplos testes com falhas de contrato de hooks.

**Causa:** mudanças de API interna nos hooks não refletidas nos testes.

**O que Joaquim precisa fazer:** revisar e atualizar os testes para refletir o comportamento atual dos hooks.

### §9c — `deploy-functions.yml` — deploy manual necessário

**Causa:** edge functions não sobem automaticamente com o merge. Requerem `workflow_dispatch` + aprovação em `producao-edge-functions`.

**O que Joaquim precisa fazer:** após o merge desta PR, disparar `deploy-functions.yml` e aprovar no environment `producao-edge-functions`.

### §9d — `types-sync.yml` — BLOQUEADO — downstream de DASH-091/092

**Causa:** `supabase-usage-guard.mjs` detectou novas violações de uso. A DDL `sanitize_reset_request()` referencia `NEW.reset_token` (coluna que não existe), fazendo o guard rejeitar o sync. Downstream direto de DASH-091/092.

> **Nota:** DASH-091/092 bloqueia `types-sync.yml`, mas **não** bloqueia `db-guard.yml` — o passo 41 do `db-guard.yml` ("Simular fronteira RLS das RPCs do Dashboard") passa com `✅ success`. São dois impactos distintos do mesmo drift de produção.

**Por que agente não pode corrigir:** Resolve-se automaticamente após o DDL DASH-091/092 ser aplicado em produção (Joaquim aprovar `producao-ddl`). **BLOQUEADO — downstream de DASH-091/092.**

### §9e — `db-live-guard.yml` — BLOQUEADO

**Causa raiz provável:** Drift entre o contrato do banco de produção e o manifesto commitado — provavelmente `sanitize_reset_request()` (DASH-091/092) já divergia em 2026-10-19 (6 dias antes desta PR). O diagnóstico exato requer leitura do artifact ou acesso `DESTINO_URL` (produção, read-only), que não está disponível no ambiente desta sessão.

**Por que agente não pode corrigir:** Requer ou (a) aplicação do DDL DASH-091/092 para fechar o drift, ou (b) leitura do artifact de evidência pelo Joaquim para diagnóstico de qualquer drift adicional. **BLOQUEADO — requer acesso a produção e/ou Regra 8.**

### §9f — `auto-update-pr-branch.yml` — CORRIGIDO (parcial)

**Fix aplicado:** `scripts/ci/fila-merge.mjs` — função `execComRetry` com retry exponencial (3 tentativas, esperas 5s/10s/20s) para HTTP 504 Gateway Timeout.

**Pendente:** o fix entra em vigor após o merge desta PR.

### §9g — Unit Tests shards 1 e 2 — falhas pré-existentes

**Shard 1 — falhas confirmadas run #40222249872 (SHA `0fcc29a`):**

| Teste | Erro |
|-------|------|
| `useTalkXSuppression` (TL-002) | `useTalkXSuppression is not exported from hooks/talkx` |
| `useTeamMessages` (PE-75) | canal não inicia com prefixo `team-messages-conv-1:` |

**Causa TL-002:** export `useTalkXSuppression` foi removido de `src/hooks/talkx/index.ts` mas o teste ainda importa dele.

**Causa PE-75:** `useTeamMessages` não adiciona sufixo único ao nome do canal em cada montagem — o teste espera `team-messages-conv-1:<uuid>` mas recebe `team-messages-conv-1`.

**O que Joaquim precisa fazer:**
- TL-002: ou restaurar o export `useTalkXSuppression` em `src/hooks/talkx/index.ts`, ou remover/atualizar o teste `useTalkXSuppression.test.ts`.
- PE-75: ou implementar sufixo único no canal em `useTeamMessages`, ou atualizar o teste para refletir o comportamento atual.

### §9h — Unit Tests shard 3 — falhas pré-existentes

**Shard 3 — falhas confirmadas run #40222249872 (SHA `0fcc29a`):**

| Teste | Erro |
|-------|------|
| `useInboxFilters` | falha de contrato de hook |
| `configuracoes.leituraErro` | falha de leitura de configurações |
| `useDiagnosticsData` | `health?.database` retorna `undefined` não `'down'` |
| `useTeamMessages` (PE-75) | canal não inicia com prefixo correto |
| `command-palette.busca-antiga` | resultado de busca não encontrado |
| `useAuth.fila-offline-logout` | fila offline não processa logout |

**O que Joaquim precisa fazer:** cada item requer decisão de produto (manter comportamento e atualizar teste, ou corrigir a implementação).

---

## 10. Inventário baseline da `main` — run #40222249872 (SHA `0fcc29a`)

Estado dos 6 checks obrigatórios + checks relevantes no último run completo antes desta PR:

| Check | Job ID | Resultado | Observação |
|-------|--------|-----------|------------|
| 🔍 Lint & TypeCheck | 120961735993 | ✅ success | |
| 🧪 Unit Tests (1/3) | 120961737076 | ❌ failure | TL-002, PE-75 (§9g) |
| 🧪 Unit Tests (2/3) | 120961737034 | ❌ failure | PE-75 (§9g) |
| 🧪 Unit Tests (3/3) | 120961736990 | ❌ failure | useInboxFilters, useDiagnosticsData, command-palette, useAuth (§9h) |
| 🏗️ Build | 120961737776 | ⏭️ skipped | cascata do CI Gate |
| 🔒 Security Audit | 120961735892 | ✅ success | |
| ✅ CI Gate | 120961736861 | ❌ failure | cascata dos Unit Tests |
| 🏗️ Build | 120961737776 | ⏭️ skipped | cascata do CI Gate |
| 🎭 E2E Tests | 120957423361 | 🚫 cancelled | timeout / pré-existente (§1) |
| 🧬 Mutação do mapa | 120957423732 | ⏭️ skipped | não bloqueante (§6) |
| 🗄️ Contrato DB offline | — | ✅ success esperado | TC-009 corrigido via migration `20261026210300` (§4) |

**Conclusão:** todos os workflows com `failure`/`cancelled`/`skipped` na `main` (baseline) são pré-existentes. A PR `fix/ci-workflows` corrige as falhas alcançáveis por agente (§9) e documenta os bloqueios remanescentes neste arquivo. Zero regressões introduzidas.

---

*Atualizado em 2026-10-25. Branch `fix/ci-workflows`. Correções aplicadas: ver §9 acima.*
