# Contatos — medição inicial do caminho até a conversa (CT-001)

> **Não é um relatório de melhoria: são os números de ANTES.** A meta do plano
> (`docs/plans/PLANO_CONTATOS_POR_JORNADA_2026-10-08.md`, jornada 1 · Achar) é
> **3 cliques e 5 segundos** do módulo até a conversa com um cliente. Este documento
> fixa o ponto de partida para os cartões seguintes compararem.

- Gerado em: 2026-10-08T15:39:55.765Z
- Commit medido: `7556a08f7`
- Preview: `http://127.0.0.1:4173` — bundle de produção (`vite build`, com manifesto)
- Roteiro: `node scripts/qa/contatos-jornada.cjs --repeticoes 3 --md docs/audits/CONTATOS_BASELINE_2026-10-08.md`
- Rodadas: 3 por largura; a linha de referência é a **mediana em segundos** (o host é compartilhado entre agentes e uma rodada isolada pega pico de carga).

## O que foi medido, e o que não foi

Medido no navegador real (Chromium do Playwright), a partir do menu principal já
carregado: clicar **Contatos** → digitar o termo na **busca** → clicar **Conversar**.
"Conversa aberta" = o painel da conversa montado (`ChatPanel`, classe `bg-inbox-panel`).

O roteiro roda com **sessão falsa e backend 100% mockado** (mesmo padrão dos projetos
`chromium-contacts-visual` e `chromium-a11y` do `playwright.config.ts`): nada sai para o
Supabase real — um guarda de rede barra e **registra** qualquer escape (o roteiro falha se
houver um). WebSocket também é bloqueado.

- **Limite 1 — a lista é uma fixture de 40 contatos**: o banco local tem
  poucos contatos, então a lista de teste é controlada e o contato-alvo é achado pela
  busca de verdade (mock da RPC `search_contacts` filtrado pelo termo enviado).
- **Limite 2 — latência de banco real não entra**: as respostas são locais; os segundos
  medem o custo do CLIENTE (montagem, chunks, troca de módulo), não a rede do Supabase.
- **Limite 3 — fontes do Google barradas**: a medição é hermética, então o texto usa a
  fonte de fallback; os erros de console de origem "externo" são esse efeito.
- **Limite 4 — a caixa de entrada também sai do mock**: o banco local não tem conversas,
  então a lista de conversas é servida a partir da mesma fixture de contatos. A coluna
  "é a conversa do contato buscado?" registra o que a tela mostra; quando ela diz "não",
  isso é atribuível à fixture (a conversa aberta não é rastreável até o contato clicado)
  e **não** deve ser lido como defeito do produto sem a mesma medição contra dados reais.

## Números de antes

| Largura | Cliques | Segundos | Requisições | JS baixado no caminho | Chunk do módulo (build) | Busca: cards antes → depois | Erros do app | Achados de a11y |
|---|---|---|---|---|---|---|---|---|
| 390 px | 3 | 2.8 s | 72 | 1070.3 KB | 138.3 KB (entrada) | 40 → 1 (filtrou: sim) | 1 | 159 |
| 768 px | 2 | 2.3 s | 82 | 1119.9 KB | 138.3 KB (entrada) | 40 → 1 (filtrou: sim) | 1 | 160 |
| 1672 px | 2 | 2.5 s | 151 | 1598.8 KB | 138.3 KB (entrada) | 40 → 1 (filtrou: sim) | 1 | 160 |

O **chunk do módulo (build)** é o arquivo do `ContactsView` no manifesto (o módulo
como ele é baixado); as dependências estáticas somam 2220.7 KB no
total. A coluna **JS baixado no caminho** é o que o navegador baixou de fato na janela
medida (0 KB = já estava em cache/precarga — ver a seção do chunk do módulo).

Meta do plano: **3 cliques e 5 segundos** — a comparação é com esta tabela.

### Onde os segundos vão (por largura)

| Largura | Como abriu o módulo | Abrir o módulo | Achar na busca | Abrir a conversa (total) | É a conversa do contato buscado? | Sinal que fechou a medição |
|---|---|---|---|---|---|---|
| 390 px | cabeçalho → painel do menu (celular) | 1.6 s | 2.3 s | 2.8 s | **não** | ChatPanel (.bg-inbox-panel) visível |
| 768 px | menu lateral (desktop) | 1.1 s | 1.8 s | 2.3 s | **não** | ChatPanel (.bg-inbox-panel) visível |
| 1672 px | menu lateral (desktop) | 1.3 s | 2.0 s | 2.5 s | **não** | ChatPanel (.bg-inbox-panel) visível |

