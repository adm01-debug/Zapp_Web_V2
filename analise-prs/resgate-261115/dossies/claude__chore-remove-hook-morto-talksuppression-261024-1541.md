# Dossiê — claude__chore-remove-hook-morto-talksuppression-261024-1541 (PR #2230)

**Ref:** `origin/claude/chore-remove-hook-morto-talksuppression-261024-1541` · tip `fd9096ce1` · merge-base `2d97c44cf` (2026-10-24) · 3 commits, 927 deleções, 0 inserções.

## Propósito
Remover o hook morto `useTalkXSuppression` (hook de lista, TL-002). A branch fez isso apagando o **módulo inteiro** `src/hooks/integrations/useTalkXSuppression.ts` (400 linhas) e os dois testes da pasta.

Problema da abordagem: o módulo não era inteiro morto. Em `2d97c44cf:src/components/talkx/TalkXSuppression.tsx:32` (e em `origin/main` na mesma linha 32, usos nas linhas 305, 306, 415) a tela importa `useTalkXSuppressionActivity`, `useTalkXSuppressionStats` e `SUPPRESSION_ACTIVITY_EVENT_TYPES` desse arquivo. Apagar o módulo quebraria o typecheck (TS2307) da tela de supressão do Talk X.

## Arquivo × achado × evidência

| Arquivo | Branch | Main hoje | Achado |
|---|---|---|---|
| `src/hooks/integrations/useTalkXSuppression.ts` | deleta (400 l.) | existe; `git diff --stat 2d97c44cf origin/main -- <arq>` = +39/−146 | **Intenção incorporada de forma correta** por `662083c5f fix: remove hook morto useTalkXSuppression (#2071)` (2026-10-31): removeu só `export function useTalkXSuppression()` (MB:306) e os tipos `BlacklistEntry`/`AddBlacklistEntryInput` (MB:281,295). `git grep "export function useTalkXSuppression(" origin/main -- src/` → vazio. Exports vivos mantidos: `useTalkXSuppressionActivity` (main:218), `useTalkXSuppressionStats` (main:283), `fetchTalkXSuppressionActivity` (main:181). Apagar o arquivo inteiro = **obsoleto e nocivo** (quebra `TalkXSuppression.tsx:32`). |
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | deleta (371 l.) | ausente (PRESENT_BYTE) | **Já na main** — deletado pela mesma #2071 (testava só o hook morto). Main tem outro arquivo, `useTalkXSuppression.test.tsx` (testa `useTalkXSuppressionActivity`, X184), que não é o mesmo. |
| `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts` | deleta (156 l.) | existe | **Obsoleto manter a deleção**: é o guarda TL-002 que a main quer. Afirma (a) o hook morto não exporta mais (linhas 44-45), (b) a API viva continua exportada (48-51), (c) nenhum arquivo reintroduz o hook (94-99). O próprio cabeçalho (l. 13-15) registra que "foi o apagamento do módulo inteiro que quebrou o tipo (TS2307)" — exatamente o que esta branch faria. |

## Veredito
**OBSOLETA** (confiança alta). A necessidade de negócio (código morto fora, trilha append-only preservada) já está na main via #2071 com abordagem cirúrgica; o que a branch ainda "acrescentaria" (apagar o módulo vivo + apagar o guarda) contraria a main e quebraria a tela de supressão do Talk X.

## Lacunas a recuperar
Nenhuma. Não portar nada desta branch.

`apagar_branch_seguro = true`.
