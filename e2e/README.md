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
consome o `storageState` resultante.

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

Existe um usuário de teste dedicado, com perfil de agente (não enxerga
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

- `.github/workflows/ci.yml` (job `E2E Tests (Playwright)`, roda em PR): só o
  project `chromium` (`auth.spec.ts`, deslogado).
- `.github/workflows/e2e-logado.yml`: project `chromium-e2e-core` (que
  resolve `setup` sozinho via `dependsOn` — uma única invocação do
  Playwright, `--project=chromium-e2e-core`, sem path de arquivo no CLI),
  depois de cada merge na `main` e sob demanda (Actions → E2E logado →
  Run workflow). Fica separado do `ci.yml` de propósito: workflows de PR não
  podem referenciar secrets (regra em `scripts/ci/check-pr-workflow-secrets.mjs`),
  então esse teste não bloqueia PR.

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
`testIgnore` cobrindo auth + os 2 specs acima) fica reservado para specs
futuros que não sejam `conversation`/`messaging` — hoje nenhum workflow o
invoca. `talkx.spec.ts` fica fora do `e2e-logado.yml`: o usuário de teste é
agente e não enxerga "Campanhas". Para incluí-lo é preciso decidir o perfil
do usuário de teste ou trazer specs que um agente consiga executar.

## Fixture de dados (contato seedado)

`conversation.spec.ts` e `messaging.spec.ts` dependem de um contato real já
seedado em produção — `e2e/fixtures/e2e-contact.ts` documenta o id e expõe
`ensureFixtureConversationOpen()`. Em `conversation.spec.ts`, o `beforeEach`
navega para `/inbox` primeiro (chamar `ensureFixtureConversationOpen` antes
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

`talkx.spec.ts` continua com `test.skip`: além de não ter dados seedados,
o usuário de teste não tem permissão de ver Campanhas de qualquer forma.
