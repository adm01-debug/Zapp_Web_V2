# RELATÓRIO W5 — reprodução na app (navegador real) dos defeitos que a onda 1 provou só em sonda unitária

**Onda:** 2 (adversarial) · **Frente:** W5 — bundle real / navegador real
**Repo:** `adm01-debug/Zapp_Web_V2` · **Sandbox:** `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae`
**HEAD do sandbox:** `77f1a054995130b1f9257eb7691a66985877d447` (`docs(auditoria): auditoria adversarial das fases 1-3 (5 frentes) (#1215)`)
**Coleta:** `2026-09-29T17:12-03:00` (America/Sao_Paulo)
**Toolchain:** `bun 1.4.0` · `node v24.19.0` · `playwright 1.63.0` (Chromium) · `vite preview` em `http://127.0.0.1:4173`
**Nada foi commitado/pushado/checkoutado.** Único diretório novo: `w5-artefatos/` (untracked).

---

## Sumário executivo

| # | Defeito (onda 1) | Veredicto desta onda | Prova principal |
|---|---|---|---|
| 1 | **A3-01** — toast destrutivo **falso** por clique duplo + N−1 `/retrieve` + N sessões | **REPRODUZIDO NO BUNDLE REAL** | toast `bg-destructive` `rgb(239,67,67)` com o texto exato; localização aplicada **depois**; `1 /suggest` + **2 `/retrieve`** com **2 `session_token` distintos** para **1** seleção |
| 2 | **A3-04** — pausa de 429 não se encerra sozinha; botão "Tentar novamente" some ao ser clicado | **REPRODUZIDO NO BUNDLE REAL** | contador `57s → 37s → 15s → 0s → 0s`; **`retryButton=0`** em todas as amostras; `/suggest` **congelado em 1** de t+0s a t+75s |
| 3 | **A4-B** — `ContactForm` (cadastro) ignora a flag `mapa.searchbox-autocomplete` | **REPRODUZIDO NO BUNDLE REAL** | com a flag OFF: cadastro dispara **1 `/suggest`** (`types=address,street,place`, sessão própria) e renderiza a lista rica; o picker do inbox, no **mesmo contexto**, dispara **0 `/suggest`** |
| 4 | **A4-C** — ramo da flag DESLIGADA do picker não tem estado de busca/causa | **REPRODUZIDO NO BUNDLE REAL** | em voo e após falha a área da lista fica **vazia**; sucesso renderiza a "terceira cópia" **sem** `role=listbox`/`role=option`, sem ícone e sem destaque |
| 5 | **A4-D** — 2º editor de contato abre com endereço **vazio** | **REPRODUZIDO NO BUNDLE REAL** | os 2 caminhos (Detalhes do Contato **e** CRM 360°) abrem `Editar Contato` com `#address`, `#city`, `#postal_code`… vazios, enquanto a resposta de `contacts` que o app recebeu **tem** as 8 colunas de endereço; a query `contact-enriched` **não pede nenhuma** |

**Nenhum** dos 5 saiu como "só em sandbox" ou "não reproduzido". Todos aparecem no bundle compilado de produção, num Chromium real, via interação real (clique, tab, teclado).

---

## 1. Como a reprodução foi feita — e por que não foi na URL publicada com login

`https://zapp-web-v2.vercel.app` é **alcançável** (HTTP 200) e o bundle dela está **vivo**. O que bloqueia é o **login**:

- `e2e/README.md` e `.github/workflows/e2e-logado.yml` mostram que a única credencial de teste (`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`) vive nos **secrets do GitHub** — valor não extraível por `gh` (`gh secret list` só lista nomes).
- A tarefa **proíbe** usar credencial de pessoa real. Logo, não havia credencial legítima disponível.
- O login não é GoTrue puro: `AuthService.signIn` chama a edge function **`auth-login`** (`src/lib/serverLogin.ts`), cujos segredos também não estão no sandbox.
- Agravante de infra já avisado: o **gateway MCP do banco canônico está fora** (o probe da rota `/mcp` trava). Consequência direta: **não li o estado real de `feature_flags` nem qualquer linha de `contacts` nesta onda**; o valor de `mapa.searchbox-autocomplete` usado é o que eu **injeto na resposta da RPC de flags** (o mesmo campo que a onda 1 leu como `true`).

Por isso segui exatamente o **caminho alternativo autorizado**: `bun run build` + `vite preview` + rede mockada por `page.route`.

### 1.1 Achado de infraestrutura (importante para o aceite)

`https://zapp-web-v2.vercel.app/version.json` responde:

```json
{"buildId":"77f1a054995130b1f9257eb7691a66985877d447"}
```

