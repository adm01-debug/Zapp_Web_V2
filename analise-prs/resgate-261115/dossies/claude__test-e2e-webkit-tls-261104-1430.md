# Dossiê — claude/test-e2e-webkit-tls-261104-1430

- Ref: `origin/claude/test-e2e-webkit-tls-261104-1430` · tip `48b7ada59` · merge-base `46a025733` (2026-11-04) · 5 commits · sem PR própria
- Veredito: **INCORPORADA** (confiança alta) · apagar branch: **seguro**

## Propósito
Exigir HTTPS verificado no E2E isolado (`scripts/e2e-isolated/`): emitir CA local, provar que node/bun/chromium/firefox/webkit/edge rejeitam cert não confiável e SAN errado (`tls.mjs`, `tls-probe.mjs`, `tls-edge-probe.ts`), preservar diagnóstico TLS com redação de segredos, diagnosticar falha de request WebKit antes do teardown da página (`navigationDiagnostic`), mover `tarefas-quadro.spec.ts` para o projeto `chromium` deslogado, e instrumentar E71 (`location-picker.spec.ts`) com log `E71_KEYBOARD_DIAGNOSTIC`.

Commits: `a0b8e42de` exigir HTTPS verificado · `31188873d` diagnóstico TLS com redação · `0f80b210d` preservar causa de rejeição · `a332396cc` untrusted issuer + capture input · `48b7ada59` WebKit TLS request failure antes do teardown.

## Como entrou na main
- `f32223dda` 2026-11-04 `fix(ci): validar HTTPS e completar suíte E2E isolada (#2716)` — mesmo stat da branch para 17 arquivos (location-picker +40, playwright.config 11, run.mjs 81, runtime-contract 5, tls.mjs +224, tls-edge-probe +38, gateway 28, README 31, unit tests).
- `afd8c7ca3` 2026-11-04 `fix: validar a suíte logada em ambiente isolado (#2717)` — trouxe `navigationDiagnostic` em `tls-probe.mjs` (+75) e ampliou `e2e-isolated-tls.unit.mjs` (+322) e `e2e-isolated-runtime.unit.mjs` (+456).
- Desde então a main evoluiu os mesmos arquivos (2004 linhas que a branch não tem) — por isso a pré-classificação mecânica deu CONFLICT.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na main |
|---|---|---|---|
| `.github/workflows/e2e-logado-isolado.yml` | PRESENT_REVERSE_APPLIES | incorporado | prova mecânica do JSON |
| `e2e/location-picker.spec.ts` | 3 linhas | incorporado, texto refatorado | `origin/main:e2e/location-picker.spec.ts:136` usa `['ArrowDown','Enter'].includes(key)` em vez de `key === 'ArrowDown' \|\| key === 'Enter'`; `:168` `process.stdout.write(\`E71_KEYBOARD_DIAGNOSTIC ...\`)` em vez de `console.info(...)`; bloco `data-e71-keyboard-diagnostics` idêntico em `:130`/`:158` |
| `playwright.config.ts` | +1 / −1 | incorporado | `:64` `testMatch: [/auth\.spec\.ts/, /tarefas-quadro\.spec\.ts/]`; `:134` testIgnore de `chromium-authenticated` contém `tarefas-quadro\.spec\.ts`. O `testMatch: /auth\.spec\.ts/` "ainda na main" (`:266`, `:273`) é de outros projetos (firefox/webkit auth), não o alvo da branch |
| `scripts/ci/e2e-isolated-gateway.unit.mjs` | 0 missing | incorporado | line_check 0/0 |
| `scripts/ci/e2e-isolated-runtime.unit.mjs` | 4 linhas | incorporado, assinatura evoluída | `:235` `controllerFixture(t, fault, options = {}, tlsDiagnostic)`; `:254` lista de módulos copiados é superconjunto (inclui `collection.mjs`, `provider-diagnostics.mjs`…); `:382` metadata do container ampliado; `:786` `tlsDiagnosticLog, diagnosticCredentials, exit, state, calls…` presentes; `:1324-1329` asserções de redação do diagnóstico TLS |
| `scripts/ci/e2e-isolated-tls.unit.mjs` | 5 linhas | incorporado e ampliado | `:15` import inclui `certificateNavigationFailure` além dos 5 da branch; `:348` fixture `positive-status` com `json:`; `:526` `tlsDiagnosticCases.length, 49` (branch: 48 — main adicionou 1 caso); `:551`/`:690` fixtures de `/__e2e/tls-probe`; `:604` `spec.recognized \|\| spec.recognizedByEvidence` |
| `scripts/e2e-isolated/README.md` | 0 missing | incorporado | line_check 0/0 |
| `scripts/e2e-isolated/gateway.mjs` | 0 missing | incorporado | line_check 0/0 |
| `scripts/e2e-isolated/run.mjs` | 1 linha | incorporado | `:782` `metadata = ['images.json','bundles.json','tls-proof.json','entrypoints.json',…]` (superconjunto); `:253` `assertTlsClientProof`; `:338/:486/:595/:689/:737` `removedContainers` |
| `scripts/e2e-isolated/runtime-contract.mjs` | 2 linhas / 1 removida | incorporado, quebrado em 2 linhas | `:5` `ORIGIN = 'https://127.0.0.1:5173'`; `:84-85` `'LD_LIBRARY_PATH',` + `'PLAYWRIGHT_FIREFOX_POLICIES_JSON',`; `:91-92` `fail('invalid-browser-tls-policy')` |
| `scripts/e2e-isolated/tls-probe.mjs` | 4 linhas | incorporado e superado | `:10` `export function navigationDiagnostic` (branch: não exportada); `:166` `observation = navigationDiagnostic(negative, controlUrl(kind), …)` após warm-up em `/__e2e/identity` (`:157-160`); `:173` `finally { observation?.stop(); await negative.close(); }`; `:175-176` usa `certificateNavigationFailure(rejection, kind, name, observation?.record)` — versão mais forte que o `certificateFailure` da branch (aceita evidência do diagnóstico, exatamente o problema WebKit que a branch tentava cobrir) |
| 12 arquivos restantes | IDENTICAL_TO_MAIN / PRESENT_BYTE | incorporado | prova mecânica do JSON |

