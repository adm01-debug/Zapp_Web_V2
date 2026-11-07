# Testes E2E (Playwright)

## Execução isolada

Os testes autenticados usam um ambiente descartável com Auth, PostgreSQL,
PostgREST, Storage, Realtime e Edge Runtime reais. O controller cria credenciais
sintéticas por execução, prepara os dados e confere isolamento e HTTPS antes de
ler as credenciais no login. O navegador não recebe a chave `service_role`.
A rede do conjunto fica restrita ao loopback, sem acesso ao backend oficial,
mensagens externas ou serviços de IA pagos.

O contrato completo, os requisitos Linux/Docker/Bun/OpenSSL/NSS, os digests das
imagens e os arquivos publicáveis estão em
[`scripts/e2e-isolated/README.md`](../scripts/e2e-isolated/README.md).

```bash
bun install --frozen-lockfile --ignore-scripts
# Cada destino precisa estar vazio e fora do checkout.
bash scripts/e2e-isolated/run.sh login /tmp/e2e-isolated-login
bash scripts/e2e-isolated/run.sh suite authenticated-1-of-3 /tmp/e2e-isolated-authenticated-1
bash scripts/e2e-isolated/run.sh suite authenticated-2-of-3 /tmp/e2e-isolated-authenticated-2
bash scripts/e2e-isolated/run.sh suite authenticated-3-of-3 /tmp/e2e-isolated-authenticated-3
bash scripts/e2e-isolated/run.sh suite deslogado-principal /tmp/e2e-isolated-deslogado-principal
bash scripts/e2e-isolated/run.sh suite deslogado-secundario /tmp/e2e-isolated-deslogado-secundario
```

`login` executa somente `setup/authenticate`. Esse resultado não aprova os demais
projetos. Cada grupo da suíte usa coleta `--list` separada e a mesma seleção,
shard e concorrência na execução. Todos usam `--workers 1`: os três shards
autenticados distribuem os casos `1/3`, `2/3` e `3/3` em backends descartáveis
independentes, sem concorrência sobre as mesmas fixtures. Não há parâmetro livre
para ignorar dependências, escolher comandos ou apontar um backend externo. O
resultado completo depende da execução nativa dos cinco grupos, não das
simulações locais de controle.

## Fixture de autenticação

`e2e/auth.setup.ts` é o único teste do projeto `setup`. Faz login real pela UI
(tab "Entrar" → e-mail → senha → botão "Entrar") e salva a sessão em
`e2e/.auth/user.json`, em mount efêmero. Esse arquivo nunca é commitado nem
publicado como artifact. Projetos com `dependencies: ['setup']` reutilizam o
`storageState`; a seleção explícita conserva essa dependência em todos os
browsers.

| Variável | Origem no ambiente descartável |
|---|---|
| `E2E_TEST_EMAIL` | Usuário sintético criado e confirmado no Auth local |
| `E2E_TEST_PASSWORD` | Senha sintética desta execução |
| `VITE_ZAPP_LOCAL_SUPABASE_URL` e `VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY` | Origem HTTPS de loopback e chave local `anon` geradas pelo controller |
| `E2E_SUPABASE_URL_OVERRIDE` e `E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE` | Mesmo par local, usado pelas fixtures |

A admissão exige prova recente em `/run/zapp-e2e/proof.json`, namespace sem rede
externa e coincidência entre origem, chave e configuração efetiva do Vite. Ela
valida esses dados antes de ler e-mail/senha e novamente após a observação no
browser. Exportar somente credenciais ou usar frontend em localhost não satisfaz
esse contrato. Não é necessário obter secrets do repositório para essa execução.

Os projetos públicos deslogados continuam independentes de `setup`. O projeto
`chromium` do CI público inclui os casos R1 de Tarefas: os três cenários, suas
asserções e a guarda deslogada são preservados; a seleção sai somente do catch-all
autenticado.
Essa cobertura pública não deve ser contada novamente entre os projetos abaixo.

## Grupos e GitHub Actions

A interface do controller conserva 15 projetos distintos. A seleção autenticada
de nove projetos é repetida em três backends e o Playwright atribui cada caso a
exatamente um dos shards fechados:

