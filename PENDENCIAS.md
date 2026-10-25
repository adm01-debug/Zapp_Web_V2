# Pendências de CI — SL-016

> Gerado em: 2026-10-25
> Branch: `claude_05/brave-mccarthy-zvzky4`
> PR: [#2218](https://github.com/adm01-debug/Zapp_Web_V2/pull/2218)

---

## 1. Contrato DB offline — falha pré-existente em `main`

**Status:** ❌ Falha — NÃO introduzida por esta PR
**Check:** `Contrato DB offline`
**Causa raiz:** Constraint check `department_audit_logs_action_check` não aceita o valor `access_requested`

### Evidência de pré-existência

O check falha identicamente em `main` (SHA `2d97c44cfe7f2fa8a3ca572f8f5689118328e858`, run de 24/10/2026)
como `conclusion: failure` com a mesma causa raiz.

### O que a PR SL-016 toca

Arquivos modificados:
- `src/components/team-chat/useTeamChatPanel.ts`
- `src/components/team-chat/__tests__/useTeamChatPanel.search-antigas.test.tsx`

Nenhum arquivo toca `department_audit_logs`, `request_department_access`,
nem qualquer constraint relacionada ao check falhando.

### Ação necessária (em PR separada)

- Diagnosticar qual valor o constraint permite vs. o que está sendo inserido
- Corrigir migration ou a função que insere `access_requested`

---

## 2. `copilot-pull-request-reviewer` — failure (não-required)

**Status:** ❌ failure — não é required check, não bloqueia merge

Finding principal (searchError boolean) foi corrigido pelo fix desta PR.
Findings restantes são pré-existentes ou fora do escopo.

---

## Inventário de falhas em `main` (SHA `2d97c44c`, 24/10/2026)

| Check | Estado em main | Causa |
|---|---|---|
| `Contrato DB offline` | ❌ failure | `department_audit_logs_action_check` — valor `access_requested` viola constraint |
| Todos os outros required | ✅ success | — |