## Lacunas a recuperar
Nenhuma. As 22 linhas "faltantes" são reescritas equivalentes (includes vs ===, stdout.write vs console.info, quebra de linha, superconjuntos de listas, 48→49 casos de teste) ou foram substituídas por versão mais robusta na main (`certificateNavigationFailure`).

## Reexame de commits intermediários

Entrada: 6 achados mecânicos, 23 linhas, adicionadas por `a0b8e42de` (5 achados) e `0f80b210d` (1 achado), removidas por commits posteriores da própria branch e ausentes da `main` como texto exato.

**Parecer: REFATORACAO_INTERNA em 100% dos achados. Nenhuma reversão de trabalho real. Apagar a branch continua seguro.**

Ordem dos commits (`git log --oneline --no-merges 46a025733..origin/claude/test-e2e-webkit-tls-261104-1430`):
`a0b8e42de` → `31188873d` → `0f80b210d` → `a332396cc` → `48b7ada59`. Nenhum título promete segurança e entrega remoção: cada remoção é a linha antiga sendo trocada por uma versão **mais forte**, e é a versão mais forte que está na `main`.

### Achado por achado

| # | Achado (commit · arquivo · linhas) | Removedor | O que aconteceu | Onde a intenção sobrevive |
|---|---|---|---|---|
| 1 | `a0b8e42de` · `scripts/e2e-isolated/tls.mjs` · 9 | `a332396cc` | O leaf negativo **autoassinado** foi substituído por leaf assinado por uma **segunda CA nunca confiada** (`untrusted-ca.crt/.key`), com `rmSync(controlCaKey)` e asserções novas (`!controlCa.verify(ca.publicKey)`, `!untrusted.verify(controlCa.publicKey)`). As flags `CA:FALSE` / `keyUsage` / `extendedKeyUsage=serverAuth` / `subjectAltName` migraram do `-addext` inline para o extfile. Ganho de cobertura, não perda. | `origin/main:scripts/e2e-isolated/tls.mjs:66,76-84,98,100,104-107,130` (CA de controle) e `:89` (extfile com `CA:FALSE`, `keyUsage`, `extendedKeyUsage=serverAuth`, `subjectAltName=IP:`) |
| 2 | `a0b8e42de` · `scripts/e2e-isolated/tls-probe.mjs` · 4 | `0f80b210d` + `48b7ada59` | `fail(code)` → `fail(code, cause)`; `probeBrowsers({…})` ganhou o parâmetro `diagnostic`; `finally { await negative.close(); }` virou `finally { observation.stop(); await negative.close(); }`; o `fail('…-not-certificate-error')` passou a carregar `rejection` como `cause`. Nenhuma guarda caiu — o `if (!rejection) fail('…-accepted')` e o `if (!certificateFailure(...)) fail(...)` seguem intactos. | `origin/main:scripts/e2e-isolated/tls-probe.mjs:6` (`fail` com `cause`), `:10` (`navigationDiagnostic` exportada), `:132` (`probeBrowsers` com `diagnostic`), `:78`/`:175` (`certificateNavigationFailure` — versão mais forte, usa a evidência do diagnóstico) |
| 3 | `a0b8e42de` · `scripts/ci/e2e-isolated-tls.unit.mjs` · 6 | `a332396cc` + `48b7ada59` | Título do teste renomeado (`CA por execução` → `CAs separadas … chaves das CAs removidas`) com asserções acrescentadas; `browserFixture(fault, affected)` → `browserFixture(fault, affected, negativeOverride)`; `newPage` virou `EventEmitter` com `mainFrame()` para emitir `request`/`requestfailed`; os `throw` diretos viraram `reject(...)`, que emite os eventos **e** lança; o return do fixture ganhou `diagnostic`. | `origin/main:scripts/ci/e2e-isolated-tls.unit.mjs:54` (título novo), `:78`/`:103`/`:146`/`:152` (`untrusted-ca.key`), `:327` (`browserFixture` com `negativeOverride`), `:356` (`reject(failure)`), `:108` (trio server/untrusted/wrong_san com issuer), `:526` 49 casos vs 48 da branch |
| 4 | `a0b8e42de` · `scripts/e2e-isolated/run.mjs` · 1 | `31188873d` | A única mudança na linha foi **retirar** `{ recordLog: false }` da chamada do `tls-probe`, ou seja, passar a **preservar** o log de diagnóstico TLS. Remoção que aumenta a proteção. | `origin/main:scripts/e2e-isolated/run.mjs:587` — forma final idêntica, sem `recordLog: false` |
| 5 | `a0b8e42de` · `scripts/ci/e2e-isolated-runtime.unit.mjs` · 2 | `31188873d` + `a332396cc` | `path.basename(key) === 'ca.key'` → `['ca.key','untrusted-ca.key'].includes(...)` (superconjunto); o objeto `result` ganhou `tlsDiagnosticLog` e `diagnosticCredentials`, com 36 testes novos de redação do diagnóstico TLS. | `origin/main:scripts/ci/e2e-isolated-runtime.unit.mjs:79` (lista das duas chaves) e `:786`/`:1324-1329` (log + asserções de redação, já citados na triagem) |
| 6 | `0f80b210d` · `scripts/ci/e2e-isolated-tls.unit.mjs` · 1 | `48b7ada59` | `if (failure) throw failure;` → `if (failure) reject(failure);` — mesma falha, agora também emitindo os eventos de rede que o `navigationDiagnostic` observa. Era exatamente o bug WebKit que a branch perseguia. | `origin/main:scripts/ci/e2e-isolated-tls.unit.mjs:356` |

