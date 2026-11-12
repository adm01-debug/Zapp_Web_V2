# PENDENCIAS DE CI

> Gerado em 2026-11-05 pela sessao `fix-ci-workflows-hxupgs`.
> Atualizado em 2026-11-12 pela sessao `fix-ci-workflows-261112-0400`.
> Atualizar quando os bloqueios forem resolvidos.

---

## RESOLVIDOS (antes em falha, agora verdes)

| Workflow | Ultimo run verde | Conclusao |
|---|---|---|
| Deploy Edge Functions | [#43143197204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43143197204) (2026-11-12) | `success` |
| DB Live Guard | [#42678012070](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42678012070) (2026-11-09) | `success` |
| Branch Hygiene Audit | [#42582604190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42582604190) (2026-11-09) | `success` |

---

## 1. E2E logado - routine-ownership-failed (sub-fase: scope)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run original | [#42039283192 (`341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run mais recente analisada | [#43158859764 (`13a00e06`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43158859764) |
| Jobs com falha | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` |
| Jobs que passam | `deslogado-principal` OK, `deslogado-secundario` OK |
| Codigo JSON de saida | `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `restore-versioned-routine-owners` -> `cleanup` em ~403ms |

### Analise de timing - sub-fase identificada: `scope`

Logs do job `authenticated-1-of-3` (run #43148791130, job ID 130952813356):
```
03:46:05Z [e2e-isolated] start-platform
03:46:05Z [e2e-isolated] apply-active-migrations   <- durou ~1m55s
03:48:01.3397161Z [e2e-isolated] restore-versioned-routine-owners
03:48:01.7426918Z [e2e-isolated] cleanup            <- 403ms depois
03:48:09Z {"code":"routine-ownership-failed","report_ready":true}
```

A funcao `restoreRoutineOwnership` (`scripts/e2e-isolated/routine-ownership.mjs:95`) executa 6 fases em sequencia:

| Fase | I/O | Tempo tipico | Compativel com 403ms? |
|---|---|---|---|
| `scope` | Nenhum (validacao de parametros) | < 1ms | **Sim** |
| `source` | `git rev-parse HEAD` | ~50-200ms | Sim |
| `container` | `docker inspect` x 2 | 500ms-2s | Nao |
| `volume` | `docker volume inspect` | 200ms-1s | Nao |
| `namespace` | `docker exec readlink` | 200ms-1s | Nao |
| `sql-process` | `docker exec psql` | 1-5s | Nao |

**Conclusao: a falha ocorre na fase `scope` (mais provavel) ou `source`. Fases com Docker estao descartadas pelo timing.**

### Condicao da fase `scope` (linhas 100-103 de `routine-ownership.mjs`)

```javascript
if (scope !== 'suite' || !isAuthenticatedGroup(group) || !CID.test(anchorId) || !CID.test(databaseId)
    || anchorId === databaseId || !IMAGE.test(anchorImage) || !IMAGE.test(databaseImage)
    || volumeName !== runId + '-postgres' || !NET.test(networkNamespace)
    || !(allowedWritableSources instanceof Set) || typeof dockerConfig !== 'string'
    || !dockerConfig.startsWith('/')) reject();
```

Hipoteses (da mais provavel para a menos):

| Check | Hipotese |
|---|---|
| `scope !== 'suite'` | A variavel `scope` em `run.mjs:635` para grupos authenticated pode ser `'authenticated-suite'` em vez de `'suite'` |
| `anchorId === databaseId` | Grupos authenticated podem receber os mesmos container IDs para anchor e database |
| `volumeName !== runId + '-postgres'` | Volume criado com nome diferente quando ha autenticacao |

### `report_ready: true` - testes completaram; falha e no teardown

O campo `report_ready: true` no JSON confirma que a suite Playwright **completou com sucesso** antes desta verificacao. A falha e no **teardown** (`restore-versioned-routine-owners`), nao nos testes.

### Correcao aplicada nesta sessao (2026-11-12)

`scripts/e2e-isolated/run.mjs:639-641` foi corrigido para logar `routineOwnership.reason` antes de lancar o erro:

```javascript
if (!routineOwnership.confirmed) {
  console.error('[ownership] reason:', routineOwnership.reason);
  throw new Error('routine-ownership-failed');
}
```

**Evidencia:** commitado em `5b796e70d` e pushado na branch `claude/fix-ci-workflows-261112-0400`.

### O que o dono precisa fazer

1. **Verificar `scope`** - apos a correcao, re-executar `e2e-logado.yml` via `workflow_dispatch` na `main` (exige runners disponiveis - ver paragrafo 5). Os logs do CI agora mostrarao `[ownership] reason: scope-failed` (ou outro reason), confirmando a sub-fase. Se `reason: scope-failed`, verificar no `run.mjs` se `scope` e `'suite'` ou `'authenticated-suite'` na chamada de `restoreRoutineOwnership` (~linha 635).
2. **Apos corrigir a causa raiz** - re-executar `e2e-logado.yml` via `workflow_dispatch` na `main` e confirmar que os 3 grupos authenticated passam.

> Bloqueio atual: validacao final requer runners disponieis (quota esgotada - ver paragrafo 5) e credenciais E2E_TEST_EMAIL/E2E_TEST_PASSWORD configuradas como secrets (Rule 8).

---

## 2. Types Sync - gate de usage-guard bloqueado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/types-sync.yml` |
| Run com falha | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) |
| Erro exato | `"A sincronizacao foi bloqueada por um ou mais gates."` |
| Causa raiz | Gate 2 (`usage-guard`) bloqueou a sincronizacao. Causa raiz: drift no banco. |

### O que o dono precisa fazer

1. Verificar se o drift de migrations foi resolvido (o DB Live Guard passou no run #42678012070).
2. Dispatchar `types-sync.yml` via `workflow_dispatch` na `main`.
3. Confirmar `conclusion=success`.

---

## 3. Front release targets (V2/V3) - deploy Vercel nao atualizou no prazo

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/verify-release-targets.yml` |
| Run com falha | [#43133746925 (commit `bd62fc9d`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43133746925) |
| Erro exato | `V2 ainda em 7e128bc40305; esperado bd62fc9d9771` |
| Causa raiz | O script `scripts/vercel/verify-release-targets.mjs` aguarda 30 tentativas x 10s (5 min) para o Vercel atualizar o deploy. O deploy V2 nao completou nesse prazo. |
| Por que nao posso corrigir | Exige verificar se o deploy Vercel esta travado (Vercel billing/quota) ou se o timeout do script precisa ser aumentado. Ambos podem envolver decisao de infra (Rule 8). |

### O que o dono precisa fazer

1. Verificar no painel Vercel se o projeto `zapp-web-v2` tem deploy em andamento ou falho para o commit `bd62fc9d`.
2. Se o deploy falhou no Vercel: verificar logs do build no painel Vercel.
3. Se o deploy esta atrasado: verificar quota/billing do Vercel.
4. Apos deploy confirmado, re-dispatchar `verify-release-targets.yml`.

---

## 4. Contexto para agentes de IA (10 min) - nenhum job iniciou

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/contexto.yml` |
| Run com falha | [#43095079516 (commit `f036006a`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43095079516) |
| Sintoma | `conclusion=failure`, `failed_jobs: []` -- nenhum job iniciou |
| Causa raiz | Runner pool esgotado (quota GitHub Actions minutes do plano free: 2.000 min/mes). Os jobs ficaram queued sem runner disponivel e o workflow expirou ou foi forcado a falhar pela propria logica de timeout. |
| Por que nao posso corrigir | Envolve billing/quota de CI (AGENTS.md regra 8 - infra). |

### O que o dono precisa fazer

1. Resolver o bloqueio de runners (ver secao 5 - quota esgotada).
2. Apos runners disponiveis, o workflow sera disparado automaticamente a cada 10 min pelo schedule.

---

## 5. PR #2975 - required checks bloqueados por runner pool esgotado

| Campo | Valor |
|---|---|
| PR | [#2975](https://github.com/adm01-debug/Zapp_Web_V2/pull/2975) |
| Estado | OPEN, MERGEABLE, mergeStateStatus=BLOCKED |
| HEAD | `ed00ee85114be3b2c0c7ae8405c748f3124274de` |
| Required checks bloqueados | TypeCheck, Build, CI Gate, Security Audit, Edge contracts, Workflow lint, E2E Tests, Node CI Scripts, Replay local das migrations |
| Status de todos os jobs | queued - nunca iniciados |
| Causa raiz | Quota de GitHub Actions minutes esgotada (plano free: 2.000 min/mes). Os jobs ficam queued indefinidamente sem runner disponivel. |
| Por que nao posso corrigir | Envolve billing/quota de CI (AGENTS.md regra 8 - infra). |

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/settings/billing (ou Settings > Billing and plans) e verificar o consumo de GitHub Actions minutes.
2. Comprar minutes adicionais ou aguardar o proximo ciclo de faturamento (reinicia no inicio do mes).
3. Apos runners disponiveis, o PR #2975 tera CI executado automaticamente. Se CI passar, mergear com squash.
4. Apos merge, confirmar que o deploy Vercel subiu e que PENDENCIAS.md e RELATORIO_CI.md estao na main.

---

## 6. DB Guard - run zombie incancelavel via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Branch | claude_04/trusting-newton-duiglt (pull_request event - NAO e run na main) |
| Em in_progress desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente; aparece na aba is:failure do GitHub |

Nota: este run nao e da branch main - e um run de pull_request em branch externa. Nao afeta o estado da main.

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313
2. Clicar em "Cancel workflow" na interface do GitHub.
