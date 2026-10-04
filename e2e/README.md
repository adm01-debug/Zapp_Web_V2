# Testes E2E (Playwright)

## Fixture de autenticação

`e2e/auth.setup.ts` é o único teste do project `setup` (ver
`playwright.config.ts`): faz login de verdade via UI (mesmo fluxo de
`e2e/auth.spec.ts`: tab "Entrar" → e-mail → senha → botão "Entrar") e salva a
sessão em `e2e/.auth/user.json`. Esse arquivo **nunca** é commitado (está no
`.gitignore`).

Os projects `chromium-authenticated` e `chromium-e2e-core` declaram
`dependencies: ['setup']`, então `auth.setup.ts` só roda (e só exige as
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
  --project=chromium-mapa --project=firefox-talkx --project=webkit-talkx
  --project=firefox-conversation
  --project=webkit-conversation`. `setup` gera `e2e/.auth/user.json` uma vez;
  todos os projects com `dependencies: ['setup']` reutilizam o mesmo arquivo de
  sessão — o `storageState` gerado pelo Chrome é browser-agnostic e funciona
  igualmente no Firefox e no WebKit.

`chromium-e2e-core` cobre só `conversation.spec.ts` e `messaging.spec.ts`
(`testMatch` dedicado em `playwright.config.ts`) — passar os 2 arquivos como
path no CLI junto de `--project` quebra a resolução de `dependencies` (o filtro
de arquivo vale para todos os projects da invocação, então `setup` roda com
0 testes e nunca gera `e2e/.auth/user.json`; foi exatamente esse bug na
primeira tentativa, run 36247270724). Rodar `setup` e os specs em 2
invocações separadas do CLI evita esse bug mas sobe 2 `vite` dev server do
zero (um por invocação) — sem o `setup` aquecer o bundle antes, a 1ª
navegação real do job cai num vite frio e estoura o timeout de 30s
(confirmado na run 36249048738). O project dedicado com `dependencies` resolve
os dois problemas numa invocação só.

`chromium-authenticated` (mesma dependência de `setup`, mas com
`testIgnore` cobrindo auth, os 2 specs acima e as 3 specs do módulo MAPA) é
invocado pelo `e2e-logado.yml` junto de `chromium-e2e-core` — uma única
chamada do Playwright com os projects explícitos (`setup`,
`chromium-e2e-core`, `chromium-authenticated`, `chromium-mapa`).
`talkx.spec.ts` roda sob este project: o usuário de teste é supervisor e
enxerga "Campanhas".

`chromium-mapa` cobre só as specs do módulo MAPA (`location-picker.spec.ts` —
E71/E72, `contact-address.spec.ts` — E73, `contact-map-pin.spec.ts` — E74).
Diferente de `chromium-e2e-core`/`chromium-authenticated`, **não** declara
`dependencies: ['setup']` nem `storageState`: essas specs autenticam por sessão
FALSA (`installFakeSession`) com REST/RPC e Mapbox mockados, então rodam sem
`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` — nenhum secret novo no `e2e-logado.yml`.

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
`firefox-conversation` e `webkit-conversation` (ambos com `dependencies: ['setup']`
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

## Fixture de demonstração determinística (plano V4 · X003)

`e2e/talkx-demo.spec.ts` renderiza o módulo Talk X com dados fake — sem gravar
nem enviar nada em produção. `e2e/fixtures/talkx-demo.ts` exporta
`mockTalkXBackend(page, tela)`, que carrega `e2e/fixtures/talkx-demo/<tela>.json`
e intercepta via `page.route` as chamadas `rest/v1/talkx_*`,
`rest/v1/rpc/talkx_*` e `functions/v1/talkx-*`: GET devolve a fixture, e
qualquer escrita é bloqueada com 403 `"escrita não prevista"`. Criadores
(`get_team_profiles`) e contatos (insights) respondem vazios para o demo não
ler produção. O relógio é fixado com `page.clock`.

**Contrato de crescimento (oficializado em X003/X004).** A fixture **cresce
junto com cada etapa de tela**: a etapa que cria uma tabela/RPC Talk X acrescenta
a resposta dela no JSON da tela correspondente — a fixture de cada tela nasce na
etapa daquela tela, nunca antes. Enquanto isso, o arquivo da tela é `{}` e:

- `loadDemoData(tela)` (e portanto `mockTalkXBackend`/`mockTalkXVisual`) **lança
  `FixtureVaziaError`** ao referenciar uma fixture vazia — nunca mais
  `data[table] ?? []` renderizando a tela em branco em silêncio;
- a régua visual (`e2e/talkx-visual.spec.ts`) **pula** as telas cuja fixture é
  `{}` (`fixtureDaTela(nn)` devolve `undefined`) — ausência de fixture não é
  falha, é "ainda não é a etapa desta tela".

Hoje só a tela 01 (`01-campanhas-visao-geral.json`) tem dados (as 24 campanhas
do mock, KPI "Total de campanhas" = 24); as demais são `{}` e serão preenchidas
pelas etapas de cada tela — por isso a régua hoje captura só a 01. O spec roda no
`e2e-logado.yml` via `chromium-authenticated` (mesmo `storageState` dos demais
specs autenticados), mas nunca toca o banco de produção do módulo.

## Régua visual lado a lado (plano V4 · X004)

`e2e/talkx-visual.spec.ts` é a **régua informativa** do plano V4: percorre as
17 telas do mock e captura, em 1672×941 (tema escuro), aquelas cuja fixture tem
dados reais (hoje só a 01 — ver contrato de crescimento acima), para comparar
com os mockups de `docs/talkx/references/NN_*.png`. Roda **deslogado** (sem
`storageState`/secrets) no projeto `chromium-talkx-visual` — a sessão é
injetada no localStorage por `installFakeSession(page)` de
`e2e/fixtures/talkx-demo.ts`, que também mocka `profiles`, `user_roles`, a RPC
`user_has_permission` e marca o onboarding como concluído (senão o
`WelcomeModal` abre e intercepta os cliques).

As telas **13/14/15** (pausa/retomada, relatório concluído, importação CRM360)
ainda não existem no app: o spec grava `nao-existe-NN.txt` em vez de capturar.

Além disso, a régua só **captura** as telas cuja fixture tem dados reais
(contrato de crescimento, seção anterior): hoje só a 01 — as 02..17 são puladas
(`test.skip`) até que a etapa de cada tela popule a fixture dela, sem que isso
seja falha do run.

O artefato é montado por `scripts/talkx/lado-a-lado.mjs --out <dir>`, que copia
mock + captura para `<dir>/img/{mock,captura}` e gera `<dir>/index.html` lado a
lado. No CI, `e2e-talkx.yml` roda o spec, monta a régua e sobe o HTML como
artefato `regua-visual-talkx` (14 dias) — informativo, não bloqueia merge.

## Picker de localização (plano MAPA · E71)

`e2e/location-picker.spec.ts` cobre o combobox de endereço do picker **sem
secret e sem token real**. Reusa `installFakeSession(page)` de
`e2e/fixtures/talkx-demo.ts` (sessão falsa injetada no localStorage) e mocka o
backend inteiro com `page.route`: `rest/v1` (contato fixo `04dff4dc-…`,
`profiles`/`user_roles`/`user_settings`, `messages` só leitura — escritas
devolvem 403) e, o que importa aqui, `functions/v1/get-mapbox-token` devolve um
token falso enquanto todo o `searchbox/v1` da Mapbox é respondido com as
fixtures de `src/lib/__fixtures__/mapbox/` (E68) — inclusive o `/retrieve`,
que usa o shape de `forward-avenida-paulista-1000.json` porque o E68 não tem
`retrieve-*` para esse endereço.

O fluxo é: abrir a conversa do contato de teste → "Mais" → "Enviar
localização" → aba "Escolher no Mapa" → digitar "avenida paulista 1000" →
esperar `role=listbox` → `ArrowDown` + `Enter` → conferir o cartão de
confirmação → **fechar sem enviar**. O spec asserta que nenhum POST (insert)
saiu para `rest/v1/messages`, então nenhum WhatsApp real é gerado (o único
PATCH é o `is_read` do markAsRead ao abrir a conversa). Roda em
`chromium-mapa` (E75) — projeto sem `setup`/`storageState`, pois a sessão é
falsa.

## Lançamento do Talk X com provedor falso (plano V4 · X034)

`e2e/talkx-launch.spec.ts` é o **ensaio real de lançamento**: prova no navegador
o ciclo inteiro de uma campanha — lançar → corpo `{ action: 'start' }` → ida ao
monitor ("Campanha em Andamento") → pausar com motivo → `{ action: 'pause',
reason }` → retomar → `{ action: 'start' }` → cancelar → `{ action: 'cancel' }`.

Roda **deslogado** (sem `storageState`/secrets) no projeto
`chromium-talkx-launch`: a sessão é injetada por `installFakeSession(page)` e o
backend inteiro é mockado com `page.route`. As leituras da campanha vêm das
fixtures de `e2e/fixtures/talkx-launch/<tabela>.json` (uma por tabela:
`talkx_campaigns`, `whatsapp_connections`, `talkx_recipients`,
`talkx_campaign_events`, `contacts` e `talkx_segments`) e o POST de
`**/functions/v1/talkx-send` é respondido por um **stub local** que registra o
corpo e devolve `{ accepted: true }`. O status da campanha na fixture é mutável
(`start` → `sending`, `pause` → `paused`, `cancel` → `cancelled`), então a UI
migra de rascunho → em andamento → pausada → cancelada sem banco nenhum.

**Guardas.** O stub responde com o cabeçalho marcador `x-talkx-launch-stub`; o
spec ouve `page.on('response')` e **falha** se alguma resposta de `talkx-send`
não trouxer esse cabeçalho — ou seja, se alguma chamada escapar do `page.route`
e for para a rede. O provedor de produção não é endereçado por nenhum caminho:
não existe envio real neste spec. Os 4 corpos são conferidos exatamente e
qualquer outra `functions/v1/*` responde 403 `"escrita não prevista"`.

O spec roda em `.github/workflows/e2e-talkx.yml` (junto do spec de navegação e
da régua visual), no passo `--project=chromium-talkx-launch`.

**Armadilhas para quem for mexer.** O botão do menu da linha tem
`aria-label="Ações"` e exige `exact: true` no seletor: sem isso,
`getByRole('button', { name: 'Ações' })` casa também o sino "Notificações" (que
contém "ações") e o clique abre o popover de notificações. E o
`TalkXConfirmDialog` renderiza `role="alertdialog"`, não `dialog`.