### Verificação mecânica
Nenhuma das 23 linhas existe como texto exato na ponta da branch nem na `main` — o que a varredura já indicava e, por si, não distingue reescrita de reversão. O que decide é o removedor: nos 6 casos o `git show <removedor> -- <arquivo>` mostra a linha antiga saindo **na mesma hunk** em que entra a versão mais forte, e essa versão mais forte está na `main` nas linhas citadas acima.

### Lacunas a recuperar
Nenhuma. Nada a recuperar de commit intermediário.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Apagar a branch é seguro.** Tentei refutar e não achei um único hunk de valor ≥ médio fora da `main` (`origin/main` em `dac285f62`).

### 1. Recontagem independente das lacunas
Rodei minha própria varredura (linhas `+` do `git diff 46a025733 origin/claude/test-e2e-webkit-tls-261104-1430`, trim, `grep -F` contra `git show origin/main:<arquivo>`): **22 linhas** faltantes, exatamente os mesmos 7 arquivos e as mesmas contagens do JSON (runtime-contract 2 · run.mjs 1 · e2e-isolated-tls.unit 5 · e2e-isolated-runtime.unit 4 · location-picker 3 · playwright.config 1 · tls-probe 4). Nenhuma lacuna escondida pela truncagem do `missing_sample`.

### 2. Prova por hash: 12 arquivos byte-idênticos à main
`git rev-parse <ref>:<arquivo>` vs `origin/main:<arquivo>` deu blob igual para: `e2e/tarefas-quadro.spec.ts`, `scripts/ci/e2e-auth-isolation.unit.mjs`, `e2e-isolated-runtime-probe.unit.mjs`, `e2e-isolated-tls-preparation.unit.mjs`, `e2e-isolated.unit.mjs`, `e2e-tarefas-project.unit.mjs`, `scripts/e2e-isolated/admission.mjs`, `runtime-probe.mjs`, `tls-edge-probe.ts`, **`tls.mjs`**, `src/config/__tests__/supabase.test.ts`, `src/config/supabase.ts`. O `tls.mjs` (+224 linhas, o núcleo da branch: CA local, CA não confiada, extfile, SAN) está idêntico — logo nada do achado #1 do reexame pode ter sido perdido.

