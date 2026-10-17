Especialista: worker (testes) (area-testes-do-produto)

# E2E logado (main a9b4d6c, run 38986918644): causa-raiz, ambiente declarado x real e caminho para o verde

Cartão de DIAGNÓSTICO (SYNC20-02). Produto = este documento + os comandos. Zero alteração em
código, teste, workflow, guarda ou baseline. Fonte: log real da run (via `gh`, somente leitura),
inspeção do repositório e execução LOCAL de dois projetos Playwright deslogados. SEM merge, SEM push,
SEM produção (R1-e2e: só banco local, usuário sintético local).

## Causa-raiz (uma só): o instalador de browsers dos workflows está pinado numa versão diferente da que o `bun.lock` resolve

Prova, na própria run:

1. O passo "Install Playwright" NÃO foi pulado e baixou os browsers da **1.63.0** (cache MISS):

```
##[group]Run bunx playwright@1.63.0 install --with-deps chromium firefox webkit
Chrome Headless Shell 153.0.8010.12 (playwright chromium-headless-shell v1243) downloaded to /home/runner/.cache/ms-playwright/chromium_headless_shell-1243
Firefox 155.0 (playwright firefox v1543) downloaded to /home/runner/.cache/ms-playwright/firefox-1543
WebKit 26.6 (playwright webkit v2359) downloaded to /home/runner/.cache/ms-playwright/webkit-2359
```

2. O passo de teste falha pedindo OUTRAS revisões:

```
Error: browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell
Error: browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/firefox-1555/firefox/firefox
Error: browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/webkit-2370/pw_run.sh
```

3. As revisões pedidas (1248/1555/2370) são as do **Playwright 1.64.1**, não as da 1.63.0:

```
$ npm pack playwright-core@1.64.1 && grep -E '"name"|"revision"' package/browsers.json
  chromium 1248 | chromium-headless-shell 1248 | firefox 1555 | webkit 2370   <- o que o RUNNER (1.64.1) precisava
```

No repositório, a 1.63.0 (a que o instalador baixou) espera o conjunto antigo:

```
$ grep -E '"name"|"revision"' node_modules/playwright-core/browsers.json
  chromium 1243 | chromium-headless-shell 1243 | firefox 1543 | webkit 2359   <- o que o INSTALADOR baixou
```

4. O lock da main resolve **1.64.1** e o workflow continua pinando **1.63.0**:

```
$ git show a9b4d6c:package.json | grep playwright   ->  "@playwright/test": "^1.64.0"
$ git show a9b4d6c:bun.lock | grep -o '@playwright/test@[0-9.]*'  ->  @playwright/test@1.64.1
$ git show a9b4d6c:.github/workflows/e2e-logado.yml | grep 'bunx playwright'
  127: run: bunx playwright@1.63.0 install --with-deps chromium firefox webkit
  131: run: bunx playwright@1.63.0 install-deps chromium firefox webkit
```

Conclusão: o CI instala os browsers da **1.63.0** e roda a suíte com o runner da **1.64.1**. É skew de
versão (workflow x lockfile), não "browsers não instalados no runner" nem cache corrompido — nesta run
o passo de install RODOU com sucesso (cache MISS; o `install-deps` é que foi pulado). A classificação
"infra" da AG5 (t_9d0263e6) descreve o sintoma, não a causa.

### O drift já era detectável dentro do próprio repo (a guarda N-022 reprova na main)

`scripts/ci/playwright-version-lock.unit.mjs` (N-022) compara o pin dos workflows com o `bun.lock`.
Aplicando essa guarda à árvore da main:

```
bun.lock da main resolve playwright 1.64.1
pins divergentes: [{"nome":"e2e-logado.yml","linha":127,"pinado":"1.63.0","esperado":"1.64.1"},
                   {"nome":"e2e-logado.yml","linha":131,"pinado":"1.63.0","esperado":"1.64.1"}]
```

No meu workspace (base `dia/2026-10-17`: lock 1.63.0 / pin 1.63.0) a mesma guarda passa
(`node --test scripts/ci/playwright-version-lock.unit.mjs` -> 4/4 pass). Ou seja: o drift nasceu de
subir `@playwright/test` para `^1.64.0` sem atualizar o literal `bunx playwright@1.63.0` dos 3
workflows; a guarda acusou, mas a main já estava vermelha em unit 1/3, 2/3, 3/3 (F20) e o acusado se
perdeu no ruído. O cache está correto (`pw-cfw-` = 3 engines, `pw-c-` = só chromium) — cache não é a
causa. São 6 pontos pinados no total: e2e-logado.yml 127/131, ci.yml 440/446, e2e-talkx.yml 91/95.

## Ambiente declarado x real