Todas as rodadas (a linha de referência é a mediana em segundos):

| Largura | Cliques | Segundos | Requisições | JS baixado | Conversa do alvo |
|---|---|---|---|---|---|
| 390 px · rodada 1 | 3 | 2.8 s | 71 | 1070.3 KB | não |
| 390 px · rodada 2 | 3 | 2.8 s | 72 | 1070.3 KB | não |
| 390 px · rodada 3 | 3 | 2.7 s | 57 | 917 KB | não |
| 768 px · rodada 1 | 2 | 2.2 s | 148 | 1598.8 KB | não |
| 768 px · rodada 2 | 2 | 2.3 s | 148 | 1598.8 KB | não |
| 768 px · rodada 3 | 2 | 2.3 s | 82 | 1119.9 KB | não |
| 1672 px · rodada 1 | 2 | 2.5 s | 151 | 1598.8 KB | não |
| 1672 px · rodada 2 | 2 | 2.4 s | 148 | 1598.8 KB | não |
| 1672 px · rodada 3 | 2 | 2.5 s | 151 | 1598.8 KB | não |

## Peso do chunk do módulo (do build)

- Entrada: `assets/ContactsView-CK1ALO28.js` — 138.3 KB
- Dependências estáticas (128): 2082.5 KB
- **Total do módulo: 2220.7 KB**

Maiores dependências:

| Chunk | Bytes |
|---|---|
| `assets/vendor-charts-CL2qqn_3.js` | 447.8 KB |
| `assets/vendor-ui-X_h-x61U.js` | 349.4 KB |
| `assets/vendor-core-Cv0p2dBW.js` | 253.1 KB |
| `assets/vendor-data-CCKDm4LC.js` | 238.6 KB |
| `assets/index-Ccu_X8rp.js` | 214.2 KB |
| `assets/dnd.esm-CuBffvSY.js` | 81.6 KB |
| `assets/Index-cKDd7ojK.js` | 79.8 KB |
| `assets/vendor-utils-CnXPeyNc.js` | 53.5 KB |
| `assets/talkxShared-CnzN9Uy0.js` | 40.2 KB |
| `assets/Sidebar-BvxWOHIc.js` | 36.3 KB |

### O que o navegador baixou do módulo durante a janela medida

| Largura | Arquivo do módulo | Já estava carregado antes de abrir? | Baixado no caminho? | Bytes (decodificado) |
|---|---|---|---|---|
| 390 px | `assets/ContactsView-CK1ALO28.js` | não | sim | 138.3 KB |
| 768 px | `assets/ContactsView-CK1ALO28.js` | não | sim | 138.3 KB |
| 1672 px | `assets/ContactsView-CK1ALO28.js` | não | sim | 138.3 KB |

## Requisições do caminho

### 390 px — 72 requisição(ões)

| Rota | Nº |
|---|---|
| `GET /rest/v1/contacts` | 4 |
| `POST /rest/v1/rpc/search_contacts` | 2 |
| `POST /rest/v1/rpc/get_last_message_dates` | 2 |
| `POST /rest/v1/rpc/can_delete_contacts` | 2 |
| `GET /auth/v1/user` | 2 |
| `GET /rest/v1/queues` | 2 |
| `GET /rest/v1/queue_members` | 2 |
| `GET http://127.0.0.1:4173/assets/RealtimeInboxView-5uhV5G-w.js` | 1 |
| `GET http://127.0.0.1:4173/assets/alarm-clock-D7nQZXDS.js` | 1 |
| `GET http://127.0.0.1:4173/assets/facebook-BH3bM7oo.js` | 1 |
| `GET http://127.0.0.1:4173/assets/globe-UKjZEJoU.js` | 1 |
| `GET http://127.0.0.1:4173/assets/instagram-eZoChKB5.js` | 1 |
| `GET http://127.0.0.1:4173/assets/linkedin-CowEHqVm.js` | 1 |
| `GET http://127.0.0.1:4173/assets/pin-D-0J125N.js` | 1 |
| `GET http://127.0.0.1:4173/assets/route-CXjFApvp.js` | 1 |

### 768 px — 82 requisição(ões)

