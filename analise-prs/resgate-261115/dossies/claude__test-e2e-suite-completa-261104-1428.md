# Dossiê — claude/test-e2e-suite-completa-261104-1428

- Ref: `origin/claude/test-e2e-suite-completa-261104-1428` · tip `b7c538b` · merge-base `46a0257` (2026-11-04) · 9 commits, 50 arquivos, +5578/-384.
- PRs com o mesmo tip: nenhuma. Mas é a **branch de trabalho da PR #2716** (`f32223dda fix(ci): validar HTTPS e completar suíte E2E isolada`): o corpo da PR cita como heads `a0b8e42` e `a332396ccc...`, ambos commits desta branch. O trabalho continuou nas PRs #2717 (`afd8c7ca3`, head `bd9acd3`) e #2719 (`5f3f7bd28`, head `4b1bae1`), todas mergeadas em `main` no mesmo dia.

## Propósito
Preparar a suíte E2E completa no ambiente isolado (controller `scripts/e2e-isolated/run.mjs` com escopo `suite <grupo>`, 3 grupos fixos 9+3+3 projetos), HTTPS/TLS local com probes negativos, verificação de providers (catálogo/mídia), fixture de onboarding isolado, diagnósticos de teclado no location-picker, teste de corrida de sessão em `detect-new-device`, e mover `tarefas-quadro.spec.ts` para o projeto Chromium público.

