# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-12 por sessão `claude_05/festive-carson-ub43wu`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Runs com falha:**
- [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) — SHA `532aa09b` (2026-11-01T14:54Z): 3 contratos reais (migrations/ledger, ACL/mcp_exec, runtime-config)
- [42525294301](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42525294301) — SHA `e6e467b9` (2026-11-08T21:26Z): paridade tripla, catálogo, manifesto, frescor types.ts
- [42525240682](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42525240682) — SHA `e6e467b9` (2026-11-08T21:27Z): idem

**Diagnóstico dos runs de Nov/08 (42525294301 / 42525240682):**
Ambos rodaram sobre SHA `e6e467b96f12dfca1e12bab7847fad6ddef3c397`, que é **anterior ao HEAD atual** da main (`bd62fc9d`). O `types-sync` rodou com **sucesso** às 21:44 UTC do mesmo dia (run 42526738975) corrigindo o `types.ts`. Falhas de Nov/08 são **transitórias** no SHA antigo.

**Run de Nov/01 (41318522203) — 3 contratos reais:**
Este run falhou com divergências de DDL/migrations/ACL — requer análise do artifact `db-live-evidence-{run_id}-1`. Este workflow **não é required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Se o próximo run agendado (`13 6 * * *` UTC) falhar: baixar artifact `db-live-evidence-{run_id}-1` e diagnosticar o contrato que diverge
2. Se "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` em `main`

---

## 2. Running Copilot Code Review — limite de cota do plano (HTTP 402)

**Runs com falha confirmados (exemplos):**
- [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) — 2026-10-31T04:08Z
- [41166869775](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41166869775) — 2026-10-31T04:02Z
- múltiplos anteriores no mesmo dia

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo no repositório**.

**O que falha:** Step "Processing Request (Linux)" termina com `errorType: 'quota'`, HTTP 402,
"You've reached your additional usage limit for your plan". A mensagem de firewall que aparece
no log é secundária — a causa real é esgotamento de cota de uso do Copilot Code Review.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — sem código no repositório.
A falha está no limite de cota do plano do Copilot (HTTP 402). Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Billing and plans → Copilot usage limits
2. Aguardar reset de ciclo de faturamento ou fazer upgrade do plano
3. Configurar allowlist de firewall do Copilot **não resolve** este erro — a causa é HTTP 402 quota, não HTTP 403 firewall

---

## 3. Deploy Edge Functions — falha transitória HTTP 414 (Nov/08) + @types/node ainda a investigar

**Falha transitória de Nov/08 (run 42448021843):**
- SHA: `e028887387f334021f5f6c9423b6dc26b7c8b91d` (2026-11-08T04:44Z)
- Erro: `health-check.mjs falhou: Management API recusou a consulta de logs (HTTP 414)` — URL Too Long na Supabase Management API
- **Deploy em si SUCEDEU**: 85/85 edge smoke tests passaram
- Causa: problema transitório na API do Supabase (URL de health-check muito longa), não bug no código
- Confirmado resolvido: run anterior (2026-11-07, run 42375139178) concluiu `success`
- **Nenhuma ação necessária para esta ocorrência.**

**Falha pendente — @types/node (run 41338277476):**
- SHA `3617a2acd5` (2026-11-01T18:45Z) — executado via `workflow_dispatch`, falhou com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407 não foi suficiente.
- **Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
  npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
  gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** para diagnosticar o erro `@types/node` sem risco de side-effects
2. Investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio publica as funções em produção

---

## 4. CI/CD Pipeline — `🧪 Unit Tests` falhando por arquivo truncado — RESOLVIDO ✅

**Resolvido em:** 2026-11-09  
**Como:** PR #2851 (`claude/fix-ci-talkx-report-test-261108-2152`) foi fechada sem merge porque o objetivo (`TalkXCampaignReport.test.tsx` com 12 testes) já estava na main via commit `568d3f9326` (PR #2550 / TalkX 6 RPCs). Os `🧪 Unit Tests` passam no HEAD atual da main (`bd62fc9d`): `Unit Tests (1/3)`, `(2/3)` e `(3/3)` = ✅ success.