Esse SHA é **exatamente o HEAD deste sandbox**. Ou seja: **a produção está no mesmo commit auditado** — o `buildId` `0ab84095` citado no enunciado **não** é o que está no ar hoje.

Para que o artefato local fosse comparável, o build foi refeito com o SHA do deploy (é o `vite.config.ts:9` que define `buildId = VERCEL_GIT_COMMIT_SHA || GITHUB_SHA || local-<ts>`):

```
$ VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD) bun run build
$ cat dist/version.json
{"buildId":"77f1a054995130b1f9257eb7691a66985877d447"}      # <- idêntico ao da produção
```

Todos os `w5-artefatos/*.png` desta rodada foram capturados **depois** desse rebuild — o bakeado é o do commit publicado.

### 1.2 Proveniência: o que é real e o que é mockado

| Camada | Estado | Observação |
|---|---|---|
| Bundle JS/CSS | **REAL** | `dist/` do build de produção do commit publicado (mesmo `buildId`) |
| Navegador | **REAL** | Chromium headless (Playwright 1.63), viewport 1440×950 |
| React/DOM/foco/teclado/clique | **REAL** | o app inteiro montado: AppShell, inbox, `ChatPanel`, `LocationPicker`, `ContactForm`, `EditContactDialog`, mapa (`mapbox-gl`) |
| Construção das URLs da Mapbox (Search Box) | **REAL** | `q`, `session_token`, `access_token`, `types`, `proximity` são gerados pelo código do bundle — é o que o HAR mostra |
| Respostas da Mapbox (suggest/retrieve/forward/style) | **MOCK** | `context.route('https://api.mapbox.com/**')`, com atraso artificial no `/retrieve` |
| Supabase: auth/REST/functions | **MOCK** | `context.route('https://tnnnlkbymytvtqngbbqh.supabase.co/**')`; o mock **projeta** as colunas pedidas no `select` (semântica do PostgREST) |
| Supabase Realtime (WS) | **BLOQUEADO** | `routeWebSocket('wss://**')` → `close()` |
| `feature_flags` | **MOCK** | injetado na resposta da tabela, é o que permite ligar/desligar a flag |
| Login de usuário | **NÃO EXERCITADO** | sessão injetada em `localStorage['sb-tnnnlkbymytvtqngbbqh-auth-token']`; o caminho de autenticação real não é tocado |

### 1.3 Sanidade — nada tocou o backend real

`w5-artefatos/sanity-origins.json` (fluxo completo do A3-01):

```json
{ "origens": {
    "http://127.0.0.1:4173": 221,
    "https://tnnnlkbymytvtqngbbqh.supabase.co": 89,
    "https://api.mapbox.com": 4,
    "https://fonts.gstatic.com": 3,
    "https://fonts.googleapis.com": 1 },
  "requestsfalhos": [] }
```

- **Supabase e Mapbox foram 100% satisfeitos pelas rotas locais** (nenhum request chegou ao banco nem à Mapbox; o token usado é `pk.w5-fake-mapbox-token`, falso). Portanto: **zero sessão faturável real, zero leitura no banco canônico, zero escrita, nenhuma mensagem enviada.**
- Divulgação honesta: **4 requests ao Google Fonts** (`fonts.googleapis.com`/`gstatic`) **saíram de fato** para a internet (o app faz preconnect em `index.html`). São GETs de fonte, sem relação com os defeitos.

---

## 2. Roteiro comum (a infraestrutura de reprodução)

