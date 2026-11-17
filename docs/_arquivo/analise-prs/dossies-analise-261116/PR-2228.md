# Dossiê PR #2228

**Título:** fix(tests): corrige falha mecânica de mock em useAdminDataCreateUser.test.ts  
**Branch:** `claude/fix-unit-tests-mechanical-261024-1527`  
**Head SHA:** `af3fa1db777b150698beace933043ed75ac945bb`  
**Base SHA:** `b1fe88215b4861121c912140d7968581e26e9111` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-24  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivo alterado:** `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` (1 arquivo, 49 adições, 34 deleções)

**Problema:** Mock apontava para `@/lib/supabaseHelpers` (módulo que não tem os exports necessários), fazendo 8 testes falharem silenciosamente.

**Correção:**
- `vi.mock('@/lib/supabaseHelpers')` → dois mocks separados: `vi.mock('@/lib/invokeEdge')` + `vi.mock('@/integrations/supabase/client')`
- `mockInvokeEdge` ajustado: caminho feliz resolve `{ data, error: null }` (contrato real)
- `readEdgeError` mockado para `{ status, message }` conforme `parseEdgeError`
- Helper `httpError` simplificado: usa `_parsedStatus`/`_parsedMessage` que o mock lê

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — 8 testes de `useAdminDataCreateUser` estavam com mock errado, falhando silenciosamente |
| 2 | Traz regressão? | **NÃO** — apenas arquivo de teste; código de produção intocado |
| 3 | Já está em main? | **NÃO** — diff mostra substituição do mock |
| 4 | Regra de negócio correta? | **SIM** — aponta mock para os módulos que o código real usa (`@/lib/invokeEdge`, `@/integrations/supabase/client`) |

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos com main (base `b1fe8821`). Arquivo único de teste, conflito provavelmente simples.

## Ação necessária

Rebase na main atual para resolver conflitos. Após CI verde, fazer merge squash.