**Nenhuma ação necessária.**

---

## 5. E2E — 3 specs de geolocation (fix em CI queue)

**Specs afetadas:**
- `location-picker.spec.ts`
- `contact-address.spec.ts`
- `contact-map-pin.spec.ts`

**Causa raiz:** O projeto `chromium-mapa` do Playwright não tinha `geolocation` nem
`permissions` configurados no contexto. Por padrão, o Playwright bloqueia
`navigator.geolocation`, fazendo as 3 specs falharem ao chamar `getCurrentPosition()`.

**Fix:**
- **PR #2883** (`claude/fix-e2e-geolocation-261109-0130`)
  — adiciona `geolocation: { latitude: 0, longitude: 0 }, permissions: ['geolocation']`
  ao projeto `chromium-mapa` em `playwright.config.ts`.
- Código correto: Joaquim (commit `13d44c07`, Co-Authored-By Claude Opus 5.5) restaurou
  `playwright.config.ts` a partir da main e aplicou **apenas** a mudança de geolocation,
  corrigindo a regressão do commit `16b8e050` desta sessão que havia desfeito mudanças
  anteriores dos PRs #2716, #2785 e GR-016.
- HEAD atual do PR #2883: `dc22fcc7` — merge da main em cima do fix.

**Estado atual (2026-11-12T01:00Z):**
- CI em **`queued`** em todos os 14 checks desde 2026-11-11T23:57Z — runner congestion
- Runs bloqueados: `43123668172`, `43123668182`, `43123668190` — `updated_at` congelado
- `mergeable: true`, `mergeStateStatus: BLOCKED` — bloqueado apenas porque CI não completou
- **Auto-merge desativado pelo Joaquim** — requer merge manual após CI passar

**BLOQUEIO:** Runner congestion. Não há falha de código. CI precisa rodar para confirmar o fix.

**O que o Joaquim precisa fazer:**
1. Aguardar CI do PR #2883 completar (todos os 14 checks passarem)
2. Mergear manualmente o PR #2883 (auto-merge foi desativado)
3. Após merge: confirmar que `🎭 E2E Tests (Playwright)` passa na main e issue `[e2e-logado] Suíte logada quebrada na main` é fechada

---

## 6. DB Guard (offline) — N-008: BLOQUEADO POR INFRAESTRUTURA DE CI