Os scripts ficam em `w5-artefatos/` e podem ser reexecutados:

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
cd /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae
bun run build && ./node_modules/.bin/vite preview --port 4173 --strictHost --host 127.0.0.1 &   # serve dist/
cd w5-artefatos
node probe-A3-01.mjs     # defeito 1
node probe-A3-04.mjs     # defeito 2  (~80 s, tem espera do backoff de 60 s)
node probe-A4-BC.mjs     # defeitos 3 e 4
node probe-A4-D.mjs      # defeito 5
node sanity-origins.mjs  # sanidade de rede
```

| arquivo | papel |
|---|---|
| `w5-mocks.mjs` | mock de Supabase (auth/REST/functions/realtime), Mapbox (Search Box + v5 + style) e log HAR-like (request **e** resposta) |
| `w5-app.mjs` | sobe a app, dispensa o tour, abre a conversa da fixture |
| `probe-*.mjs` | as 4 reproduções |

Como a app exige sessão, injeto um `storageState` fake (`sb-tnnnlkbymytvtqngbbqh-auth-token`) e abro a conversa da fixture pelo **mesmo evento que a busca global do app dispara**:

```js
window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: '04dff4dc-c6b1-4283-ac22-bd8639804759' } }))
```

(`useRealtimeInbox.ts:66-81` escuta exatamente esse evento — não é atalho, é caminho do produto.)

Os caminhos de UI exercitados são os reais: **Inbox → conversa → composer "Mais" → "Localização"**; **"Detalhes do Contato" → "Mais" (`aria-label="Mais"`) → "Editar Contato"**; **aba `CRM 360°` → card Empresa → "Editar"**; e **sidebar → "Contatos" → "Novo Contato"**.

---

## 3. Defeito 1 — A3-01: toast destrutivo **falso** + `/retrieve` e sessões a mais

### Passos executados

1. Abrir a conversa da fixture no inbox.
2. Composer → **"Mais"** → **"Localização"** → aba **"Escolher no Mapa"**.
3. Digitar `Avenida Pau` (≥3 chars) → debounce 300 ms → `/suggest` mockado devolve **3 sugestões**.
4. **Um** clique duplo (`clickCount: 2`) na 1ª sugestão, com o `/retrieve` mockado atrasado em **1400 ms**.
5. Observar o toast e, depois, a localização aplicada.

### Evidência

Timeline real (`A3-01-result.json` → `timeline`):

```
+0ms     lista de sugestoes visivel (opcoes=3) status=ok
+0ms     CLIQUE DUPLO na 1a sugestao (clickCount=2)
+1826ms  TOAST DESTRUTIVO visivel
+2138ms  LOCALIZACAO APLICADA depois do toast
```

O toast (DOM ao vivo; `A3-01-result.json` → `toastHtml`):

```json
{ "found": true,
  "destructiveClass": true,
  "backgroundColor": "rgb(239, 67, 67)",
  "borderColor": "rgb(239, 67, 67)",
  "text": "Não consegui obter a coordenadaTente outra sugestão ou busque pelo endereço completo." }
```

(casa com `LocationPicker.tsx:84-92`: `if (!place) { toast({ title: 'Não consegui obter a coordenada', variant: 'destructive' }) }`)

HAR (`A3-01-traffic.json`) — **1 sugestão escolhida**, mas:

```
GET /search/searchbox/v1/suggest?q=Avenida%20Pau&session_token=a5ceb1bb-…-1147f6f53847&…&proximity=-46.6333,-23.5505
GET /search/searchbox/v1/retrieve/w5-sug-1?session_token=a5ceb1bb-…-1147f6f53847&…
GET /search/searchbox/v1/retrieve/w5-sug-1?session_token=4c493aa0-…-52eb4db5988d&…      <-- SESSÃO NOVA
```

Contadores (`A3-01-result.json`):

```json
{ "cliquesIntencionais": 1,
  "retrieveRequests": 2, "retrieveRequestsExtras": 1,
  "sessionTokensDistintos": 2,
  "suggestRequests": 1, "sessionTokensNosSuggest": ["a5ceb1bb-…"],
  "toastDestrutivoVisivel": true, "localizacaoAplicadaDepois": true,
  "appliedText": "Avenida Paulista" }
```

### Leitura

- **1** intenção de escolha → **2 `/retrieve`** (N−1 a mais) e **2 sessões** de billing: o 1º `/retrieve` marca a sessão como `retrieved` (`mapboxSession.ts:44-47`), então o 2º `getSearchSession()` **cria sessão nova** — faturável — e o token do HAR prova isso (dois UUIDs distintos).
- O `select()` da 1ª seleção devolve `null` porque uma seleção mais nova a superou (`useAddressAutocomplete.ts:340`, guard `seq !== selectionSeqRef.current`), e o consumidor trata `null` como **falha** (`LocationPicker.tsx:84`) → **toast destrutivo falso**, apesar de nada ter falhado.
- A localização **é** aplicada 312 ms depois — o operador vê o aviso vermelho de erro e, logo em seguida, o endereço escolhido no lugar.
- O `<button role="option">` continua clicável enquanto `retrievingId` é o dele (`SuggestionList.tsx:121-151` só mostra o spinner) — é a porta do clique duplo.

### Screenshots

- `w5-artefatos/A3-01-toast.png` — toast vermelho visível sobre o picker com as 3 sugestões.
- `w5-artefatos/A3-01-aplicado.png` — mesma tela, agora com o bloco de localização selecionada ("Avenida Paulista").

### Veredicto

**REPRODUZIDO NO BUNDLE REAL.** O defeito deixa de ser hipótese de sonda React: acontece no bundle de produção, com um único clique duplo humano, e os 3 efeitos (toast falso, localização aplicada, requests/sessões a mais) são observáveis simultaneamente.

---

## 4. Defeito 2 — A3-04: a pausa de 429 não se encerra e o "Tentar novamente" some

### Passos executados

1. Abrir o `LocationPicker` na aba **"Escolher no Mapa"** (flag ligada).
2. `/suggest` mockado devolve **HTTP 429**; digitar `Avenida Pau`.
3. Clicar em **"Tentar novamente"** (dentro da lista) **durante** o backoff.
4. Amostrar o estado em t+0 s, +20 s, +42 s, +63 s, +75 s (pausa = 60 s).
5. Controle: **depois** do backoff, digitar mais um caractere.

### Evidência

```
estado pos-429:                erro=true  causa429=true  botaoRetry=1
apos clicar em Tentar novamente: pausa="Sugestões pausadas por 57 s — a busca por Enter continua funcionando."
                                 botaoRetry=0   suggests=1 (antes=1)
