# Dossiê — claude__fix-e2e-telefonia-teclado-261101-1558 (PR #2489)

**Branch:** `origin/claude/fix-e2e-telefonia-teclado-261101-1558` · tip `e5fd0eb9a` · merge-base `1252bb5a4`
**Propósito:** estabilizar o E2E de Telefonia (GR-012 Firefox): em `abrirDiscador()` esperar o teclado numérico ficar visível antes de retornar o painel, evitando clique no primeiro dígito antes do render.
**Commits reais:** 1 (`05e9552a2 fix: assert teclado visível em abrirDiscador (E2E telefonia)`); os outros 4 são merges de `main`.
**Diff total:** `e2e/telefonia.spec.ts` +1 linha.

## Arquivo × achado × evidência

| Arquivo | Lacuna na branch | Achado | Evidência na main |
|---|---|---|---|
| `e2e/telefonia.spec.ts` | `+ await expect(teclado(page)).toBeVisible();` dentro de `abrirDiscador` (branch @186-189) | **JÁ NA MAIN**, mesma função, mesmo texto | `origin/main:e2e/telefonia.spec.ts:189-190` (`// GR-012: aguarda teclado totalmente renderizado antes de retornar (Firefox)` + `await expect(teclado(page)).toBeVisible();`), dentro de `abrirDiscador` (linha 172). Entrou pelo commit `4b5c6e797` — `fix(e2e): aguarda teclado visível antes do primeiro clique — Firefox GR-012 (#2522)`, 2026-11-02. |

`hunk=CONFLICT` é só porque a main evoluiu `abrirDiscador` depois (#2717, #2755, #3079, #3080 adicionaram retry de boot e espera do aviso SIP); `missing_in_main=0` confirma que a única linha adicionada existe na main.

## Veredito
**INCORPORADA** (confiança alta). A PR #2489 foi substituída pela #2522, que fez exatamente a mesma mudança (+ comentário GR-012). Nenhuma lacuna.

**Apagar branch:** seguro (true).

## Verificação adversarial
**Concordo — INCORPORADA.** Tentei refutar e não achei lacuna.
- `git log --no-merges 1252bb5a4..origin/claude/fix-e2e-telefonia-teclado-261101-1558` → 1 commit (`05e9552a2`); `git diff 1252bb5a4 <ref> --stat` → só `e2e/telefonia.spec.ts | 1 +`. A linha é `await expect(teclado(page)).toBeVisible();` dentro de `abrirDiscador`, após o `expect(heading 'Telefonia')`.
- `origin/main:e2e/telefonia.spec.ts:189-190` tem exatamente essa linha (com comentário GR-012) na mesma posição de `abrirDiscador` (linha 172), antes do `return`. `git merge-base --is-ancestor 4b5c6e797 origin/main` → sim; `05e9552a2` não é ancestral de main (rebase/duplicata, não perda).
- `4b5c6e797` (#2522, 2026-11-02) descreve o mesmo fix para o mesmo problema (Firefox GR-012, `abrirDiscador` retornando antes do teclado). Nada na branch (sem src, edge, migration, workflow) fica fora da main.
- `hunk=CONFLICT` é apenas contexto divergente: main depois adicionou retry de boot, espera de `tel-dial-reason` e do toast SIP na mesma função.

**Apagar branch:** seguro.
