# Dossiê — claude__fix-telefonia-firefox-gr012 (PR #2428)

**Ref:** `origin/claude/fix-telefonia-firefox-gr012` · tip `0b7db6cbc` · merge-base `3b5f8a96d` (2026-11-01)

## Propósito
Flake do E2E de Telefonia no Firefox (GR-012): `abrirDiscador` retornava antes do teclado numérico estar renderizado e o primeiro clique de `digitarNaTela` se perdia. A branch adiciona, em `abrirDiscador`, uma espera `await expect(teclado(page)).toBeVisible();` antes do `return`.

Commits úteis (os demais são merges de `main`):
- `9aac66398 fix(e2e): aguarda teclado visível em abrirDiscador antes do primeiro clique (GR-012)`
- `85b6a84bb fix(e2e): GR-012 — aguarda teclado visível no Firefox antes de retornar`

`git diff --stat 3b5f8a96d origin/claude/fix-telefonia-firefox-gr012` → `e2e/telefonia.spec.ts | 2 ++` (único arquivo, 2 linhas adicionadas, 0 removidas).

## Arquivo × achado × evidência

| Arquivo | Diff da branch | Achado | Evidência |
|---|---|---|---|
| `e2e/telefonia.spec.ts` | +2 linhas em `abrirDiscador` (comentário GR-012 + `await expect(teclado(page)).toBeVisible();`) | **Já está na main, byte a byte** | `git grep -n` em `origin/main`: linha 189 `// GR-012: aguarda teclado totalmente renderizado antes de retornar (Firefox)` e linha 190 `await expect(teclado(page)).toBeVisible();`. Entrou pelo commit `4b5c6e797 2026-11-02 fix(e2e): aguarda teclado visível antes do primeiro clique — Firefox GR-012 (#2522)` (`git log -S`). |

Observações:
- O `hunk: CONFLICT` do mecânico vem só do contexto: a main evoluiu `abrirDiscador` depois (espera do toast "Senha SIP não configurada" antes do `return`, linhas 191-209 na main), então o patch não aplica no mesmo offset — mas as duas linhas da branch estão lá, no mesmo ponto lógico (logo após o `expect(heading 'Telefonia')`).
- Os commits `9aac66398`/`85b6a84bb` não são ancestrais da main (reimplementado via PR #2522 com texto idêntico); isso não muda o veredito — a prova é o conteúdo, não o SHA.
- Nada de banco, edge, workflow ou `src/` nesta branch.

## Veredito
**INCORPORADA** (confiança alta). Lacunas: nenhuma. A triagem anterior (`triagem_2804`: OBSOLETA) estava imprecisa — o conteúdo foi incorporado, não descartado.

`apagar_branch_seguro = true`.

## Verificação adversarial
**Concordo: INCORPORADA.** Tentei refutar e não achei hunk perdido.

- `git diff 3b5f8a96d origin/claude/fix-telefonia-firefox-gr012` → um único hunk em `e2e/telefonia.spec.ts` (`@@ -186,6 +186,8 @@ async function abrirDiscador`), +2/-0: comentário `// GR-012: aguarda teclado totalmente renderizado antes de retornar (Firefox)` e `await expect(teclado(page)).toBeVisible();`. Nenhum outro arquivo (o commit `53214c307 ci: re-trigger CI` não deixa diff líquido).
- `git show origin/main:e2e/telefonia.spec.ts` linhas 189-190: as duas linhas idênticas, no mesmo ponto lógico (logo após `expect(heading 'Telefonia')`, dentro de `abrirDiscador`). `git grep -n "GR-012" origin/main -- e2e/telefonia.spec.ts` → 189, 251, 256.
- `git log -S'GR-012: aguarda teclado totalmente renderizado' origin/main -- e2e/telefonia.spec.ts` → `4b5c6e797 fix(e2e): aguarda teclado visível antes do primeiro clique — Firefox GR-012 (#2522)`; não há remoção posterior.
- O `hunk: CONFLICT` é só deslocamento de contexto: a main acrescentou depois (linhas 191-209) a espera do toast "Senha SIP não configurada", que é superconjunto da intenção da branch.

Lacunas adicionais: nenhuma. `apagar_branch_seguro = true`.
