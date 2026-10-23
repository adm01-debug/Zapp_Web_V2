# Consolidação — docs das PRs #2117 e #2118 (branch `claude/confident-babbage-ivgmmn`)

**Data:** 2026-10-21
**Base:** `origin/main` `d7af7a671c` · worktree próprio `/tmp/wt-docs1`, sem tocar a working tree de outro agente
**Escopo:** somente leitura + este documento. Nenhum código, migration ou `.github/` tocado.

## 1. Referências

| Item | Valor |
|---|---|
| PR #2117 (proveniência/drift) | `claude/docs-drift-provenance-babbage-261020-1929` @ `a6621ae3ac` — `docs/audits/PROVENANCE_MIGRATIONS_TEAM_CHAT_2026-10-20.md` (396 linhas, novo) |
| PR #2118 (matriz de salvage) | `claude/docs-matriz-babbage-salvage-261020-1933` @ `48e98fd037` — `docs/audits/MATRIZ_BABBAGE_SALVAGE.md` (398 linhas, novo) |
| Branch abandonada auditada | `origin/claude/confident-babbage-ivgmmn` @ `0e283d06` (PR #1151 fechada sem merge) |
| Estado das PRs (21/10) | ambas `OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED` (bloqueio = required checks vermelhos, não conflito) |

## 2. Vereditos consolidados (verificação independente — comandos no §5)

| Item | Veredito final | Fonte |
|---|---|---|
| E61 `useResolvedStorageUrl` | ✅ `OK_NA_MAIN` — existe em `src/hooks/storage/useResolvedStorageUrl.ts`, símbolo em 56 arquivos | correção `48e98fd0` + comentários da #2118 |
| E76 `useAgentPresenceMap` | ✅ `OK_NA_MAIN` — 18 arquivos em `src/` usam o helper | correção `48e98fd0` + comentários da #2118 |
| E52 decisão de publication | 🔵 `PORT` **doc-only** — a coluna `conversation_id` existe e `useTeamReadState.ts` já a usa (5 ocorrências); só falta o doc de decisão | comentários da #2118 |
| E90 `notificationclick → ?cid=` | 🔵 `PORT`, lacuna real — 0 ocorrências em `src/`; correção exige `src/hooks/chat/useTeamChatNotifications.ts` (PR #2080), por isso não implementada | comentários da #2118 |
| E83 entrar via código | ✅ feito na PR #2131 (`useRedeemDepartmentInvite` + `EnterDepartmentByCode.tsx`) | apêndice da #2118 |
| 40 migrations `team_chat` | ⛔ não portar — na `main` como cópias do ledger (PR #1199) | #2117 + §4.1 da #2118 |
| Risco de replay (`20260928430000`) | ⛔ não se reproduz — arquivo falha no meio (`conversation_id` ainda não existe, `ON_ERROR_STOP=1`), a guarda de `20261003272707` cria as policies canônicas; `Replay local` verde nas duas PRs | nota `a6621ae3` na #2117 |
| PR #2137 (reafirmação idempotente) | opcional/defensiva, não obrigatória | nota `a6621ae3` |

## 3. Residual registrado (NÃO corrigido aqui — ownership do autor da #2118)

O HEAD da #2118 (`48e98fd0`) corrigiu as linhas E61/E76 e adicionou o apêndice de verificação,
mas o corpo manteve o estado anterior: contagem do §3 (`PORT = 4`), vereditos `PORTAR (E61)` e
`PORTAR (E76)` no §4.2, nota do `useTeamPresence.ts` no §4.3 e saldo do §5 (lista E61/E76 e E83
como pendente). O alinhamento dessas seções ao apêndice cabe à #2118; este documento prevalece
como referência até lá.

## 4. Checks — falhas pré-existentes, idênticas nos três pontos

| Check | `main` `d7af7a67` (runs 39298103966/57) | #2117 | #2118 |
|---|---|---|---|
| Contrato DB offline | failure | failure | failure |
| Node CI Scripts | failure | failure | failure |
| Unit Tests (1/3, 2/3, 3/3) | failure | failure | failure |
| E2E (Playwright) | failure | failure | failure |
| Mutação do mapa (não bloqueante) | failure | failure | failure |
| Replay local das migrations | success | success | success |
| TypeCheck / Security Audit | success | success | success |

Ambas as PRs tocam **1 arquivo `.md` cada** (`git diff --stat origin/main...<head>`) — nenhum `.md`
causa falha de DB/E2E/Unit. O `main` puro falha igual: as falhas são da base, não dos docs.

## 5. Reprodução

```bash
git rev-parse origin/main  # d7af7a671c
git log --oneline origin/main..origin/claude/docs-drift-provenance-babbage-261020-1929  # a6621ae3ac + eaab1ee8fd
git log --oneline origin/main..origin/claude/docs-matriz-babbage-salvage-261020-1933     # 48e98fd037 + 4a8bd72f43
git grep -l useResolvedStorageUrl origin/main -- src/ | wc -l        # 56
git cat-file -e origin/main:src/hooks/storage/useResolvedStorageUrl.ts
git grep -l useAgentPresenceMap origin/main -- src/ | wc -l          # 18
git grep -c notificationclick origin/main -- src/ | head -3          # 0 ocorrências
gh pr checks 2117; gh pr checks 2118                                 # mesmos fails da main
```
