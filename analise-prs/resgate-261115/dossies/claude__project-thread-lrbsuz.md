# Dossiê — claude__project-thread-lrbsuz (PR #2524)

**Branch:** `origin/claude/project-thread-lrbsuz` · tip `3ff941d8c` · merge-base `1252bb5a4` (2026-11-01) · 1 commit
**PR #2524:** "fix: adiciona gte/lte ao mock chainable em useAdminData.select.test.ts" — CLOSED sem merge em 2026-11-01 (congelamento de features #2545). Triagem 2026-11-08: OBSOLETA.

## Propósito
Alegação da PR: `useAdminData.ts` passou a usar `.gte()`/`.lte()` em `audit_logs` e o mock do Supabase no teste `useAdminData.select.test.ts` quebraria com `b.gte is not a function`. Fix: acrescentar `'gte','lte'` ao array do builder chainable; de carona, apaga o cabeçalho de comentário N-216 e um comentário inline.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência |
|---|---|---|---|
| `src/components/admin/__tests__/useAdminData.select.test.ts` | `+ for (const m of [... 'range', 'gte', 'lte'])` | **Premissa falsa → OBSOLETA.** O hook só chama `.gte`/`.lte` quando há filtro de data; o teste chama `useAdminData('audit')` sem filtro, logo o mock nunca é invocado com `gte`/`lte`. | `origin/main:src/components/admin/useAdminData.ts:272-273` → `if (auditFrom) query = query.gte(...)` / `if (auditTo) query = query.lte(...)`; `origin/main:...useAdminData.select.test.ts:35` → `renderHook(() => useAdminData('audit'))` (sem `auditFilter`). Já era condicional no merge-base (`1252bb5a4:useAdminData.ts:273-274`). |
| idem | `-` cabeçalho de 8 linhas `/** N-216 — ... */` | Remoção de comentário documental; a main mantém (linhas 4-10). Ruído, não é lacuna. | `git show origin/main:src/components/admin/__tests__/useAdminData.select.test.ts` linhas 4-10 |
| idem | `-    // details é exibida na tabela — permanece.` | Idem (main linha 48). Ruído. | idem, linha 48 |

Contexto adicional: a main já passou pelo commit `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)") que tocou exatamente este arquivo de teste — o arquivo está no estado em que o CI Gate ficou verde. O hook `useAdminData.ts` mudou na main depois do merge-base (`1f77f7917`, `41853318c`) sem tornar `gte`/`lte` incondicionais.

**NÃO VERIFICADO em runtime:** não há `node_modules` neste clone (`npx vitest` falha com EOVERRIDE do npm; `./node_modules/.bin/vitest` inexistente) — a prova é estática (código condicional + teste sem filtro).

## Veredito
**OBSOLETA** — a falha que a PR corrigia não ocorre na main (nem ocorria no merge-base). Os hunks restantes são remoção de comentários (valor nenhum). `apagar_branch_seguro = true`.

## Lacuna (valor baixo, opcional — robustez do mock, não protege comportamento)
Se algum dia o hook chamar `gte`/`lte` sem filtro, ou um teste passar `auditFilter`, basta esta linha em `src/components/admin/__tests__/useAdminData.select.test.ts` (linha 22 na main):
```diff
-      for (const m of ['order', 'limit', 'eq', 'in', 'neq', 'range']) b[m] = () => b;
+      for (const m of ['order', 'limit', 'eq', 'in', 'neq', 'range', 'gte', 'lte']) b[m] = () => b;
```
Não portar as remoções de comentário.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar e não consegui — ao contrário, achei a prova que faltava.

**O que a triagem deixou como "NÃO VERIFICADO" eu verifiquei em runtime.** O dossiê afirma que não há `node_modules` neste clone. Está errado: `/home/user/Zapp_Web_V2/node_modules/.bin/vitest` existe. Rodei o teste na versão da main dos dois arquivos:

```
$ ./node_modules/.bin/vitest run src/components/admin/__tests__/useAdminData.select.test.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

(working tree em `346c62601`; `git diff --stat origin/main --` nos dois arquivos relevantes retorna vazio, isto é, `useAdminData.ts` e `useAdminData.select.test.ts` estão idênticos a `origin/main` — logo o verde é o verde da main.)

Isso transforma a prova estática da triagem em prova de execução: o erro `b.gte is not a function` que a PR #2524 alegava corrigir **não acontece**. A premissa da PR é falsa.

**Confirmações independentes (não copiei a triagem):**
- `git show origin/main:src/components/admin/useAdminData.ts` — `.gte`/`.lte` aparecem só nas linhas 272-273, ambas dentro de `if`: `if (auditFrom) query = query.gte(...)` / `if (auditTo) query = query.lte(...)`. Nenhuma outra chamada `.gte(`/`.lte(` no arquivo.
- `git show 1252bb5a4:src/components/admin/useAdminData.ts` — mesmas duas chamadas condicionais nas linhas 273-274. Já era condicional no merge-base; a PR nunca teve razão de ser, nem no dia em que foi aberta.
- `git show origin/main:...useAdminData.select.test.ts:36` — `renderHook(() => useAdminData('audit'))`, sem segundo argumento, logo `auditFilter === undefined` → `auditFrom`/`auditTo` undefined → os dois `if` são falsos.
- `git grep -l "auditFilter" origin/main -- 'src/**/__tests__/*'` — **nenhum** arquivo de teste na main passa `auditFilter`. Não existe outro teste que exercite esse caminho e que pudesse quebrar.

**Busca por hunk útil não coberto (o que me pediram para procurar):** o diff `1252bb5a4..3ff941d8c` tem exatamente 3 hunks, 1 arquivo, +1/-10.
1. `+ ... 'range', 'gte', 'lte'` no array do mock — é a única linha com algum conteúdo. Valor **baixo**, não médio: é robustez defensiva de um mock para um caminho que nenhum teste percorre e que o código de produção só percorre sob `if`. Não protege comportamento nenhum hoje, e o teste passa sem ela (provado acima). Fica registrada como lacuna opcional, já colada no dossiê.
2. `-` cabeçalho `/** N-216 … */` (8 linhas, main 4-10) — remoção de documentação. Valor **negativo**.
3. `-    // details é exibida na tabela — permanece.` (main 50) — idem. Valor **negativo**.

Não há hunk de valor ≥ médio fora da main. Nada a rebaixar para PERDIDA_PARCIAL.

**Veredito final: OBSOLETA · `apagar_branch_seguro = true`.** Único reparo ao dossiê: trocar o "NÃO VERIFICADO em runtime" pelo resultado do vitest acima.