| Grupo | Projetos |
|---|---|
| `authenticated-1-of-3` (`--shard 1/3`) | `setup`, `chromium-e2e-core`, `chromium-authenticated`, `firefox-talkx`, `webkit-talkx`, `firefox-conversation`, `webkit-conversation`, `firefox-catalog`, `webkit-catalog` |
| `authenticated-2-of-3` (`--shard 2/3`) | os mesmos nove projetos, em backend próprio |
| `authenticated-3-of-3` (`--shard 3/3`) | os mesmos nove projetos, em backend próprio |
| `deslogado-principal` | `chromium-mapa`, `firefox-auth`, `webkit-auth` |
| `deslogado-secundario` | `chromium-telefonia`, `firefox-telefonia`, `webkit-telefonia` |

`.github/workflows/e2e-logado-isolado.yml` é o ponto de prova sobre a branch sem
secrets de produção. O workflow autenticado anterior só deve ser reativado com a
substituição validada pelo mesmo controller e pelos mesmos grupos. Publicar ou
obter sucesso do modo login não comprova a execução da suíte completa.

`chromium-e2e-core` cobre `conversation.spec.ts` e `messaging.spec.ts` por
`testMatch`; `chromium-authenticated` cobre os demais specs selecionados, com
suas exclusões explícitas. Não acrescente um filtro de arquivo à chamada de grupo:
esse filtro também afeta `setup` e pode retirar a criação de sessão da execução.
Os projetos de Talk X, conversa e catálogo reutilizam a sessão através das
respectivas dependências, preservando os casos cross-browser.

`chromium-mapa` não depende de `setup`: seus três specs usam sessão simulada,
REST/RPC e Mapbox controlados. As fixtures usam a origem configurada do conjunto;
um mock da API não pode interceptar a navegação do frontend.

## Fixture de dados: conversa e entrega

`e2e/fixtures/e2e-contact.ts` conserva o identificador que
`conversation.spec.ts` e `messaging.spec.ts` procuram. Os seeds de Arquivos criam
esse contato no banco descartável. `seed-suite.mjs` preserva seu proprietário:
a atribuição permanece com o agente de Arquivos. O supervisor sintético precisa
ler a conversa por RLS com seu JWT real. Não é necessário preparar nem limpar
uma linha no backend oficial.

Em `conversation.spec.ts`, a navegação ocorre antes de
`ensureFixtureConversationOpen()` para que `localStorage` exista. A fixture
reabre a conversa local entre os cenários e clica em "Todas", preservando o teste
do FSM e sua restauração. `messaging.spec.ts` navega e escolhe a conversa sem
substituir o envio por uma inserção artificial.

No ramo `ZAPP_E2E_LOCAL=1`, a mesma mensagem fresca
`[E2E fixture setup]` é criada pelo helper Node
`scripts/e2e-isolated/fixture-access.mjs`. O guard de proveniência do banco
recusa `sender='contact'` com JWT `authenticated`; o helper mantém essa
proteção e usa a chave sintética `service_role` somente depois de comprovar
origem fixa, prova do controlador, namespace, interfaces e identidade do
gateway, e de ler o contato canônico com o JWT real do usuário. Após cada
espera de rede, reconfirma a mesma execução, SHA e hash da chave anon. A chave
privilegiada nunca passa por `page.evaluate`, pela página ou pelo retorno da
função.

O POST aceita somente os quatro campos fixos da mensagem de texto e exige
uma única linha coerente. Em seguida, o helper lê o ID recém-criado com
anon + JWT do usuário: privilégio de preparo não substitui a prova de RLS.
Esse texto mantém o comportamento de `conversation`, `reactions`,
`inbox-contact-sidebar` e `media-volume`; a mensagem canônica de áudio e o
fluxo de envio real continuam independentes. As rotinas de limpeza e o ramo
legado mantêm seu comportamento. Se o POST for aceito e a leitura seguinte
falhar, o preparo reprova e pode deixar uma linha no banco descartável;
não há promessa de rollback. A conclusão dos testes nativos depende de uma
nova execução autenticada e de seu resumo estrito.

