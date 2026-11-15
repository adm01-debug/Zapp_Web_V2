# fix/ci-verde-261021 — triagem (PRs #2155 e #2444)

- Ref: `origin/fix/ci-verde-261021` · tip `64934014e` · merge_base `9911bc007` (21/10/2026) · 7 commits, 46 arquivos.
- Veredito: **OBSOLETA** (confiança alta). `apagar_branch_seguro = true`.

## Propósito
A branch não trazia feature: consertava uma `main` que **não compilava** em 21/10. No merge_base havia código
pela metade — por exemplo `supabase/functions/evolution-api/session-flavor-routes.test.ts:2` (no MB) importava
`formatPairingCode, pairingCodeFromResponse, pairingValidity, resolvePairingRoute` de `./index.ts`, funções que
**não existiam** no `index.ts` do MB; e `evolution-webhook-handlers.ts` tinha `presences`/`isComposing` sem
declaração. Os 7 commits criam essas funções, reescrevem o handler de presença, alinham tipos, workflows,
baselines de DB e docs para a CI ficar verde.

**A main resolveu a mesma quebra por outro caminho, no mesmo dia**: PR **#2156** "Correções validadas de CI,
segurança e integrações" (`4b9585052`, 21/10 15:51). Prova de que foi o #2156 que mexeu no mesmo arquivo:
`git log -S'resolvePairingRoute' --oneline origin/main -- supabase/functions/evolution-api/session-flavor-routes.test.ts`
→ `4b9585052`. Lá o teste encolheu de 622 → 403 linhas (os casos de pareamento foram **removidos**), em vez de
criar as funções.

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência na main |
|---|---|---|
| `supabase/functions/_shared/evolution-webhook-handlers.ts` (59 linhas) | **Incorporada, outro texto** | `handlePresenceUpdate` na main (linhas 265–349) faz tudo que o diff pedia e mais: `return` em `@broadcast` (268), grupo sem autor identificável aborta (283–292), canal `private: true` (322), payload de grupo com `typing`/`participant` (325), presença on/off só em 1:1 (334) e `last_seen_at` só na transição (341–345) |
| `supabase/functions/auth-login/index.ts` (40) | **Superada** | A main tirou `deps.enforceRateLimit` do login: o gate único `consume_login_gate` aplica IP+e-mail numa transação (main `index.ts:268–280`) e `gateError` → 500 fail-closed (281–284). O teste da main (`index.test.ts`) não tem `unavailable`/`enforceRateLimit`. `LoginAdminClient` com `auth.admin.signOut` existe na main (88–94) |
| `supabase/functions/evolution-api/index.ts` (66) | **Alvo removido de propósito** | `resolvePairingRoute/pairingCodeFromResponse/formatPairingCode/pairingValidity` não existem na main e **nada** os chamava na branch (só o teste). O #2156 apagou os testes. Main não tem fluxo de conectar por número/código de pareamento (`evolution-api/index.ts:675` só lê `pairingCode` do QR do v2) |
| `supabase/functions/_shared/gmail-helpers.ts` (24) + `gmail-cron-sync/index.ts` (11) | **Incorporada e ampliada** | main: `gmailNextAttemptAt` (gmail-helpers.ts:79), `selectGmailAccountsDue` (84), `GMAIL_REAUTH_HTTP_STATUS = 409` (138), `gmailReauthErrorPayload` (140), `requestGmailTokenRefresh` (144), `next_attempt_at: gmailNextAttemptAt(failureCount)` (522); cron usa `selectGmailAccountsDue` + `claimGmailAccountSync` (gmail-cron-sync/index.ts:4,82) |
| `supabase/functions/connection-health-check/index.ts` (11) | **Incorporada e ampliada** | main tem `kind`/`reason` no alerta (1002), `dedupeAlerts` (578, usado em 1081), `runWithConcurrency` (113, usado em 1051), `REASON_LABEL` (223) e ainda dedupe por nível (`levelDedupeKey`, 90) |
| `supabase/functions/revoke-auth-sessions/index.ts` (8) | **Contradiz decisão vigente** | a branch força `Retry-After: 60` nos dois 429. A main decidiu o contrário: `index.test.ts:281` — "não deve inventar Retry-After sem reset conhecido" — coerente com `_shared/validation.ts:152–156` ("Do not invent a retry window"; só manda `Retry-After` se o chamador passar o valor) |
| `supabase/functions/_shared/validation.ts` (1) | **Desnecessária** | re-export de `isAllowedOrigin/FALLBACK_ORIGIN`; o único consumidor importa direto da fonte: `approve-password-reset/index.ts:12` |
| `src/integrations/supabase/types.ts` (42) | **Incorporada (superset)** | main: `app_settings` (773), `team_message_read_state` (12243), `set_default_whatsapp_connection` (14884), `transfer_conversation` (15353) — este com `p_expect_unassigned` a mais |
| `ChatPanel.tsx`, `RealtimeCollaboration.tsx`, `useConversationActions.ts`, `useInboxBulkActions.ts` + 3 testes | **Incorporada por refatoração** | a main extraiu o helper `transferConversation({...})` já com `undefined` (ChatPanel.tsx:405–412, useConversationActions.ts:337–340, useInboxBulkActions.ts:145–148, RealtimeCollaboration.tsx:65) e acrescentou CAS `expectedAgentId`. Testes da main já esperam `p_to_queue_id: undefined` (ChatTransferContract.test.tsx:266, useInboxBulkActions.test.ts:471) |
| `useConnectionsManager.ts` | **Incorporada byte** | main `useConnectionsManager.ts:389` sem o cast `as any` |
| `.github/workflows/ci.yml` (28) | **Quase toda incorporada**; sobra o job `coverage` | main já tem cache do Bun em todos os jobs (58, 98, 140, 242, 312, 455), `playwright@1.64.1` (484), prova do ignore-build (190–191) e a lista de projetos E88 idêntica (502). O guard de `git merge-base` ficou **obsoleto**: a main trocou toda a lógica por `BASE_SHA`/`HEAD^1` + `git diff --name-only "$effective_base" HEAD` (560–588), sem `merge-base`. O job `coverage` **não existe** na main, que registra a decisão em `ci.yml:289–291`: "Vitest roda em shards sem coletar coverage… Cobertura no CI exige agregação dos shards" |
| `e2e-logado.yml` (3) | **Arquivo reescrito na main** | a suíte logada roda em backend descartável (`bash scripts/e2e-isolated/run.sh suite`, main 150) — não há mais `bunx playwright@…` nem cache `pw-cfw` nesse arquivo |
| `e2e-talkx.yml` (2) | pin incorporado; prefixo de cache **redundante** | main `e2e-talkx.yml:94` já usa `playwright@1.64.1`; a chave `pw-c-${{ hashFiles('bun.lock') }}` já muda em bump (Playwright é devDependency no lock — comentário em `ci.yml:466–472`) |
| `notifica-falha-main.yml` (2) | **Incorporada, texto melhor** | main já tem `falha:`/`avisa:` no header de docs e monitora um workflow a mais |
| `vercel-env-cleanup.yml` (5) | **Incorporada** | main tem header docs (1–5), `defaults: shell bash -euo pipefail` (19–21), `persist-credentials: false` (44) e `node-version: '24'` (50) |
| `.github/toolchain.json` | **Idêntico à main** | `playwright: 1.64.1` (linha 7) |
| `scripts/ci/ci-docs-baseline.unit.mjs` (13) | **Superada** | a main lê a versão do `bun.lock` por regex (W39, linhas 358–371) em vez do `.github/toolchain.json`, e a contagem hoje é 21 workflows (298) |
| `scripts/ci/marcador-specs.mjs` (5 removidas) | **Incorporada** | main tem um único `tituloDe` com `if (eLoginFalhou(nomes))` (87–88); a duplicata já não existe |
| `scripts/ci/check-talkx-docs.unit.mjs` | **Incorporada** | `'ESTADOS.md'` em main:55 |
| `scripts/vercel/ignore-build.unit.mjs` (13) | **Incorporada e ampliada** | main usa `cwd` por teste (15), `mkdirSync` (70) e ainda cobre repo raso (105) |
| `scripts/db-audit/check-migration-drift.test.mjs` (1) | **Obsoleta** | a chave `'sql-sha256'` não é campo de item; na main é só prefixo de log (`check-migration-drift.mjs:99`) e a lista de chaves aceitas (188–201) não a inclui |
| `scripts/db-audit/grants-baseline.json` (8) / `known-violations.json` / `migration-evidence.json` (1) | **Regenerados mais novos na main** | main `grants-baseline.json`: `generated_at 2026-11-15`, `anon_execute: []`, sem `passkey_credentials`, contagens 411/226 (a branch dizia 21/10, 285/152). `known-violations.json` já sem as entradas de `transfer_conversation`/`set_default_whatsapp_connection`/`team_message_read_state`. `migration-evidence.json` já tem `20261016240000` |
| `supabase/schema-manifest.json` (62) / `schema-catalog.json` (1) | **Incorporados** | manifesto da main `generated_at 2026-11-15T05:16:27Z` contém `app_settings`, `connection_alert_preferences`, `search_events`, `v:team_message_read_state`, `messages.transcribed_at`, `set_default_whatsapp_connection`, `transfer_conversation`. Catálogo: `team_message_read_state` (12), `app_settings` (37). Produção confirma as RPCs: `select proname from pg_proc where proname in (...)` → `consume_login_gate`, `set_default_whatsapp_connection`, `transfer_conversation` |
| `CLAUDE.md`, `docs/ci/README.md`, `docs/DB-INVENTORY.md`, `docs/audits/PLANO_…`, `docs/talkx/README.md` | **Números velhos** | a branch escrevia "15 workflows"; `docs/ci/README.md` da main (gerado) diz **21 workflows** (linha 7). PLANO da main já cita 1.64.1 (108). `docs/talkx/README.md:21` já lista `ESTADOS.md`. `DB-INVENTORY.md` da branch aponta catálogo de 16/10; o da main é de 15/11 |
| `e2e/auth.spec.ts` (13) | **Incorporada, cobertura equivalente** | main cobre heading `ZAPP Web`, maxlength 255/200, ausência de aba/botão de cadastro e e-mail malformado via `validity.typeMismatch`. Só não tem a asserção do alerta zod "Email inválido" (a main valida antes do submit, no navegador) |
| `talkx-status-regen.yml`, `scripts/ci/workflow-contracts.unit.mjs`, `webauthn/index.ts`, `RealtimeCollaboration.handoff.test.tsx` | **Já na main** (prova mecânica: `PRESENT_REVERSE_APPLIES`) | — |