```

Contador e ausência de auto-retomada (`A3-04-result.json` → `contador`):

| amostra | texto de pausa | botão "Tentar novamente" | `/suggest` acumulado |
|---|---|---|---|
| t+0 s | `Sugestões pausadas por 57 s — a busca por Enter continua funcionando.` | **0** | 1 |
| t+20 s | `…por 37 s…` | **0** | 1 |
| t+42 s | `…por 15 s…` | **0** | 1 |
| t+63 s | `…por 0 s…` | **0** | **1** |
| t+75 s | `…por 0 s…` | **0** | **1** |

Controle (prova de que o defeito é **não haver retomada automática**, e não um bloqueio eterno de fato):

```
controle pos-backoff com tecla: status ok? true   suggest=2
```

HAR (`A3-04-traffic.json`) — só **2** `/suggest` na sessão inteira: o que tomou 429 e o do controle.

### Leitura

- Após o 429 o estado é `error` (título "Falha ao buscar sugestões." + causa "Limite de buscas atingido — aguarde 1 min.") **com** o botão de retry.
- Clicar em "Tentar novamente" durante o backoff **não** gera request (`retrySuggest` cai em `SUGGEST_BLOCKED`, `useAddressAutocomplete.ts:375-378`) e troca o estado para `paused`: o botão **desaparece** (`SuggestionList.tsx` só o renderiza em `status === 'error'`) e passa a existir apenas o aviso de pausa.
- O aviso estaciona em **"pausadas por 0 s"** e **nunca** volta a buscar: de t+0 s a t+75 s o contador de `/suggest` fica **congelado em 1**. A única saída é o operador digitar de novo (o controle mostra que aí sim funciona).
- Isto é literalmente o defeito que a onda 1 descreveu a partir do hook: **a pausa vencida não tem ação disponível, e o único botão que existia sumiu quando o operador tentou usá-lo.**

### Screenshots

- `w5-artefatos/A3-04-1-erro-com-retry.png` — estado pós-429, com o botão "Tentar novamente".
- `w5-artefatos/A3-04-2-pausado-sem-botao.png` — logo após o clique: aviso de pausa, **sem** botão.
- `w5-artefatos/A3-04-3-pausa-expirada-em-0s.png` — t+75 s: "pausadas por 0 s", ainda sem botão.
- `w5-artefatos/A3-04-4-controle-volta-ao-digitar.png` — depois de digitar, a busca volta (prova de contraste).

### Veredicto

**REPRODUZIDO NO BUNDLE REAL.** O comportamento inteiro (texto de pausa, contador até 0, ausência de retomada automática, sumiço do botão) foi observado na UI compilada, com relógio real, sem relógio falso nem jsdom.

---

## 5. Defeito 3 — A4-B: o cadastro de contato ignora a flag

### Passos executados

Em **um único contexto de navegador** (flag `mapa.searchbox-autocomplete` respondida como **`false`** na RPC de flags mockada):

1. **Picker do inbox**: abrir `LocationPicker` → aba "Escolher no Mapa" → digitar `Avenida Pau` → clicar "Buscar".
2. **Cadastro**: sidebar → **"Contatos"** → **"Novo Contato"** → digitar `Avenida Pau` no campo **Logradouro** (`#address`).

### Evidência

Contraste dentro da **mesma** sessão (`A4-BC-result.json`):

```
ramo flag OFF: combobox=0 listbox=0 inputLegado=true botaoBuscar=true
suggestsNoPickerComFlagOff: 0
CADASTRO com flag OFF: /suggest antes=0 depois=1 (delta=1) listbox=true opcoes=3
```

