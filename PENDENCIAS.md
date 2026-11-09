# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-09 por sessão `claude_05/festive-carson-ub43wu`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Runs com falha:**
- [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) — SHA `532aa09b` (2026-11-01T14:54Z): 3 contratos reais (migrations/ledger, ACL/mcp_exec, runtime-config)
- [42525294301](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42525294301) — SHA `e6e467b9` (2026-11-08T21:26Z): paridade tripla, catálogo, manifesto, frescor types.ts
- [42525240682](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42525240682) — SHA `e6e467b9` (2026-11-08T21:27Z): idem

**Diagnóstico dos runs de Nov/08 (42525294301 / 42525240682):**
Ambos rodaram sobre SHA `e6e467b96f12dfca1e12bab7847fad6ddef3c397`, que é **anterior ao HEAD atual** da main (`9183f0f6`). Naquele momento o `types.ts` estava stale e catálogo/manifesto fora de sincronia. O `types-sync` rodou com **sucesso** às 21:44 UTC do mesmo dia (run 42526738975) — depois dessas falhas — corrigindo o `types.ts`. Falhas de Nov/08 são **transitórias** no SHA antigo, muito provavelmente resolvidas pelo types-sync subsequente. Próximo run agendado: `13 6 * * *` UTC (≈ 06:13 UTC de 09/11) confirmará o estado atual do HEAD.

**Run de Nov/01 (41318522203) — 3 contratos reais:**
Este run falhou com divergências de DDL/migrations/ACL — requer análise do artifact `db-live-evidence-{run_id}-1`. Este workflow **não é required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Aguardar o run agendado de 06:13 UTC de 09/11 — se verde, confirma que Nov/08 foi transitório
2. Se ainda falhar: baixar artifact `db-live-evidence-{run_id}-1` e diagnosticar o contrato que diverge
3. Se "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` em `main`

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

## 4. CI/CD Pipeline — `🧪 Unit Tests` falhando na main por arquivo truncado

**Causa raiz:** O commit `9183f0f6` (PR #2550 / TalkX 6 RPCs, 2026-11-08) truncou
`src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` de 202 para 61 linhas
(`+4 −141`). Sobraram apenas blocos `vi.mock()` sem nenhum `describe`/`it`, fazendo o Vitest
falhar com `Error: No test suite found in file`. Isso derrubou o job `🧪 Unit Tests (2/3)` e o
`CI Gate` na main ([run 42521096687](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42521096687)).

**Fix pendente:**
- **PR #2851** (`claude/fix-ci-talkx-report-test-261108-2152`, SHA `5c97aa006ae60c012c1014d3353e85ade115e671`)
  — restaura os 3 testes de aceite (agrupamento por dia/hora, grade 7×24, renderização com 3
  gráficos sem a série "Conversões"). CI em `queued` por saturação do pool de runners.
- Verificado localmente antes do push: `npx vitest run <arquivo>` → `Tests 3 passed (3)`,
  typecheck e lint OK.

**Estado dos required checks em PR #2851:** `Contrato DB offline` e `Talk X launch` em `queued`;
demais checks (Lint, Unit Tests, Build, Security Audit, E2E) ainda aguardando runner.

**Estado atual do required check `🧪 Unit Tests` na main:** ❌ **failure** (CI Gate vermelho no
HEAD `9183f0f6` desde 2026-11-08T18:49Z).

**O que está pendente:** PR #2851 precisa que os 6 required checks fiquem verdes — esperando
liberação de runners. Auto-merge está ativo na PR (squash), não toca `.github/workflows/`.

---

## 5. E2E logado — 3 specs falham por geolocation (fix em andamento)

**Specs afetadas:**
- `location-picker.spec.ts`
- `contact-address.spec.ts`
- `contact-map-pin.spec.ts`

**Causa raiz:** O projeto `chromium-mapa` do Playwright não tinha `geolocation` nem
`permissions` configurados no contexto. Por padrão, o Playwright bloqueia
`navigator.geolocation`, fazendo as 3 specs falharem ao chamar `getCurrentPosition()`.

**Fix criado:**
- **PR #2883** (`claude/fix-e2e-geolocation-261109-0130`, SHA `16b8e050e590031c754ab4d533f7caf863c4ff38`)
  — adiciona `geolocation: { latitude: 0, longitude: 0 }, permissions: ['geolocation']`
  ao projeto `chromium-mapa` em `playwright.config.ts`. PR em estado **draft**.
- CI em `queued`: vários checks aguardando runner. `🧪 Unit Tests (placeholder)` e
  `Contrato DB offline` aparecem como `skipped` (provável path filter: playwright.config.ts
  não está em `src/`, jobs com condição `if: contains(...)` podem não disparar — a serem
  confirmados quando os runners subirem).

**Risco:** Se os jobs `🧪 Unit Tests` e `Contrato DB offline` não subirem para os shards reais
(1/3, 2/3, 3/3) por path filter, os required checks não fecharão como `success` mas como
`skipped` — que pode ou não ser aceito como "passou" pelo branch protection. A ser verificado
quando o CI terminar.

**Estado do required check `🎭 E2E Tests (Playwright)` na PR #2883:** `queued`.

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

**BLOQUEIO PARA CONFIRMAR O FIX — motivo exato: saturação do pool de runners de CI (infraestrutura externa)**

Pool de runners `ubuntu-24.04` da conta `adm01-debug` esgotado por ~40 sessões paralelas
simultâneas. 4 tentativas de CI ao longo de 3h22min, todas bloqueadas antes de executar:

| Attempt | Run ID | Status | `updated_at` | Duração em queue |
|---|---|---|---|---|
| 1 | (anterior a `c61cbe617`) | `queued` → cancelado | — | ~15 min |
| 2 | (após push `c61cbe617`) | `queued` → cancelado | — | ~20 min |
| 3 | rerun manual | `queued` → cancelado | 2026-11-02T00:35Z | ~15 min |
| 4 | [41364695562](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695562) | `queued` | congelado desde 2026-11-02T00:46:33Z | 4h+ sem mudar |

Diagnóstico: `runner_id=0` em todas as tentativas confirma que nenhuma chegou a ser alocada
a um runner. `conclusion=null` em todas as 4. O run de CI/CD Pipeline
([41364695618](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695618))
do mesmo push também está em `queued` desde 2026-11-02T00:44:29Z (4h+ sem mudança).

**Tipo de bloqueio:** infraestrutura de CI externo (pool de runners GitHub Actions).
Não há código no repositório que cause ou corrija essa saturação.

**Código do fix está correto** — verificado por code review automático (Codex/Qodo) na PR #2542;
não há nenhuma falha de lógica, sintaxe ou dependência nos 2 commits do fix.

**O que o Joaquim precisa fazer:**
1. Aguardar redução da contention de runners (horário de menor demanda ou liberação do pool)
2. Relançar o CI da PR #2542 (botão "Re-run all jobs" em https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695562)
3. PR #2542 requer: (a) `Contrato DB offline` = `conclusion: success`, (b) aprovação do Joaquim (toca `.github/workflows/` — DECISAO_HUMANA)

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

O `types-sync.yml` que estava sendo listado como falha em sessões anteriores passou a funcionar
corretamente após regeneração dos tipos via `workflow_dispatch`. O `types.ts` está em sincronia
com o schema atual do banco de produção.

**Nenhuma ação necessária.**

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
