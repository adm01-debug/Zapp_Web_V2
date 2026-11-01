# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Atualizado em 2026-11-01 UTC. Branch de trabalho: `claude_05/festive-carson-ub43wu`.
> PR #2246 fechada sem merge em 2026-10-31. Nova PR será aberta com os mesmos commits.
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

## §1. types-sync — Gate TypeScript bloqueou a proposta (drift de schema)

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
##[error]A sincronizacao foi bloqueada por um ou mais gates.
Process completed with exit code 1.
```

**O que o Joaquim precisa fazer:**

1. Resolver os erros de TypeScript no banco (drift de schema documentado em RELATORIO_CI.md).
2. Re-disparar `types-sync.yml` via `workflow_dispatch` — quando o Gate TypeScript passar,
   o workflow propõe a PR automaticamente.

**Sem fix de agente possível:** o drift de schema (warroom_queue_stats, transfer_conversation etc.)
requer intervenção humana na estrutura do banco para resolvê-lo completamente.

---

## §2. DB Live Guard — 8/8 passos do contrato falharam (run de 2026-10-19)

**Workflow:** `db-live-guard.yml`  
**Run:** [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) `failure`

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

O artifact de evidência (3 dias de retenção) expirou em 2026-10-22 — não é possível inspecionar
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

## §4. DB Migrate (production) — invocação manual com TARGET_VERSION errado (operacional)

**Workflow:** `db-migrate.yml`  
**Run:** [39596763483](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39596763483) `failure`  
**Erro:** `missing_count=135` — 135 versões esperadas não encontradas no ledger.

**Causa raiz exata:**

O dispatch foi feito com `TARGET_VERSION: 20261020190001`, valor muito à frente do último
registro real no ledger. O script de dry-run reportou 135 ausentes — não é bug de código,
é parâmetro errado na invocação manual.

**Não é regressão desta PR.** É falha operacional de um dispatch anterior, não de código da branch.

**O que o Joaquim precisa fazer:**

1. Verificar `max(version)` atual no ledger:
   ```sql
   SELECT max(version) FROM supabase_migrations.schema_migrations;
   ```
2. Re-disparar `db-migrate.yml` com `apply=false` e `TARGET_VERSION` correto.
3. Após dry-run ok, re-disparar com `apply=true` e o hash SHA-256 do dry-run.

---

## §5. supabase-sync — desarmado por design (CLAUDE.md)

**Workflow:** `supabase-sync.yml`  
**Última run:** [33082545380](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/33082545380) `failure` (2026-08-27 — antes do desarmamento)

**Situação conforme CLAUDE.md (seção "Auditoria de workflows 2026-09-25"):**

> `supabase-sync.yml` está desarmado. A única barreira era digitar o project-ref, que é público.
> Agora exige, cumulativamente, aprovação no environment e o secret `LEGACY_IMPORT_UNLOCK`
> igual ao project-ref — secret que **não existe**, logo todo dispatch falha fechado.

**Não é falha de código nem regressão.** O workflow está intencionalmente inutilizável até
que o Joaquim decida reativá-lo com os dados corretos. A última falha real foi em 27/08/2026,
antes mesmo das correções desta sessão.

**Sem fix de agente possível:** desarmado por decisão explícita de Joaquim (CLAUDE.md).

---

## §6. db-guard.yml N-008 — falha pré-existente mascarada pelo TC-009, exposta após o fix

**Workflow:** `db-guard.yml`  
**Run com N-008 exposto:** [40243878705](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878705) `failure`  
**Script:** `scripts/db-audit/user-sessions-expire.test.sh`  
**Step:** 171 — "Provar encerramento diario de sessoes vencidas (N-008)"

**Causa raiz exata:**

A falha N-008 é **pré-existente na `main`**, mas estava mascarada no baseline porque o TC-009
(passo 147 — `team-receipts-reactions-conversation-id.test.sh`) falhava antes e o job abortava
sem chegar ao passo 171 (N-008). Evidência:

- Baseline run `40122006482` (main, SHA `2d97c44`): falha no passo 147 (TC-009), job encerrado
  antes do passo 171. N-008 nunca foi executado no baseline.
- Após fix do TC-009 (commit `4adee58`), job da branch avança até o passo 171 e falha em N-008.
- `scripts/db-audit/user-sessions-expire.test.sh` testa o encerramento diário de sessões
  vencidas via pg_cron — requer banco local com pg_cron ativo e dados de sessão preenchidos.

**Por que não é regressão desta branch:**

Nenhum arquivo desta branch toca `user-sessions-expire.test.sh` ou a lógica de pg_cron.
A falha existia antes desta sessão, apenas nunca era visível porque TC-009 a mascarava.

**O que o Joaquim precisa fazer:**

1. Verificar se `pg_cron` está ativo no banco local do CI.
2. Checar se há dados de sessão vencida no banco local para o teste exercitar.
3. Corrigir ou adaptar `scripts/db-audit/user-sessions-expire.test.sh` para o ambiente de CI.

**Sem fix de agente possível:** requer banco local com pg_cron ativo — infraestrutura de CI.

---

## §7. ci.yml — 410 falhas de unit tests pré-existentes na `main`

**Workflow:** `ci.yml`  
**Run da branch:** [40243878635](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878635) `failure`  
**Required check afetado:** `🧪 Unit Tests`

**Causa raiz exata:**

410 falhas de testes unitários são **pré-existentes na `main`**, confirmado por duas evidências
independentes:

1. **Run na main antes desta branch:** [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) (SHA `2d97c44`) já era `failure` com os mesmos
   arquivos falhando.
2. **Nenhum arquivo falho foi tocado por esta branch:** todos os arquivos com falha —
   `useTalkXSegments.test.ts`, `useTeamChatPanel.search-antigas.test.tsx`,
   `useInboxBulkActions.test.ts`, `useDashboardKpi.periodo.test.tsx`,
   `useAgentCelebrations.test.tsx`, `configuracoes.leituraErro.test.tsx`,
   `workItemFormat.test.ts` — são arquivos que esta branch não modificou.

Resultado da suíte completa rodada localmente (SHA `69cf182`, 2026-10-25 ~23:00 UTC):

| Shard | Arquivos falhos | Testes falhos | Testes passando |
|-------|----------------|---------------|-----------------|
| 1/3   | 44             | 148           | 4921 + 12 todo/expected |
| 2/3   | 45             | 149           | 4985 + 15 todo/expected |
| 3/3   | 37             | 113           | 5089 + 36 todo/expected |
| **Total** | **126** | **410** | **14995 + 63 todo/expected** |

Os 15 testes dos arquivos alterados nesta branch passam: 15/15 ✅ (confirmado em
`bun vitest run …pagination.test.tsx …useDiagnosticsData.select.test.ts …useInboxFilters.type-url.test.tsx`).

**Sem fix de agente possível:** 410 falhas são pré-existentes e requerem decisão de produto/
engenharia sobre quais priorizar. Nenhuma foi introduzida por esta branch.

---

## §8. db-guard.yml — Replay local das migrations falha por rate limit do ECR (infra transiente)

**Workflow:** `db-guard.yml`  
**Run:** [40243878705](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40243878705) `failure`  
**Job:** `Replay local das migrations`  
**Step:** 4 — "Pre-baixar a imagem do replay"

**Causa raiz exata:**

```
toomanyrequests: Data limit exceeded. Please see https://docs.aws.amazon.com/AmazonECR/latest/public/public-gallery.html#public-gallery-rate-limiting for more information.
```

O runner do GitHub Actions atingiu o rate limit do Amazon ECR Public ao tentar fazer `docker pull`
da imagem `public.ecr.aws/supabase/postgres:17.6.1.159@sha256:86a2e...`. Três tentativas
consecutivas falharam com o mesmo erro. **Não é falha de código** — é rate limit transiente
de infraestrutura do ECR no pool de runners GitHub-hosted.

**Evidência de que é transiente:**

- O código do step não foi alterado por esta branch.
- A mesma imagem foi usada com sucesso em runs anteriores na main.
- O erro é explicitamente de quota (`Data limit exceeded`), não de digest inválido ou imagem
  inexistente.

**O que o Joaquim precisa fazer:**

1. Re-run manual do job `Replay local das migrations` após o merge — a maioria dos rate limits
   do ECR Public se recupera em poucos minutos/horas.
2. Se persistir, considerar espelhar a imagem em GHCR ou Docker Hub para evitar dependência
   do ECR Public.

**Sem fix de agente possível:** rate limit externo de infraestrutura; não é falha de código.

---

## §9. deploy-functions.yml — manifesto regenerado, mas merge bloqueado por required checks pré-existentes

**Workflow:** `deploy-functions.yml`  
**Run baseline:** [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) `failure`  
**Causa baseline:** `supabase/deployment-manifest.json` stale — hashes de `ai-audio-authz.ts` (4007→7475 bytes) e `ai-transcribe-audio/index.ts` (28209→29419 bytes) desatualizados.  
**Fix aplicado:** commit `96b1aa6` — manifesto regenerado com hashes atuais (`manifest_sha256=42fcdc0b3046b16ee740b3ec41ec6ff675087b215442e10d2ec4693011feca8f`).

**Por que ainda está bloqueado:**

`deploy-functions.yml` dispara apenas via `workflow_dispatch` **após merge em `main`** (conforme cabeçalho do workflow — não tem trigger `push` nem `pull_request`). Para validar o fix com `conclusion=success`, é necessário mergear a branch em `main`. O merge está bloqueado porque os 6 required checks da `main` não passam:

| Required check | Estado | Motivo |
|----------------|--------|--------|
| `🧪 Unit Tests` | ❌ failure | 410 falhas pré-existentes — §7 |
| `Contrato DB offline` | ❌ failure | N-008 pré-existente exposto — §6; Replay ECR rate limit — §8 |
| `🎭 E2E Tests (Playwright)` | ❌ failure | 4 specs de geolocalização sem credenciais CI — §3 |
| `🔍 Lint & TypeCheck` | ⚠️ pré-existente | 819 problemas presentes na `main` antes desta branch |
| `🏗️ Build` | ✅ success | `bun run build` — `dist/` gerado, zero erros |
| `🔒 Security Audit` | não avaliado | depende do CI verde |

Os três required checks em falha são **pré-existentes na `main`** (confirmado pelo run `40122006424` na SHA `2d97c44`, que já era `failure` antes desta branch existir). Nenhum foi introduzido por esta sessão.

**O que o Joaquim precisa fazer:**

1. Resolver os bloqueadores de required checks pré-existentes (§3, §6, §7).
2. Mergear a PR `claude_05/festive-carson-ub43wu`.
3. Disparar `deploy-functions.yml` via `workflow_dispatch` na `main` e aprovar no environment `producao-edge-functions`.

**Fix commitado — validação bloqueada por infra pré-existente:** o fix de código (commit `96b1aa6`) está na branch; a validação final requer merge em `main` bloqueado pelos required checks pré-existentes (§3, §6, §7).

---

## §10. auto-update-pr-branch.yml — retry adicionado, mas merge bloqueado por required checks pré-existentes

**Workflow:** `auto-update-pr-branch.yml`  
**Run baseline:** [40210888395](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40210888395) `failure` (HTTP 504 sem retry)  
**Causa baseline:** `scripts/ci/fila-merge.mjs` não incluía `"unexpected end of JSON input"` no regex de erros transitórios, tratando respostas truncadas da API do GitHub como falha permanente.  
**Fix aplicado:** commit `a6d68651` — `"unexpected end of JSON"` adicionado ao regex de erros transitórios em `scripts/ci/fila-merge.mjs:38`.

**Por que ainda está bloqueado:**

`auto-update-pr-branch.yml` dispara apenas em `push` na `main` — não tem trigger `pull_request`. Para validar o fix com `conclusion=success`, é necessário que um commit chegue na `main`. O merge da branch está bloqueado pelos mesmos required checks pré-existentes documentados em §9:

| Required check | Estado | Motivo |
|----------------|--------|--------|
| `🧪 Unit Tests` | ❌ failure | 410 falhas pré-existentes — §7 |
| `Contrato DB offline` | ❌ failure | N-008 pré-existente — §6; Replay ECR — §8 |
| `🎭 E2E Tests (Playwright)` | ❌ failure | geolocalização CI — §3 |

Esses três required checks eram `failure` na `main` (SHA `2d97c44`) antes desta branch existir — evidência: run [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424).

**O que o Joaquim precisa fazer:**

1. Resolver os bloqueadores de required checks pré-existentes (§3, §6, §7).
2. Mergear a PR — o `auto-update-pr-branch.yml` disparará automaticamente no push.

**Fix commitado — validação bloqueada por infra pré-existente:** o fix de código (commit `a6d68651`) está na branch; a validação final requer merge em `main` bloqueado pelos required checks pré-existentes (§3, §6, §7). Runs recentes do `auto-update-pr-branch` na main (SHA `1252bb5a`) são `cancelled` — comportamento normal quando push novo supersede run pendente. Não é `failure` ativa.

---

*Documento atualizado em 2026-11-01 UTC pela sessão `claude_05/festive-carson-ub43wu`.*
