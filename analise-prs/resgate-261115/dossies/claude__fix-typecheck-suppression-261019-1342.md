# Dossiê — claude__fix-typecheck-suppression-261019-1342 (PR #2111)

**Branch:** `origin/claude/fix-typecheck-suppression-261019-1342` · tip `ec57655d5` · merge-base `ee2947491` (2026-10-18) · 1 commit, 1 arquivo (+4/-2).

## Propósito
`fix(types): narrowar reason_code em useTalkXSuppression para SuppressionReasonCode` — criar `export type SuppressionReasonCode = 'manual'|'opt_out'|'invalid_number'|'lgpd'|'no_commercial_permission'|'bounce'` em `src/hooks/integrations/useTalkXSuppression.ts` e usá-lo em `BlacklistEntry.reason_code` e `AddBlacklistEntryInput.reason_code` (bloco Z008 do hook, linhas 283–306 no merge-base).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/integrations/useTalkXSuppression.ts` | **Alvo removido de propósito na main.** O bloco Z008 inteiro (`BlacklistEntry`, `AddBlacklistEntryInput`, `useTalkXSuppression()`) foi apagado em `e1f2ee4dd` (fix(test): destrava o CI Gate da main, 2026-10-27; `-127 linhas` no arquivo). Na main o hook só exporta activity/stats (`git show origin/main:... | grep ^export` → L32–L283, nenhum `BlacklistEntry`/`AddBlacklistEntryInput`). `git grep 'useTalkXSuppression()\|AddBlacklistEntryInput' origin/main -- src` → vazio. Antes da remoção, `8c4ef6c6d` já tinha estreitado `AddBlacklistEntryInput.reason_code` para a mesma união literal (visível no diff de `e1f2ee4dd` L58). | `git log -S'reason_code: string \| null' --oneline origin/main -- <arquivo>` → `e1f2ee4dd`; `git show e1f2ee4dd -- <arquivo>` L40–L58 |
| — intenção (tipo estreito) | **Coberta em outro lugar.** `src/components/talkx/TalkXSuppression.tsx:37` define `type ReasonCode = 'opt_out'|'invalid_number'|'manual'|'lgpd'|'no_commercial_permission'|'bounce'` (mesmos 6 literais); `:49` `reason_code: ReasonCode | null` na `BlacklistEntry` local; `:65` `REASON_CODES` tipado; `:541` grava `payload.reason_code = editReason`. Testes em `src/components/talkx/__tests__/TalkXSuppression.actions.test.tsx:443` cobrem o enum. | `git grep -n 'ReasonCode' origin/main -- src/components/talkx/TalkXSuppression.tsx` |

## Veredito
**OBSOLETA** — confiança alta. As 3 linhas "faltando" só fazem sentido sobre interfaces que não existem mais na main; o estreitamento de tipo que a branch queria vive hoje em `TalkXSuppression.tsx:37/49`. Nada a portar.

`apagar_branch_seguro`: **true**.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar e não achei nenhum hunk aproveitável.

1. **Diff completo da branch conferido, não só a amostra.** `git diff ee2947491 origin/claude/fix-typecheck-suppression-261019-1342` → 1 arquivo, 1 hunk, +4/-2: cria `export type SuppressionReasonCode = 'manual'|'opt_out'|'invalid_number'|'lgpd'|'no_commercial_permission'|'bounce'` e troca `reason_code: string | null` → `SuppressionReasonCode | null` em `BlacklistEntry` (L283) e `reason_code?: string` → `SuppressionReasonCode` em `AddBlacklistEntryInput` (L301). Nada mais. Commit `ec57655d5`.
2. **O alvo não existe mais na main.** `git show origin/main:src/hooks/integrations/useTalkXSuppression.ts | grep '^export'` → 293 linhas (merge-base: 400), exports só de atividade/stats (`SUPPRESSION_ACTIVITY_EVENT_TYPES` L32 … `useTalkXSuppressionStats` L283). Nenhum `BlacklistEntry`, `AddBlacklistEntryInput` ou `useTalkXSuppression()`. O único `BlacklistEntry` do arquivo na main é `interface BlacklistEntryRow` (L116), interno e sem `reason_code` tipado.
3. **Remoção deliberada, com guarda ativo contra a volta.** `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main") tirou 127 linhas desse arquivo. Mais forte que a mensagem de commit: a main tem `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` (TL-002), que varre `src/` e **falha** se a declaração exportada ou um import nomeado de `useTalkXSuppression` reaparecer — doc do próprio teste L1–L21: hook morto (ninguém importava; removia com `DELETE` físico contra a trilha append-only). Portar esta branch reintroduziria o bloco e quebraria o CI.
4. **A substituição alegada cobre a necessidade — arquivo aberto na linha citada.** `origin/main:src/components/talkx/TalkXSuppression.tsx:37` `type ReasonCode = 'opt_out' | 'invalid_number' | 'manual' | 'lgpd' | 'no_commercial_permission' | 'bounce'` (os mesmos 6 literais), `:49` `reason_code: ReasonCode | null`, `:65` `REASON_CODES: { code: ReasonCode; label: string }[]`, `:148` `isProtectedReason(code: ReasonCode)`, `:541` `payload.reason_code = editReason`. A tela faz as próprias queries, então o estreitamento de tipo que a branch queria já é o que vale em produção.
5. **Nada na main depende do que a branch tipava.** `git grep 'BlacklistEntry\|AddBlacklistEntryInput\|SuppressionReasonCode' origin/main -- src e2e scripts supabase` → só o `BlacklistEntry` local de `TalkXSuppression.tsx`, o `BlacklistEntryRow` interno do hook, a menção no guarda TL-002 e entradas do baseline. `useTalkXSuppression.test.tsx` (o teste vivo) importa apenas `useTalkXSuppressionActivity`/`fetchTalkXSuppressionActivity`/`SUPPRESSION_ACTIVITY_EVENT_TYPES`.

**Observação de higiene da main (não é lacuna desta branch):** `scripts/ci/typecheck-baseline.json:686` e `:694` ainda registram TS2305/TS2724 em `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` — arquivo que não existe mais na main (`git ls-tree origin/main src/hooks/integrations/__tests__/` lista só `.hook-morto.test.ts` e `.test.tsx`). São entradas de baseline órfãs; a branch não as resolvia.

`apagar_branch_seguro`: **true** (confirmado).
