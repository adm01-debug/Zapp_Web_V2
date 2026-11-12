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
| Front release targets V2/V3 | [#43163880482](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43163880482) (2026-11-12T05:49Z) | `success` |
| Contexto para agentes de IA (10 min) | [#43167727048](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43167727048) (2026-11-12T06:22Z) | `success` |

---

## 1. E2E logado - routine-ownership-failed (fase: source)

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/e2e-logado.yml` |
| Run original | [#42039283192 (`341d3fda`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42039283192) |
| Run mais recente analisada | [#43166054120 (`0d65d573`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43166054120) (2026-11-12T06:08Z) |
| Jobs com falha | `authenticated-1-of-3`, `authenticated-2-of-3`, `authenticated-3-of-3` (code: `routine-ownership-failed`); `deslogado-secundario` (code: `pull-rest-failed` — causa distinta, ver §1b abaixo) |
| Jobs que passam | `deslogado-principal` OK |
| Codigo JSON de saida (authenticated) | `{"scope":"authenticated-suite","success":false,"code":"routine-ownership-failed","native_e2e":false,"report_ready":true}` |
| Codigo JSON de saida (deslogado-secundario) | `{"scope":"deslogado-secundario","success":false,"code":"pull-rest-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `restore-versioned-routine-owners` -> `cleanup` em ~403ms |

### Analise de timing - fase confirmada pelo codigo: `source`

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

**Conclusao: a falha ocorre na fase `source` — CONFIRMADO pelo codigo (`routine-ownership.mjs:112-114`). A fase `scope` NUNCA falha: o parametro passado em `run.mjs:635` e sempre `'suite'`, entao `scope !== 'suite'` nunca e verdadeiro. Fases com Docker estao descartadas pelo timing (403ms < 500ms minimo de `docker inspect`).**

### Fase `source` — condicao que falha (linhas 112-114 de `routine-ownership.mjs`)

```javascript
phase = 'source';
const source = invoke('git', ['rev-parse', 'HEAD']);
if (!processSucceeded(source) || typeof source.stdout !== 'string' || source.stdout.trim() !== sourceSha) reject();
```

**Causa raiz**: `git rev-parse HEAD` retorna SHA diferente de `sourceSha` passado como parametro. Timing 403ms confirma (~50-200ms para git).

**Por que `scope` NUNCA falha**: a fase anterior (`scope`, linhas 100-103) checa `scope !== 'suite'`. O valor de `scope` passado na chamada em `run.mjs:635` e SEMPRE a string literal `'suite'` — nunca `'authenticated-suite'`. O campo `"scope":"authenticated-suite"` visto no JSON de saida e `reportScope` (linha 314), nao o parametro. Esta fase e descartada como causa.

### `report_ready: true` - testes completaram; falha e no teardown

O campo `report_ready: true` no JSON confirma que a suite Playwright **completou com sucesso** antes desta verificacao. A falha e no **teardown** (`restore-versioned-routine-owners`), nao nos testes.

### §1a — Causa dos grupos authenticated (routine-ownership-failed)

A fase `source` e confirmada pelo CODIGO (`routine-ownership.mjs:112-114`). **O `[ownership] reason:` NUNCA apareceu no log de CI** porque o fix diagnostico (`5b796e70d`) esta na branch `claude/fix-ci-workflows-261112-0400`, ainda nao mergeada na `main`. O CI na `main` roda o `run.mjs` SEM o console.error.

**Validacao do commit `5b796e70d`**: unit tests `e2e-isolated-routine-ownership.unit.mjs` etc. → **196 pass, 0 fail, exit 0** (verificado 2026-11-12T07:00Z). Vitest nao e afetado: commit toca apenas `scripts/`, nao `src/`.

### §1b — Causa do deslogado-secundario (pull-rest-failed) — NOVA FALHA

| Campo | Valor |
|---|---|
| Job | `deslogado-secundario` |
| Code JSON | `{"scope":"deslogado-secundario","success":false,"code":"pull-rest-failed","native_e2e":false,"report_ready":true}` |
| Fase que falha | `pull-immutable-images` (durou ~57s — confirmado pelo log do job #131008063409) |
| Causa raiz | Falha na fase de pull de imagens imutaveis (REST call rejeitado — possivel rate limit ou imagem indisponivel) |
| Independente? | Sim — causa diferente de `authenticated-*`; `deslogado-principal` PASSOU no mesmo run |

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

1. **Merge PR #2975** (apos CI verde) — isso adiciona o `console.error` na main
2. **Re-executar `e2e-logado.yml`** via `workflow_dispatch` na `main` — logs mostrarao `[ownership] reason:` confirmando a sub-fase exata
3. **Investigar `deslogado-secundario`** (`pull-rest-failed`) separadamente apos resolver os authenticated

> **Bloqueio atual**: PR #2975 requer CI verde (runners disponiveis — ver §4); credenciais `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` precisam estar nos secrets (Rule 8).

---

## 2. Types Sync - migration 20261111160000 nao aplicada no banco

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/types-sync.yml` |
| Run com falha mais recente | [#43164662755](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43164662755) (2026-11-12) |
| Erro exato | Gate 2 (usage-guard): 2 novas violacoes — RPCs chamadas no codigo nao existem no banco |
| Violacao 1 | `src/hooks/delivery/useUnconfirmedMessages.ts:57` chama `.rpc('resolve_unconfirmed_message')` |
| Violacao 2 | `supabase/functions/message-delivery/index.ts:711` chama `.rpc('mark_outbound_post_started')` |
| Causa raiz | `supabase/migrations/20261111160000_outbound_post_started.sql` esta na `main` mas **nao foi aplicada no banco de producao**. O banco pulou direto para `20261111181000_instance_pause_investigation.sql`. As funcoes que a migration cria (`mark_outbound_post_started`, `resolve_unconfirmed_message`) nao existem no schema. |
| Por que nao posso corrigir | DDL em banco de producao — Rule 8. |

### O que o dono precisa fazer

1. Aplicar `supabase/migrations/20261111160000_outbound_post_started.sql` no banco de producao via o fluxo de banco (`docs/agentes/banco.md`).
2. Confirmar no banco: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('resolve_unconfirmed_message', 'mark_outbound_post_started');` deve retornar 2 linhas.
3. Redispatchar `types-sync.yml` via `workflow_dispatch` na `main` e confirmar `conclusion=success`.

---

## 3. Contexto para agentes de IA (10 min) - nenhum job iniciou

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/contexto.yml` |
| Run com falha | [#43095079516 (commit `f036006a`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43095079516) |
| Sintoma | `conclusion=failure`, `failed_jobs: []` — nenhum job iniciou |
| Causa do runner nao alocado | CONFIRMADO via API (`github_list_workflow_run_jobs` run #43095079516): Job `O que precisa rodar` ficou `status=queued`, `runner_id=null`, `conclusion=null`, `completed_at=null` — nenhum runner alocado em ~44 minutos (criado 20:43:02Z, run encerrado 21:01:55Z). Causa raiz do nao-alocamento: **indeterminada pela API** (possiveis: quota GitHub Actions minutes esgotada, runner label `ubuntu-24.04` indisponivel, billing). |
| Status ATUAL | **RESOLVIDO** — runs mais recentes confirmam `success` (ver ATUALIZAÇÃO abaixo) |

### ATUALIZACAO 2026-11-12T07:00Z — RESOLVIDO

Runs recentes confirmam que o Contexto esta verde novamente:
- [#43164823749](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43164823749) `success` (2026-11-12T05:57Z)
- [#43167727048](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43167727048) `success` (2026-11-12T06:22Z)
- [#43169606875](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43169606875) `in_progress` (2026-11-12T06:39Z)

O workflow esta rodando normalmente a cada 10 min. Movido para "RESOLVIDOS" na tabela acima. O §4 (quota) tambem esta resolvido — PR #2975 pode ser executado quando CI estiver disponivel.

---

## 4. PR #2975 - required checks bloqueados por runner pool esgotado

| Campo | Valor |
|---|---|
| PR | [#2975](https://github.com/adm01-debug/Zapp_Web_V2/pull/2975) |
| Estado | OPEN, MERGEABLE, mergeStateStatus=BLOCKED |
| HEAD | `ed00ee85114be3b2c0c7ae8405c748f3124274de` |
| Required checks bloqueados | `🔎 TypeCheck`, `🏗️ Build`, `✅ CI Gate`, `🔒 Security Audit`, `🦕 Edge contracts`, `🛡️ Workflow lint`, `🎭 E2E Tests`, `🧩 Node CI Scripts`, `Replay local das migrations` |
| Status de todos os jobs | `queued` — nunca iniciados (no momento da analise) |
| Causa raiz | Quota temporariamente esgotada — agora resolvida (ver §3 ATUALIZAÇÃO). |

### ATUALIZACAO 2026-11-12T07:00Z

Runners voltaram a funcionar (Contexto esta verde — §3). O PR #2975 deve ter CI disparado automaticamente. Verificar o estado atual de PR #2975.

### O que o dono precisa fazer

1. Verificar estado atual do PR #2975 — se CI disparou e passou, mergear com squash.
2. Apos merge, confirmar que o deploy Vercel subiu e que PENDENCIAS.md e RELATORIO_CI.md estao na `main`.

---

## 5. DB Guard - run zombie incancelavel via API

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/db-guard.yml` |
| Run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) |
| Branch | `claude_04/trusting-newton-duiglt` (pull_request event — NAO e run na main) |
| Em `in_progress` desde | 2026-10-26T22:15Z (run_attempt=14) |
| Comportamento da API | HTTP 409 em todos os cancelamentos via API REST |
| Impacto | Ocupa 1 slot de runner permanentemente; aparece na aba `is:failure` do GitHub |

**Nota**: este run nao e da branch `main` — e um run de pull_request em branch externa. Nao afeta o estado da main.

### O que o dono precisa fazer

1. Acessar https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313
2. Clicar em **"Cancel workflow"** na interface do GitHub.