| Rota | Nº |
|---|---|
| `GET /rest/v1/contacts` | 4 |
| `POST /rest/v1/rpc/search_contacts` | 2 |
| `POST /rest/v1/rpc/get_last_message_dates` | 2 |
| `POST /rest/v1/rpc/can_delete_contacts` | 2 |
| `GET /auth/v1/user` | 2 |
| `GET /rest/v1/queues` | 2 |
| `GET /rest/v1/queue_members` | 2 |
| `POST /rest/v1/rpc/dashboard_kpi` | 1 |
| `GET http://127.0.0.1:4173/assets/TransferDialog-BSQs2YpB.js` | 1 |
| `GET http://127.0.0.1:4173/assets/radio-group-C0x5--kW.js` | 1 |
| `GET http://127.0.0.1:4173/assets/AIConversationAssistant-BPt9yTeP.js` | 1 |
| `GET http://127.0.0.1:4173/assets/dollar-sign-B3BSzr40.js` | 1 |
| `GET http://127.0.0.1:4173/assets/refresh-ccw-RRV7RYyw.js` | 1 |
| `GET http://127.0.0.1:4173/assets/thumbs-up-D7oaIk6O.js` | 1 |
| `GET http://127.0.0.1:4173/assets/PeriodFilterSelector-DTTSugA-.js` | 1 |

### 1672 px — 151 requisição(ões)

| Rota | Nº |
|---|---|
| `GET /rest/v1/contacts` | 4 |
| `GET /auth/v1/user` | 3 |
| `POST /rest/v1/rpc/search_contacts` | 2 |
| `POST /rest/v1/rpc/get_last_message_dates` | 2 |
| `POST /rest/v1/rpc/can_delete_contacts` | 2 |
| `GET /rest/v1/queues` | 2 |
| `GET /rest/v1/queue_members` | 2 |
| `GET /rest/v1/whatsapp_connections` | 1 |
| `GET http://127.0.0.1:4173/assets/ChatPanel-Dq2TRlUd.js` | 1 |
| `GET http://127.0.0.1:4173/assets/archive-BBfYJPhQ.js` | 1 |
| `GET http://127.0.0.1:4173/assets/arrow-left-right-BAAxSKUK.js` | 1 |
| `GET http://127.0.0.1:4173/assets/ban-CxmSo_oe.js` | 1 |
| `GET http://127.0.0.1:4173/assets/calendar-days-BtE94Bp9.js` | 1 |
| `GET http://127.0.0.1:4173/assets/useQuickReplies-CdfN_Se1.js` | 1 |
| `GET http://127.0.0.1:4173/assets/check-check-wladySLZ.js` | 1 |

## Erros de console e exceções

Classificação: **app** = erro/warn do próprio código (é o que interessa); **mock** = falha
de recurso do backend mockado (403 de escrita, 401 do JWT falso, recurso barrado) —
esperado nesta medição; **externo** = fontes do Google barradas.

### 390 px

- erros do app: **1** · avisos do app: 0
- erros do app DURANTE o caminho medido (o resto é do casco, antes de abrir Contatos): 0
- falhas de recurso do mock: 15
- fontes externas barradas: 1
- exceções não tratadas: **0**
  - `[2026-10-08T15:40:01.454Z] [ERROR] [RealtimeDashboard] [sid:cca02cbd] Error fetching initial data: [Object, Object, Object, Object]`

### 768 px

- erros do app: **1** · avisos do app: 0
- erros do app DURANTE o caminho medido (o resto é do casco, antes de abrir Contatos): 0
- falhas de recurso do mock: 19
- fontes externas barradas: 2
- exceções não tratadas: **0**
  - `[2026-10-08T15:40:19.131Z] [ERROR] [RealtimeDashboard] [sid:ca46523d] Error fetching initial data: [Object, Object, Object, Object]`

### 1672 px

- erros do app: **1** · avisos do app: 0
- erros do app DURANTE o caminho medido (o resto é do casco, antes de abrir Contatos): 0
- falhas de recurso do mock: 19
- fontes externas barradas: 2
- exceções não tratadas: **0**
  - `[2026-10-08T15:40:32.517Z] [ERROR] [RealtimeDashboard] [sid:5d7e1685] Error fetching initial data: [Object, Object, Object, Object]`

## Achados de acessibilidade (tela do módulo)

Escopo: a área do módulo (`#main-content`), com a busca e a lista carregadas — o casco
(barra lateral, cabeçalho, painel de notificações) não é o objeto desta medição.

Regras verificadas: fonte < 11 px, `<img>` sem `alt`, controle sem nome acessível, campo
sem rótulo, alvo de toque < 24 px (WCAG 2.5.8), contraste abaixo de AA (4,5:1 normal / 3:1
grande) e `id` duplicado.

