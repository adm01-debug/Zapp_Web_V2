# Dossiê — claude__fix-z011bc-timing-safe-261018-1855 (PR #2091)

**Ref:** `origin/claude/fix-z011bc-timing-safe-261018-1855` · tip `626811d3a` · merge-base `e322d3794` (2026-10-18) · 2 commits, 3 arquivos, +5/-4.

## Propósito
- `d79d986c4` — Z011-B/C: trocar comparação `===` de segredos por `timingSafeStringEqual` em `searchbox-budget-alert` (header `x-cron-secret`) e `whatsapp-webhook` (`hub.verify_token`).
- `626811d3a` — tipar `AddBlacklistEntryInput.reason_code` como union (corrigir TS2322) em `useTalkXSuppression.ts`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência na `origin/main` |
|---|---|---|
| `supabase/functions/searchbox-budget-alert/index.ts` | **INCORPORADA** (byte-equivalente, só ordem dos imports difere) | L14 `import { timingSafeStringEqual, unauthorizedResponse } from "../_shared/cron-secret-auth.ts"`; L26 `if (!secret || !esperado || !timingSafeStringEqual(secret, esperado))`. Entrou em `5ac70fd29 fix(edges): comparação segura dos tokens de autenticação (#2308)`, que também adicionou teste `index.test.ts` (+11). |
| `supabase/functions/whatsapp-webhook/index.ts` | **INCORPORADA** (mesmo comportamento; `token &&` em vez de `token !== null &&` — equivalente, pois `verifyToken` já é validado não-vazio em L80) | L7 `import { timingSafeStringEqual } from "../_shared/cron-secret-auth.ts"`; L85 `if (mode === 'subscribe' && token && timingSafeStringEqual(token, verifyToken))`. Mesmo commit `5ac70fd29` (#2308), com teste `index.test.ts` (+18). |
| `src/hooks/integrations/useTalkXSuppression.ts` | **OBSOLETA** (alvo removido de propósito) | A união já estava aplicada e depois a interface inteira foi apagada como código morto: `e1f2ee4dd fix(test): destrava o CI Gate da main` remove `export interface AddBlacklistEntryInput` (diff mostra `-  reason_code?: 'opt_out' \| 'invalid_number' \| 'manual' \| 'lgpd' \| 'no_commercial_permission' \| 'bounce';`), 127 linhas removidas; depois `662083c5f fix: remove hook morto useTalkXSuppression (#2071)`. Nenhuma referência a `AddBlacklistEntryInput`/`useAddBlacklistEntry` em `origin/main:src/`. A tipagem vive hoje em `src/components/talkx/TalkXSuppression.tsx:37` (`type ReasonCode = 'opt_out' \| 'invalid_number' \| 'manual' \| 'lgpd' \| 'no_commercial_permission' \| 'bounce'`), que é quem faz o `insert` em `talkx_blacklist` (L458). |

Helper `timingSafeStringEqual` existe em `origin/main:supabase/functions/_shared/cron-secret-auth.ts:38`.

## Veredito
**INCORPORADA** (2 arquivos byte/semanticamente iguais via #2308; o 3º é obsoleto porque o alvo foi removido de propósito e a mesma tipagem vive no componente). Nada a recuperar. `apagar_branch_seguro = true`.

Triagem anterior (2026-11-08) marcou #2091 como DUPLICATA_PROVAVEL — confirmado: duplicata de #2308.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial
Parecer: **CONCORDA** com INCORPORADA. Branch pode ser apagada.

Tentei refutar hunk por hunk. O diff inteiro é minúsculo e fechado: `git diff e322d379 origin/claude/fix-z011bc-timing-safe-261018-1855 --stat` = 3 arquivos, 5 inserções / 4 remoções. Não há hunk escondido além dos 3 do JSON.

1. `supabase/functions/searchbox-budget-alert/index.ts` — **idêntico na main**.
   `origin/main:14` `import { timingSafeStringEqual, unauthorizedResponse } from "../_shared/cron-secret-auth.ts";`
   `origin/main:26` `if (!secret || !esperado || !timingSafeStringEqual(secret, esperado)) {`
   O `secret !== esperado` que a branch removia não existe mais na main (`removed_still_in_main: 0` confere).

2. `supabase/functions/whatsapp-webhook/index.ts` — **presente na main**, com guarda equivalente.
   `origin/main:7` `import { timingSafeStringEqual } ...`; `origin/main:85` `if (mode === 'subscribe' && token && timingSafeStringEqual(token, verifyToken)) {`
   Única divergência textual: main usa `token &&`, branch usava `token !== null &&`. Diferem só com `token === ''`: main curto-circuita → 403; branch chamaria o helper, que com `verifyToken` já validado não-vazio (`origin/main:79-83`) devolve `false` → 403 também. Mesmo resultado, e a main evita a chamada. Nada a recuperar.
   Ambos entraram por `5ac70fd29 fix(edges): comparação segura dos tokens de autenticação (#2308)`, que trouxe também `index.test.ts` nas duas pastas (`git ls-tree origin/main` confirma os dois arquivos de teste). Helper real em `origin/main:supabase/functions/_shared/cron-secret-auth.ts:38` — loop sobre `max(len)` sem early-return, portanto a mitigação Z011 está de fato aplicada, não só o nome da função.

3. `src/hooks/integrations/useTalkXSuppression.ts` — a tipagem **não deve voltar**: o alvo foi removido de propósito e há guarda de teste contra reintrodução.
   O arquivo segue na main (293 linhas, termina em `useTalkXSuppressionStats` em `:283`); a versão da branch tem 400 linhas. O hunk da branch alterava `reason_code?: string` dentro de `AddBlacklistEntryInput` em `:296` — bloco que só existe na branch.
   `git log -S'AddBlacklistEntryInput' --oneline origin/main -- src/hooks/integrations/useTalkXSuppression.ts` → `e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)`; antes, `662083c5f fix: remove hook morto useTalkXSuppression (#2071)`.
   Remoção deliberada e travada: `origin/main:src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` varre `src/` e falha se a declaração exportada ou o import nomeado voltarem (motivo documentado no cabeçalho: ninguém importava e ele fazia `DELETE` físico contra a trilha append-only). Reaplicar o hunk exigiria ressuscitar o bloco morto e quebraria esse guarda.
   A union em si está viva em quem de fato insere em `talkx_blacklist`: `origin/main:src/components/talkx/TalkXSuppression.tsx:37` `type ReasonCode = 'opt_out' | 'invalid_number' | 'manual' | 'lgpd' | 'no_commercial_permission' | 'bounce'`. `git grep -E "AddBlacklistEntryInput|useAddBlacklistEntry" origin/main -- src/` → sem resultado.

Lacuna adicional: nenhuma. Nenhum hunk de valor ≥ médio fora da main.
