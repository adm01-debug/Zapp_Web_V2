# Dossiê — claude__fix-console-gmail-409-261112 (PR #2993)

**Branch:** `origin/claude/fix-console-gmail-409-261112` · tip `3e4a44373` · merge-base `65cf38544` · 3 commits
**Propósito:** Gmail — não repetir `sync-inbox`/`sync-labels` em 409 (`shouldRetryGmailSync`), avisar "sincronização em andamento", e conta em `reauth_required` responder reauth na edge `gmail-sync` + tela oferecer "Reconectar" (`needsReconnect`) em vez de disparar sync.

## Veredito: INCORPORADA (confiança alta) — apagar branch seguro

Comentário de fechamento alegava integração via pacote #3035 (`cb6576b2a`); verificado byte a byte contra `origin/main`.

| Arquivo | Achado | Evidência |
|---|---|---|
| 9 arquivos `IDENTICAL_TO_MAIN` (EmailThreadList, GmailInboxView, GmailIntegrationCard, gmailApi.ts, gmail-sync/index.ts, reauth-backoff.test.ts e seus testes) | Idênticos à main | JSON `hunk: PRESENT_BYTE` |
| `src/hooks/integrations/useGmail.ts` | Tudo da branch está na main; main ainda foi além (`syncLabels` também usa `retry: shouldRetryGmailSync`, branch tinha `retry: 1`) | `git diff <branch> origin/main -- src/hooks/integrations/useGmail.ts` mostra só adição na main (linha ~486) |
| `src/components/email/EmailChatInbox.tsx` | Tudo da branch na main; main acrescenta guarda `!needsReconnect` no auto-sync de labels | `git diff <branch> origin/main -- ...EmailChatInbox.tsx` só adiciona na main (linha ~226) |
| `src/hooks/integrations/__tests__/useGmail.syncEmAndamento.test.tsx` | Main contém os 165 casos da branch + 1 teste extra (409 `reauth_required` em `syncLabels` não repete) | `line_check.missing_in_main = 0`; `git diff <branch> origin/main` só adiciona `it(...)` na linha 185 |
| `supabase/deployment-manifest.json` | Única "lacuna": `manifest_sha256` (hash agregado gerado). As entradas reais de `gmail-sync` são idênticas: `sha256 bbfa5b1c…` (linha 705 na main) e `source_sha256 9176e9d9…` (linha 2162 na main) iguais aos da branch; `sha256sum` do `gmail-sync/index.ts` da main = `bbfa5b1c…`, 24029 bytes. O `manifest_sha256` da main (`def318ea…`) difere só porque outras edges mudaram depois (10 commits na main tocaram o manifest desde o MB) | artefato gerado — valor **nenhum** |

## Lacunas a recuperar
Nenhuma. A única linha ausente é hash agregado de artefato gerado, regenerado a cada mudança de edge.

## Observação
PR #2993 fechada corretamente; conteúdo entrou via `cb6576b2a` (#3035) e foi estendido depois (reauth em `syncLabels` e `EmailChatInbox`).

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** — as 4 linhas significativas foram substituídas pelo commit seguinte **da própria branch** (`04c53bd65`), que *endureceu* a lógica em vez de desfazê-la; a versão endurecida está na `origin/main`. Apagar a branch continua seguro.

Commits (`git log --oneline --no-merges 65cf38544..origin/claude/fix-console-gmail-409-261112`):
- `e557519f5` fix(gmail): não repetir sync-inbox em 409 e avisar sincronização em andamento ← adicionou as linhas
- `04c53bd65` fix(gmail): 409 reauth_required pede reconexão em vez de "sincronização em andamento" ← removedor
- `3e4a44373` fix(gmail): conta em reauth_required responde reauth e a tela oferece reconectar

| Linha de `e557519f5` | Removedor | O que substituiu | Onde está hoje |
|---|---|---|---|
| `useGmail.ts`: `return error instanceof GmailFunctionError && error.status === 409;` | `04c53bd65` | `… && error.status === 409 && !isGmailReauthRequired(error)` + nova `isGmailReauthRequired()` | `origin/main:src/hooks/integrations/useGmail.ts:83` (guarda) e `:92` (`isGmailReauthRequired`) |
| teste: `import { useGmail, shouldRetryGmailSync, isGmailSyncAlreadyRunning } from '../useGmail';` | `04c53bd65` | mesmo import + `isGmailReauthRequired` | `origin/main:…/useGmail.syncEmAndamento.test.tsx:49` |
| teste: `function respondSyncWithStatus(status: number) {` | `04c53bd65` | `function respondSyncWithStatus(status: number, body?: unknown) {` (helper ganhou corpo JSON) | `origin/main:…:106` |
| teste: `if (fn === 'gmail-sync') return { data: null, error: httpError(status, …) };` | `04c53bd65` | `body === undefined ? httpError(status, …) : httpErrorWithBody(status, body)` — a chamada `httpError(status, …)` original sobrevive dentro do ternário | `origin/main:…:115` |

