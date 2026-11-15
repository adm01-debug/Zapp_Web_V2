# Dossiê — claude__test-e2e-tls-diagnostico-261104-1340

**Ref:** `origin/claude/test-e2e-tls-diagnostico-261104-1340` · tip `0f80b210d` · merge-base `46a025733` (2026-11-04) · 3 commits, sem PR própria.

## Propósito
Exigir HTTPS verificado no E2E isolado (`ORIGIN` → `https://127.0.0.1:5173`), emitir CA/leafs por execução (`scripts/e2e-isolated/tls.mjs`), sondar Node/Bun/browsers/Edge (`tls-probe.mjs`, `tls-edge-probe.ts`), preservar diagnóstico TLS com redação de segredos, e mover `tarefas-quadro.spec.ts` para o projeto `chromium` deslogado.
Commits: `a0b8e42de` exigir HTTPS verificado · `31188873d` preservar diagnóstico TLS com redação · `0f80b210d` preservar causa de rejeição TLS não classificada.

## Veredito: INCORPORADA (via PR #2716, merge `f32223dda`, 2026-11-04)
`git cherry` não marca equivalentes porque #2716 (`f32223dda`) é um **superconjunto** desta branch, squash-mergeado no mesmo dia com os mesmos 21 arquivos + `e2e/tarefas-quadro.spec.ts` + `e2e/location-picker.spec.ts`.