HAR (`A4-BC-traffic.json`), todos os requests de Mapbox do contexto — repare **quem** chamou `/suggest`:

```
GET /search/searchbox/v1/forward?q=Avenida%20Pau&access_token=pk.w5-fake-…&limit=5&proximity=-46.6333,-23.5505   <- picker (ramo legado) x2
GET /search/searchbox/v1/suggest?q=Avenida%20Pau&session_token=ac2405cd-3125-4c73-bd0d-dc943c459a1e
        &access_token=pk.w5-fake-…&language=pt&country=br&limit=5&types=address%2Cstreet%2Cplace          <- SÓ o cadastro
```

`types=address,street,place` é, no fonte, exclusivo do cadastro (`ContactForm.tsx:21`, `ADDRESS_SEARCH_TYPES`), e `sessionSource: 'contact-form'`.

E o cadastro renderizou a lista **rica** (a mesma `SuggestionList`), com a flag desligada:

```
conteudo: "Avenida Paulista | Avenida Paulista, Bela Vista, Sao Paulo - SP · 420 m |
           Rua Paulista | Rua Paulista, Centro, Santos - SP · 420 m |
           Praca Paulista | Praca Paulista, Bela Vista, Sao Paulo - SP · 420 m"
listbox=true  opcoes=3
```

### Leitura

- `ContactForm.tsx:90-95` chama `useAddressAutocomplete({ enabled: !!mapboxToken })` — **sem** `useFeatureFlag` (`grep -c useFeatureFlag` nesse arquivo = **0**). A string `mapa.searchbox-autocomplete` aparece **uma única vez** em todo o `src/`: `LocationPicker.tsx:44`. Ou seja, o cadastro não tem como saber da flag.
- Resultado medido: com a flag OFF, **o picker do inbox para (0 `/suggest`)** e **o cadastro não para (1 `/suggest`)** — exatamente a assimetria que o Achado B descreveu estaticamente, agora visível na UI.
- `docs/mapa/USO_SEARCHBOX.md:65` mostra `contact-form: 6 · picker: 2` — o consumidor que ignora a flag é **o majoritário**; desligar a flag não desliga o volume no cadastro.

### Screenshot

- `w5-artefatos/A4-B-cadastro-buscando-com-flag-off.png` — diálogo "Novo Contato" com a lista de sugestões aberta **com a flag desligada**.

### Veredicto

**REPRODUZIDO NO BUNDLE REAL.** O cadastro continua buscando com a flag desligada, enquanto o picker do inbox, no mesmo contexto e com o mesmo hook mockado de flags, deixa de buscar.

---

## 6. Defeito 4 — A4-C: o ramo da flag DESLIGADA não tem estado de busca nem causa

### Passos executados

Flag OFF. `LocationPicker` → aba "Escolher no Mapa" (o ramo legado):

1. Estado inicial do ramo.
2. Digitar `Avenida Pau` e clicar **"Buscar"** com o `/forward` mockado em **HTTP 500 e 2,5 s de atraso** → amostrar **em voo** (t+0,9 s) e **após a falha** (t+4,9 s).
3. Depois, `/forward` = 200 com **2** resultados → capturar o markup da lista que aparece.

### Evidência

```
ramo flag OFF:               listbox=0  roleOption=0  inputLegado=true  botaoBuscar=true
BUSCA EM VOO:                listaLegadaVisivel=false  spinnerNoBotao=true  listbox=0
APOS FALHA DO /forward:      listaLegadaVisivel=false  listbox=0  roleOption=0
                             toast=["Falha na buscaNão foi possível consultar o endereço. Tente novamente."]
```

Texto do diálogo **em todos** os estados acima (em voo e após a falha) — idêntico, nada muda na área da lista:

```
Compartilhar Localização | … | Minha Localização | Escolher no Mapa | Buscar |
Não foi possível carregar o mapa. | Tentar novamente | Cancelar | Enviar Localização | Close
```

Markup do bloco que aparece **no sucesso** (`legadoBlockHtml`) — a "terceira cópia" viva:

```html
<div class="mt-2 rounded-lg border border-border divide-y divide-border overflow-hidden">
  <p class="px-3 py-2 text-xs text-muted-foreground bg-muted/50">Escolha o endereço certo:</p>
  <button type="button" class="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors">
    <p class="text-sm font-medium truncate">Avenida Pau — Sao Paulo</p>
    <p class="text-xs text-muted-foreground truncate">Avenida Pau, Bela Vista, Sao…</p>
  </button> …
```

...e `listaLegadaVisivel=true, itensLegado=2, roleOption=0, listbox=0`.

### Leitura