## Lacunas reais (nada de alto valor)
1. `supabase/functions/evolution-api/index.ts` — pareamento por número (conectar sem QR): 4 funções puras +
   ~45 asserções de teste, **sem nenhum consumidor** (nenhuma rota, hook ou tela chamava). Para virar
   funcionalidade faltaria: ação na edge `evolution-api` chamando `resolvePairingRoute`, persistência/exibição
   do código no cartão de conexão (`src/components/connections/*`), hook e estados de erro/expiração.
   A main apagou os testes de propósito (#2156). Recuperar só se o dono quiser a feature.
2. `.github/workflows/ci.yml` — job `coverage` (vitest com cobertura + artifact só em push na main).
   A main documenta por que não existe (`ci.yml:289–291`): com shards, cobertura exige agregação.
3. `supabase/functions/revoke-auth-sessions/index.ts` — `Retry-After: 60` nos 429. **Não portar**: contradiz
   `index.test.ts:281` na main.

## Verificação adversarial

Parecer: **concordo com OBSOLETA**; `apagar_branch_seguro = true`. Tentei refutar abrindo os 6 arquivos de
maior lacuna na `main` (`dac285f62`) e não achei nenhum hunk de valor ≥ médio fora dela.

Checagens que eu mesmo rodei (não herdadas do dossiê):

1. **Pareamento por número não tinha consumidor** — `git grep -n -E "resolvePairingRoute|pairingCodeFromResponse|formatPairingCode|pairingValidity" origin/fix/ci-verde-261021`
   devolve APENAS a definição em `supabase/functions/evolution-api/index.ts:50,82,97,108` e o teste
   `session-flavor-routes.test.ts`. Nenhuma rota, hook ou tela chamava. Na `main` não há fluxo de conectar por
   número: só leitura do `pairingCode` do QR do v2 (`_shared/evolution-session-routes.ts:103-109`,
   `evolution-api/index.ts:675`). Confirma "alvo removido de propósito", não lacuna de funcionalidade.
2. **Presença do WhatsApp — main cobre e é mais estrita.** `origin/main:_shared/evolution-webhook-handlers.ts:266-349`:
   aborta em `@broadcast` (271), exige autor de grupo com sufixo `@s.whatsapp.net|@lid` (281-286 e 303-308 —
   mais estrito que o `identifiableAuthor` da branch, que aceitava 8-15 dígitos crus e só barrava a chave "1"),
   canal `private: true` (322), payload de grupo com `typing`/`participant` (323-325), presença on/off só em 1:1
   (334), `last_seen_at` só na transição online→offline (341-345). Main ainda tem `try/finally` no
   `removeChannel` (323-331); a branch não tinha. Nada a recuperar.
3. **auth-login fail-closed já existe na main.** A preocupação da branch (contador persistente indisponível não
   pode seguir só com o contador em memória) está resolvida por outro caminho:
   `origin/main:supabase/functions/auth-login/index.ts:269-287` — `consume_login_gate` aplica IP+e-mail na mesma
   transação e `gateError` ou linha ausente respondem **500** (281-284, 287-290). `deps.enforceRateLimit` não
   existe mais no login (grep em `auth-login/` não retorna nada; a função só vive em `_shared/validation.ts:365`).
4. **Retry-After: não portar, confirmado.** `origin/main:revoke-auth-sessions/index.test.ts:281` falha o teste se
   o 429 trouxer o header ("não deve inventar Retry-After sem reset conhecido"), coerente com
   `_shared/validation.ts:152-156` ("Do not invent a retry window"). O hunk da branch quebraria a `main`.
5. **Gmail, health-check, ignore-build, e2e — incorporados.** `gmailNextAttemptAt` (gmail-helpers.ts:79),
   `selectGmailAccountsDue` (84), `GMAIL_REAUTH_HTTP_STATUS = 409` (138), `gmailReauthErrorPayload` (140),
   `next_attempt_at: gmailNextAttemptAt(failureCount)` (522), cron com `selectGmailAccountsDue` +
   `claimGmailAccountSync` (gmail-cron-sync/index.ts:4,82). Health-check: `runWithConcurrency` (113, usado 1051),
   `REASON_LABEL` (223), `dedupeAlerts` (578, usado 1081) e títulos por `kind` (429-435). A diferença
   `requested ? 1 : HEALTH_CHECK_CONCURRENCY` é inócua (com conexão específica a lista tem 1 item).
   Prova do ignore-build na CI: `ci.yml:190-191`; o unit da `main` cobre T6 `.env.production` e T7 clone raso,
   que a branch não tinha. `e2e/auth.spec.ts` da main cobre heading `ZAPP Web` (8), maxLength (26,31), ausência
   de cadastro (36-40) e e-mail malformado por `validity.typeMismatch` (23).
6. **Duplicata de `tituloDe` já não existe**: `git grep -c "export function tituloDe" origin/main -- scripts/ci/marcador-specs.mjs` → 1.

Ressalva de precisão (não muda o veredito): o dossiê diz que a `main` "recusa cobertura no CI por escrito".
O comentário real (`origin/main:.github/workflows/ci.yml:288-291`) recusa **anexar `coverage/` no runner de
build** e diz que cobertura exigiria agregar os shards. O job `coverage` da branch era um job separado rodando
`bun run test:coverage` sem shard (timeout 40 min), então tecnicamente contornaria a objeção — mas duplica a
suíte inteira em tempo de CI, é infra de baixo valor de negócio e workflow é item "chame o dono". Fica como
sugestão opcional, não como perda.
