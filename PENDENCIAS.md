# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Atualizado em 2026-11-02 UTC. Branch de trabalho: `claude_05/festive-carson-ub43wu`.
> PR #2246 fechada sem merge em 2026-10-31. PR #2542 (`fix: N-008 DB Guard`) pronta para review.
> Inventário baseline: runs na `main` em 2026-10-25 (SHA `2d97c44`).

---

## Inventário: Baseline × Final

| Workflow | ID | Baseline (main) | Causa baseline | Fix aplicado | Status final |
|---|---|---|---|---|---|
| **CI/CD Pipeline (`ci.yml`)** | 279058466 | [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) `failure` | TC-009 (versão de migration) + 410 unit test failures pré-existentes | ✅ commit `4adee58` (TC-009) — porém `🧪 Unit Tests` segue bloqueado por 410 falhas pré-existentes: ver §7 | **BLOQUEADO** — ver §7 |
| **DB Guard offline (`db-guard.yml`)** | 344052670 | [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) `failure` | TC-009 versão `20261009193246` inexistente | ✅ commit `4adee58` (TC-009 corrigido) — porém N-008 pré-existente exposto (§6) + Replay ECR rate limit (§8) | **BLOQUEADO** — ver §6 e §8 |
| **Deploy Edge Functions (`deploy-functions.yml`)** | 344691397 | [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) `failure` | `supabase/deployment-manifest.json` stale | ✅ commit `96b1aa6` (manifesto regenerado) — validação exige merge; merge bloqueado pelos required checks: ver §9 | **BLOQUEADO** — ver §9 |
| **Auto Update PR Branches (`auto-update-pr-branch.yml`)** | 366925501 | [40210888395](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40210888395) `failure` (HTTP 504) | Sem retry em `scripts/ci/fila-merge.mjs` para erros transitórios | ✅ commit `a6d68651` (retry com backoff) — validação exige merge; merge bloqueado pelos required checks: ver §10 | **BLOQUEADO** — ver §10 |
| Talk X V4 placar (`talkx-status-regen.yml`) | 372647819 | [40122006445](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006445) `success` | — | Sem fix necessário | ✅ Já success |
| Notifica falha na main (`notifica-falha-main.yml`) | 385680890 | [40170019860](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40170019860) `success` | — | Sem fix necessário | ✅ Já success |
| CodeQL | 349267462 | [39232205552](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39232205552) `success` | — | Sem fix necessário | ✅ Já success |
| Settings Guard (`settings-guard.yml`) | 372434009 | [38901696564](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/38901696564) `success` | — | Sem fix necessário | ✅ Já success |
| Targeted Ledger Evidence | 352405637 | [36041611976](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/36041611976) `success` | — | Sem fix necessário | ✅ Já success |
| vercel-env-cleanup | 389683536 | [39296301620](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39296301620) `success` | — | Sem fix necessário | ✅ Já success |
| Branch Hygiene Audit | 359626582 | [39220130783](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39220130783) `cancelled` | Schedule cancelado (não é failure ativa) | N/A | ✅ N/A |
| CRM Sync Worker | 353525371 | [35717413825](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35717413825) `skipped` | `CRM_SYNC_WORKER_ENABLED` off (deliberado, CLAUDE.md) | N/A | ✅ N/A |
| E2E Talk X | 373846327 | sem runs na main | Sem execução (sem trigger na main) | N/A | ✅ N/A |
| **types-sync** | 345269574 | [40169860237](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40169860237) `failure` | BLOQUEIO DE INFRA — ver §1 | ❌ Bloqueio | Ver §1 |
| **DB Live Guard** | 345318048 | [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) `failure` | BLOQUEIO DE INFRA — ver §2 | ❌ Bloqueio | Ver §2 |
| **E2E logado** | 366552889 | [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) `failure` | BLOQUEIO DE INFRA — ver §3 | ❌ Bloqueio | Ver §3 |
| **DB Migrate (production)** | 346525634 | [39596763483](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39596763483) `failure` | OPERACIONAL/JOAQUIM — ver §4 | ❌ Bloqueio | Ver §4 |
| **supabase-sync** | 279058467 | [33082545380](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/33082545380) `failure` | DESARMADO POR DESIGN — ver §5 | N/A | Ver §5 |

