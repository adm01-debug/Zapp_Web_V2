# Relatório de CI — SL-016

> Branch: `claude_05/brave-mccarthy-zvzky4`
> PR: [#2218](https://github.com/adm01-debug/Zapp_Web_V2/pull/2218)
> Atualizado em: 2026-10-25
> HEAD: `f040b7b9f`

---

## Estado dos required checks (6)

| Check | Estado |
|---|---|
| `🔍 Lint & TypeCheck` (`🔎 TypeCheck`) | ✅ success |
| `🧪 Unit Tests (1/3)` | ⏳ in_progress |
| `🧪 Unit Tests (2/3)` | ⏳ in_progress |
| `🧪 Unit Tests (3/3)` | ⏳ in_progress |
| `🔒 Security Audit` | ✅ success |
| `Contrato DB offline` | ⏳ in_progress (pré-existente em main — ver PENDENCIAS.md) |
| `🎭 E2E Tests (Playwright)` | ⏳ in_progress |

## Checks não-required

| Check | Estado |
|---|---|
| `🧬 Mutação do mapa` | ✅ success |
| `🧩 Node CI Scripts` | ✅ success |
| `Replay local das migrations` | ✅ success |
| `Vercel Preview Comments` | ✅ success |
| `copilot-pull-request-reviewer` | ❌ failure (não-required) |

---

## Baseline de typecheck / lint

| Métrica | Baseline (main) | Atual (branch) |
|---|---|---|
| Erros de typecheck | 93 | 63 (30 removidos, 0 novos) |
| Avisos de lint | 819 | 819 (0 novos) |

---

## Fix aplicado (SL-016)

**`src/components/team-chat/useTeamChatPanel.ts`**
- `p_limit: 50` (revertido da regressão 100→50, alinhado com main e testes canônicos)
- `searchError: string | null` (era `boolean`; agora retorna mensagem ou `null`)
- `searchIsCapped`: threshold `>= 50`

**`src/components/team-chat/__tests__/useTeamChatPanel.search-antigas.test.tsx`**
- `p_limit: 50` (linha 145)
- `.toBeFalsy()` / `.toBeTruthy()` em vez de `.toBe(false)` / `.toBe(true)`

---

## Falhas pré-existentes em `main`

| Falha | Causa |
|---|---|
| `Contrato DB offline` | `department_audit_logs_action_check` com valor `access_requested` |

Ver PENDENCIAS.md para detalhes e plano de correção separado.