`git diff --stat 0f80b210d f32223dda -- <21 arquivos>` → só 4 arquivos divergem, todos com #2716 **à frente** da branch:

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/e2e-logado-isolado.yml` | na main | hunk `PRESENT_REVERSE_APPLIES` |
| `playwright.config.ts` | idêntico a #2716; main hoje tem `testMatch: [/auth\.spec\.ts/, /tarefas-quadro\.spec\.ts/]` (l.64) e `tarefas-quadro` no `testIgnore` (l.134). A linha "still" `testMatch: /auth\.spec\.ts/` do line_check é falso positivo (regex contida na nova) | `git diff --quiet 0f80b210d f32223dda -- playwright.config.ts` = IDENTICAL |
| `scripts/e2e-isolated/runtime-contract.mjs` | idêntico a #2716; main l.5 `ORIGIN = 'https://...'`, l.85 `PLAYWRIGHT_FIREFOX_POLICIES_JSON`, l.91-92 `invalid-browser-tls-policy` | IDENTICAL vs f32223dda |
| `scripts/e2e-isolated/run.mjs` | idêntico a #2716; main: `assertTlsClientProof` l.253, `removedContainers` l.338, `withCheckout` l.409, `prove-tls-clients` l.574, `tls-proof.json` em metadata l.782 | IDENTICAL vs f32223dda |
| `scripts/e2e-isolated/tls-probe.mjs` | idêntico a #2716 (incl. `fail(code, cause)` l.6 = commit `0f80b210d`); main depois evoluiu (`navigationDiagnostic`, `certificateNavigationFailure`) | IDENTICAL vs f32223dda |
| `scripts/e2e-isolated/gateway.mjs`, `scripts/ci/e2e-isolated-gateway.unit.mjs` | idênticos a #2716 | IDENTICAL vs f32223dda |
| `scripts/e2e-isolated/tls.mjs` | #2716 **substituiu de propósito** o leaf `untrusted` autoassinado da branch por leaf assinado por segunda CA (`untrusted-ca.key`), removendo as duas chaves. As 10 linhas "missing" são a variante antiga | `git diff 0f80b210d f32223dda -- scripts/e2e-isolated/tls.mjs` (+30/-14); main l.66,76-84,98,104-109 |
| `scripts/ci/e2e-isolated-tls.unit.mjs` | #2716 renomeou o teste para "CAs separadas…" e adicionou `certificateNavigationFailure`, `https`; 9 linhas "missing" = texto antigo do teste/mocks | main l.15,54; diff +89 |
| `scripts/ci/e2e-isolated-runtime.unit.mjs` | #2716 ajustou mock para `['ca.key','untrusted-ca.key']`; `controllerFixture` ganhou `options` depois; `tlsDiagnosticLog`/`diagnosticCredentials` presentes na main (l.750-786, 1324-1329) | main l.79,235 |
| `scripts/e2e-isolated/README.md` | #2716 = branch + 2 linhas (parágrafo da segunda CA) | diff +2 |
| 9 arquivos restantes (`admission.mjs`, `runtime-probe.mjs`, `tls-edge-probe.ts`, `src/config/*`, 5 unit tests) | `IDENTICAL_TO_MAIN` | `PRESENT_BYTE` |

Nenhuma linha "missing" sobrevive como intenção não coberta: `git grep "This leaf is deliberately self-signed" origin/main -- scripts/e2e-isolated/tls.mjs` → vazio (substituída pela CA de controle).

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro: sim (todo o conteúdo está em #2716 ou foi deliberadamente superado por ele).

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** As 5 linhas apontadas pela varredura foram todas adicionadas por `a0b8e42de` (1º commit) e **substituídas por versões superconjunto** pelos dois commits seguintes da própria branch (`31188873d`, `0f80b210d`). Nenhum commit posterior desfez proteção: os dois últimos commits **endurecem** o que o primeiro entregou, e a versão endurecida está na `origin/main`. Apagar a branch continua seguro.

Títulos dos commits (`git log --oneline --no-merges 46a025733..origin/claude/test-e2e-tls-diagnostico-261104-1340`): nenhum promete segurança e remove — os três são adição incremental sobre o mesmo mecanismo TLS.

| Achado (linha de `a0b8e42de`) | Removedor | O que substituiu | Sobrevive na main |
|---|---|---|---|
| `tls-probe.mjs`: `const fail = code => { throw new Error('[e2e-isolated/tls-' + code + ']'); }` | `0f80b210d` | `const fail = (code, cause) => { … , { cause })` — passa a **preservar** a causa nativa | `origin/main:scripts/e2e-isolated/tls-probe.mjs` l.6 (forma com `cause`) |
| `tls-probe.mjs`: `fail('browser-' + name + '-' + kind + '-not-certificate-error')` | `0f80b210d` | mesma chamada **com** `, rejection` | main l.176 (`fail('browser-…-not-certificate-error', rejection)`) |
| `e2e-isolated-tls.unit.mjs`: `function browserFixture(fault, affected = 'chromium') {` | `0f80b210d` | assinatura + `negativeOverride`, e **+20 linhas de teste novo** (18 casos engine×kind×mensagem, `assert.equal(failure.cause, original, 'retain exact native cause without approving it')`) | main l.327 (assinatura nova) e l.468 (asserção da causa) |
| `run.mjs`: `driverRun([…'tls-probe.mjs', runtime], 'tls-' + runtime + '-gate', 240_000, { recordLog: false })` | `31188873d` | **removeu `{ recordLog: false }`**, ou seja passou a **gravar** o log do probe (com os dois redatores de segredo), + comentário explicando | main l.587 — idêntico, sem `recordLog: false` |
| `e2e-isolated-runtime.unit.mjs`: `const result = { exit, state, calls, … tlsProbeRemoved }` | `31188873d` | mesmo objeto **com** `tlsDiagnosticLog` e `diagnosticCredentials` na frente | main l.784-786 (`… tlsDiagnosticLog, diagnosticCredentials, exit, state, …`), lido/asseverado em l.750, 1324-1329 |

Observação sobre o único caso que poderia parecer perda: a remoção de `{ recordLog: false }` em `run.mjs` é o **oposto** de uma reversão — antes o log do gate TLS era descartado, depois passou a ser preservado e redigido. Confirmado por `git show 31188873d -- scripts/e2e-isolated/run.mjs` (+3/-1) e pelo estado da main.

**Lacunas a recuperar: nenhuma** (mantém a conclusão da triagem).

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA.** Tentei refutar procurando qualquer hunk útil da branch ausente da main; não sobrou nenhum.

Método: extraí **todas** as 102 linhas únicas que a branch tem e a `origin/main` (`dac285f62`) não tem — `git diff 0f80b210d origin/main -- <os 21 arquivos da branch> | grep '^-[^-]'` → `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/branch_only_lines.txt` — e classifiquei cada uma. Todas caem em três grupos, nenhum deles perda:

1. **Variante antiga, substituída por versão mais forte** (`tls.mjs`, `tls-probe.mjs`, 2 unit tests): leaf `untrusted` autoassinado → leaf assinado por segunda CA exclusiva (`origin/main:scripts/e2e-isolated/tls.mjs:66,76-84,98,104-109`, incl. `rmSync(caKey); rmSync(controlCaKey)` e as asserções `!untrusted.verify(untrusted.publicKey)`); `fail(code)` → `fail(code, cause)` com `rejection` preservado (`origin/main:scripts/e2e-isolated/tls-probe.mjs:62,176` e `scripts/ci/e2e-isolated-tls.unit.mjs:468` `'retain exact native cause without approving it'`). Os mocks `throw` da branch viraram `reject` na main (`tls.unit.mjs:356,359`) — mesma semântica no `await`.
2. **Andaime do "primeiro corte" (só login), generalizado na main**: `runLogin({..., scope})` + `runSuite` + `phase(scope === 'login' ? 'real-browser-login' : 'real-browser-suite')` (`origin/main:scripts/e2e-isolated/run.mjs:308,703,816,821`); `metadata` com `tls-proof.json` presente em `run.mjs:782`; `controllerFixture(t, fault, manifest)` da branch continua aceito por retrocompatibilidade na main (`scripts/ci/e2e-isolated-runtime.unit.mjs:235-237`, `typeof options === 'function' ? { manifest: options }`); README e nome do workflow apenas descreviam esse corte.
3. **Linha reformatada**: `'...LD_LIBRARY_PATH', 'PLAYWRIGHT_FIREFOX_POLICIES_JSON',` virou duas linhas na main (`runtime-contract.mjs:84-85`), com `invalid-browser-tls-policy` em `:91-92` e `ORIGIN = 'https://127.0.0.1:5173'` em `:5`.

Checagens adicionais que poderiam derrubar a triagem e não derrubaram:
- `f32223dda` **é ancestral** de `origin/main` (`git merge-base --is-ancestor` → YES) e `git diff --stat 0f80b210d f32223dda -- <21 arquivos>` → só 4 arquivos divergem, **+111/−14**, e as 14 deleções são exatamente a variante antiga do item 1.
- Único hunk da branch no workflow (step `Preparar ferramentas TLS...` com `openssl libnss3-tools`) está na main **três vezes**: `.github/workflows/e2e-logado-isolado.yml:119,189,254`.
- A linha "missing" do `playwright.config.ts` é falso positivo: o `testIgnore` da main (`:134`) é **superconjunto** do da branch (acrescenta `talkx-visual`), e `tarefas-quadro` está no `testMatch` do projeto deslogado `chromium` (`:64`).
- Os 3 commits da branch: o conteúdo endurecido dos dois últimos (`cause` preservada, log do gate TLS gravado e redigido, `tlsDiagnosticLog`/`diagnosticCredentials`) está na main (`e2e-isolated-runtime.unit.mjs:750,786`; `run.mjs:587` sem `recordLog: false`).

**Lacunas adicionais: nenhuma. Apagar a branch continua seguro.**