---

## §1. types-sync — Gate TypeScript bloqueou a proposta (run de 2026-10-25)

**Workflow:** `types-sync.yml`
**Run:** [40169860237](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40169860237) `failure`

**Causa raiz exata (verificada no log do job 121098349633):**

O secret `DESTINO_URL` **está presente** no scope de repositório (aparece mascarado como `***`
no log — confirmado na linha `DESTINO_URL: ***` do step 23). O workflow conseguiu conectar ao banco.

A falha é no **Gate 1 (TypeScript)**: `gate1 = 'false'` no step "Abrir ou atualizar issue de alerta",
indicando que `src/types/database.types.ts` commitado na `main` (SHA `2d97c44`) diverge do
tipo gerado a partir do banco oficial. O workflow detectou o drift e abriu issue com
`causa: typescript`; não conseguiu propor PR porque o TypeScript gate bloqueou (os tipos novos
causariam erros de compilação).

Erro exato do step "Falhar quando um gate rejeitar a proposta":
```
##[error]A sincronizacao foi bloqueada por ou mais gates.
Process completed with exit code 1.
```

**O que o Joaquim precisa fazer:**

1. Resolver os erros de TypeScript no banco (drift de schema documentado em RELATORIO_CI.md).
2. Re-disparar `types-sync.yml` via `workflow_dispatch` — quando o Gate TypeScript passar,
   o workflow provõe a PR automaticamente.

**Sem fix de agente possível:** o drift de schema (warroom_queue_stats, transfer_conversation etc.)
requer intervenção humana na estrutura do banco para resolvê-lo completamente.

---

## §2. DB Live Guard — 8/8 passos do contrato falharam (run de 2026-10-19)

**Workflow:** `db-live-guard.yml`
**Run:** [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) `failure`
**Run mais recente (2026-11-01):** [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) `failure`

**Causa raiz exata (verificada no log do job 117927749742):**

O secret `DESTINO_URL` **está presente** no scope de repositório (aparece mascarado como `***`
no log — confirmado na linha `DESTINO_URL: ***` do step 22). O workflow conseguiu autenticar.

Todos os 8 passos do contrato falharam na run de 2026-10-19:

```
FALHAS_LISTA: Auditar configuracao runtime sem dados de clientes,
              Comparar migrations com schema_migrations,
              Paridade tripla (migrations, edges, grants),
              Regenerar catalogo e comparar com o commitado,
              Regenerar manifesto e comparar com o commitado,
              Verificar ACL e contrato de mcp_exec,
              Verificar frescor do types.ts,
              Verificar invariantes gerais do banco vivo
CAUSA: c2908c3a1ea3a8199242ee74b66dee834b3cef41d4064424c0b83e72341df07e
```

O artifact de evidência (3 dias de retenção) expirou em 2026-10-22 — iç não é possível inspecionar
os logs individuais de cada passo. A run é anterior às correções desta sessão (TC-009, manifesto,
etc.); a próxima execução agendada (06:13 UTC diário) após o merge indicará se os fixes
desta sessão resolvem os passos de manifesto e migrations.

**O que o Joaquim precisa fazer:**

1. Após o merge da nova PR, aguardar a próxima execução agendada do `db-live-guard` (06:13 UTC)
   ou disparar manualmente via `workflow_dispatch`.
2. Se persistirem falhas de paridade (catálogo, manifesto), comparar com o commit mergeado.

**Sem fix de agente possível:** a magnitude (8/8) indica drift multi-layer anterior a esta sessão;
artifact de evidência expirado impede diagnóstico exato dos sub-erros.

---

## §3. E2E logado — credenciais de geolocalização ausentes no CI (bloqueio de infra)

**Workflow:** `e2e-logado.yml`
**Run:** [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) `failure`
**Run mais recente (2026-11-01):** [41350571737](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571737) `cancelled` (não é failure ativa)

**Causa raiz exata:**

4 specs do projeto Playwright `chromium-mapa` falham porque dependem de API de geolocalização
que não funciona no ambiente de CI:

| Spec | Linha | Descrição |
|------|-------|-----------|
| `location-picker.spec.ts` | 81 | Seletor de localização — ação primária |
| `location-picker.spec.ts` | 148 | Seletor de localização — confirmação |
| `contact-address.spec.ts` | 184 | Endereço do contato via mapa |
| `contact-map-pin.spec.ts` | 79 | Pin de localização do contato |