| Largura | Elementos | Fonte <11px | Img sem alt | Sem nome | Campo sem rótulo | Alvo <24px | Contraste baixo / não medido | Id duplicado |
|---|---|---|---|---|---|---|---|---|
| 390 px | 2029 | 0 | 0 | 42 | 1 | 111 | 4 / 0 | 1 |
| 768 px | 2029 | 0 | 0 | 42 | 1 | 111 | 5 / 0 | 1 |
| 1672 px | 2029 | 0 | 0 | 42 | 1 | 111 | 5 / 0 | 1 |

Duas ressalvas para ler esta tabela:

- **contraste** é calculado pela cor de texto contra o fundo opaco mais próximo — sem
  considerar gradiente, imagem de fundo nem camada translúcida (alpha ≤ 0,5): esses casos
  entram como "não medido", e um "1,00:1 (branco sobre branco)" é artefato dessa
  simplificação, não achado. É uma aproximação de WCAG 1.4.3, não a medição do axe.
- **alvo < 24 px** é o mínimo da WCAG 2.5.8; alvos inline (link no meio de um texto)
  ficam fora. A referência de toque do projeto é 44 px, então 24 é o piso, não a meta.

### Exemplos — 390 px

- **campoSemRotulo** (1): `input[] Buscar por nome, telefone, email ou empresa…`
- **semNomeAcessivel** (42): `button.peer inline-flex h-6 w-11 shrink-0 curso` · `button.peer shrink-0 border ring-offset-backgro` · `button.inline-flex items-center justify-center `
- **alvoPequeno** (111): `BUTTON 18x18` · `Selecionar Ana Beatriz Souza 16x16` · `5511980001111 113x20`
- **contrasteBaixo** (4): `4.38:1 (mín 4.5) "DF" [rgb(161, 89, 18) sobre rgb(250,230,209)]` · `4.38:1 (mín 4.5) "HA" [rgb(161, 89, 18) sobre rgb(250,230,209)]` · `4.38:1 (mín 4.5) "AB" [rgb(161, 89, 18) sobre rgb(250,230,209)]`
- **idDuplicado** (1): `kpi-spark-area (3x)`

### Exemplos — 768 px

- **campoSemRotulo** (1): `input[] Buscar por nome, telefone, email ou empresa…`
- **semNomeAcessivel** (42): `button.peer inline-flex h-6 w-11 shrink-0 curso` · `button.peer shrink-0 border ring-offset-backgro` · `button.inline-flex items-center justify-center `
- **contrasteBaixo** (5): `1.00:1 (mín 4.5) "Cards" [rgb(255, 255, 255) sobre rgb(255,255,255)]` · `4.38:1 (mín 4.5) "DF" [rgb(161, 89, 18) sobre rgb(250,230,209)]` · `4.38:1 (mín 4.5) "HA" [rgb(161, 89, 18) sobre rgb(250,230,209)]`
- **alvoPequeno** (111): `BUTTON 18x18` · `Selecionar Ana Beatriz Souza 16x16` · `5511980001111 113x20`
- **idDuplicado** (1): `kpi-spark-area (3x)`

### Exemplos — 1672 px

- **campoSemRotulo** (1): `input[] Buscar por nome, telefone, email ou empresa…`
- **semNomeAcessivel** (42): `button.peer inline-flex h-6 w-11 shrink-0 curso` · `button.peer shrink-0 border ring-offset-backgro` · `button.inline-flex items-center justify-center `
- **contrasteBaixo** (5): `1.00:1 (mín 4.5) "Cards" [rgb(255, 255, 255) sobre rgb(255,255,255)]` · `4.38:1 (mín 4.5) "DF" [rgb(161, 89, 18) sobre rgb(250,230,209)]` · `4.38:1 (mín 4.5) "HA" [rgb(161, 89, 18) sobre rgb(250,230,209)]`
- **alvoPequeno** (111): `BUTTON 18x18` · `Selecionar Ana Beatriz Souza 16x16` · `5511980001111 113x20`
- **idDuplicado** (1): `kpi-spark-area (3x)`

## Integridade da medição

A guarda de rede é por **allowlist** (só a origem local passa). Toda requisição
não-local ou é servida por um **mock** (a maior parte: o backend inteiro é mockado)
ou é **barrada** pela guarda (Mapbox, fontes do Google, WebSocket). O que não estiver
em nenhuma das duas contas é escape e derruba o roteiro (EXIT 1).

| Largura | Não-local atendida por mock | Barrada pela guarda (backend real) | Outros hosts barrados | WebSocket bloqueado | Escapes |
|---|---|---|---|---|---|
| 390 px | 62 | 0 | 1 | 3 | 0 |
| 768 px | 85 | 0 | 2 | 4 | 0 |
| 1672 px | 85 | 0 | 2 | 3 | 0 |

Falhas do roteiro: nenhuma.

