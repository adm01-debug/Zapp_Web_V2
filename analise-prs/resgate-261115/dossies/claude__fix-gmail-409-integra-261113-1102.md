# Dossiê — claude__fix-gmail-409-integra-261113-1102 (PR #3031)

**Ref:** `origin/claude/fix-gmail-409-integra-261113-1102` · tip `a15b724b9` · merge-base `7c3ef80de` (2026-11-13)

## Propósito
Gmail: `sync-inbox`/`sync-labels` deixam de repetir a chamada em 409 (`shouldRetryGmailSync`), a UI avisa "sincronização em andamento", e conta em `reauth_required` recebe 409 com `code: 'reauth_required'` do `gmail-sync` e a tela oferece "Reconectar" em vez de "em andamento". Commits úteis: `e557519f5`, `04c53bd65`, `3e4a44373` (+2 merges de main).

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado |
|---|---|---|
| 9 arquivos `IDENTICAL_TO_MAIN` (EmailThreadList, GmailInboxView, GmailIntegrationCard, gmailApi.ts, gmail-sync/index.ts, reauth-backoff.test.ts e seus testes) | PRESENT_BYTE | Idênticos à main — incorporados. |
| `src/components/email/EmailChatInbox.tsx` | PRESENT_REVERSE_APPLIES | Na main (`git diff origin/main <branch>` só mostra evolução posterior da main). |
| `src/hooks/integrations/useGmail.ts` | PRESENT_REVERSE_APPLIES | Na main e **main está à frente**: main adiciona guarda `!needsReconnect` no auto-sync de labels e `retry: shouldRetryGmailSync` em `syncLabels` (branch tinha `retry: 1`). `origin/main:src/hooks/integrations/useGmail.ts:88-92,182` tem `reauth_required`/`shouldRetryGmailSync`. Commits na main: `cb6576b2a` (#3035), `f32855df6` (#3046). |
| `src/hooks/integrations/__tests__/useGmail.syncEmAndamento.test.tsx` | CONFLICT, `missing_in_main: 0` | Todo conteúdo da branch está na main; main tem **1 teste a mais** ("sincronizar marcadores com 409 reauth_required NÃO repete a chamada", 13 linhas) — adicionado em `f32855df6`. Nada falta. |
| `supabase/deployment-manifest.json` | CONFLICT, `missing_in_main: 1` | Única linha ausente é `"manifest_sha256": "c345510c…"`. As entradas de `gmail-sync` (bytes 24029, sha `bbfa5b1c…`, `source_sha256` `9176e9d9…`) estão **iguais** na main (`origin/main:supabase/deployment-manifest.json:703-705,2162`). O `manifest_sha256` da main (`def318ea…`, linha 2814) é o hash regenerado do manifesto inteiro após merges posteriores (`41853318c`, `f369f88b2`, `2cf0153ae`, `dac285f62`). Artefato gerado — valor **nenhum**. |

## Veredito
**INCORPORADA** (confiança alta). O comentário de fechamento ("coberto pelo pacote #3035, squash `cb6576b2a`") confere; complementado por `f32855df6` (#3046), que ainda estendeu o comportamento.

## Lacunas a recuperar
Nenhuma. A única linha "faltante" é o `manifest_sha256` gerado, que a main já recalculou com valor mais novo — portar seria regressão.

**Apagar branch: seguro.**

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** As 4 linhas apontadas pela varredura são as versões *anteriores* de linhas que o commit seguinte da própria branch (`04c53bd65`) estendeu no mesmo lugar. Nenhuma guarda, validação, teste ou estado foi desfeito — ao contrário, `04c53bd65` **acrescentou** cobertura.

Commits (merge-base `7c3ef80de`): `e557519f5` → `04c53bd65` → `3e4a44373`. Removedor em ambos os arquivos: `04c53bd65` ("409 reauth_required pede reconexão em vez de 'sincronização em andamento'").

| Linha de `e557519f5` que saiu | O que `04c53bd65` pôs no lugar | Sobrevive? |
|---|---|---|
| `useGmail.ts`: `return error instanceof GmailFunctionError && error.status === 409;` | mesma expressão + `&& !isGmailReauthRequired(error)`, mais a nova função `isGmailReauthRequired` e um ramo `onError` que recarrega a conta e mostra "Sessão do Gmail expirada" | Sim — `origin/main:src/hooks/integrations/useGmail.ts:82-83,91,459,468` |
| teste: `import { useGmail, shouldRetryGmailSync, isGmailSyncAlreadyRunning } from '../useGmail';` | mesma linha + `isGmailReauthRequired` | Sim — `origin/main:…/useGmail.syncEmAndamento.test.tsx:49` |
| teste: `function respondSyncWithStatus(status: number) {` | assinatura ganhou `body?: unknown` (+ helper `httpErrorWithBody` com `Response` real) | Sim — main linhas 98, 106 |
| teste: linha do `if (fn === 'gmail-sync') return { data: null, error: httpError(...) }` | mesmo caminho preservado no ternário `body === undefined ? httpError(...) : httpErrorWithBody(...)` | Sim — main linha 112 |

Saldo de `04c53bd65` no arquivo de teste: **+3 testes** (409 com `Response` real segue informativo; 409 `reauth_required` pede reconexão; teste unitário dos três helpers). Nada a recuperar.

Sem sinal de alerta do tipo PR #2879: o commit com título de correção aqui só restringiu o 409 "em andamento" para não engolir o 409 de token revogado — o caso em que "sincronização em andamento" nunca terminaria.

**Conclusão mantida: apagar a branch é seguro.**

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Apagar a branch é seguro.** Tentei refutar e não achei um único hunk de valor fora da main.

Método: comparei o blob final de cada um dos 14 arquivos de `git diff 7c3ef80de a15b724b9` com `origin/main` (tip `dac285f62`), em vez de confiar no `line_check` do JSON.

| Verificação | Resultado |
|---|---|
| 9 dos 14 arquivos | blob **byte-idêntico** à main (`git rev-parse <ref>:<arquivo>` igual em branch e main): `EmailThreadList.tsx` + teste, `GmailInboxView.tsx` + teste, `GmailIntegrationCard.tsx` + teste `falha-consulta`, `gmailApi.ts` + teste, `gmail-sync/index.ts`, `reauth-backoff.test.ts` |
| `src/components/email/EmailChatInbox.tsx` | `git diff <branch> origin/main` mostra **só adição da main**: guarda `!needsReconnect` no auto-sync de labels + `needsReconnect` na lista de deps (linhas 223-230 da main). O `needsReconnect`/`onReconnect`/`isReconnecting` passados ao `EmailThreadList` que a branch introduziu estão na main. Nada da branch ficou fora. |
| `src/hooks/integrations/useGmail.ts` | `git diff <branch> origin/main` é **um único hunk, todo a favor da main**: `retry: 1` → `retry: shouldRetryGmailSync` no `syncLabels` (main:487). Identificadores confirmados na main: `isGmailSyncAlreadyRunning` (82), `shouldRetryGmailSync` (101, usado em 428 e 487), `isGmailReauthRequired` (91, usado em 83 e 468), `needsReconnect` (182, exportado em 637). |
| `useGmail.syncEmAndamento.test.tsx` | `git diff <branch> origin/main` é **só +13 linhas da main** (teste "sincronizar marcadores com 409 reauth_required NÃO repete a chamada"). Zero linhas da branch ausentes. |
| `supabase/deployment-manifest.json` | A única linha "faltante" (`manifest_sha256: c345510c…`) é **artefato gerado e porta-la seria regressão comprovada**: rodei `verifyManifestDigest` (de `scripts/edge-deploy/manifest-lib.mjs`) contra `origin/main:supabase/deployment-manifest.json` → `DIGEST OK def318ea302d9ccc5f0baa0e99de7f54d2ea2dea21ac05cef4b9b9c5b0e2b6b7`. O digest da main é auto-consistente; substituí-lo pelo da branch quebraria `generate-manifest --check`. O conteúdo real do gmail-sync **está** na main: `bytes: 24029` / `sha256: bbfa5b1c…` (main:703-705) e `source_sha256: 9176e9d9…` (main:2162) — e confirmei que batem com o blob: `git show origin/main:supabase/functions/gmail-sync/index.ts \| wc -c` = 24029, `sha256sum` = `bbfa5b1c16a93c29fcec40e8fd292711a3a43e32c8913f9a37f98f57ce8716d0`. |

Também checei o risco de "merge que desfaz": os dois commits de merge da branch (`f3480458c`, `a15b724b9`) não deixam resíduo — o `diff` merge-base→tip toca apenas os 14 arquivos de Gmail, e o estado final de todos eles é subconjunto da main.

**Conclusão:** nenhuma lacuna. Veredito mantido: INCORPORADA, exclusão segura.
