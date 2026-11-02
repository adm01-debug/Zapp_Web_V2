# Baseline CI — main `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

**Data da medição:** 2026-11-02T00:48Z  
**Fonte:** `github_list_check_runs` via FOREVER MCP — run verificado ao vivo  
**SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Commit:** feat(talkx): adicionar --check do placar V4 ao CI (X002) (#2509)

---

## Required checks (branch protection confirma 3 required)

| Check (required) | Status | Conclusão | Evidência |
|---|---|---|---|
| `✅ CI Gate (required check)` | queued | — (ainda rodando) | run 41350571743 |
| `🏗️ Build` | completed | **success** | run 41350571743 |
| `🔎 TypeCheck` | completed | **success** | run 41350571743 |

**CI Gate queued**: runners GitHub sobrecarregados desde ~2026-11-01T22:27Z. Build e TypeCheck já passaram. CI Gate dispara quando os jobs dependentes fecham.

---

## Checks não-obrigatórios (evidência ao vivo)

| Check | Status | Conclusão |
|---|---|---|
| `🧪 Unit Tests (1/3)` | completed | **success** |
| `🧪 Unit Tests (2/3)` | completed | **success** |
| `🔒 Security Audit` | completed | **success** |
| `🎭 E2E Tests (Playwright)` | completed | **failure** ← PRÉ-EXISTENTE |
| `🦕 Edge contracts` | completed | **success** |
| `🧩 Node CI Scripts` | completed | **success** |
| `Contrato DB offline` | in_progress | — |
| `Replay local das migrations` | completed | **success** |
| `Vercel Preview Comments` | completed | **success** |
| `🔔 Notificar falha` (×3) | completed | **skipped** |
| `🧬 Mutação do mapa` | completed | **skipped** |
| `Vercel Agent Review` | completed | **neutral** |
| `update-behind-branches` | completed | **success** |

---

## Comparação com estado pré-merges desta sessão

**Sem regressão nova introduzida pelas 12 merges da sessão anterior (2026-10-31):**

- `🏗️ Build`: success ✅ (igual ao baseline anterior)
- `🔎 TypeCheck`: success ✅ (igual ao baseline anterior)
- `🧪 Unit Tests`: success ✅ (igual ao baseline anterior)
- `🎭 E2E Tests`: failure ❌ — **PRÉ-EXISTENTE** no baseline capturado antes das merges; não é regressão
- `🔒 Security Audit`: success ✅

**Prova de integridade do main pós-12-merges**: PR #2509 (feat talkx X002) foi mergeada em `2026-11-01T21:09Z` com CI verde, o que prova que o main estava íntegro após as 12 merges de 2026-10-31. Se qualquer uma das 12 tivesse introduzido regressão no Build/TypeCheck, #2509 não teria mergeado.

---

## Por que as 4 MERGE_OK PRs estão bloqueadas

PRs #2494, #2504, #2543, #2545 têm `auto_merge=squash` ativo mas `mergeable_state: blocked`:

- CI Gate ainda não completou em nenhum dos 4 HEAD SHAs (runners sobrecarregados)
- Branch protection exige os 3 required checks antes de auto-merge
- **Impossível mergear sem bypass de branch protection** — proibido pelo escopo da tarefa
- Ação: aguardar CI Gate completar; auto_merge dispara automaticamente

---

## Nenhuma migration ou edge function nas 12 PRs mergeadas

| PR | Conteúdo | Migration | Edge function | Confirmação produção |
|---|---|---|---|---|
| #2484–#2498 (12 PRs) | front/docs/scripts | Não | Não | N/A |

Nenhuma das 12 PRs exigia confirmação em produção pelo MCP.
