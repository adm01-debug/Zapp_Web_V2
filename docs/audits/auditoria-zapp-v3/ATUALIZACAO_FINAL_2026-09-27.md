# Atualização final — 2026-09-27 (substitui o item 1 do ANALISE_SENIOR)

## Item 1 (órfãos de edge): **RESOLVIDO — ORPHAN 0 → gate verde**

A análise anterior dizia "não remover as 2 funções: são chamadas por código". **Estava
errada** e a causa do erro foi metodológica: eu contei **ocorrências de texto**, não
chamadores. As ocorrências de `email-health` e `zapp-google-calendar-sync` eram
**comentários** e uma chave de query, não chamadas. Relendo com calma, as duas são
**retiradas de propósito**:

| função | retirada em | evidência |
|---|---|---|
| `email-health` | 2026-08-22 | `docs/_archive/email-health-ADR-2026-08-22.md`; commits `577264780`, `7b3a9bb18`; saiu do `EDGE_FUNCTION_NAMES` → não roteada (404); o app usa `rpc_get_email_health_summary` como fallback |
| `zapp-google-calendar-sync` | 2026-08-25 | ADR; **0 chamadores**; fonte em `supabase/functions/_archive/zapp-google-calendar-sync/index.ts.archived` |

### O que foi executado (2 PRs, ambos mergeados)

**#1598 — dois defeitos do gate + input de prune**
1. **Comparação assimétrica:** o repo listava só `*.ts` em `_shared`, o snapshot do volume
   lista **todos** os arquivos → `README.md` e `evolution-event-types.json`, **ambos
   versionados no `main`**, eram acusados de órfão (7 em vez de 5). Corrigido com
   `REPO_SHARED_ALL` (só no teste de órfão; o sync continua só com `*.ts`).
2. **Funções retiradas:** `RETIRED_FUNCTIONS` no próprio script, com o ponteiro do ADR no
   comentário e `continue` **antes** do incremento — órfão novo continua sendo reportado.
3. `edge-deploy.yml` ganhou o input **`prune` (default `false`)** — antes o `--prune` do
   script não era alcançável por workflow nenhum.
4. Teste de regressão `infra/edge-deploy/__tests__/edge-orphan-registry.test.mjs`
   (5 casos, `node --test`), ligado ao próprio `edge-drift-check.yml`.

**#1599 — registry corrigido no doc** (`docs/edge/runbook-sync-functions-volume.md`),
incluindo a correção da afirmação errada acima.

### Execução em produção e verificação

- Poda: `gh workflow run edge-deploy.yml -f prune=true` → run `36328479649`, **SUCCESS**,
  **5 arquivos removidos** do volume (`db-columns.ts`, `mode.ts`, `criticalPayloadSchemas.ts`,
  2× `*.bak_s18`) — todos com **0 imports** e fontes no histórico do git (`3380a52fb`).
- Gate re-executado na `main` → run `36328889424`, job **`E39 — deploy-edge.sh read-only` =
  SUCCESS**:

```
functions: OK 122 · MISSING 0 · STALE 0 · ORPHAN 0
_shared  : OK  57 · MISSING 0 · STALE 0 · ORPHAN 0
✅ deploy-edge: concluído sem erros.
```

- Simulação antes de gastar CI (listas reais do volume): `_shared` 7 → 5, funções 2 → 0,
  órfão **inventado** continua sendo pego, `bash -n` OK.

### Pendência de CI registrada (não é do escopo, é do dono)

Em `workflow_dispatch` o job **`E38 — Completude de ambiente`** falha (falta
`SUPABASE_ANON_KEY` no contexto do dispatch) e derruba o `conclusion` do workflow mesmo com o
`E39` verde. Em **PR** ele faz skip silencioso → o caminho que importa não é afetado.

### Estado das 4 frentes (final)

| frente | estado |
|---|---|
| E42 (view `zapp.contacts` lendo `zapp.evolution_contacts`) | ✅ verde, 0 violações sem allowlist |
| E39 / edge drift (MISSING/STALE/ORPHAN) | ✅ **verde — 0/0/0** |
| DB Guard / catálogo de schema | ⚠️ vermelho **honesto** — bloqueado por 388 erros de tipo no app (projeto de correção, não commit) |
| Migration drift repo↔banco | ✅ verde (REPO_ONLY 0, DB_ONLY 687 documentados) |