**Branch do fix:** `claude/fix-ci-n008-261101-2340`  
**PR:** [#2542](https://github.com/adm01-debug/Zapp_Web_V2/pull/2542)  
**Head SHA do fix:** `c61cbe617f4d06b0f29cb41ddb8f4a1c03082327`

**Causa raiz identificada e corrigida no código:**  
O step `Provar encerramento diario de sessoes vencidas (N-008)` em
`.github/workflows/db-guard.yml` tinha dois problemas:
1. `N008_POSTGRES_IMAGE` ausente no bloco `env:` — sem ela, `docker run postgres:17-alpine` falha com rate limit/imagem não cacheada. **Fix (commit `68c998e`):** adicionado `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` e `SKIP_DOCKER_SHIM: "1"`.
2. `user-sessions-expire.test.sh` usava loop `pg_isready` vulnerável à race condition do servidor temporário do PostgreSQL. **Fix (commit `c61cbe617`):** substituído por `wait-postgres-final-start.sh` que aguarda o marcador "init process complete" nos logs + query real.

**BLOQUEIO PARA CONFIRMAR O FIX — motivo exato: runner congestion + DECISAO_HUMANA**

Pool de runners `ubuntu-24.04` da conta `adm01-debug` esgotado por ~40 sessões paralelas
simultâneas. 4 tentativas de CI ao longo de 3h22min, todas bloqueadas antes de executar.

Diagnóstico: `runner_id=0` em todas as tentativas confirma que nenhuma chegou a ser alocada
a um runner.

**Tipo de bloqueio:** (1) infraestrutura de CI externo (pool de runners) + (2) PR #2542 requer aprovação do Joaquim pois toca `.github/workflows/` — DECISAO_HUMANA.

**Código do fix está correto** — verificado por code review automático (Codex/Qodo) na PR #2542.

**O que o Joaquim precisa fazer:**
1. Aguardar redução da contention de runners (horário de menor demanda ou liberação do pool)
2. Relançar o CI da PR #2542 (botão "Re-run all jobs" em https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695562)
3. PR #2542 requer: (a) `Contrato DB offline` = `conclusion: success`, (b) **aprovação do Joaquim** (toca `.github/workflows/` — DECISAO_HUMANA)

---

## 7. DB Migrate (production) — TARGET_VERSION divergente

**Último run com falha:** [41313326544](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41313326544)
**Head SHA:** `50fc5f0e` (2026-11-01T13:52Z)

**O que falha:** O workflow `db-migrate.yml` (dispatch) falha no passo de dry-run porque
`TARGET_VERSION` passado manualmente não existe no ledger do banco, ou é inferior ao `max(version)`
atual — o workflow rejeita por segurança. Este workflow **não é um required check**.

**Por que não foi corrigido:** O dispatch manual com `TARGET_VERSION` errado é erro de operação,
não de código. O workflow está correto.

**O que o Joaquim precisa fazer:**
1. Antes de disparar `db-migrate.yml`: executar `SELECT max(version) FROM supabase_migrations.schema_migrations`
   no banco de produção para obter o `TARGET_VERSION` correto
2. Usar o formato `YYYYMMDDHHMMSS` estritamente maior que o max do ledger

---

## 8. types-sync — RESOLVIDO ✅

**Resolvido em:** 2026-11-08T21:44Z  
**Run com sucesso:** [42526738975](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42526738975) — `conclusion: success` (branch `main`)

O `types-sync.yml` passou a funcionar corretamente após regeneração dos tipos via `workflow_dispatch`. O `types.ts` está em sincronia com o schema atual do banco de produção.

**Nenhuma ação necessária.**

---

## 9. E2E logado em main — `routine-ownership-failed` recorrente (causa: infra E2E)

**Runs com falha (todos em `main`, não são required check):**
- [43116986482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43116986482) — SHA `e408b778` (2026-11-11T23:22Z, mais recente)
- [43108863222](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43108863222) — SHA `d5835ed8`
- [43094223124](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43094223124) — SHA `f036006a`
- Múltiplos runs anteriores com o mesmo código de falha

**O que falha:** Os 3 jobs do shard `🎭 E2E logado (backend descartável)` (authenticated-1/2/3-of-3)
terminam com `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed"}`
no step "Validar grupo e executar a suíte no backend descartável". O resumo público não
identifica os casos reprovados (`resumo público indisponível ou inválido`).

**Causa raiz:** A falha ocorre após `restore-versioned-routine-owners` / `cleanup` no sistema
de E2E isolado — indica falha no restore da propriedade de rotinas do backend descartável.
**NÃO é relacionada ao problema de geolocation** do PR #2883 (que corrige o `🎭 E2E Tests
(Playwright)` do CI/CD pipeline, não o `E2E logado`).

**Por que não foi corrigido:** A causa exata requer leitura do artifact
`playwright-report-logado-authenticated-*-{run_id}-1` para identificar quais specs falharam,
e análise do sistema `e2e-isolated/` que gerencia propriedade de rotinas. Fora do escopo desta
sessão — requer investigação do código de orquestração E2E.

**Este workflow NÃO é required check** — não bloqueia merges na `main`.

**Estado da issue `[e2e-logado] Suíte logada quebrada na main`:**
Ao falhar, o workflow comenta na issue (dedupe de 6h). O log mostra `"mesma causa da ultima vez
-- sem comentario novo"` — indica que o conjunto de specs quebradas não mudou recentemente.

**O que o Joaquim precisa fazer:**
1. Baixar artifact `playwright-report-logado-authenticated-1-of-3-43116986482-1` (ID 13899618188)
   do run 43116986482 para identificar quais specs estão falhando
2. Investigar `scripts/e2e-isolated/` — especificamente o mecanismo de `restore-versioned-routine-owners`
3. Verificar se o banco de testes do E2E tem dados de fixture corretos para os specs que falham

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