`assertIsolatedFixtureEnvironment({ baseURL, anonKey })` reutiliza a mesma
admissão Node para outros preparos: retorna `Promise<void>`, não navega a
página, não lê a service key e não expõe um mutador genérico.

Antes de liberar os specs, a prontidão prova `enqueue_outbound_message` →
`message-delivery` → provider local → linha real de `messages` visível com RLS.
Texto, imagem do catálogo e mídia privada do Storage precisam completar o fluxo.
O provider só emite recibo depois de baixar os bytes HTTPS; a URL assinada é
produzida pelo worker real. Uma contraprova HTTP precisa ser recusada por `22023`
sem persistir mensagem. Essa preparação não conta como aprovação das assertions
Playwright, que continuam obrigatórias.

## Fixture de dados Talk X

`e2e/fixtures/e2e-talkx.ts` conserva os identificadores de conexão e segmento
usados pelos specs. O seed isolado cria esses recursos com dados sintéticos;
a conexão aponta para Evolution GO no namespace local e o token vive no Vault
descartável. O supervisor precisa ler o segmento e a conexão com seu JWT antes
de começar o navegador.

O cenário que avança o wizard para "Mensagem" continua preenchendo nome,
conexão e segmento e exercita o autosave real. O rascunho é criado no banco local.
`cleanupE2EDraftCampaigns()` continua limpando os drafts de fixture nesse mesmo
ambiente. Não se remove nem se reutiliza um recurso do backend oficial.

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
lado. O `index.html` declara, tela por tela, o motivo de não haver captura —
`sem dados ainda` (a fixture ainda é `{}`, contrato de crescimento), `sem
componente no app` (13/14/15) ou `sem captura` (a fixture tem dados e a régua não
mediu) — e resume a contagem no topo; captura de execução anterior com a fixture
já esvaziada não é reexibida. No CI, `e2e-talkx.yml` roda o spec, monta a régua e
sobe o HTML como artefato `regua-visual-talkx` (14 dias) — informativo, não
bloqueia merge.

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

## Aba Arquivos: prova autenticada 100% local (cartão t_6c2d8281)

`e2e/files-tab.spec.ts` é a prova E2E autenticada da aba Arquivos **sem sair da
máquina**: banco local (`zapp-db-local`), Storage local, usuário sintético criado
no banco local e rede externa bloqueada. Nada é copiado de outro ambiente — não
há `storageState`, credencial real, fixture remota nem URL de Supabase externo.

### Como rodar

Os três grupos `authenticated-*-of-3` executam os seeds de Arquivos em backends
independentes. Para reproduzir o shard que contém o caso, rode a matriz completa;
cada comando prepara Auth/Storage reais e valida seus proprietários:

```bash
bash scripts/e2e-isolated/run.sh suite authenticated-1-of-3 /tmp/e2e-isolated-arquivos-1
bash scripts/e2e-isolated/run.sh suite authenticated-2-of-3 /tmp/e2e-isolated-arquivos-2
bash scripts/e2e-isolated/run.sh suite authenticated-3-of-3 /tmp/e2e-isolated-arquivos-3
```

Não substitui os dados por respostas fixas nem ignora `setup`. O usuário e os
objetos abaixo continuam sendo criados pelos seeds versionados no ambiente local.

O seed cria **só no ambiente local** e imprime o resumo: usuário
`e2e.arquivos@example.com` (domínio reservado RFC 2606, senha sintética que vive
apenas no conjunto local), 3 contatos atribuídos a ele, 69 mensagens de mídia (71 mensagens contando os 2 textos) e os
objetos privados do bucket `whatsapp-media` em `<contact_id>/<arquivo>` (o
formato exigido pela policy "Users can read assigned whatsapp media"). Ele mesmo
verifica o caminho de leitura: baixa um objeto por **URL assinada** e confirma que
a rota **pública** nega.

### O que a suíte prova

