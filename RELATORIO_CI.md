# RELATÓRIO CI — Baseline × Final

> Gerado em 2026-10-22 02:30 UTC. Última atualização: 2026-10-22 08:10 UTC.
> Branch de trabalho: `claude/kind-gates-87mwoe` | PR: [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185)
> Esta sessão corrigiu uma regressão introduzida pela PR #2182 e documentou falhas pré-existentes.

---

## 0. Baseline local (antes de alterar qualquer arquivo)

Executado no contêiner de desenvolvimento antes de qualquer edição nesta sessão.

| Comando | Resultado | Observação |
|---------|-----------|-----------|
| `bun install` | ✅ success | 675 pacotes, sem alterações |
| `bun run lint` | ✅ success | exit 0, sem erros |
| `bun run typecheck` (local) | ❌ SIGABRT (OOM) | `tsc -b` sem `--max-old-space-size` → kernel mata o processo. CI usa `typecheck-ratchet.mjs` com `--max-old-space-size=4096` (commit `4604a5a`, PR #2182) |
| `bun run build` | ✅ success | 18.90s, sem erros |
| `bun run test` (full suite local) | ❌ timeout (143) | Suite completa > 300s local; CI usa 3 shards paralelos |

> **Nota:** `bun run typecheck` local falha por OOM em todo ambiente sem 4 GB de memória para o Node; o CI usa `typecheck-ratchet.mjs` que adiciona `--max-old-space-size=4096` via `spawnSync`. Build e lint passam sem restrições.

---

## 1. Baseline — Estado da `main` antes desta sessão

**SHA de referência:** `61a973da` (merge da PR #2182 em 2026-10-22T02:01:37Z)

| Required check | Estado baseline | Causa |
|---|---|---|
| `🔍