# Dossiê — fix__f1a-lote-b-hooks-misc-1 (PR #2074)

- Ref: `origin/fix/f1a-lote-b-hooks-misc-1` · tip `ff66b4565` · merge_base `9d65fed62` (2026-10-18)
- Commit único: `ff66b4565 fix: overlay de useScreenProtection sem role=alert/aria-live — 1 arquivo (lote F1a)`
- Diff: `src/hooks/ui/useScreenProtection.ts | 5 +++++` (2 linhas funcionais + 3 linhas de comentário)

## Propósito
Acessibilidade: o overlay de proteção de tela (`#screen-protection-overlay`) passa a ter `role="alert"` e `aria-live="assertive"` para que leitores de tela anunciem a proteção sem precisar de foco.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/ui/useScreenProtection.ts` | INCORPORADA (parte funcional) | `git show origin/main:src/hooks/ui/useScreenProtection.ts` linhas 119-120: `overlay.setAttribute('role', 'alert');` / `overlay.setAttribute('aria-live', 'assertive');` — idênticas ao diff da branch. Entrou pelo commit `4b9585052 Correções validadas de CI, segurança e integrações (#2156)` (`git log -S'aria-live' origin/main -- <arquivo>`). |
| idem | Faltam só 3 linhas de comentário explicativo (`// O usuário pode estar de olho...` etc.) | `line_check.missing_in_main=3`, todas comentários. Zero impacto em comportamento. |

## Veredito
**INCORPORADA** (confiança alta). O único conteúdo ausente na main são 3 linhas de comentário; o comportamento está 100% na main. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma funcional. Comentário opcional (valor: nenhum):
```ts
      // O usuário pode estar de olho em outra janela quando a proteção entra:
      // role="alert" + aria-live="assertive" anuncia pro leitor de tela sem
      // precisar de foco no overlay.
```
(iria antes de `overlay.setAttribute('role', 'alert');` em `src/hooks/ui/useScreenProtection.ts:119` na main).

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não há nada a resgatar.

Provas que eu mesmo rodei (repo local, `origin/main` atual):

1. Diff completo da branch é 1 hunk, 1 arquivo, 5 inserções, 0 remoções:
   `git diff --stat 9d65fed626e05a9582c56badade4d2e6afaf9356 origin/fix/f1a-lote-b-hooks-misc-1`
   → `src/hooks/ui/useScreenProtection.ts | 5 +++++`. Não existe nenhum outro arquivo/hunk fora do que a triagem examinou (nada de migration, edge, workflow ou teste escondido).
2. Teste decisivo — diff da branch contra a **main** (não contra o merge-base):
   `git diff origin/main origin/fix/f1a-lote-b-hooks-misc-1 -- src/hooks/ui/useScreenProtection.ts`
   → o único resíduo são as 3 linhas de comentário; as duas linhas funcionais aparecem como contexto (sem `+`), isto é, já estão na main. Isso fecha a questão: o delta branch→main é 100% comentário.
3. `git grep -n "aria-live" origin/main -- src/hooks/ui/useScreenProtection.ts` → linhas 119 e 120 (`overlay.setAttribute('role', 'alert');` / `overlay.setAttribute('aria-live', 'assertive');`), no mesmo ponto do `handleBlur`, logo após `overlay.id = 'screen-protection-overlay'` (linha 118). Comportamento idêntico ao da branch.
4. Procedência confirmada: `git log -S"aria-live" --oneline origin/main -- src/hooks/ui/useScreenProtection.ts` → `4b9585052 Correções validadas de CI, segurança e integrações (#2156)`. Entrou por merge legítimo, não é coincidência de reescrita.
5. Não há remoção posterior: o `-S` retorna um único commit (o de introdução); se tivesse sido revertido apareceria um segundo. As linhas estão vivas no HEAD de `origin/main`.

Valor da lacuna remanescente: **nenhum**. Três linhas de comentário não mudam DOM, acessibilidade, build, lint ou teste. Nenhum hunk de valor ≥ médio fora da main → não rebaixo para PERDIDA_PARCIAL.

`apagar_branch_seguro = true` (a branch não carrega comportamento exclusivo).