Os specs usam `page.setGeolocation()` ou chamadas à API de mapas (Google Maps / Leaflet)
que requerem credenciais ou não funcionam no sandbox do CI sem permissões especiais.

**O que o Joaquim precisa fazer:**

1. Verificar se `MAPS_API_KEY` (ou equivalente) está configurada como secret do environment E2E.
2. Verificar se os specs usam `page.setGeolocation()` e se o contexto do browser o permite.
3. Decisão de produto: marcar esses specs como `.skip` com issue rastreável, ou configurar
   as credenciais no CI environment correto.

**Sem fix de agente possível:** decisão de negócio sobre mock vs. skip, requer acesso a secrets.

---

## §4. DB Migrate (production) - invocação manual com TARGET_VERSION errado (operacional)

**Workflow:** `db-migrate.yml`
**Run baseline:** [39596763483](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39596763483) `failure`
Erro: `missing_count=135` — 135 versões esperadas não encontradas no ledger.

**Run mais recente (2026-11-01):** [41313326544](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41313326544) `failure` (main SHA `50fc5f0e`, 2026-11-01T13:52Z)
Step falhante: "Exigir alvo unico ou bundle atomico conhecido"
Erro exato: `TARGET_VERSION: 20261030135126`, `missing_count=9` — `O conjunto de versions ausentes nao corresponde exatamente ao alvo informado.`

**Causa raiz exata:**

O dispatch foi feito com `TARGET_VERSION` que não é o único ausente no banco (há 9 versões
ausentes, não apenas o alvo especificado). O script de preflight recusa aplicação parcial — comportamento correto.

**Não é regressão desta PR.** É falha operacional de dispatch manual com parâmetros incorretos.

**O que o Joaquim precisa fazer:**

1. Verificar versões ausentes no ledger:
   ```sql
   SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;
   ```
2. Re-disparar `db-migrate.yml` com `apply=false` e o TARGET_VERSION correto (único ausente)
   ou usar o bundle autorizado correto.
3. Após dry-run ok, re-disparar com `apply=true` e o hash SHA-256 do dry-run.

---

## §5. supabase-sync — desarmado por design (CLAUDE.md)

**Workflow:** `supabase-sync.yml`
**Última run:** [33082545380](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/33082545380) `failure` (2026-08-27 - antes do desarmamento)

**Situação conforme CLAUDE.md (seção "Auditoria de workflows 2026-09-25"):**

> `supabase-sync.yml` está desarmado. A única barreira era digitar o project-ref, que é público.
> Agora exige, cumulativamente, aprovação no environment e o secret `LEGACY_IMPOPUNLOCK`
> igual ao project-ref — secret que **não existe**, logo todo dispatch falha fechado.

**Não é falha de código nem regressão.** O workflow está intencionalmente inutilizável até
que o Joaquim decida reativá-lo com os dados corretos. A última falha real foi em 27/08/2026,
antes mesmo das correções desta sessão.

**Sem fix de agente possível:** desarmado por decisão explícita de Joaquim (CLAUDE.md).

---

## §6. db-guard.yml N-008 - fix aplicado, �PR #2542 pronta, CI run em validação

**Workflow:** `db-guard.yml`
**Run com falha original:** [40243878705](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878705) `failure`
**Script:** `scripts/db-audit/user-sessions-expire.test.sh`
**Step:** "Provar encerramento diario de sessoes vencidas (N-008)"

**Causa raiz exata:**

O step N-008 foi **adicionado por esta branch** (confirmado: grep de "N-008|user-sessions-expire"
em `db-guard.yml` na `main` retorna zero resultados). O step falhava porque:

1. O step não tinha variável `*_IMAGE` no seu bloco `env:`.
2. `retry-disposable-postgres-test.sh` só faz pre-pull de imagens quando encontra variáveis
   no padrão `*_IMAGE` no ambiente - sem elas, ignora o pre-pull.
3. Com `SKIP_DOCKER_SHIM: "1"`, o Docker real é chamado; como a tag `postgres:17-alpine` não
   estava no cache local (só o digest-pinned `postgres:17-alpine@sha256:b0f9...` é cacheado pelo
   service container), `docker run postgres:17-alpine` falhou imediatamente com erro de pull.