- No ramo da flag desligada **não existe `SuggestionList`**: `combobox=0`, `listbox=0`, `roleOption=0`. A área da lista é um bloco que **só existe com resultados** (`LocationPicker.tsx:218-233`).
- **Em voo**: a área da lista segue vazia; o único sinal é o `Loader2` **dentro do botão "Buscar"** (`isSearching`). Não há esqueleto, nem texto.
- **Falha**: `setSearchResults([])` (`useLocationPicker.ts:231`) → a área continua vazia. Existe **um** feedback: um **toast transitório** genérico ("Falha na busca / Não foi possível consultar o endereço. Tente novamente."), **fora** da lista, sem causa específica (rede vs. servidor vs. timeout colapsam no mesmo texto ou em 3 textos fixos), **sem** persistência e **sem** ação de retry ali.
- **Sucesso com ≥2 resultados**: aparece a terceira cópia — `<div>`/`<button>` puros, **sem** `role="listbox"`/`role="option"`, **sem** ícone por tipo, **sem** destaque da busca, **sem** `distanceMeters`, **sem** causa por item. É exatamente a divergência da cópia de cima (`SuggestionList`), que tem tudo isso.
- Nota de precisão (correção da onda 1, que falou "totalmente muda"): a lista **é** muda, sim; o que existe é o toast transitório. Eu não conto isso como "estado da lista" — e o relatório registra o toast em vez de varrer o assunto para baixo do tapete.
- Detalhe incidental amplamente visível nas capturas: o mapa mostra "Não foi possível carregar o mapa. / Tentar novamente" porque os tiles estão mockados (204) — é efeito do harness, **não** faz parte do A4-C.

### Screenshots

- `w5-artefatos/A4-C-1-ramo-legado.png` — ramo legado (input + "Buscar"), sem `combobox`/`listbox`.
- `w5-artefatos/A4-C-2-busca-em-voo-sem-estado.png` — em voo: spinner no botão, área da lista vazia.
- `w5-artefatos/A4-C-3-falha-sem-estado-na-lista.png` — após a falha: lista vazia (só o toast).
- `w5-artefatos/A4-C-4-lista-legada-sem-estado.png` — a "terceira cópia" com 2 resultados.

### Veredicto

**REPRODUZIDO NO BUNDLE REAL.** No ramo da flag desligada a lista não tem estado de busca nem causa de falha; a única informação persistente é nenhuma.

---

## 7. Defeito 5 — A4-D: o 2º editor abre com o endereço vazio

### Passos executados

A fixture de contato **tem** endereço no banco simulado:

```json
{ "address": "Avenida Paulista", "address_number": "1578", "neighborhood": "Bela Vista",
  "city": "Sao Paulo", "state": "SP", "postal_code": "01310200",
  "latitude": -23.561414, "longitude": -46.655881 }
```

**Caminho 1** — Inbox → painel **"Detalhes do Contato"** → **"Mais"** (`aria-label="Mais"`) → **"Editar Contato"**.
**Caminho 2** — Inbox → aba **"CRM 360°"** → card **Empresa** → **"Editar"**.

### Evidência — UI

`A4-D-result.json` → `caminho1_detalhesDoContato` **e** `caminho2_crm360` são **iguais**:

```json
{ "titulo": "Editar Contato",
  "name": "W5 Contato Endereco", "email": "w5@example.invalid",
  "postal_code": "", "address": "", "address_number": "",
  "neighborhood": "", "city": "", "state": "",
  "addressPlaceholder": "Rua, avenida..." }
```

Nome e e-mail vêm preenchidos; **todo** o bloco de endereço vem vazio.

### Evidência — HAR (o payload)

O app **recebeu** o endereço na carga da inbox (`A4-D-traffic.json`, resposta ao `select` da lista) — 8 colunas de endereço presentes:

```
GET /rest/v1/contacts?select=*,conversation_sla(first_response_at,first_message_at,first_response_breached)
  -> colunasNaResposta: [id, name, phone, email, nickname, surname, job_title, company, contact_type,
     avatar_url, address, address_number, neighborhood, city, state, postal_code, latitude, longitude, …]
     temColunaDeEndereco: [postal_code, address, address_number, neighborhood, city, state, latitude, longitude]
```

Mas a query que alimenta o painel/2º editor **não pede endereço** — e é **esse objeto** que vira o `contact` do `EditContactDialog`:

```
GET /rest/v1/contacts?select=company,job_title,nickname,surname,contact_type,ai_sentiment,ai_priority,channel_type
  -> body: {"company":"Promo Brindes","job_title":"Analista","nickname":"W5","surname":"Auditoria","contact_type":"cliente"}
     colunasNaResposta: [company, job_title, nickname, surname, contact_type]
     temColunaDeEndereco: []
```

