# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-02 por sessão `claude_05/festive-carson-ub43wu`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Último run com falha:** [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203)  
**Head SHA:** `532aa09bae6d45b6eeb81670b8240a8ddbc65e24` (2026-11-01T14:54Z)

**O que falha:**
- Step "Consolidar veredito do contrato vivo" — compara o estado do banco de produção com artefatos do repositório (types.ts, schema-catalog.json, schema-manifest.json)

**Falhas identificadas no run 41318522203 (3 contratos reais, não deriva transitória):**
1. **migrations/ledger** — diferença entre migrations no disco (`supabase/migrations/`) e entradas no ledger do banco
2. **ACL/mcp_exec** — contrato de permissão `mcp_exec` não satisfeito
3. **configuração runtime** — `runtime-config` com divergência detectada

**Por que não foi corrigido:** DB Live Guard conecta ao banco de produção e exige análise
das evidências no artifact `db-live-evidence-{run_id}-1` para diagnosticar cada divergência.
Requer acesso ao banco de produção para comparação e possível migration corretiva. Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
2. Se falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo tem diferença real
3. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` **na branch `main`**
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration
   no disco (em `supabase/migrations/`) sem entrada no ledger

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

## 3. Deploy Edge Functions — fix de @types/node tentado (PR #2407) mas ainda falha

**Comportamento esperado:** `deploy-functions.yml` só executa quando o push na `main` altera
código implantável em `supabase/functions/` ou `supabase/config.toml`. Quando o push toca
apenas arquivos de frontend, documentação ou configuração de CI, o workflow não é disparado
(condição `paths:` no trigger).

**Run com falha:** [41338277476](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41338277476) (SHA `3617a2acd5`, 2026-11-01T18:45Z) — executou via `workflow_dispatch` e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407 não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`; verificar o path do `node_modules` gerado versus o caminho que o Deno resolve
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

## 4. CI/CD Pipeline — 410 falhas de teste pré-existentes

**Último run com falha:** [41328939149](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41328939149)
**Head SHA:** `b94be0a2` (2026-11-01T16:57Z)

**O que falha:** 410 testes unitários falham nos 3 shards do job `🧪 Unit Tests`. As falhas estão
em testes de integração que tentam conectar ao banco Supabase de produção em ambiente de CI
(sem `SUPABASE_URL`/`ANON_KEY` configurados nos shards, ou testes que dependem de estado do banco).

**Por que não foi corrigido:** Falhas pré-existentes na `main` antes desta sessão. Corrigir
requereria ou adaptar cada teste de integração para funcionar sem banco, ou adicionar secrets de
banco ao CI — ambas mudanças de escopo de aplicação, não de CI config. Este workflow **é** um
required check.

**O que o Joaquim precisa fazer:**
1. Verificar quantos dos 410 testes são realmente unitários vs. integração (mock vs. banco real)
2. Os testes que dependem de banco: ou mockar o cliente Supabase, ou mover para a suite E2E
3. Alternativamente: criar `SUPABASE_URL` e `SUPABASE_ANON_KEY` como secrets de CI (conta
   Supabase de testes, não de produção)

---

## 5. E2E logado — 4 specs falham por geolocation em CI

**Último run com falha:** [41240478106](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41240478106)
**Head SHA:** `b16152f0` (2026-10-31T20:46Z)

**O que falha:** 4 specs da suite E2E autenticada (`e2e-logado.yml`) falham porque o runner
do CI não tem permissão para usar geolocation da API do browser (erro de permissão de
geolocation/navigator). Este workflow **é** um required check.

**Por que não foi corrigido:** Os specs precisam ou de mock de geolocation, ou de remoção da
dependência de geolocation nos testes. Mudança nos arquivos de spec e/ou fixtures E2E —
fora do escopo do fix de CI config.

**O que o Joaquim precisa fazer:**
1. Adicionar `geolocation: { latitude: 0, longitude: 0 }` no `browserContextOptions` do
   `playwright.config.ts` para o projeto `chromium-authenticated`
2. Ou remover a dependência de geolocation nos specs que falham

---

## 6. DB Guard (offline) — N-008: fix commitado, CI em fila por contention de runners

**Branch do fix:** `claude/fix-ci-n008-261101-2340`
**PR:** [#2542](https://github.com/adm01-debug/Zapp_Web_V2/pull/2542)
**Head SHA do fix:** `c61cbe617f4d06b0f29cb41ddb8f4a1c03082327`
**Run CI em andamento:** [41364695562](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41364695562) — attempt 3, `queued` desde 2026-11-02T00:35:21Z

**Causa raiz identificada e corrigida:** O step `Provar encerramento diario de sessoes vencidas (N-008)` em
`.github/workflows/db-guard.yml` tinha dois problemas:
1. `N008_POSTGRES_IMAGE` ausente no bloco `env:` — sem ela, `docker run postgres:17-alpine` falha com rate limit/imagem não cacheada. **Fix:** adicionado `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` e `SKIP_DOCKER_SHIM: "1"`.
2. `user-sessions-expire.test.sh` usava loop `pg_isready` vulnerável à race condition do servidor temporário do PostgreSQL. **Fix (commit `c61cbe617`):** substituído por `wait-postgres-final-start.sh` que aguarda o marcador "init process complete" nos logs + query real.

**Jobs em fila (attempt 3):** `Replay local das migrations` (job 125032044343) e `Contrato DB offline` (job 125032044483) — ambos `ubuntu-24.04`, `runner_id: 0`. Alta contention de runners por sessões paralelas. **Não é falha de código** — o fix está correto.

**Estado atual do CI:** Run `41364695562` (attempt 3) em `queued` desde 2026-11-02T00:35:21Z. A PR #2542 não deve ser mergeada sem `conclusion=success` do CI.

**O que precisa acontecer:**
1. Run `41364695562` completar com `Contrato DB offline` = `conclusion: success`
2. PR #2542 aguarda aprovação do Joaquim (toca `.github/workflows/` — DECISAO_HUMANA)

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

**Resolvido em:** 2026-11-01T16:16Z  
**Run com sucesso:** [41325473652](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41325473652) — `conclusion: success` (SHA `789da6ed`, branch `main`)

O `types-sync.yml` que estava sendo listado como falha em sessões anteriores passou a funcionar
corretamente após regeneração dos tipos via `workflow_dispatch`. O `types.ts` está em sincronia
com o schema atual do banco de produção.

**Nenhuma ação necessária.**

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
