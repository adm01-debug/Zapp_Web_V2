# Dossiê PR #2225

**Título:** fix(e2e): mock do RPC app_bootstrap para corrigir travamento em ProtectedRoute  
**Branch:** `claude/fix-e2e-mock-app-bootstrap-261024-1527`  
**Head SHA:** `33e6cd02cdad19408985dd22723d45c148fb57bf`  
**Base SHA:** `b1fe88215b4861121c912140d7968581e26e9111` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-24  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_CONFLITO**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivo alterado:** `e2e/fixtures/mapa-mocks.ts` (1 arquivo, 6 adições, 3 deleções)

```diff
+await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) => json(route, {}));
```

O hook `useAppBootstrap` introduzido pelo PR #1986 chama o RPC `app_bootstrap`. Sem mock, o `ProtectedRoute.tsx` ficava em `"Verificando permissões..."` indefinidamente em E2E. A correção adiciona mock explícito e atualiza o catch-all com negative lookahead para `app_bootstrap`.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — fix cirúrgico de E2E que trava sem esse mock |
| 2 | Traz regressão? | **NÃO** — apenas fixture de E2E; código de produção intocado |
| 3 | Já está em main? | **NÃO** — diff mostra +route mock |
| 4 | Regra de negócio correta? | **SIM** — mock retorna `{}` conforme contrato mínimo do hook |

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos com main (base `b1fe8821`). Mudança é pequena (9 linhas), conflito provavelmente simples.

## Ação necessária

Rebase na main atual para resolver conflitos. Após CI verde, fazer merge squash.