### 3. As 22 linhas, uma por uma
- `.github/workflows/e2e-logado-isolado.yml` (PRESENT_REVERSE_APPLIES): o passo da branch é `sudo apt-get install … openssl libnss3-tools`; a main tem o mesmo passo **três vezes** (`:123-124`, `:193-194`, `:258-259`, a terceira com `iproute2` a mais).
- `e2e/location-picker.spec.ts` (3): bloco `data-e71-keyboard-diagnostics` idêntico linha a linha na main `:113-138`; as 3 divergências são `['ArrowDown','Enter'].includes(key)` (`:135`) e `process.stdout.write(\`E71_KEYBOARD_DIAGNOSTIC …\`)` (`:168`) — mesmo payload (`phases`, `completedPhases`, `endpointCounts`) em `:169-176`.
- `playwright.config.ts` (1 + 1 removida): main `:60-64` tem o comentário novo e `testMatch: [/auth\.spec\.ts/, /tarefas-quadro\.spec\.ts/]`; `:134` tem o `testIgnore` com `tarefas-quadro\.spec\.ts` (e mais `talkx-visual`). Abri `:261-275`: os `testMatch: /auth\.spec\.ts/` de `:266`/`:273` são os projetos `firefox-auth` e `webkit-auth` — não o alvo da branch. Refutação do "removed_still_in_main" confirmada.
- `scripts/e2e-isolated/runtime-contract.mjs` (2 + 1 removida): main `:84-85` quebra a lista em duas linhas (`'LD_LIBRARY_PATH',` / `'PLAYWRIGHT_FIREFOX_POLICIES_JSON',`) e `:91-92` tem o `fail('invalid-browser-tls-policy')` com o mesmo caminho `/run/zapp-e2e-tls/firefox-policies.json`.
- `scripts/e2e-isolated/run.mjs` (1): main `:782-784` — os 9 itens da branch estão todos lá, mais 6 (`entrypoints.json`, `seed-files-volume-diagnostic.json`, …). Confirmei também que o achado #4 do reexame (remover `{ recordLog: false }` do probe TLS) está na forma final: `:587` chama o `tls-probe.mjs` **sem** `recordLog: false`, enquanto outros `driverRun` em `:660-668` ainda usam `recordLog: false` — ou seja, o log TLS é preservado de propósito. `:253` `assertTlsClientProof`, `:591` grava `tls-proof.json`.
- `scripts/ci/e2e-isolated-tls.unit.mjs` (5): main `:15` importa os 5 símbolos da branch **+** `certificateNavigationFailure`; `:348` fixture `positive-status` com `json:`; `:551`/`:690` fixtures de `/__e2e/tls-probe`; `:604` `spec.recognized || spec.recognizedByEvidence`. Sobre o `48` vs `49`: comparei os nomes de caso dos dois lados (`grep -o "name: '[^']*'" | sort -u`) — o diff é **só adição** (main acrescenta `webkit-cancel-with-matching-network-failure`, `native-cancel-proved-by-network/`, `generic-stays-rejected/`, `invalid-certificate-accepted/`, `valid/`, `warmup-*`). Nenhum caso da branch foi descartado.
- `scripts/ci/e2e-isolated-runtime.unit.mjs` (4): `:235` `controllerFixture(t, fault, options = {}, tlsDiagnostic)`; `:254` lista de módulos é superconjunto (acrescenta `collection.mjs`, `provider-diagnostics.mjs`, `routine-ownership.mjs`, `qr-contract.mjs`, `compilation-network.mjs`, `pull-image.mjs`); `:382` metadata do container ampliado (`Id: sha256(name)` + `Name`, `Config.Image`, `Config.Env`, e os mesmos `Labels`/`User`/`State`/`HostConfig`/`NetworkSettings`/`Mounts`); `:786` o objeto `result` carrega `tlsDiagnosticLog, diagnosticCredentials, …` e `:1324-1329` as asserções de redação.
- `scripts/e2e-isolated/tls-probe.mjs` (4): `diff` integral branch×main. A main é **superconjunto estrito**: `navigationDiagnostic` exportada (`:10`), `certificateNavigationFailure` novo (`:72-100`) que começa com `if (certificateFailure(error, kind, engine)) return true;` — portanto não afrouxa nada — e o `fail('…-not-certificate-error')` segue em `:175-177`. A main ainda acrescentou o warm-up em `/__e2e/identity` (`:160-166`), que é justamente o que faltava à branch para fechar o caso WebKit. Nenhuma guarda da branch caiu.

### 4. Arquivos com `missing_in_main: 0`
`gateway.mjs`, `README.md` e `e2e-isolated-gateway.unit.mjs` diferem em blob da main, mas minha varredura não achou **nenhuma** linha adicionada pela branch ausente da main — a diferença é só a evolução posterior da main.

### 5. Commits de incorporação
`f32223dda fix(ci): validar HTTPS e completar suíte E2E isolada (#2716)` e `afd8c7ca3 fix: validar a suíte logada em ambiente isolado (#2717)` estão ambos em `origin/main` (`git log --oneline origin/main | grep -E "^(f32223dda|afd8c7ca3)"`).

### Lacunas adicionais encontradas
Nenhuma.
