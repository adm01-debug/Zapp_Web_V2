# Dossiê — claude__fix-typecheck-suppression-261023-2230 (PR #2208)

**Ref:** `origin/claude/fix-typecheck-suppression-261023-2230` · tip `665432536` · merge-base `af9d36e55` (2026-10-23) · 1 commit.

## Propósito
`fix(types): narrowar reason_code em useTalkXSuppression (resolve #2111)` — tipagem só: cria `export type SuppressionReasonCode = 'manual'|'opt_out'|'invalid_number'|'lgpd'|'no_commercial_permission'|'bounce'` e usa em `BlacklistEntry.reason_code` (era `string | null`) e `AddBlacklistEntryInput.reason_code` (já era o union inline). 4 linhas +, 2 −, um só arquivo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/integrations/useTalkXSuppression.ts` | **OBSOLETA** — o alvo do patch (bloco Z008: `BlacklistEntry`, `AddBlacklistEntryInput`, hook `useTalkXSuppression`) foi removido de propósito da main como código morto | `git log -S'export interface BlacklistEntry' origin/main -- <arquivo>` → `e1f2ee4dd fix(test): destrava o CI Gate da main` (2026-10-27, −127 linhas; arquivo 400 → 293 linhas). `git grep BlacklistEntry origin/main -- <arquivo>` só acha `BlacklistEntryRow` (l.116), outro tipo. Guarda anti-reintrodução: `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` (TL-002: "nenhum arquivo o importava — a tela faz as próprias queries"; regex falha o CI se o hook/`export type` voltar). |
| idem — intenção (narrow do `reason_code`) | **já coberta na main, em outro lugar** | `src/components/talkx/TalkXSuppression.tsx:37` `type ReasonCode = 'opt_out'|'invalid_number'|'manual'|'lgpd'|'no_commercial_permission'|'bounce'` (mesmos 6 valores) e `:49` `reason_code: ReasonCode | null;` no `BlacklistEntry` da tela viva (único consumidor real). |

## Veredito
**OBSOLETA** (confiança alta). Reaplicar o hunk hoje: (a) não tem onde encaixar — as interfaces não existem mais na main; (b) reintroduzir o bloco quebraria o teste-guarda TL-002. O ganho de tipagem pretendido já existe na tela `TalkXSuppression.tsx:37,49`.

## Lacunas a recuperar
Nenhuma. Nada a portar.

## Apagar branch
Seguro (`apagar_branch_seguro = true`). Triagem anterior (2026-11-08) marcou #2208 como `JA_NA_MAIN`; a classificação correta é OBSOLETA — o conteúdo literal não está na main, mas o alvo foi removido de propósito e a necessidade está coberta de outra forma.

## Verificação adversarial

Parecer: **concordo — OBSOLETA** (confirmada; branch segura de apagar). Tentei refutar procurando qualquer hunk de valor não coberto; não há.

Provas que eu mesmo rodei:

1. **O diff é só tipagem, 1 arquivo.** `git diff --stat af9d36e55 origin/claude/fix-typecheck-suppression-261023-2230` → `src/hooks/integrations/useTalkXSuppression.ts | 6 ++++--` (4 inserções, 2 remoções). As 3 linhas de `line_check.missing_sample` são exatamente o `export type SuppressionReasonCode`, `reason_code: SuppressionReasonCode | null` e `reason_code?: SuppressionReasonCode` — nada mais existe no commit `665432536`.
2. **O alvo não existe mais na main.** `git grep -n "BlacklistEntry|AddBlacklistEntryInput|SuppressionReasonCode|reason_code" origin/main -- src/hooks/integrations/useTalkXSuppression.ts` → só `interface BlacklistEntryRow` (l.116), seu uso (l.147) e um comentário (l.255). O arquivo tem 293 linhas na main; na branch o bloco está em l.283–308 (`export interface BlacklistEntry`, `export interface AddBlacklistEntryInput`, `export function useTalkXSuppression`). O patch não tem onde encaixar.
3. **A remoção foi de propósito, e é anterior ao commit da branch na intenção.** O teste-guarda `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` (TL-002) entrou em `025d0258d` (2026-10-16, PR #1976) e afirma `expect(MORTO in exportsDoModulo).toBe(false)`. A remoção física veio depois, em `e1f2ee4dd` (2026-10-27, −127 linhas no arquivo), justamente para satisfazer o guarda — commit "destrava o CI Gate da main". Ou seja: quando a branch foi escrita (2026-10-23) o bloco já estava marcado para morrer. Reintroduzir `export function useTalkXSuppression` quebra o guarda (regex `export\s+(?:function|const|let|var|type|interface)\s+useTalkXSuppression\b`).
4. **A necessidade (narrow do `reason_code`) está coberta na main.** `src/components/talkx/TalkXSuppression.tsx:37` `type ReasonCode = 'opt_out' | 'invalid_number' | 'manual' | 'lgpd' | 'no_commercial_permission' | 'bounce'` — os mesmos 6 valores, na mesma ordem lógica — e `:49` `reason_code: ReasonCode | null` no `BlacklistEntry` local da tela, que é o único consumidor real (o guarda registra: "nenhum arquivo o importava — a tela faz as próprias queries").
5. **Não sobrou `reason_code` frouxo para narrowar.** `git grep -n "reason_code[?]*: string" origin/main -- src` → só `src/integrations/supabase/types.ts` (l.8618, 8635, 8652, 15298), arquivo gerado pelo Supabase, que não se edita à mão. `git grep -n "SuppressionReasonCode" origin/main -- src e2e scripts` → zero.

Único ganho residual imaginável — exportar `SuppressionReasonCode` de um módulo compartilhado para a tela importar em vez do `ReasonCode` local — é refatoração não pedida, de valor abaixo de médio, e não faz parte do patch (que tipava interfaces hoje inexistentes). Não é lacuna.
