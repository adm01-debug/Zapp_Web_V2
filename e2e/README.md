# Testes E2E (Playwright)

## Fixture de autenticação

`e2e/auth.setup.ts` é o único teste do project `setup` (ver
`playwright.config.ts`): faz login de verdade via UI (mesmo fluxo de
`e2e/auth.spec.ts`: tab "Entrar" → e-mail → senha → botão "Entrar") e salva a
sessão em `e2e/.auth/user.json`. Esse arquivo **nunca** é commitado (está no
`.gitignore`).

Os projects `chromium-authenticated` e `chromium-e2e-core` declaram
`dependsOn: ['setup']`, então `auth.setup.ts` só roda (e só exige as
variáveis abaixo) quando algum teste de um desses projects é executado, e
consume o `storageState` resultante.

O project `chromium` (usado só por `auth.spec.ts`, que testa a própria tela
de login deslogada) **não** depende de `setup` — continua funcionando sem
`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` definidas, inclusive rodando sozinho via
`npx playwright test --project=chromium`.

### Variáveis necessárias

| Variável | Descrição |
|---|---|
| `E2E_TEST_EMAIL` | E-mail de um usuário de teste real, já cadastrado no ambiente alvo |
| `E2E_TEST_PASSWORD` | Senha desse usuário |

Sem as duas, `e2e/auth.setup.ts` lança um erro explicativo e só os projects
que dependem de `setup` falham (propositalmente — não há fallback silencioso
nem bypass de auth); `chromium` (`auth.spec.ts`) continua passando
normalmente porque não depende de `setup`.

Existe um usuário de teste dedicado, com perfil de supervisor (enxerga
"Campanhas"/Talk X), e as credenciais estão nos secrets do repositório
(`E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD`). Para rodar localmente, peça as
credenciais ao dono do projeto.

### Configuração local

Criar um `.env` (já ignorado pelo git) na raiz do repo, ou exportar no shell
antes de rodar os testes:

```bash
export E2E_TEST_EMAIL="usuario-de-teste@exemplo.com"
export E2E_TEST_PASSWORD="senha-do-usuario-de-teste"
npm run test:e2e
```

### Configuração no GitHub Actions

- `.github/workflows/ci.yml` (job `E2E Tests (Playwright)`, roda em PR):
  projects `chromium`, `firefox-auth` e `webkit-auth` — todos exercitam
  `auth.spec.ts` deslogado (sem `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`).
  Workflows de PR não podem referenciar esses secrets (regra em
  `scripts/ci/check-pr-workflow-secrets.mjs`), então os testes autenticados
  ficam em `e2e-logado.yml`.
- `.github/workflows/e2e-logado.yml`: roda depois de cada merge na `main` e
  sob demanda (Actions → E2E logado → Run workflow). Numa única invocação:
  `--project=setup --project=chromium-e2e-core --project=chromium-authenticated
  --project=firefox-talkx --project=webkit-talkx --project=firefox-conversation
  --project=webkit-conversation`. `setup` gera `e2e/.auth/user.json` uma vez;
  todos os projects com `dependsOn: ['setup']` reutilizam o mesmo arquivo de
  sessão — o `storageState` gerado pelo Chrome é browser-agnostic e funciona
  igualmente no Firefox e no WebKit.

`chromium-e2e-core` cobre só `conversation.spec.ts` e `messaging.spec.ts`
(`testMatch` dedicado em `playwright.config.ts`) — passar os 2 arquivos como
path no CLI junto de `--project` quebra a resolução de `dependsOn` (o filtro
de arquivo vale para todos os projects da invocação, então `setup` roda com
0 testes e nunca gera `e2e/.auth/user.json`; foi exatamente esse bug na
primeira tentativa, run 36247270724). Rodar `setup` e os specs em 2
invocações separadas do CLI evita esse bug mas sobe 2 `vite` dev server do
zero (um por invocação) — sem o `setup` aquecer o bundle antes, a 1ª
navegação real do job cai num vite frio e estoura o timeout de 30s
(confirmado na run 36249048738). O project dedicado com `dependsOn` resolve
os dois problemas numa invocação só.