`carrega os 4 tipos de mídia privada` · `alterna Grid/Lista/Tabela e persiste a
preferência` · `modo seleção (item, Selecionar todos, recorte fora do filtro, Esc)`
· `painel de detalhes` · `preview com navegação por teclado` · `ARIA (aba, chips,
nomes acessíveis)` · `contraste numérico >= 4.5 em claro/escuro/alto contraste` ·
`paginação real (aviso "Buscando entre 60 carregados" e Carregar tudo até o fim)` ·
`lista vazia` · `redução de movimento`. As contagens vêm de consultas de verdade ao
banco local (4 mídias no contato principal, 65 no de paginação > `MEDIA_PAGE_SIZE` =
60, zero no contato só-texto) e a imagem só conta como carregada quando o `<img>`
decodifica (`naturalWidth > 0`) a partir de `/storage/v1/object/sign/...`.

### Local-only por construção

A guarda histórica `test.skip(!CONJUNTO_LOCAL)` continua no spec. O controller
fornece os dois overrides locais e exige os dados e o usuário reais: faltar essa
fixture reprova a preparação ou o resumo estrito, não torna a execução verde.
Os dois skips de plataforma previamente revisados de `conversation.spec.ts` são
outra categoria, vinculada à identidade e fonte exatas e nunca contada como pass.
Fixmes estáticos continuam registrados como pendências, sem ampliar essa exceção.

### Prova negativa de segurança

O spec faz `page.route('**/*')` e **aborta** toda requisição fora de
`127.0.0.1`/`localhost`/`::1`; os únicos hosts tolerados (fontes do Google e
Speed Insights, chamados pelo `index.html`) também são abortados — o app segue
funcional sem eles, que é exatamente a prova de que o fluxo não depende de rede
externa. Sobra de host fora da lista reprova o teste no `afterEach`. O login é real
pela UI (`/auth` → `auth-login` local → GoTrue local) com `storageState` vazio, e o
`src/config/supabase.ts` só desvia para o conjunto local com build não-PROD e URL
em `127.0.0.1`/`localhost`.

### Por que contexto compartilhado e `retries`

Cada teste da suíte paga um login real + boot completo da SPA. Dez renderers novos
em sequência derrubam o Chromium por OOM em máquina compartilhada (vários
workspaces de teste no mesmo host), então a suíte roda `serial` sobre **uma** página
autenticada: cada teste volta a `/` com reload completo (estado de memória zerado
como numa visita nova) e só a preferência de layout (`zapp.inbox.files.view:*`) é
removida entre testes — a sessão local e as demais preferências ficam, como na vida
real. `retries` cobre o OOM residual do renderer, que é flake de infraestrutura.

### Achado fora do escopo desta suíte

Sob carga, o **primeiro** `Esc` real chega ao `window` e não sai do modo seleção
(o listener do `useEffect` da aba ainda não estava registrado); o segundo sai. É
comportamento do app (`FilesTab.tsx`, fora dos arquivos deste cartão), registrado
no cartão t_6c2d8281 — aqui o teste prova a saída por `Esc` com tentativas reais,
sem depender do timing do efeito.

O **erro da segunda leitura** não entra nesta suíte por medição, não por escolha:
interceptar `**/rest/v1/messages**` atinge TODA a inbox (a conversa aberta lê a
mesma tabela), e nas duas formas testadas — `route.abort()` e `route.fulfill(500)`
— o botão "Carregar tudo" ficou desabilitado (`isFetchingNextPage`) e a faixa
`files-query-error` não apareceu em 20 s (com `abort`, o fetch do supabase-js entra
em retry). Medição registrada no cartão; a faixa de erro em si tem prova unitária
em `src/components/inbox/tabs/__tests__/FilesContent.test.tsx`.

## Diagnóstico do setup e limites de execução remota

O setup registra somente origem do endpoint, status HTTP, ocorrência de falha de
transporte do POST de `auth-login` e presença de marcadores específicos de recusa
na UI. Não lê nem imprime corpo, headers, credenciais, tokens ou conteúdo do
storageState para diagnosticar uma falha.

O toast "Login temporariamente indisponível" também pode resultar de CORS/fetch;
ele não comprova timeout, HTTP 5xx/429 nem senha incorreta. O diagnóstico distingue
origem incompatível com a política CORS oficial, transporte sem resposta, recusa
de autenticação, HTTP 429/5xx e resposta 2xx sem sessão/app shell confirmada.
O título exato "Acesso bloqueado" encerra a espera como bloqueio observado pelo
app; HTTP 403 isolado é recusa da requisição, sem atribuir senha inválida ou uma
regra de rede específica. O setup observa apenas a presença desse título, sem
ler o corpo da resposta nem a descrição do toast.
Respostas tardias de uma tentativa anterior não alimentam a tentativa seguinte.
O diagnóstico controla somente o laço interno de tentativas do setup; os retries
do projeto Playwright (`RETRIES_LOGADOS`) permanecem como estavam.

