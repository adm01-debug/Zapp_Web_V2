# Dossiê PR #2197

**Título:** ci: lote GA49–GA64 — fila-merge, actions-kpi, types-sync, codeql e branch-hygiene  
**Branch:** `claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023`  
**Head SHA:** `e1cf8004d000b66230c3c97c87ac426be0d5908d`  
**Base SHA:** `351ccb2a651f0394b5e78fd660695c09b4f799cf` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-23  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 12 arquivos, 274 adições, 35 deleções  

| Item | Arquivo | Descrição |
|---|---|---|
| GA49 | `scripts/ci/fila-merge.mjs` | `CANCELLED`/`ACTION_REQUIRED` reconhecidos como `bloqueado` |
| GA50 | `scripts/ci/fila-merge.mjs` | `motivoFora()` expõe por que uma PR não entra na fila |
| GA54 | `scripts/ci/actions-kpi.mjs` + `actions-kpi.unit.mjs` | `detectarLote()` detecta branches com > 15 runs em 24h |
| GA60 | `.github/actionlint.yaml` | Remove ignore de `could not parse as YAML` |
| GA61 | `.github/workflows/types-sync.yml` | Exclui `known-violations.json` do trigger; concurrency diferencia dispatch de push |
| GA62 | `.github/workflows/codeql.yml` | Schedule diário em vez de semanal |
| GA63 | `.github/workflows/types-sync.yml` | Documenta justificativa das permissões |
| GA64 | `.github/workflows/branch-hygiene-audit.yml` | `if: !cancelled()` no passo de publicar |
| Extra | `.gitignore` | Adiciona `node_modules` |
| Extra | mock de `logger` em `ChatPopup.rolagem-mensagem-nova` | preserva `createLogger` com `withCorrelation` |

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — melhorias de CI (GA49-GA64) ainda não estão em main |
| 2 | Traz regressão? | **NÃO** — apenas CI scripts e configs; nenhum código de produção alterado |
| 3 | Já está em main? | **NÃO** — verificado contra descrição do PR |
| 4 | Regra de negócio correta? | **SIM** — `node_modules` no `.gitignore` é correção de higiene; schedule codeql diário correto |

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos reais com main (base `351ccb2a` muito atrás de `c4c7139e`). Requer rebase e resolução de conflitos.

## Ação necessária

Rebase na main atual para resolver conflitos. Após CI verde, fazer merge squash.
