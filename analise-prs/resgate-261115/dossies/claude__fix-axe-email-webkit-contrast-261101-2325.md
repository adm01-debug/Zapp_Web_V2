# Dossiê — claude__fix-axe-email-webkit-contrast-261101-2325 (PR #2541)

**Branch:** `origin/claude/fix-axe-email-webkit-contrast-261101-2325` · tip `7ddc2cc94` · merge-base `1252bb5a4` · 1 commit (2026-11-01)
**Commit:** `fix(e2e): corrige axe color-contrast webkit no email-workspace`

## Propósito
Eliminar violação `color-contrast` do axe (WebKit) no workspace de Email: o separador `•` do cabeçalho usava `text-border` (contraste insuficiente) e o teste axe não esperava o tema dark estar aplicado antes de rodar.

## Arquivo × achado × evidência

| Arquivo | Mudança na branch | Na main? | Evidência |
|---|---|---|---|
| `src/components/email/EmailChatInbox.tsx` | `<span className="text-border">•</span>` → `text-muted-foreground` | **SIM (idêntico)** | `origin/main:src/components/email/EmailChatInbox.tsx:316` já tem `<span className="text-muted-foreground">•</span>`; entrou via `71dd7238d fix(email): corrige contraste do separador no cabeçalho do EmailChatInbox (#2832)` |
| `e2e/email-navy-visual.spec.ts` | adiciona `await waitForAppliedTheme(page, 'dark');` antes do `axe.run` no teste "workspace do Email não introduz violações axe" | **SIM (mesma intenção, posição diferente)** | `origin/main:e2e/email-navy-visual.spec.ts:155` tem `await waitForAppliedTheme(page, 'dark');` dentro do mesmo teste (linha 150), após `addScriptTag` (l.154) e antes do `page.evaluate` do axe (l.156). Hunk CONFLICT só porque a main reordenou/removeu o `waitForTimeout(400)`; `line_check.missing_in_main = 0`. |

## Veredito
**INCORPORADA** — ambos os hunks estão na main (um byte a byte, outro com a mesma chamada no mesmo teste). Nenhuma lacuna.

## Lacunas a recuperar
Nenhuma.

## Branch
Seguro apagar: sim.

## Verificação adversarial
**Concordo: INCORPORADA.** Tentei refutar e não achei hunk fora da main.
- `git diff 1252bb5a4 7ddc2cc94`: 2 arquivos, 2 linhas úteis (+1 e2e, 1 troca de classe no TSX).
- `origin/main:src/components/email/EmailChatInbox.tsx:316` — linha byte a byte igual à da branch (`<span className="text-muted-foreground">•</span>`); `git log -S` aponta `71dd7238d (#2832)`. `git grep 'text-border' origin/main -- src/components/email/` → vazio (classe antiga não sobrou).
- `origin/main:e2e/email-navy-visual.spec.ts:155` — `await waitForAppliedTheme(page, 'dark');` dentro do mesmo teste (l.150), antes do `page.evaluate` do axe (l.156). A branch a colocava antes de `addScriptTag`; a main a coloca depois — equivalente, pois o que importa é preceder o `axe.run`. O `waitForTimeout(400)` que a branch mantinha foi removido de propósito na main (`13a00e06a` #2881 troca por espera via requestAnimationFrame dentro do `evaluate`), então o hunk CONFLICT é só reordenação.
- Nenhuma lacuna adicional. Apagar branch: seguro.
