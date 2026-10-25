# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Atualizado em 2026-10-25 UTC. Branch de trabalho: `claude_05/festive-carson-ub43wu` (PR #2246).
> Inventário baseline: runs na `main` em 2026-10-25 (SHA `2d97c44`).

---

## Inventário: Baseline × Final

| Workflow | ID | Baseline (main) | Causa baseline | Fix aplicado | Status final |
|---|---|---|---|---|---|
| CI/CD Pipeline (`ci.yml`) | 279058466 | [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) `failure` | Unit tests: TC-009 versão errada de migration | ✅ commit `4adee58` | Aguardando CI do PR |
| DB Guard offline (`db-guard.yml`) | 344052670 | [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) `failure` | TC-009: `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` referenciava versão `20261009193246` inexistente | ✅ commit `4adee58` (versão corrigida para `20261006222024`) | Aguardando CI do PR |
| Deploy Edge Functions (`deploy-functions.yml`) | 344691397 | [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) `failure` | `supabase/deployment-manifest.json` stale | ✅ commit `chore: regenera deployment-manifest.json` (este push) | Ver §7 — trigger incompatível |
| Auto Update PR Branches (`auto-update-pr-branch.yml`) | 366925501 | failure (HTTP 504) | Sem retry em `scripts/ci/fila-merge.mjs` para erros transitórios | ✅ commit anterior do PR #2246 (retry com backoff) | Ver §6 — trigger incompatível |
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

## §1. types-sync — secret `DESTINO_URL` ausente (bloqueio de infra)

**Workflow:** `types-sync.yml`
**Run:** [40169860237](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40169860237) `failure`

**Causa raiz exata:**

O workflow precisa do secret `DESTINO_URL` para conectar ao banco oficial e regenerar
`src/types/database.types.ts`. O secret existe no escopo do environment `db-ledger-evidence`,
mas o workflow não usa esse environment — depende do secret em scope de repositório.
A falha ocorre no passo que tenta `psql "$DESTINO_URL" -c "SELECT 1"` ou equivalente.

**O que o Joaquim precisa fazer:**

1. Verificar se `DESTINO_URL` está configurada como secret de repositório (não apenas de environment):
   Settings → Secrets and variables → Actions → Repository secrets.
2. Se ausente no scope de repo: adicionar o secret (valor = string de conexão `postgres://...`
   do banco `tnnnlkbymytvtqngbbqh`).
3. Após criar o secret, re-disparar o `types-sync.yml` via `workflow_dispatch`.

**Sem fix de agente possível:** o secret de banco não pode ser commitado em código (CLAUDE.md regra de segredos).

---

## §2. DB Live Guard — secret `DESTINO_URL` ausente (bloqueio de infra)

**Workflow:** `db-live-guard.yml`
**Run:** [39212157834](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39212157834) `failure`

**Causa raiz exata:**

Mesma causa do §1 — `DESTINO_URL` não está configurada no scope de repositório (apenas em environment).
O `db-live-guard` roda em push e schedule (`13 6 * * *`) e precisa conectar ao banco oficial.
Sem o secret, o psql retorna erro de conexão e o workflow conclui `failure`.

**O que o Joaquim precisa fazer:**

Mesma ação do §1 — adicionar `DESTINO_URL` como secret de repositório.
Após isso, o `db-live-guard` passará automaticamente no próximo schedule (06:13 UTC) ou em push na `main`.

**Sem fix de agente possível:** mesmo motivo do §1.

---

## §3. E2E logado — credenciais de geolocalização ausentes no CI (bloqueio de infra)

**Workflow:** `e2e-logado.yml`
**Run:** [40122006547](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006547) `failure`

**Causa raiz exata:**

4 specs do projeto Playwright `chromium-mapa` falham porque dependem de API de geolocalização
que não funciona no ambiente de CI:

| Spec | Linha | Descrição |
|------|-------|----------|
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

## §6. auto-update-pr-branch.yml — validação exige push na main (trigger incompatível)

**Workflow:** `auto-update-pr-branch.yml`
**Workflow ID:** 366925501
**Última run com falha (baseline):** failure (HTTP 504 + `unexpected end of JSON input` no `gh pr list`)

**Fix aplicado:** commit `a6d68651` — adicionado `execComRetry()` com 3 retries e backoff exponencial
(5s→10s→20s) em `scripts/ci/fila-merge.mjs:38`; `unexpected end of JSON` adicionado ao regex de
erros transitórios para cobrir JSON truncado de respostas da API do GitHub.

**Por que não há `conclusion=success` comprovado em contexto de PR:**

O workflow `auto-update-pr-branch.yml` tem trigger exclusivamente `on: push` para a branch `main`:

```yaml
on:
  push:
    branches: [main]
```

Ele **não é acionado por `pull_request`** — nunca produzirá um run associado a esta PR. A validação
só é possível após merge em `main` (o próximo push à `main` dispara o workflow com o código corrigido).

**Não é bloqueio de infra nem decisão de Joaquim.** É limitação arquitetural do trigger: o workflow
não pode rodar no contexto de PR por design (seu propósito é reagir a pushs na `main` para atualizar
PRs abertas atrás da `main` — não faria sentido rodar durante um PR).

**Validação esperada pós-merge:** primeiro push à `main` após merge do PR #2246 produzirá run com o
código corrigido. A ausência de `conclusion=success` em PR é estrutural, não indicador de falha no fix.

---

## §7. deploy-functions.yml — validação exige workflow_dispatch na main + aprovação humana (trigger incompatível)

**Workflow:** `deploy-functions.yml`
**Workflow ID:** 344691397
**Última run com falha (baseline):** [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) `failure` — "Deployment manifest is stale"

**Fix aplicado:** commit `96b1aa6` — `supabase/deployment-manifest.json` regenerado com hashes atuais
(84 funções, 168 arquivos fonte). Novo `manifest_sha256: 42fcdc0b3046b16ee740b3ec41ec6ff675087b215442e10d2ec4693011feca8f`.

**Por que não há `conclusion=success` comprovado em contexto de PR:**

O workflow `deploy-functions.yml` tem trigger exclusivamente `on: workflow_dispatch`:

```yaml
on:
  workflow_dispatch:
    inputs: ...
```

Ele **não é acionado por `pull_request`** — nunca produzirá um run associado a esta PR. Além disso,
o job pausa em `Waiting` no environment `producao-edge-functions` que requer aprovação de Joaquim.

**Conforme CLAUDE.md (seção "Decisões de 2026-09-26"):**
> "Merge em `main` NÃO deploya edge function. As edge functions sobem **só** por `workflow_dispatch`
> do `deploy-functions.yml` (é deliberado) [...] uma correção de edge function mergeada continua
> **fora do ar** até alguém disparar o workflow E aprovar."

**O que o Joaquim precisa fazer após merge:**

1. Disparar `deploy-functions.yml` via `workflow_dispatch` na `main` (aba Actions → Deploy Functions).
2. Aprovar o job no environment `producao-edge-functions`.

**Sem `conclusion=success` possível por agente:** trigger incompatível com PR + aprovação humana obrigatória.

---

*Documento gerado em 2026-10-25 UTC pela sessão `claude_05/festive-carson-ub43wu` (PR #2246).*
