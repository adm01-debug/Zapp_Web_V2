# Testes E2E (Playwright)

## Fixture de autenticação

`e2e/auth.setup.ts` é o único teste do project `setup` (ver
`playwright.config.ts`): faz login de verdade via UI (mesmo fluxo de
`e2e/auth.spec.ts`: tab "Entrar" → e-mail → senha → botão "Entrar") e salva a
sessão em `e2e/.auth/user.json`. Esse arquivo **nunca** é commitado (está no
`.gitignore`).

O project `chromium-authenticated` declara `dependsOn: ['setup']`, então
`auth.setup.ts` só roda (e só exige as variáveis abaixo) quando algum teste
desse project é executado, e consome o `storageState` resultante.

O project `chromium` (usado só por `auth.spec.ts`, que testa a própria tela
de login deslogada) **não** depende de `setup` — continua funcionando sem
`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` definidas, inclusive rodando sozinho via
`npx playwright test --project=chromium`.

### Variáveis necessárias

| Variável | Descrição |
|---|---|
| `E2E_TEST_EMAIL` | E-mail de um usuário de teste real, já cadastrado no ambiente alvo |
| `E2E_TEST_PASSWORD` | Senha desse usuário |

Sem as duas, `e2e/auth.setup.ts` lança um erro explicativo e só o project
`chromium-authenticated` falha (propositalmente — não há fallback silencioso
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
- `.github/workflows/e2e-logado.yml`: project `setup` (login real com o usuário
  de teste), depois de cada merge na `main` e sob demanda (Actions → E2E logado →
  Run workflow). Fica separado do `ci.yml` de propósito: workflows de PR não
  podem referenciar secrets (regra em `scripts/ci/check-pr-workflow-secrets.mjs`),
  então esse teste não bloqueia PR.

`chromium-authenticated` **não roda no CI**: hoje só tem specs do Talk X, e o
usuário de teste (agente) não enxerga "Campanhas". Para incluí-lo é preciso
decidir o perfil do usuário de teste ou trazer specs que um agente consiga
executar.

## Specs que dependem de dados seedados

Alguns testes em `conversation.spec.ts`, `messaging.spec.ts` e `talkx.spec.ts`
continuam com `test.skip` mesmo depois da fixture de auth, porque dependem de
dados que não existem neste ambiente (ex.: uma conversa específica já aberta
no inbox, ou uma conexão de WhatsApp + segmento já seedados para avançar o
wizard de campanha). O comentário acima de cada `test.skip` explica a
dependência específica. Não inventamos fixtures de dados falsos só para
destravar esses casos.
