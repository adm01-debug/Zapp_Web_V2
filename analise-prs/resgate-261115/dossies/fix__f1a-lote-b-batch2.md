# Dossiê — fix__f1a-lote-b-batch2 (`origin/fix/f1a-lote-b-batch2`, PRs #2076 e #2436)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
Branch do lote F1a (2026-10-23), 3 commits sobre `bac62ba98`:
- `a4de2dbc4 chore(fmt): prettier em GroupsView.a11y.test.tsx` — só reformatação.
- `f190aa201 fix(test): mock de framer-motion sem useReducedMotion/MotionConfig em GroupsView.a11y` — a única mudança funcional: acrescenta `useReducedMotion: () => false` e `MotionConfig: ({children}) => children` ao `vi.mock('framer-motion', …)`, porque `GroupsView.tsx` passou a importar os dois e o teste quebrava.
- `d76fb9d57` merge de main (sem conteúdo próprio).

Único arquivo tocado: `src/components/groups/__tests__/GroupsView.a11y.test.tsx` (+60/−17).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/groups/__tests__/GroupsView.a11y.test.tsx` | A intenção funcional (mock de `MotionConfig` + `useReducedMotion`) **já está na main**, com texto quase idêntico e um comentário a mais. | `git show origin/main:src/components/groups/__tests__/GroupsView.a11y.test.tsx` linhas 77–79: `// Grupos passou a usar o movimento reduzido…` / `MotionConfig: ({ children }…) => children,` / `useReducedMotion: () => false,`. Entrou pelo commit `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)") — `git log -S'useReducedMotion' origin/main -- <arquivo>`. O componente alvo usa os dois: `origin/main:src/components/groups/GroupsView.tsx:2,74,77,354`. |
| idem | O restante do diff (48 linhas "missing_in_main" + 16 "removed_still_in_main") é **exclusivamente formatação prettier**: quebra de objetos literais (`mockData.grupos`), de `vi.fn().mockResolvedValue(...)`, de arrow functions JSX nos mocks de `EmptyState`/`PageHeader`/`withFeedback`, dos `expect(...)` longos e remoção de vírgula final em `</button>,`. Nenhuma alteração de comportamento, asserção ou mock. | `git diff origin/fix/f1a-lote-b-batch2 origin/main -- <arquivo>`: todos os hunks são reflow; o único hunk com conteúdo (`useReducedMotion`/`MotionConfig`) existe nos dois lados, só em ordem diferente. Prettier não é check de CI: `git grep prettier origin/main -- .github/workflows/*.yml` → vazio (só devDependency em `package.json:133-134`). |

Por que a pré-classificação deu `CONFLICT`: o `line_check` compara linhas textualmente, e a reformatação muda todas as linhas dos hunks; semanticamente é o mesmo código.

## Lacunas a recuperar
Nenhuma. A única lacuna textual é cosmética (prettier num arquivo de teste que a main mantém no estilo compacto), valor `nenhum`.

## Triagem anterior (2026-11-08)
Classificou #2076 e #2436 como OBSOLETA. Mais preciso é INCORPORADA: o fix do mock foi absorvido na main por `e1f2ee4dd` e o teste alvo continua existindo. Resultado prático idêntico: branch pode ser apagada.

## Verificação adversarial (2026-11-15)

Parecer: **CONCORDO com a triagem — INCORPORADA, branch segura para apagar.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Provas que eu mesmo levantei (main em `dac285f62`):

1. `git diff origin/main:src/.../GroupsView.a11y.test.tsx origin/fix/f1a-lote-b-batch2:src/.../GroupsView.a11y.test.tsx` — diff integral tem **8 hunks, todos reflow prettier** (objeto `mockData.grupos`, cadeia `vi.fn().mockResolvedValue`, `onAuthStateChange`, JSX dos mocks `motion.div/span`, `EmptyState`, `PageHeader`, `withFeedback`, dois `expect(...)` longos). Nenhum mock novo, nenhuma asserção nova, nenhuma lógica diferente.
2. O único conteúdo funcional do commit `f190aa201` já está na main: `origin/main:src/components/groups/__tests__/GroupsView.a11y.test.tsx:77-79` tem `MotionConfig` e `useReducedMotion: () => false` — com comentário explicativo que a branch **não** tem. Entrou por `e1f2ee4dd` ("fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)").
3. O alvo do mock continua vivo: `src/components/groups/GroupsView.tsx:2` importa `motion, MotionConfig, useReducedMotion`; usa em `:74` (`useReducedMotion() ?? false`) e `:77/:354` (`<MotionConfig reducedMotion="user">`). Logo o mock da main é necessário e suficiente.
4. **Executei o teste na versão da main** (arquivo do worktree idêntico à main — `git diff origin/main -- <arquivo>` vazio): `npx vitest run src/components/groups/__tests__/GroupsView.a11y.test.tsx` → `Test Files 1 passed (1) · Tests 5 passed (5)`. A necessidade que a branch atendia está coberta e verde.
5. Formatação não é exigida: `.prettierrc` existe, mas `grep -rn prettier package.json .github/workflows/` só retorna `package.json:133-134` (devDependencies). Não há script `format`/`format:check` nem job de CI. Consequência zero.
6. Único ponto em que a branch "difere de verdade" é regressivo: ela **remove** o comentário de `:77` da main e remove a vírgula final de `</button>,` (`:218`). Com `trailingComma: "es5"` o prettier atual tiraria essa vírgula, mas sem check de CI isso não é dívida — e não justifica manter a branch.
7. PRs do mesmo tip: #2076 `state=closed, merged=false, mergeable_state=dirty` e #2436 `state=closed, merged=false, draft`. Nenhuma PR aberta é fechada pela deleção da ref.

Lacunas adicionais encontradas: nenhuma.