## Arquivo × achado × evidência (só os 23 com lacuna mecânica)

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `.github/workflows/e2e-logado-isolado.yml` | Evoluído: main tem `full-suite` com **5 grupos** (3 shards autenticados + 2 deslogados), não 3 | `:2,:20,:63,:140-162` (`full-suite`, `authenticated-1-of-3`, `deslogado-principal`); `:7` "cinco grupos"; `:113` `restore-keys: bun-${{ github.ref }}-` (mais estrito que `bun-` da branch, CodeQL #2899) |
| `docs/ci/README.md` | Linha da tabela evoluída (inclui network-proof) | `:21`, `:105-107` |
| `e2e/README.md` | Evoluído para shards; seção "Fixture de autenticação" que a branch removia foi mantida de propósito | `:20-23` comandos `suite authenticated-N-of-3`; `:75` grupos; `:36` seção mantida |
| `e2e/busca-global-paleta.spec.ts` | `fill('[E2E]')` presente em forma equivalente (`campo.fill('[E2E]')`); `await abrir();` da linha_check é falso positivo (branch só moveu a chamada) | `:294`, `:47` |
| `e2e/catalog.spec.ts` | missing_in_main=0 → presente | line_check |
| `e2e/fixtures/onboarding-isolated.ts` | Presente, refinado (`isolatedTarget(expected)`, `Object.is`) | `:12` `withFreshOnboardingUser`, `:31` `foreign-run`, `:36` `local-service-key`, `:96-98` fixture `freshOnboardingUser` |
| `e2e/fixtures/supabase-env.ts` | Presente (único delta: `!Object.is(key, appKey)` em vez de `key !== appKey`) | `:54` |
| `e2e/location-picker.spec.ts` | Presente (`observe` + `E71_KEYBOARD_DIAGNOSTIC` via `process.stdout.write`) | `:135`, `:168` |
| `playwright.config.ts` | Incorporado byte a byte: `testMatch: [/auth/, /tarefas-quadro/]` e `tarefas-quadro` no `testIgnore` de `chromium-authenticated` | `:64`, `:134` |
| `scripts/ci/e2e-isolated-{fixtures,providers}.unit.mjs` | missing_in_main=0 | line_check |
| `scripts/ci/e2e-isolated-provider-readiness.unit.mjs` | Presente, ampliado (`diagnostics`) | `:71`, `:202` |
| `scripts/ci/e2e-isolated-results.unit.mjs` | Presente, generalizado (`PLATFORM_BLOB`/`sourceBlobs` mapa) | `:276`, `:331-335` |
| `scripts/ci/e2e-isolated-runtime.unit.mjs` | Presente, ampliado para shards (`AUTH_GROUP`, `GROUP_SHARDS`, `isAuthenticatedGroup`) | `:14`, `:101`, `:238`, `:1091-1092`, `:1123` |
| `scripts/ci/e2e-isolated-suite.unit.mjs` | Presente, asserção virou `[9,9,9,3,3]` | `:9`, `:38-40` |
| `scripts/ci/e2e-isolated-tls.unit.mjs` | Presente, 49 casos (branch 48) | `:15`, `:526`, `:649` |
| `scripts/ci/e2e-isolated-workflow.unit.mjs` | Presente, inclui network-proof; 20 nomes (branch 12) | `:19-20`, `:49-52`, `:160`, `:178`, `:228` |
| `scripts/e2e-isolated/README.md` | "Suíte em cinco grupos isolados" substitui "três grupos" | `:114`, `:122`, `:132` |
| `scripts/e2e-isolated/providers.mjs` | Presente | `:166` `media_receipts` |
| `scripts/e2e-isolated/results.mjs` | Presente; `sourceBlob` atualizado para `7039743b…` (spec evoluiu) e `sourceBlobs` mapa | `:17-19`, `:33-48` |
| `scripts/e2e-isolated/run.mjs` | Presente e ampliado (`runLogin({scope, group, compilationNetwork, imagePull})`, `test-inventory.json`, usage); linhas "removed_still_in_main" são só reindentação | `:308`, `:717-719`, `:783`, `:821` |
| `scripts/e2e-isolated/runtime-contract.mjs` | missing_in_main=0 | line_check |
| `scripts/e2e-isolated/runtime-skips.md` | Presente, blob atualizado | `:15` `sourceBlobs` |
| `scripts/e2e-isolated/stack.mjs` | Presente | `:72`, `:84`, `:108` |
| `scripts/e2e-isolated/tls-probe.mjs` | Presente | `:10` `navigationDiagnostic`, `:176` |
| `scripts/e2e-isolated/verify-providers.mjs` | Presente | `:61` |
| `supabase/functions/detect-new-device/index.test.ts` | Teste de corrida presente, parametrizado (`raceUserId`, `raceAuthToken`) | `:401-403`, `:431`, `:466`, `:487`, `:547-551`, `:586`, `:612` |

Arquivos IDENTICAL/PRESENT_REVERSE_APPLIES (27): já na main com prova mecânica (inclui `detect-new-device/index.ts`, `onboarding-tour.spec.ts`, `e2e-isolated-tour.unit.mjs`, `tls.mjs`, `seed-suite.mjs`).

## Veredito
**INCORPORADA** (confiança alta). Toda lacuna mecânica é (a) a mesma intenção com texto refinado (`Object.is`, shards 1/3-3/3 em vez de grupo único `authenticated`, blob do skip atualizado) ou (b) ruído de line_check (reindentação, chamada movida). Nada da branch falta para o negócio; a main está **à frente** (shards, network-proof, cache scoped).

## Lacunas a recuperar
Nenhuma.

## apagar_branch_seguro
true — fluxo da branch entrou via PRs #2716 → #2717 → #2719 (squash); últimos 5 commits (0f22ae6…b7c538b) têm todo o conteúdo coberto na main conforme tabela.

## Reexame de commits intermediários

Parecer: **REFATORACAO_INTERNA** — nada a recuperar. 32 linhas de 10 achados em 6 arquivos (commits `a0b8e42de`, `31188873d`, `0f80b210d`, `792d037e3`), todas substituídas por versão equivalente ou mais estrita, que está na ponta da branch **e** na `main`.

Removedores identificados: `a332396cc`, `31188873d`, `0f22ae64d`, `792d037e3`, `b6af66375`. Nenhum commit com título de segurança/correção removeu proteção.

| Achado | Removedor | Intenção sobrevive em `origin/main` |
|---|---|---|
| `tls.mjs` (9 linhas, `a0b8e42de`): leaf `untrusted` auto-assinado, `rmSync(caKey)` | `a332396cc` | **Mais estrito**: leaf `untrusted` agora emitido por CA independente (`untrusted-ca.key`), mesmo SAN `IP:127.0.0.1`, contrato X509 ampliado com `!controlCa.verify(controlCa.publicKey)`, `controlCa.verify(ca.publicKey)`, `!untrusted.verify(controlCa.publicKey)`, `untrusted.verify(untrusted.publicKey)` — `scripts/e2e-isolated/tls.mjs:66,75-81,82-85,98-110,129` da main; `git diff` ponta↔main nesse arquivo = **vazio** |
| `runtime.unit.mjs` (2, `a0b8e42de`): `path.basename(key) === 'ca.key'` | `a332396cc` | `:79` `['ca.key','untrusted-ca.key'].includes(path.basename(key))` — cobre as duas CAs |
| `runtime.unit.mjs` (2, `31188873d`): `controllerFixture(t, fault, manifest, tlsDiagnostic)` + objeto `result` | `0f22ae64d` | `:235` `controllerFixture(t, fault, options = {}, tlsDiagnostic)`; `tlsDiagnostic` em uso em `:481-493,750-751`; `result` em `:784-786` com `tlsDiagnosticLog`/`diagnosticCredentials`; asserções de redação em `:1324-1329` |
| `tls.unit.mjs` (7, `a0b8e42de`): nome do teste de emissão + `browserFixture(fault, affected)` + mock | `a332396cc`/`792d037e3`/`b6af66375` | `:54` `'emissão real: CAs separadas, leaf/SAN/EKU, chaves das CAs removidas e mounts separados'`; `:327` `browserFixture(fault, affected='chromium', negativeOverride)`; falhas nativas em `:348,356-359` (passou de `throw` para `reject`, equivalente) |
| `tls.unit.mjs` (1, `0f80b210d`): `negativeOverride` no fixture | `b6af66375` | `:356` presente, usado em `:464` para o caso de rejeição não classificada |
| `tls.unit.mjs` (1, `792d037e3`): rota `/__e2e/tls-probe` → 200 | `b6af66375` | `:551` generalizado para `[tls-probe, identity]`; `:690` mantém a rota positiva |
| `run.mjs` (2, `a0b8e42de`): gate `tls-probe.mjs` com `{ recordLog: false }` e lista `metadata` | `31188873d`/`0f22ae64d` | `:587` idêntico à ponta, **sem** `recordLog: false` — `31188873d` tirou a flag justamente para **preservar** o log redigido (comentário no próprio diff); `:782` lista com `tls-proof.json` + `entrypoints.json` |
| `runtime-contract.mjs` (2, `a0b8e42de`): allowlist e guarda de `PLAYWRIGHT_FIREFOX_POLICIES_JSON` | `0f22ae64d` | `:85` na allowlist; `:91-92` guarda `fail('invalid-browser-tls-policy')` intacta |
| `tls-probe.mjs` (4, `a0b8e42de`): `fail(code)`, assinatura de `probeBrowsers`, `negative.close()`, `certificateFailure(...)` | `0f80b210d`/`792d037e3`/`b6af66375` | `:6` `fail(code, cause)`; `:132` `probeBrowsers` com mesmos campos + extras; `:173` `observation?.stop(); await negative.close()`; `:174-176` `certificateNavigationFailure(...)`, que **começa chamando** `certificateFailure` (`:70`) e só então aceita o cancelamento nativo do WebKit sob 9 condições de rede |
| `tls-probe.mjs` (2, `792d037e3`): `navigationDiagnostic(negative, controlUrl(kind), …)` e `observation.stop()` | `b6af66375` | `:10` `export function navigationDiagnostic`; chamada e `observation?.stop()` em `:170-173`; negativos ainda obrigatórios (`:179,191` `untrusted_rejected`/`wrong_san_rejected`) |

Nenhuma validação, guarda, teste ou estado ficou sem equivalente. `apagar_branch_seguro` permanece **true**.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar hunk por hunk e não achei nenhuma lacuna de valor ≥ médio. `origin/main` em `dac285f62`.

Checagens independentes (não copiadas da triagem):

| Alegação da triagem | Checagem própria | Resultado |
|---|---|---|
| Controller `suite <grupo>` incorporado | `origin/main:scripts/e2e-isolated/run.mjs:308` `runLogin({…scope,group,compilationNetwork,imagePull})`; `:310` `invalid-isolated-scope`; `:816` `runSuite`; `:821` usage idêntico ao da branch | presente e ampliado |
| Grupos 9+3+3 | `origin/main:scripts/e2e-isolated/runtime-contract.mjs:21-34` → `GROUPS` com 3 shards autenticados (`1/3`,`2/3`,`3/3`) + 2 deslogados; união de 15 projetos | superset (branch: 1 grupo autenticado) |
| `--workers 1` (fixtures compartilham estado) | `origin/main:scripts/e2e-isolated/run.mjs:193` `browserWorkers = () => 1`, usado em `:698`; comentário "executa workers1" em `.github/workflows/e2e-logado-isolado.yml:150` | preservado |
| Orçamento 45 min da suíte | `run.mjs:190` `browserTimeoutMs` → `55 * 60_000`; workflow `:155,:158,:161` `timeout-minutes: 75` | main mais generoso, não perdido |
| `suite-inventory-invalid` / `login-inventory-not-exact` / `test-inventory.json` | extraídos para `origin/main:scripts/e2e-isolated/collection.mjs` (+ `scripts/ci/e2e-isolated-collection.unit.mjs`), citados em `run.mjs:699,:783` | presentes, só realocados |
| Validação de escopo no workflow | `origin/main:.github/workflows/e2e-logado-isolado.yml:63` `case "$scope" in login|full-suite|network-proof|network-proof-contexts)` | superset do `login|full-suite` da branch |
| `restore-keys: bun-` | main `:113,:183,:243` usa `bun-${{ github.ref }}-` | main mais estrito (a linha "faltante" da branch era a frouxa) |
| `playwright.config.ts` | `origin/main:64` `testMatch: [/auth/, /tarefas-quadro/]` byte igual; `:134` `testIgnore` = o da branch **mais** `talkx-visual.spec.ts` | superset |
| Fixture de onboarding isolado | `origin/main:e2e/fixtures/onboarding-isolated.ts` contém `withFreshOnboardingUser`, `freshOnboardingUser`, `foreign-run`, `local-service-key` | presente |
| Diagnóstico de teclado E71 | `origin/main:e2e/location-picker.spec.ts` contém `E71_KEYBOARD_DIAGNOSTIC` | presente |
| `fill('[E2E]')` na paleta | `origin/main:e2e/busca-global-paleta.spec.ts:294` `await campo.fill('[E2E]')` com `CAMPO_PALETA` em `:289` | equivalente |
| Probes TLS negativos (48 casos) | `origin/main:scripts/ci/e2e-isolated-tls.unit.mjs:526` `assert.equal(tlsDiagnosticCases.length, 49)`; `:15` importa `certificateFailure`, `certificateNavigationFailure`, `probeClient/Browsers/Edge` | 49 ≥ 48 |
| `navigationDiagnostic` | `origin/main:scripts/e2e-isolated/tls-probe.mjs` + reaproveitado em `network-proof-browser.mjs` | presente e reutilizado |
| Verificação de providers | `provider-verification-http-` em `origin/main:scripts/e2e-isolated/verify-providers.mjs`; `media_receipts` em `providers.mjs`; `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY`/`E2E_CATALOG_PRODUCT_SKU` em `stack.mjs` | presentes |
| Skip de plataforma do conversation | `origin/main:scripts/e2e-isolated/results.mjs:17-19` `sourceBlob: 7039743b…`, `line: 47`; `:29-48` contrato com `sourceBlobs` e recorte por shard | presente, blob/linha atualizados porque o spec evoluiu (não é perda) |
| Teste de corrida em `detect-new-device` | `origin/main:supabase/functions/detect-new-device/index.test.ts:401-403,411-413,431,466,486-487,508,517,531,541,547-551,558,565,579,602-603,612,616` — mesma prova, parametrizada em `raceUserId`/`raceAuthToken`, **mais** `rateCalls`/`rateLogs` e assert do JWT no `/auth/v1/user` | superset |
| Testes unitários do runtime/suite/workflow | `e2e-isolated-runtime.unit.mjs:14,30,101-102,236,588-589,626-628`; `e2e-isolated-suite.unit.mjs:38-40` (`[9,9,9,3,3]`, união 15, 3 `setup`); `e2e-isolated-workflow.unit.mjs:49,132,160-167,178,228` (matriz dos 5 grupos, orçamentos `[75,75,75,45,45]`, 20 nomes) | presentes e ampliados |

Teste do "removido de propósito": as linhas `removed_still_in_main` são reindentação (`run.mjs:717-719`) ou chamada movida (`busca-global-paleta.spec.ts:47`) — nenhuma proteção caiu. O reexame de commits intermediários do dossiê foi conferido por amostragem no ponto mais sensível (TLS): `scripts/e2e-isolated/tls.mjs` em `origin/main` é **byte-idêntico** à ponta da branch, e `runtime-contract.mjs:85,91-92` mantém a guarda de `PLAYWRIGHT_FIREFOX_POLICIES_JSON`.

Rastreabilidade do merge: `f32223dda` (#2716), `afd8c7ca3` (#2717) e `5f3f7bd28` (#2719) são todos ancestrais de `origin/main` (`git merge-base --is-ancestor` = 0); os heads citados nos corpos (`a0b8e42`, `a332396c`, `bd9acd3`, `4b1bae1`) e a ponta `b7c538b6` existem no repositório.

PR aberta na branch: nenhuma. `github_graphql` com `headRefName:"claude/test-e2e-suite-completa-261104-1428"` em `adm01-debug/Zapp_Web_V2` devolveu `pullRequests.nodes: []` — nunca houve PR direta desta ref, logo nada quebra ao apagá-la.

Veredito final: **INCORPORADA**, `apagar_branch_seguro = true`.
