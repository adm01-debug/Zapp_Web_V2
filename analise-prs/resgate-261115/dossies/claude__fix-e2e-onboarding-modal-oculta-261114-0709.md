# Dossiê — claude__fix-e2e-onboarding-modal-oculta-261114-0709 (PR #3072)

**Branch:** `origin/claude/fix-e2e-onboarding-modal-oculta-261114-0709` · tip `eeeace208` · merge-base `ff0a5dbc` · 1 commit
**Propósito:** `test(e2e): preparo do tour enxerga Contatos sob o modal de boas-vindas` — em `e2e/fixtures/onboarding-isolated.ts::gotoOnboardingContacts`, passar `includeHidden: true` nos `getByRole` de `main`, `heading` "Contatos" e `tab` "Todos", porque o WelcomeModal (Radix Dialog, `hideOthers`) põe `aria-hidden` no wrapper do `<main>` e a prontidão da tela não pode depender de quem monta primeiro.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência |
|---|---|---|---|
| `e2e/fixtures/onboarding-isolated.ts` | BOTH_CHANGED / CONFLICT, 9 linhas "missing" | **INCORPORADA** com outro texto, pela PR #3071 | `git log origin/main -- e2e/fixtures/onboarding-isolated.ts` → `58f1713ba fix(e2e): prontidão de Contatos imune ao aria-hidden do modal de boas-vindas (#3071)`. `origin/main:e2e/fixtures/onboarding-isolated.ts:108` `getByRole('main', { name: 'Conteúdo principal', includeHidden: true })`; `:109` `main.getByRole('heading', { level: 1, name: 'Contatos', includeHidden: true })`; `:121` `main.getByRole('tab', { name: /Todos/, includeHidden: true })`; comentário equivalente em `:105-107` (WelcomeModal / hideOthers / aria-hidden). |

As 9 linhas "missing" são (a) o comentário em outra redação, (b) a constante `sobModal` (a main inlina `includeHidden: true`) e (c) as 3 chamadas com spread — comportamento idêntico. A main ainda vai além: a `tab` Todos fica escopada ao `main` (branch usava `page.getByRole`), o que é mais estrito, não menos.

## Veredito
**INCORPORADA** — confiança alta. O comentário de fechamento da #3072 ("duplicada da #3071, `58f1713bae`") confere com o código lido na main.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro (`true`).

## Verificação adversarial

Parecer: **concordo — INCORPORADA**. Tentei refutar e não encontrei nenhum hunk útil fora da `main`.

Checagens feitas (git somente leitura):
- `git diff ff0a5dbc eeeace208 --name-only` → **um único arquivo**: `e2e/fixtures/onboarding-isolated.ts` (+9/-3). Não há migration, workflow, `src/` ou edge escondido na branch, então o universo de perda possível é esse arquivo.
- Diff completo da branch lido linha a linha: a mudança é (a) comentário explicando o `hideOthers` do WelcomeModal, (b) `const sobModal = { includeHidden: true } as const`, (c) spread de `sobModal` em `getByRole('main')`, `getByRole('heading', { level: 1, name: 'Contatos' })` e `getByRole('tab', { name: /Todos/ })`.
- `git show origin/main:e2e/fixtures/onboarding-isolated.ts` (`gotoOnboardingContacts`, linhas 103-123) tem o equivalente comportamental de todos os três pontos:
  - `:105-107` comentário sobre `includeHidden` / WelcomeModal / `hideOthers` / aria-hidden (outra redação, mesmo conteúdo);
  - `:108` `const main = page.getByRole('main', { name: 'Conteúdo principal', includeHidden: true });`
  - `:109` `const heading = main.getByRole('heading', { level: 1, name: 'Contatos', includeHidden: true });`
  - `:121` `await expect(main.getByRole('tab', { name: /Todos/, includeHidden: true })).toBeVisible();`
- `git grep -n includeHidden origin/main -- e2e` → só essas 4 ocorrências, todas nesse arquivo: não há outro ponto do E2E que a branch cobrisse e a main não.
- `git log --oneline origin/main -- e2e/fixtures/onboarding-isolated.ts` → `58f1713ba fix(e2e): prontidão de Contatos imune ao aria-hidden do modal de boas-vindas (#3071)` como último toque. Não houve revert/remoção posterior (os commits anteriores são `e900ae317` e `afd8c7ca3`, ambos antes da #3071).
- `git merge-base --is-ancestor eeeace208 origin/main` → falso. Confirma que a branch não foi mergeada: a incorporação foi por **reescrita equivalente** na #3071, não pelo commit da branch. Isso explica o `CONFLICT` do `line_check` e as "9 linhas missing" — são diferença de redação (comentário) e de estilo (constante `sobModal` vs. `includeHidden: true` inline), não de comportamento.

Delta residual, avaliado e descartado como lacuna:
- Branch: `page.getByRole('tab', { name: /Todos/, includeHidden: true })` (busca na página inteira). Main: `main.getByRole('tab', …)` (escopada ao `<main>`). A main é **mais estrita**, não mais frouxa — portar a versão da branch afrouxaria o teste. Valor da lacuna: negativo.
- A constante `sobModal` é açúcar de estilo sobre três literais idênticos; zero efeito em runtime. Valor < baixo.

Risco de apagar a branch: nenhum. Único arquivo tocado, já coberto na `main` com paridade comportamental verificada em `origin/main:e2e/fixtures/onboarding-isolated.ts:105-121`.