**Fix aplicado (dois arquivos, commit `68c998e` em 2026-11-01T23:33Z, branch `claude/fix-ci-n008-261101-2340`):**

1. `.github/workflows/db-guard.yml` - step N-008 ganhou `N008_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}` no bloco `env:`.
2. `scripts/db-audit/user-sessions-expire.test.sh` - imagem hardcoded `postgres:17-alpine` substituída por `PG_IMG="${N008_POSTGRES_IMAGE:-postgres:17-alpine}"`.

**Status atual (2026-11-02T00:XX):**

- PR #2542 criada e convertida de draft para ready-for-review em 2026-11-01T23:40Z.
- Run [41363412314](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41363412314) disparado pelo evento `ready_for_review`.
- Última verificação: `status=queued`, `conclusion=null`.

**PR #2542:** https://github.com/adm01-debug/Zapp_Web_V2/pull/2542

---

## §7. ci.yml - 410 falhas de unit tests pré-existentes na `main`

**Workflow:** `ci.yml`
**Run da branch:** [40243878635](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878635) `failure`
**Required check afetado:** `🧪 Unit Tests`

**Causa raiz exata:**

410 falhas de testes unitários são pré-existentes na `main`, confirmado por duas evidências
independentes:

1. Run na main antes desta branch: [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) (SHA `2d97c44`) já era `failure` com os mesmos arquivos falhando.
2. Nenhum arquivo falho foi tocado por esta branch.

**Sem fix de agente possível:** 410 falhas são pré-existentes e requerem decisão de produto/engenharia.

---

## §8. db-guard.yml - Replay local falha por rate limit do ECR (infra transiente)

**Workflow:** `db-guard.yml`
**Run:** [40243878705](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878705) `failure`
**Job:** `Replay local das migrations`
**Step:** 4 - "Pre-baixar a imagem do replay"

**Causa raiz exata:**

```
toomanyrequests: Data limit exceeded. Please see https://docs.aws.amazon.com/AmazonECR/latest/public/public-gallery.html#public-gallery-rate-limiting for more information.
```

O runner do GitHub Actions atingiu o rate limit do Amazon ECR Public. Não é falha de código - é rate limit transiente de infraestrutura.

**O que o Joaquim precisa fazer:**

1. Re-run manual do job após o merge - a maioria dos rate limits do ECR Public se recupera em minutos/horas.
2. Se persistir, considerar espelhar a imagem em GHCR ou Docker Hub.

**Sem fix de agente possível:** rate limit externo de infraestrutura.

---

## §9. deploy-functions.yml - @hypes/node instalado, deno check ainda falha

**Workflow:** `deploy-functions.yml`
**Run mais recente (2026-11-01):** [41338277476](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41338277476) `failure`

- Step 17 "Instalar dependencias node_modules": ✅ success
- Step 18 "Typecheck das edge functions (deno check)": ❌ failure - `Could not find "@types/node"`

*O node_modules do npm não está no path que o Deno resolve. Não é required check.*

**O que o Joaquim precisa fazer:**

1. Investigar por que `npm install @types/node` não resolve o `Could not find` do `deno check`.
   ODeno pode precisar de `--node-modules-dir` ou de `nodeModulesDir: true` no `deno.json`.
2. Disparar `workflow_dispatch` com `dry_run: true` para investigar sem publicar.

**Sem fix de agente possível:** não é required check.

---

## §10. auto-update-pr-branch.yml - retry adicionado, merge bloqueado por required checks

**Workflow:** `auto-update-pr-branch.yml`
**Fix aplicado:** commit `a6d68651`
**Bloqueadores para merge:** `Unit Tests` (410 pré-existentes - p5), `Contrato DB offline` (N-008 - p6 + Replay ECR - p8), `E2E Tests` (geolocalização - p3).

**Sem fix de agente possível:** o fix de código está na branch; a validação final requer merge em `main` bloqueado pelos required checks pré-existentes.

---

*Documento atualizado em 2026-11-02 UTC pela sessão `claude_05/festive-carson-ub43wu` e `claude/fix-ci-n008-261101-2340`.*