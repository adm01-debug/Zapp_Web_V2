# Dossiê — fix__f1a-lote-b-admin-audit-page-size (PR #2068)

- Ref: `origin/fix/f1a-lote-b-admin-audit-page-size` · tip `b6faf7736` · merge-base `bac62ba98` (2026-10-23) · main avaliada: `dac285f62`
- Triagem anterior (2026-11-08): OBSOLETA. Esta triagem: **INCORPORADA** (prova abaixo).

## Propósito
Destravar 3 testes de `AdminView` cujo `vi.mock('../useAdminData')` não exportava `AUDIT_PAGE_SIZE` e `MIN_PASSWORD_LENGTH` (constantes reais em `src/components/admin/useAdminData.ts:119,121`). Commits: `47172a546` (prettier), `a121fb7bf` (mock em 2 arquivos), `db9875016` (3º arquivo), `b6faf7736` (merge main). Diff total: +7/−1 em 3 arquivos de teste.

## Arquivo × achado × evidência
| Arquivo | Hunk da branch | Na main? | Evidência |
|---|---|---|---|
| `src/components/admin/__tests__/AdminView.avatarRevogaUrl.test.tsx` | `+AUDIT_PAGE_SIZE: 50` / `+MIN_PASSWORD_LENGTH: 8` no mock | SIM | main L52-53 (ordem invertida: `MIN_PASSWORD_LENGTH` antes de `AUDIT_PAGE_SIZE`); `git diff branch origin/main` mostra só troca de ordem |
| `src/components/admin/__tests__/AdminView.limiteChats.test.tsx` | idem | SIM | main L56-57, idem |
| `src/components/admin/__tests__/AdminView.ramalAdmin.test.tsx` | idem + remoção de vírgula final em `toHaveBeenCalledWith(...),` | mock: SIM (main L61-62). Vírgula: NÃO (main L100 mantém `'segredo-sip'),`) | cosmético: TS/vitest aceitam vírgula final em argumentos; prettier não é checado no CI (`git grep prettier origin/main -- .github/workflows` → vazio; só dependência em `package.json:133`) |

Commit da main que incorporou a intenção: `e1f2ee4dd` 2026-10-27 "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)" (`git log -S'AUDIT_PAGE_SIZE: 50' origin/main -- src/components/admin/__tests__/`).

## Veredito
**INCORPORADA** (confiança alta). A única diferença residual é uma vírgula final (`.prettierrc` tem `trailingComma: "es5"`, que de fato não coloca vírgula em argumentos de chamada; mas o CI não roda `prettier --check`, então não há efeito em build/teste). Valor da lacuna: nenhum.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA e não consegui. A triagem confere.

**Diff completo da branch (`git diff bac62ba9 origin/fix/f1a-lote-b-admin-audit-page-size`)** — 3 arquivos, 4 hunks, nada além de testes:
- `AdminView.avatarRevogaUrl.test.tsx` +2 linhas (`AUDIT_PAGE_SIZE: 50`, `MIN_PASSWORD_LENGTH: 8` no mock de `../useAdminData`)
- `AdminView.limiteChats.test.tsx` +2 linhas (idem)
- `AdminView.ramalAdmin.test.tsx` +2 linhas (idem) + remoção de 1 vírgula final em `expect(handleSaveRamal).toHaveBeenCalledWith(...)`
- Commits: 47172a546 (prettier), a121fb7bf, db9875016, b6faf7736 (merge de main). Nenhum toca `src/` produtivo, migration, edge ou workflow.

**As duas chaves já estão na main**, nos três arquivos (ordem invertida, sem efeito):
- `origin/main:src/components/admin/__tests__/AdminView.avatarRevogaUrl.test.tsx:52-53`
- `origin/main:src/components/admin/__tests__/AdminView.limiteChats.test.tsx:56-57`
- `origin/main:src/components/admin/__tests__/AdminView.ramalAdmin.test.tsx:61-62`
- Origem: `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)"), confirmado ancestral de `origin/main` via `git merge-base --is-ancestor`.
- Constantes reais existem: `origin/main:src/components/admin/useAdminData.ts:119,121`.

**Único resíduo é a vírgula final** em `origin/main:.../AdminView.ramalAdmin.test.tsx:100` (`'segredo-sip'),`), que a branch removia. `.prettierrc` tem `trailingComma: "es5"`, então prettier removeria — mas **prettier não é gate de CI**: `grep -n "prettier" .github/workflows/ci.yml .github/workflows/deploy-functions.yml` → vazio; `package.json` roda `lint` via `scripts/ci/lint-ratchet.mjs`, sem `format:check`. Valor: nenhum.

**Teste executado** (arquivos do worktree idênticos a `origin/main` — `git diff origin/main` vazio nos três):
`npx vitest run src/components/admin/__tests__/AdminView.{avatarRevogaUrl,limiteChats,ramalAdmin}.test.tsx` → **3 arquivos / 8 testes, todos verdes** (5,47 s). Ou seja, a main já está consertada sem a branch.

Nenhum hunk de valor ≥ médio fora da main. Branch pode ser apagada (PR 2068 fecha com ela).