Nenhum sinal de alerta: o removedor **não** é um commit que promete correção e subtrai proteção. `04c53bd65` separou os dois sentidos do mesmo 409 do `gmail-sync` (trava já pega vs. token revogado, `{ code: 'reauth_required' }`) — sem ele, reauth cairia no toast "sincronização já em andamento", que nunca terminaria. A `main` tem a versão forte dos quatro pontos, mais os 2 testes novos de reauth que o removedor trouxe.

### Lacunas a recuperar (reexame)
Nenhuma.

## Verificação adversarial

**Parecer: CONCORDO — INCORPORADA; apagar a branch é seguro.** Tentei refutar e não achei nenhum hunk de valor fora da `main` (`origin/main` em `dac285f62`).

Método: para cada um dos 14 arquivos de `git diff --stat 65cf38544 origin/claude/fix-console-gmail-409-261112`, rodei `git diff --numstat <branch> origin/main -- <arquivo>`. Se a branch tivesse conteúdo exclusivo, apareceria como remoção no lado da `main`.

| Arquivo | `numstat` branch→main | Leitura |
|---|---|---|
| 11 arquivos (EmailThreadList + teste, GmailInboxView + teste, GmailIntegrationCard + teste, gmailApi.ts + teste, gmail-sync/index.ts, reauth-backoff.test.ts) | vazio = **idêntico byte a byte** | nada a resgatar |
| `src/hooks/integrations/useGmail.ts` | `2 / 1` | a única linha "perdida" é a **fraca**: branch tinha `retry: 1` em `syncLabels`; a main tem `retry: shouldRetryGmailSync` (`origin/main:src/hooks/integrations/useGmail.ts:487`) |
| `src/components/email/EmailChatInbox.tsx` | `3 / 2` | linhas "perdidas" são a versão sem guarda: branch `if (activeAccount && labels.length === 0 …)`; main `if (activeAccount && !needsReconnect && …)` + `needsReconnect` na lista de deps (`origin/main:src/components/email/EmailChatInbox.tsx:226,230`) |
| `…/useGmail.syncEmAndamento.test.tsx` | `13 / 0` | **zero** remoções: main tem todos os casos da branch mais o `it('sincronizar marcadores com 409 reauth_required NÃO repete a chamada'…)` na linha 185 |
| `supabase/deployment-manifest.json` | `157 / 128` | artefato gerado. Filtrando o diff por `gmail-sync`/`manifest_sha256`, a **única** linha `-/+` é `manifest_sha256` (`fec20f77…` → `def318ea…`). `source_sha256` do `gmail-sync` é o mesmo nas duas pontas (`9176e9d9ec8d…`, main linha 2162 / branch linha 2135); o resto do delta é reordenação/entradas de outras edges |

Provas de que a funcionalidade vive na `main`:
- `origin/main:src/hooks/integrations/useGmail.ts:82-83` `isGmailSyncAlreadyRunning` com `&& !isGmailReauthRequired(error)`; `:91` `isGmailReauthRequired`; `:101` `shouldRetryGmailSync`; `:428` e `:487` aplicando a política em `syncInbox` e `syncLabels`; `:459`/`:468` separando os dois sentidos do 409.
- `needsReconnect` presente na main em `useGmail.ts` (3), `EmailChatInbox.tsx` (4), `EmailThreadList.tsx` (3), `GmailInboxView.tsx` (3) — a tela "Reconectar" existe.
- `reauth_required` aparece 5× em `origin/main:supabase/functions/gmail-sync/index.ts`, que é **idêntico** ao da branch (`sha256 bbfa5b1c16a9…`).

Conclusão: a `main` é um superconjunto estrito da branch em todos os arquivos com código ou teste; as únicas linhas que a branch tem e a main não são (a) as versões antigas/fracas substituídas pelo endurecimento posterior e (b) um hash agregado de artefato gerado. Sem lacuna.