`chromium-authenticated` (mesma dependência de `setup`, mas com
`testIgnore` cobrindo auth + os 2 specs acima) é invocado pelo
`e2e-logado.yml` junto de `chromium-e2e-core` — uma única chamada do
Playwright com os 3 projects explícitos (`setup`, `chromium-e2e-core`,
`chromium-authenticated`). `talkx.spec.ts` roda sob este project: o
usuário de teste é supervisor e enxerga "Campanhas".

## Fixture de dados (contato seedado)

`conversation.spec.ts` e `messaging.spec.ts` dependem de um contato real já
seedado em produção — `e2e/fixtures/e2e-contact.ts` documenta o id e expõe
`ensureFixtureConversationOpen()`. Em `conversation.spec.ts`, o `beforeEach`
navega para `/` primeiro (chamar `ensureFixtureConversationOpen` antes
de qualquer navegação lança `SecurityError` ao ler `localStorage` numa
página ainda em `about:blank`), reabre a conversa (a suíte roda contra
produção via `e2e-logado.yml`, então o teste de resolução precisa reverter o
próprio efeito colateral a cada execução; o FSM em
`enforce_conversation_status_transition` permite `resolved -> open`) e só
depois clica no chip "Todas" — o chip padrão ("Em atendimento") depende do
feature flag `inbox.status-fsm` e de `assigned_to` bater com o profile
logado, enquanto "Todas" não filtra por isso. `messaging.spec.ts` (que não
mexe no status da conversa) faz só a navegação + clique em "Todas" no
`beforeEach`. O contato ("[E2E] Contato de teste - nao apagar", atribuído ao
usuário de teste, sem fila) é o único item visível no inbox desse usuário —
nunca apagar essa linha do banco.

`talkx.spec.ts` tem 7 specs cobrindo navegação/render do módulo Talk X e roda
automaticamente em `e2e-logado.yml` via `chromium-authenticated` (Chrome),
`firefox-talkx` (Firefox) e `webkit-talkx` (Safari/WebKit) — cobertura
cross-browser completa do módulo. Para rodar localmente: `npx playwright test
--project=setup --project=chromium-authenticated` com
`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` do usuário de teste (supervisor).

`conversation.spec.ts` e `messaging.spec.ts` ganham cobertura cross-browser via
`firefox-conversation` e `webkit-conversation` (ambos com `dependsOn: ['setup']`
e o mesmo `storageState` do Chrome), rodando junto dos outros projects no
`e2e-logado.yml`. Esses dois projects novos completam a paridade Firefox/WebKit
para todos os specs autenticados do módulo de inbox.

## Fixture de dados Talk X (segmento e conexão)

`talkx.spec.ts` usa fixtures de produção documentadas em
`e2e/fixtures/e2e-talkx.ts`:

| Fixture | ID | Observação |
|---|---|---|
| Conexão WhatsApp | `3b0f7f2e-887a-4c00-97de-012313649f9b` | "Promo Brindes WhatsApp (551146375517)"; pode estar disconnected — o wizard só exige selecionar |
| Segmento | `621521f3-e9c9-49c2-834e-cea07545d476` | "[E2E] Segmento de Teste"; semeado em 2026-09-27 para o usuário de teste (supervisor) |

**NUNCA apagar o segmento `621521f3-e9c9-49c2-834e-cea07545d476` do banco** —
ele é necessário para o spec de avanço para step 2 ("wizard advances to step 2
(Mensagem)") selecionar um segmento e habilitar "Continuar".

O 7º spec (`wizard advances to step 2`) preenche o formulário completo do
step 1 (nome, conexão WhatsApp, segmento) e verifica que "Continuar" fica
habilitado e o wizard avança para o step 2. Isso dispara o autosave do
`useCampaignEditor` (~3s após o preenchimento do nome), criando um rascunho
real em produção. O `afterAll` do arquivo chama `cleanupE2EDraftCampaigns()`
(também em `e2e/fixtures/e2e-talkx.ts`) para remover todos os drafts com
nome iniciando em `[E2E]` após cada run — mantendo o banco limpo.