Quando `PLAYWRIGHT_BASE_URL` indica um servidor HTTPS remoto, a configuração não
inicia Vite local. Projetos públicos continuam disponíveis. A guarda específica
de `auth.setup.ts` recusa a suíte autenticada nesse alvo **antes** de ler/enviar
credenciais: os testes contêm encerramento de conversas, gravação/limpeza de
fixtures, drafts e enfileiramento de mensagens reais. Usuário dedicado e limpeza
posterior não isolam o backend.

O ambiente descartável usa a configuração de desenvolvimento explícita; sem
esse par, o app usa o backend oficial. Por isso, o controller e a admissão
conferem a configuração efetiva e o namespace antes das credenciais. Não é
necessário alterar CORS, permissões ou dados do backend oficial.

O preparo, os seeds e os providers isolados estão em `scripts/e2e-isolated/`.
O aceite exige o inventário e a execução nativa dos grupos sobre o mesmo checkout,
com os limites e pendências discriminados. Preflight verde, login aprovado ou
spec pulada não bastam. O resumo distingue passes, falhas, skips históricos
estritamente vinculados à fonte, fixmes, casos ausentes e dependentes não
executados; nenhuma dessas pendências é convertida em pass.

Simulação offline, sem credenciais e sem endpoints reais (Node 24+):

```sh
node --test scripts/ci/e2e-auth-*.unit.mjs
```

## Regressões de SIP, sessão, QR e busca de contatos

As regressões de `navegacao-modulos.spec.ts` instalam os observadores antes do gatilho de boot/navegação e exigem POST e corpo concluídos. A barreira do helper `function-completion.ts` tem um prazo total de 30 segundos a partir de `completed()`, depois do gatilho; uma segunda chamada não reinicia esse prazo. Ausência, fechamento da página, transporte falho, JSON inválido e timeout reprovam.

SIP conserva no ambiente isolado somente o contrato explícito 503/`SIP_NOT_CONFIGURED`; 401 não recebe tolerância. A regressão de dispositivo exige o resultado 200 real no boot. A prova concorrente cria outra sessão Auth do mesmo usuário sintético, conserva o dispositivo já conhecido, inicia duas requisições antes de aguardá-las e exige o mesmo ID canônico, uma linha ativa e readback com RLS. Isso comprova convergência das duas chamadas; não afirma ter forçado uma colisão interna de INSERT. O cenário de corrida forçada do handler continua sendo evidência separada.

`conexoes.spec.ts` usa a fixture `isolated-qr.ts` para o fluxo de QR. Administrador, conexão, token e limpeza têm identidades próprias; os detalhes e limites estão no README de `scripts/e2e-isolated/`. Os quatro testes anteriores de Conexões continuam independentes. Nenhum pareamento ou envio externo é necessário.

A paleta Ctrl+K consulta contatos pela mesma RPC autorizada do serviço de contatos, com limite de oito resultados e escape dos curingas de busca. A seleção usa o UUID e o evento existente de abertura da conversa. Catálogo e contatos têm orçamento de cinco segundos por fonte; a expiração de contatos produz um item de indisponibilidade e não retém indefinidamente os produtos já encontrados. O prazo limita a espera da paleta: não afirma aborto do transporte nem acrescenta retry. Debounce, tamanho mínimo da consulta e proteção contra respostas antigas continuam pertencendo à paleta.

O E2E da busca mantém sessão e API simuladas. Ele exige a resposta da pesquisa concluída, seleciona o segundo contato de mesmo nome, observa a leitura de seu UUID e verifica o chat montado, por clique ou teclado, a partir de Inbox e Dashboard. Isso prova a integração da interface, serviço e navegação com a fronteira HTTP controlada; não equivale a Auth ou RLS nativos.