(`ContactDetails.tsx:140-148` e `Crm360Tab.tsx:99-114` montam o `contact` a partir de `enrichedData` — nenhuma coluna de endereço; `EditContactDialog.tsx:45-64` coage ausente → `''`.)

### Leitura

- O endereço **existe e chegou ao app**, mas o 2º editor abre **vazio** nos **dois** pontos de entrada, como o Achado D previu.
- Não há perda automática: o submit é diff-only (`EditContactDialog.tsx:107-112`), então salvar sem tocar em nada não manda o campo — o problema é **o operador não ver/verificar o endereço salvo** ali.
- Honestidade sobre o valor real: **não consultei o banco** nesta onda (gateway MCP fora) e, pela onda 1, `public.contacts` tem `count(address) = 0` em 3.104 linhas — ou seja, **hoje não existe contato com endereço em produção** para exibir. Por isso a prova é **a ausência das colunas no payload**, como a tarefa pediu, e não uma linha real com endereço.
- Complemento: o painel de detalhes **não exibe** o endereço em lugar nenhum (`uiMostraEnderecoEmAlgumLugar: false`) — logo, **não** existe contraste in-UI do tipo "painel mostra / editor não mostra"; o contraste é entre o **payload que o app recebeu** (com endereço) e o **payload passado ao editor** (sem).

### Screenshots

- `w5-artefatos/A4-D-1-editor-1-endereco-vazio.png` — "Editar Contato" via Detalhes do Contato, bloco de endereço vazio.
- `w5-artefatos/A4-D-2-editor-via-crm360-endereco-vazio.png` — o mesmo diálogo via **CRM 360°**.

### Veredicto

**REPRODUZIDO NO BUNDLE REAL.** Os dois caminhos de UI abrem o 2º editor com o endereço vazio, e o HAR mostra o porquê: as colunas de endereço não estão no payload que o app entrega ao diálogo.

---

## 8. Falsos positivos que eu derrubei (dito sem maquiagem)

- **"A4-C = falha totalmente muda"** — falso como enunciado literal: existe **um toast transitório** genérico na falha do `/forward` (`useLocationPicker.ts:247-253`). O que a inspeção confirma é a **inexistência de estado na lista** (sem `listbox`, sem causa por item, sem retry, sem persistência). Registro a correção.
- **"Enter segurado dispara o A3-01"** — não testei o repeat de tecla do SO (o Playwright não sintetiza `event.repeat`). O **clique duplo** — o outro gatilho citado na tarefa — reproduz o mesmo estado (2 `select()` em voo) e foi o caminho usado. A variante "Enter contínuo" fica **não exercitada** nesta onda, embora seja o mesmo ponto de código.
- **"o picker do inbox com a flag ligada chama `/retrieve` para toda sugestão"** — verdadeiro, mas o caso de 1 clique simples sai com **1** `/retrieve` (a onda 1 mediu o mesmo). O contador só estoura no gatilho duplo.
- **`dist/version.json` local ≠ produção** — explicado: o `buildId` local sai como `local-<ts>` sem `VERCEL_GIT_COMMIT_SHA`. Rebuildado com o SHA, ficou idêntico ao da produção. Não é divergência de código.

## 9. Não verificável nesta onda (e por quê)

1. **Login real / sessão autenticada de verdade** — sem credencial legítima; o login passa pela edge `auth-login`. Logo, **não** reproduzi nada "na URL publicada com backend real". A equivalência usada é de **código e artefato** (mesmo `buildId`), não de backend.
2. **Estado real de `feature_flags`** — gateway MCP do banco fora; usei a flag injetada. Se a produção tiver `mapa.searchbox-autocomplete = false` (o `INSERT` da migration cria `false`; a onda 1 leu `true`), então **A3-01/A3-04/A4-C já não atingem usuários** e o A4-B **continua atingindo** — é o cenário mais provável hoje.
3. **Billing real da Mapbox** — as respostas são mockadas; o que é real é a **construção das sessões** (`session_token` novos por `/retrieve`) que o HAR mostra. O custo em dólar não foi medido.
4. **Realtime (WebSocket)** — bloqueado por rota. Nenhum efeito dos defeitos depende dele.
5. **Linha real de contato com endereço** — não existe em produção (onda 1: `count(address)=0`), então a prova do A4-D é de payload, como combinado.
6. **Inspeção visual dos PNGs por mim** — o visualizador de imagem desta sessão não lê o filesystem do sandbox. Os PNGs existem e são válidos (1440×950, 247–403 KB, verificados pelo header), e o estado de tela foi provado **programaticamente no DOM vivo** (texto, classe `destructive`, `getComputedStyle` = `rgb(239, 67, 67)`), não por leitura de pixel. Quem abrir os PNGs vê o que o DOM afirma.

