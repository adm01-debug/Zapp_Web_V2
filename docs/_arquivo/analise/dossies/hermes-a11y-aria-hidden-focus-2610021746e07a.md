# Dossiê — `hermes/a11y-aria-hidden-focus-2610021746e07a`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.

---

## ⚠ Riscos de Regressão

Nenhum — mudança de desenvolvimento apenas (DEV mode, `import.meta.env.DEV`).

---

## 1. Intenção

Fix de acessibilidade: evitar falso positivo do `@axe-core/react` em desenvolvimento. O axe auditava árvores transitórias durante a hidratação do React e reportava violações que não existiam no estado final (landmark-one-main, page-has-heading-one, aria-hidden-focus). A branch adicionou guard `if (!document.querySelector('main')) return;` para auditar só quando o `<main>` estiver no DOM (marco de que o app montou).

---

## 2. Resumo do Diff

Category A (merge base real: `c3411a92a771b967016d021691569edabdebc9a7`). Inventário registrou como Category B (NONE).

`git diff --stat c3411a92..139811c3e`:
```
src/main.tsx | 7 +++++++
1 file changed, 7 insertions(+)
```

Mudanças em `src/main.tsx`:
- Bloco de comentário explicando o falso positivo (5 linhas)
- `if (!document.querySelector('main')) return;` antes do processamento de violações (1 linha)
- Nenhuma mudança fora do bloco `if (import.meta.env.DEV)`

---

## 3. Checklist com Evidências

| Item | Status | Evidência |
|---|---|---|
| Guard `querySelector('main')` em `main` | ✅ | `git show origin/main:src/main.tsx \| grep -n "querySelector"` → linha 80: `if (!document.querySelector('main')) return;` |
| Comentário sobre aria-hidden-focus em `main` | ✅ | `git show origin/main:src/main.tsx \| grep -n "aria-hidden\|auditar"` → linhas 76,80,89 presentes |
| Migrations | ✅ | Nenhuma |
| SINGU | ✅ | Zero refs |
| Código fora de DEV | ✅ | Mudanças só dentro de `if (import.meta.env.DEV)` — sem impacto em build de produção |

---

## 4. Veredito + Confiança

**SUPERADA** — confiança **0.92**

Conteúdo integral da branch (`querySelector` guard + comentário) confirmado em `origin/main:src/main.tsx` linha 80. Absorvido.

---

## 5. Metadados

| Campo | Valor |
|---|---|
| Branch | `hermes/a11y-aria-hidden-focus-2610021746e07a` |
| Tip SHA | `139811c3e` |
| Inventário | Category B (real: A) · ahead=9282 · merge_base=c3411a92 |
| Analisado em | 2026-10-23 |
| Sessão | `claude/dazzling-cannon-j7iw08` |