| item | DECLARADO | REAL (medido 17/10/2026 09:46) |
|---|---|---|
| Alvo do E2E logado | e2e-logado.yml L3: "o fluxo logado ... contra producao"; e2e/README: usuário de teste real + secrets do repo | R1 proíbe produção; o repo **não** documenta a receita local (banco local + usuário sintético) |
| Stack Supabase | pressupõe ambiente ativo | `supabase status` -> `LegacyStatusDbInspectError ... No such container: supabase_db_<ref>` = nenhum container de pé |
| Browsers firefox/webkit | instalados pelo workflow | `~/.cache/ms-playwright` tinha só `chromium-1243`, `chromium-1248`, `chromium_headless_shell-1243/1248`, `ffmpeg-1011/1013` — sem firefox, sem webkit |
| Versão do Playwright | pin literal 1.63.0 nos 3 workflows | `bun.lock` da main resolve 1.64.1 |
| Host | — | load 6,5 · 1,3 GiB livres · **sem privilégio root** (é do Joaquim) |

Após a instalação local: `firefox-1543` e `webkit-2359` presentes; o WebKit fica **inapto neste host**
sem privilégio root (`Host system is missing dependencies to run browsers ... libflite1`).

## Comandos exatos para o verde

### A) CI — dono worker (ci)/senior (fora da minha área; NÃO alterei)

1. Alinhar o literal ao lock (**1.64.1**) nos 6 pontos: `e2e-logado.yml:127,131` · `ci.yml:440,446` ·
   `e2e-talkx.yml:91,95`. Preferir trocar o literal a removê-lo: N-022 e o `workflow-contracts` (E68)
   dependem dele, e `scripts/ci/ci-docs-baseline.unit.mjs` exige o literal nos 3 workflows (atualizar o
   baseline para a mesma versão, senão ele reprova).
2. Provar localmente, sem push:
   `node --test scripts/ci/playwright-version-lock.unit.mjs` (tem de passar) ·
   `node --test scripts/ci/ci-docs-baseline.unit.mjs`
3. Aceite: a run do E2E logado instala e o passo de teste acha os 3 engines; nenhuma linha
   "Executable doesn't exist".

Alternativa estrutural (elimina o pin de vez): usar `bunx playwright install` (sem versão), herdando o
`bun.lock`; exige ajustar N-022 e E68, que hoje dependem do literal.

### B) Local (R1-e2e: só banco local e usuário sintético)

```bash
# 1) browsers do MESMO Playwright do lock do seu workspace
bunx playwright install chromium firefox webkit
ls -1 ~/.cache/ms-playwright     # firefox/webkit + o chromium da versão resolvida
# WebKit local exige libs de sistema, que só o root instala
# (install-deps do Playwright): pedir ao Joaquim; sem isso o webkit não abre.

# 2) banco LOCAL + usuário sintético LOCAL (nunca produção)
supabase start
supabase db reset                                             # migrations/seed no banco da tarefa
export E2E_TEST_EMAIL="e2e-local@exemplo.test"                # usuário SINTÉTICO local
export E2E_TEST_PASSWORD="<senha-sintetica>"

# 3) provas
bunx playwright test --project=firefox-auth --project=webkit-auth     # deslogado (sessão falsa)
bunx playwright test --project=setup --project=chromium-e2e-core      # logado, contra o banco LOCAL
```

Os projetos deslogados (`chromium-mapa`, `chromium-telefonia`, `firefox-auth`, ...) usam sessão falsa
(`installFakeSession`) + rotas mockadas: não precisam de banco nem de secrets, só browsers + dev server.

## Rodado agora neste workspace (prova)

| comando | resultado |
|---|---|
| `node --test scripts/ci/playwright-version-lock.unit.mjs` | 4 passed / 0 failed (o pin desta árvore casa com o lock) |
| guarda N-022 aplicada ao lock+workflow da main | 2 pins divergentes: 1.63.0 vs 1.64.1 |
| `npm pack playwright-core@1.64.1` + `browsers.json` | chromium 1248 / headless-shell 1248 / firefox 1555 / webkit 2370 |
| `bunx playwright install firefox webkit chromium` | baixou firefox-1543 e webkit-2359; avisou `libflite1` ausente |
| `bunx playwright test --project=chromium --workers=1` | 2 passed / 4 failed |
| `bunx playwright test --project=firefox-auth --workers=1` | 2 passed / 4 failed |

## Achado fora do escopo (vira comentário no cartão; não corrigi)

`e2e/auth.spec.ts` está vermelho **4 de 6 nos DOIS engines** (chromium e firefox) na base
`dia/2026-10-17`, por seletor desatualizado — logo não é browser/infra: `getByRole('button', { name:
/entrar|login/i })` casa 2 botões ("Entrar" e "Entrar com Google") -> `strict mode violation`; e o
heading `/bem-vindo de volta/` não existe mais no app (`git grep` só acha a string num teste unitário
que afirma que ela NÃO existe). Dono: worker (telas)/worker (ci) — provavelmente já coberto por um
cartão GA pendente.

## O que NÃO fiz e por quê

- Não editei workflow, guarda ou baseline: área do worker (ci); o cartão pede doc + comandos.
- Não rodei E2E logado nem toquei produção (R1); nenhuma credencial real foi lida ou usada.
- Não instalei dependências de sistema: exige privilégio root, que é do Joaquim.
- Único arquivo criado: este documento.