---

## 10. Artefatos (em `w5-artefatos/` do sandbox)

**Screenshots**

| arquivo | conteúdo |
|---|---|
| `A3-01-toast.png` | A3-01 · toast destrutivo falso sobre a lista de sugestões |
| `A3-01-aplicado.png` | A3-01 · a localização aplicada depois do toast |
| `A3-04-1-erro-com-retry.png` | A3-04 · pós-429, com "Tentar novamente" |
| `A3-04-2-pausado-sem-botao.png` | A3-04 · pausado: o botão sumiu |
| `A3-04-3-pausa-expirada-em-0s.png` | A3-04 · "pausadas por 0 s" e nada religa |
| `A3-04-4-controle-volta-ao-digitar.png` | A3-04 · controle: digitar religa a busca |
| `A4-B-cadastro-buscando-com-flag-off.png` | A4-B · cadastro buscando com a flag OFF |
| `A4-C-1-ramo-legado.png` | A4-C · ramo legado do picker |
| `A4-C-2-busca-em-voo-sem-estado.png` | A4-C · em voo, lista vazia |
| `A4-C-3-falha-sem-estado-na-lista.png` | A4-C · após falha, lista vazia |
| `A4-C-4-lista-legada-sem-estado.png` | A4-C · a "terceira cópia" |
| `A4-D-1-editor-1-endereco-vazio.png` | A4-D · editor via Detalhes do Contato |
| `A4-D-2-editor-via-crm360-endereco-vazio.png` | A4-D · editor via CRM 360° |
| `explore-01.png`, `explore4-deeplink.png`, `explore6-contatos.png`, `explore7-menu.png` | exploração (app real subindo com backend mockado) |

**HAR / logs / resultados**

| arquivo | conteúdo |
|---|---|
| `A3-01-traffic.json` · `A3-04-traffic.json` · `A4-BC-traffic.json` · `A4-D-traffic.json` | log HAR-like: **request + resposta** (URL crua, `session_token`, `select`, corpo) |
| `A3-01-result.json` · `A3-04-result.json` · `A4-BC-result.json` · `A4-D-result.json` | contadores, textos de tela, campos do formulário, payloads |
| `A3-01-console.log` · `A3-04-console.log` · `A4-BC-console.log` · `A4-D-console.log` | console do navegador + `pageerror` |
| `sanity-origins.json` | prova de que nenhum request saiu para o backend real |
| `explore-endpoints.txt`, `explore*.json`, `explore5-buttons.json`, `explore7.json` | reconhecimento dos endpoints e seletores reais |
| `build.log`, `build-com-sha.log` | builds (o 2º com `VERCEL_GIT_COMMIT_SHA` = SHA do deploy) |
| `w5-mocks.mjs`, `w5-app.mjs`, `probe-*.mjs`, `explore*.mjs`, `sanity-origins.mjs` | a infra de reprodução (reexecutável) |

---

## 11. Resposta direta ao critério de aceite

- **A3-01** — REPRODUZIDO NO BUNDLE REAL: toast destrutivo falso (`rgb(239,67,67)`, texto exato), localização aplicada depois, **2 `/retrieve` / 2 `session_token`** para 1 escolha.
- **A3-04** — REPRODUZIDO NO BUNDLE REAL: texto de pausa, contador 57→37→15→**0 s**, **nenhum** `/suggest` de t+0 s a t+75 s (não religa sozinho), e o botão "Tentar novamente" **some** ao ser clicado durante o backoff.
- **A4-B** — REPRODUZIDO NO BUNDLE REAL: flag OFF → cadastro **1 `/suggest`** (`types=address,street,place`) vs. picker do inbox **0**.
- **A4-C** — REPRODUZIDO NO BUNDLE REAL: ramo legado sem `listbox`/`option`; em voo e em falha a lista fica vazia (só um toast genérico transitório).
- **A4-D** — REPRODUZIDO NO BUNDLE REAL (2 caminhos): `Editar Contato` com endereço vazio, provado pela ausência das colunas no payload de `contact-enriched` no HAR.

Divergências declaradas: (a) a produção está no commit **`77f1a054`**, e não em `0ab84095`; (b) a reprodução foi no **bundle local do mesmo commit** (login real bloqueado por falta de credencial legítima), com **Supabase e Mapbox mockados** e isso declarado em cada peça de evidência.
