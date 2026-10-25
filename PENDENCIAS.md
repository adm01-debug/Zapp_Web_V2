# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Atualizado em 2026-10-25 UTC. Branch de trabalho: `claude_05/festive-carson-ub43wu` (PR #2246).
> Inventário baseline: runs na `main` em 2026-10-25 (SHA `2d97c44`).

---

## Inventário: Baseline × Final

| Workflow | ID | Baseline (main) | Causa baseline | Fix aplicado | Status final |
|---|---|---|---|---|---|
| CI/CD Pipeline (`ci.yml`) | 279058466 | [40122006424](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006424) `failure` | Unit tests: TC-009 versão errada de migration | ✅ commit `4adee58` | Aguardando CI do PR |
| DB Guard offline (`db-guard.yml`) | 344052670 | [40122006482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40122006482) `failure` | TC-009: `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` referenciava versão `20261009193246` inexistente | ✅ commit `4adee58` (versão corrigida para `20261006222024`) | Aguardando CI do PR |
| Deploy Edge Functions (`deploy-functions.yml`) | 344691397 | [40097636982](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40097636982) `failure` | `supabase/deployment-manifest.json` stale | ✅ commit `chore: regenera deployment-manifest.json` (este push) | Aguardando re-run |
| Auto Update PR Branches (`auto-update-pr-branch.yml`) | 366925501 | failure (HTTP 504) | Sem retry em `scripts/ci/fila-merge.mjs` para erros transitórios | ✅ commit anterior do PR #2246 (retry com backoff) | Aguardando CI |
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
etc.); a próxima execução agendada (06:13 UTC diário) após o merge de #2246 indicará se os fixes
desta sessão resolvem os passos de manifesto e migrations.

**O que o Joaquim precisa fazer:**

1. Após o merge de #2246, aguardar a próxima execução agendada do `db-live-guard` (06:13 UTC)
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

*Documento gerado em 2026-10-25 UTC pela sessão `claude_05/festive-carson-ub43wu` (PR #2246).*
