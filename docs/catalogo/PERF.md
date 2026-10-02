# PERF — medições do módulo Catálogo

Só números **medidos** (comando + saída crua logo abaixo). Nada estimado entra
aqui: quando algo não foi medido, o texto diz "não medido".

## Ambiente

- Data das medições: 2026-10-01, 13:39–13:47 (-03:00).
- Host: WSL2, `Linux 6.18.33.2-microsoft-standard-WSL2 x86_64`, 24 vCPU.
- `node v24.19.0`, `bun 1.4.0`, `vitest 4.1.11`, ambiente `jsdom`.
- Base do checkout: `e9a2bc5c` (merge de `main` em
  `hermes/catalogo-bloco-bc-26100112165778`).

## CT-27 — virtualização do modo lista (`@tanstack/react-virtual`)

Regra implementada em `src/components/catalog/ExternalProductCatalog.tsx`: o modo
**lista** virtualiza quando `pageSize >= 48` (`VIRTUALIZE_MIN_PAGE_SIZE`); a
**grade** nunca virtualiza (o card não tem altura de linha previsível).
O `pageSize` é estado do componente (o select do `TalkXPagination` era um
no-op) e as opções são 8/10/20/**50** — só o 50 cruza o limite.

### Linhas de produto renderizadas no DOM

Medido pelo próprio teste, com o virtualizador **real** e o único stub de
layout necessário (jsdom não tem layout: o container de scroll é medido como
720px = 10 linhas de 72px, e o `ResizeObserver` dispara na observação).

| cenário (página com 50 produtos, modo lista) | linhas no DOM | espaçador no fim | altura total da lista |
| --- | --- | --- | --- |
| `pageSize = 50` (virtualizado, viewport 720px) | **16 de 50** | **2448px** | 3600px |
| `pageSize = 24` (caminho não virtualizado) | **50 de 50** | 0 (nenhum) | 3600px |

Ou seja: mesma lista, 16 cards montados em vez de 50 (−68% de árvores de card)
e a altura total preservada (16 × 72 + 2448 = 3600 = 50 × 72), então a barra de
rolagem continua correta.

Comando e saída crua:

```console
$ bunx vitest run src/components/catalog/__tests__/ExternalProductCatalog.virtualizacao.test.tsx
 RUN  v4.1.11 .../catalogo-bloco-bc-26100112165778
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  13:44:39
   Duration  2.08s (transform 239ms, setup 62ms, import 662ms, tests 730ms, environment 524ms)
```

O 16 não é arbitrário: viewport de 720px ÷ 72px = 10 linhas visíveis + overscan
6 = 16. Em browser real a janela segue a altura real da viewport (o teste fixa
720px porque jsdom reporta 0).

### Tempo de suite (antes × depois)

| comando | antes (13:39) | depois (13:44 / 13:47) |
| --- | --- | --- |
| `bunx vitest run src/components/catalog/__tests__/ExternalProductCatalog.test.tsx` | 13 tests, `Duration 1.91s` (WALL 2.25s) | 19 tests, `Duration 2.80s` e `2.03s` |
| `bunx vitest run .../ExternalProductCatalog.virtualizacao.test.tsx` (arquivo novo, CT-27) | — (não existia) | 3 tests, `Duration 2.08s` e `1.60s` |
| `bunx vitest run src/components/catalog` (diretório inteiro) | **não medido antes desta mudança** | 14 files, 298 tests, `Duration 9.56s` (WALL 9.93s) — ⚠️ **histórico/defasado**: remedido em 2026-10-02 como 23 files/426 tests/`11.51s` (ver §CT-80 abaixo) |

Atenção: o tempo de suite varia de rodada para rodada no mesmo código (2.80s vs
2.03s acima, `Start at 13:44` e `13:47`) — a diferença "antes × depois" de uma
rodada só não é sinal de regressão nem de ganho. O que é determinístico (e por
isso é o número que vale para o CT-27) é a contagem de linhas no DOM medida na
seção anterior.

Saídas cruas:

```console
$ bunx vitest run src/components/catalog/__tests__/ExternalProductCatalog.test.tsx   # antes
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  1.91s (transform 174ms, setup 51ms, import 569ms, tests 787ms, environment 414ms)
WALL 2.25 s
```

```console
$ bunx vitest run src/components/catalog/__tests__/ExternalProductCatalog.test.tsx   # depois
 Test Files  1 passed (1)
      Tests  19 passed (19)
   Duration  2.80s (transform 258ms, setup 77ms, import 678ms, tests 1.33s, environment 591ms)
```

```console
$ bunx vitest run src/components/catalog
 Test Files  14 passed (14)
      Tests  298 passed (298)
   Duration  9.56s (transform 3.84s, setup 1.29s, import 13.35s, tests 24.03s, environment 11.57s)
WALL 9.93 s
```

O "+6 testes / +0,89s" do arquivo de teste é o custo dos testes novos
(CT-26 e CT-29); o diretório não tem "antes" medido (a medição pré-mudança só
foi feita no arquivo, antes de ser editado) — por isso nenhum delta de
diretório é afirmado aqui.

**Não medido:** tempo de render (wall-clock) e tempo de pintura da paginação.
jsdom não faz layout e o tempo de uma passada de teste não é representativo de
browser — em vez de publicar um número ruidoso, o que ficou registrado é o
tamanho da árvore montada (tabela acima). Medir isso de verdade pede browser
(Playwright/React Profiler), fora do escopo deste bloco.

## CT-29 — paginação sem flash

- O `isFetching` do hook (`src/hooks/integrations/useExternalCatalog.ts:319`) é
  o gatilho da barra fina + `opacity-60` nos cards antigos; o skeleton passou a
  depender de `isInitialLoading` (`...useExternalCatalog.ts:317`) — antes usava
  `loading` (= `isLoading || isFetching`), que trocava os cards por 8 skeletons
  a cada paginação (o flash).
- Evidência: 4 testes RTL em `ExternalProductCatalog.test.tsx` (CT-29), todos
  passando no bloco de 19 tests/`2.80s` acima. Não há número de perf novo aqui:
  a mudança é de estado de UI (um elemento de barra em vez de 8 skeletons).

## Pendências medidas

- **Prefetch da próxima página no hover de "Próxima" (CT-29) — NÃO
  implementado.** `useExternalCatalog` não expõe nenhuma função de prefetch
  (só `productsQuery`, `fetchProducts`, `fetchProduct`, `fetchCategories`,
  `fetchSuppliers`, `invalidate`) e o hook está fora dos arquivos que este
  bloco pode tocar. Chamar `fetchProducts` da próxima página no hover trocaria
  o conteúdo exibido (as `filters` viram a `queryKey`), o que é um bug, não um
  prefetch. Sem isso, o hover não pré-aquece a página; o feedback de progresso
  do CT-29 (barra + `opacity-60`) continua valendo.
- **Tempo de paginação percebido:** não medido (exigiria browser real e edge de
  verdade — a edge `promogifts-catalog` não roda neste ambiente de teste).

## CT-75 — bundle inicial (medido) e CT-71 — chunks dos modais

Medição de **2026-10-01, 21:06–21:09 (-03:00)**, mesmo host do topo
(WSL2, `node v24.19.0`, `bun 1.4.0`), na árvore de trabalho do bloco H
(`hermes/catalogo-bloco-h-26100120365a03`).

### Número do bundle inicial

| métrica | medido | limite VIVO no repo | veredito |
| --- | --- | --- | --- |
| **JS inicial** (gzip, 13 chunks) | **336,3 KB** | 341 KB (`performance-budget.json:4`) | ✅ dentro |
| CSS inicial (gzip) | 40,0 KB | 80 KB | ✅ |
| Maior chunk JS, inclui lazy (gzip) | 492,3 KB | 550 KB | ✅ |
| Assets totais, sem maps (gzip) | **4101,2 KB** | 4100 KB | ❌ **estoura 1,1 KB** (corrigido — ver nota abaixo) |

**O número é GZIP, não raw.** `vite.config.ts:45` tem
`reportCompressedSize: false`, então **o log do `bun run build` imprime kB RAW**;
a medição gzip é a do guard `scripts/ci/bundle-budget.mjs`, que lê `dist/index.html`
e soma o gzip de todo JS/CSS do grafo **inicial**. Comparar o kB do log do Vite com
o budget é comparar unidades diferentes — foi assim que nasceu a confusão de
números neste item.

#### De onde vêm os dois limites (336 e 350) — e qual é o vivo

- **341 KB é o limite VIVO** — `performance-budget.json` → `budgets["initial-js"].maxKB = 341`,
  e é ele que o CI usa (`scripts/ci/bundle-budget.mjs` falha com exit 1 acima disso;
  rodou agora: `OK: bundle inicial dentro do budget.`, exit 0). O próprio arquivo
  registra que subiu de 340 para 341 em 2026-10-01 pelo gate de microfone do T17.
- **336 KB não é budget — é a medição antiga.** Vem de
  `docs/catalogo/AUDITORIA_CATALOGO_2026-09-29.md:111` ("bundle 336 KB", linha da
  etapa E40, medida em 2026-09-29). O plano (CT-75, linha 554) transformou aquele
  número em teto: *"inicial ≤ 336 KB (não regredir o #443)"*. Ou seja, o 336 é
  **baseline do #443**, não limite de CI.
- **350 KB não existe como limite em lugar nenhum** — aparece só em **comentários**
  como histórico: `vite.config.ts:71` e `:88` e `catalogShared.tsx:453`
  ("estourou o budget de 350 KB no PR #415"). Nenhum `maxKB: 350` no repo.

**Resultado honesto contra os dois:** 336,3 KB gzip vs teto de 336 KB do plano →
**0,3 KB acima do baseline do #443** (não é regressão minha: ver abaixo); vs limite
vivo de 341 KB → **4,7 KB de folga**, gate verde.

#### O que a minha mudança fez com o inicial

O chunk de **entrada** foi de `index-COJ_X0wF.js 203,56 kB` (build anterior, log em
`.tmp/build-before.log`) para `index-CfGdaaYO.js 203,65 kB` (raw, conforme acima):
**+0,09 kB**, que é o custo dos wrappers `lazy()/Suspense`. Os modais **nunca
estiveram no grafo inicial** (são alcançados por chunk dinâmico), por isso tirá-los
de lá não mexe no inicial — mexe no **quando** o código deles é baixado.

**Não medido (dito com todas as letras):** o valor **gzip** do inicial *antes* da
minha mudança. O `dist/` é sobrescrito a cada build e o baseline preservado é só o
log **raw**; `git worktree` é bloqueado pelo guard do ambiente, então não deu para
ramificar o HEAD e medir de novo. O que existe é o delta raw do chunk de entrada
acima — pequeno o bastante para o número gzip não mudar de faixa (336,3 KB).

### Saída crua — bundle (CT-75)

```console
$ bun run build            # exit 0, "✓ built in 6.09s"
$ node scripts/ci/bundle-budget.mjs
Bundle inicial (gzip):
    107.5 KB  /assets/vendor-ui-CM8jVvQZ.js
     79.4 KB  /assets/vendor-core-Cv0p2dBW.js
     62.0 KB  /assets/index-CfGdaaYO.js
     61.5 KB  /assets/vendor-data-Cdgdvx5N.js
     13.9 KB  /assets/vendor-utils-CROwA8Ot.js
      9.1 KB  /assets/dist-Ck6tG7Oq.js
      0.7 KB  /assets/createLucideIcon-B9q1sJMV.js
      0.6 KB  /assets/client-DM5cNW6y.js
      0.5 KB  /assets/logger-yaIhJXUm.js
      0.5 KB  /assets/rolldown-runtime-B0Z9INg1.js
      0.3 KB  /assets/audit-JPoNn9lC.js
      0.2 KB  /assets/loader-circle-pSB4aFl_.js
      0.1 KB  /assets/utils-DtUhXtZY.js
  JS inicial:  336.3 KB (budget 341 KB, 13 chunks)
  CSS inicial: 40.0 KB (budget 80 KB)
  Maior chunk JS (inclui lazy): 492.3 KB gzip (budget 550 KB)
  Assets totais: 4101.2 KB gzip, sem maps (budget 4100 KB)
OK: bundle inicial dentro do budget.
```

**Nenhum plugin de visualizer foi instalado** (`vite-bundle-visualizer`,
`rollup-plugin-visualizer`): instalar dependência está fora do escopo deste bloco.
A "saída normal do build" + o guard do repo dão todos os números acima.

### Chunks dos modais — ANTES × DEPOIS (CT-71)

O aceite do CT-71 é *"`vite build` mostra chunks separados"* — e ele **passa de graça**
se você olhar o lugar errado (`vendor-charts`, 458,51 kB raw, é grupo do
`vite.config.ts:100` e existia antes e depois, igual). A prova é o **conjunto** de
chunks do módulo, antes e depois:

| chunk | ANTES (build 20:41) | DEPOIS (build 21:06) |
| --- | --- | --- |
| `ProductDetailDialog-*.js` | **não existia** | **17,94 kB** |
| `SendProductDialog-*.js` | **não existia** | **16,97 kB** |
| `CatalogAdvancedFilters-*.js` | **não existia** | **3,14 kB** |
| `CatalogBulkSendDialog-*.js` | 77,56 kB | **5,10 kB** |
| `ExternalProductCatalog-*.js` | não existia | 14,15 kB |
| `CatalogBulkBar-*.js` | não existia | 34,15 kB |
| `vendor-charts-*.js` (grupo do vite.config) | 458,51 kB | 458,51 kB (inalterado) |

Leitura do que aconteceu: `CatalogBulkSendDialog` **já** virava chunk antes desta
tarefa (o módulo é compartilhado por dois importadores dinâmicos — o catálogo do chat
e a tela de gestão), mas o chunk dele carregava **junto** o detalhe e o envio
(77,56 kB). Depois do `lazy()` cada modal tem o seu próprio chunk e o do bulk-envio
caiu para 5,10 kB: é o tamanho do que só ele usa. É por isso que "existe chunk
separado" sozinho não provava nada — o que prova é **quais** chunks existem e o
tamanho deles depois do corte.

### Saída crua — chunks (CT-71)

```console
$ grep -nE "ProductDetailDialog|SendProductDialog|CatalogAdvancedFilters|CatalogBulkSendDialog" .tmp/build-before.log   # ANTES (20:41)
373:dist/assets/CatalogBulkSendDialog-D8tVHLuk.js              77.56 kB │ map:   271.33 kB

$ grep -nE "Catalog|ProductDetailDialog|SendProductDialog" .tmp/build-after.log    # DEPOIS (21:06)
234:dist/assets/CatalogAdvancedFilters-ByXK8ony.js              3.14 kB │ map:    10.63 kB
269:dist/assets/CatalogBulkSendDialog-CaIooLe8.js               5.10 kB │ map:    14.76 kB
330:dist/assets/ExternalProductCatalog-K0oJ14ou.js             14.15 kB │ map:    48.96 kB
343:dist/assets/SendProductDialog-D3cKjNRq.js                  16.97 kB │ map:    54.76 kB
346:dist/assets/ProductDetailDialog-DC7_AP3A.js                17.94 kB │ map:    51.10 kB
370:dist/assets/CatalogBulkBar-qgN4t3dS.js                    34.15 kB │ map:   131.05 kB
```

No `HEAD` nenhum dos 4 era lazy (import estático, prova por `git grep`):

```console
$ git grep -n "lazy(\|import(" HEAD -- 'src/components/catalog/*.tsx'
(só ocorrências em __tests__ — nenhum `lazy(` de produção)
$ git grep -n "CatalogBulkSendDialog" HEAD -- src/components/catalog/ExternalProductCatalog.tsx
HEAD:src/components/catalog/ExternalProductCatalog.tsx:33:import { CatalogBulkSendDialog } from './CatalogBulkSendDialog';
```

---

## Correcao de medicao (2026-10-01, pos-CI) — o numero de CT-75 registrado acima estava ERRADO

A medicao de **4098,7 KB / OK / folga de 1,3 KB** foi feita sobre uma arvore **intermediaria**
(as edicoes de CT-68/CT-69 continuaram depois da medicao e antes do commit, sem remedicao).
Numeros verdadeiros, medidos com o MESMO ambiente do CI (`VITE_CRM_INTEGRATION_ENABLED=true`):

| Commit | Assets totais (gzip) | Budget | Resultado |
|---|---|---|---|
| `fc24b866` (fim do bloco G, antes de CT-71) | 4091,3 KB | 4100 KB | ✅ passa (folga de 8,7 KB) |
| `d61f8c83` (bloco H, com CT-71) | **4101,2 KB** | 4100 KB | ❌ **estoura 1,1 KB** |

O CI reprova o check obrigatorio **🏗️ Build** por isso. Detalhe importante: o custo do CT-71
(4 modais em `lazy` + `Suspense`) e **+9,9 KB de overhead ESTRUTURAL de split**, nao codigo novo —
o mapeamento modulo→chunk pelos sourcemaps mostra **zero duplicacao**; e o mesmo codigo passando a
viver em 7 streams de gzip em vez de 1, o que obriga o gzip a re-encodar a repeticao. O `initial-js`
praticamente nao muda (336,3 KB; o entry raw foi de 203,56 para 203,65 kB).

Cortes testados DENTRO do catalogo somam no maximo ~0,45 KB — abaixo do 1,1 KB necessario.
Consolidar os 4 modais num chunk unico recuperaria 2,28 KB, mas quebraria o aceite do CT-71
("chunks separados"). As rotas de `vite.config.ts` foram testadas em copia descartavel: grupo
`catalog-core` PIORA (4101,7 KB) e `codeSplitting.minSize: 2000` e no-op absoluto.

**Causa raiz do aperto, achada no caminho:** os icones do PWA em `public/` somam **1445,6 KB gzip
(35% do orcamento de 4100 KB)** e **8 dos 9 sao byte-identicos** (md5 `e6ca6225a36c4a307404cb89d719b664`,
109.315 bytes cada): um PNG de ~512px servido como `72x72`, `96x96`, `128x128` etc. Reotimizar cada
icone no tamanho real libera ~1,4 MB e conserta um bug real de PWA. Esta fora do escopo deste PR
(`public/`) e merece tarefa propria.

---

## CT-80 — tempo da suíte do módulo (remedido em 2026-10-02)

Medição de **2026-10-02, 00:17–00:18 (-03:00)**, WSL2, `node v24.19.0` / `bun 1.4.0`,
`vitest 4.1.11`, ambiente `jsdom`. **Substitui o registro de CT-27** (linha 58, mantido
acima marcado como histórico), que era de outra árvore e de 14 arquivos/298 testes.

| comando | resultado |
| --- | --- |
| `bunx vitest run src/components/catalog` | **23 files, 426 tests**, `Duration 11.51s`, **WALL 11.82 s** |

O aceite do CT-80 é "suíte do módulo em < 30 s" → **11,51s de vitest (11,82s WALL): dentro do
limite**. Contagem de arquivos/tests é a real do diretório hoje (`src/components/catalog/__tests__/`
tem 23 arquivos), não reciclada do bloco BC.

Saída crua:

```console
$ bunx vitest run src/components/catalog
RUN  v4.1.11 .../catalogo-bloco-i-2610020011ce71
Test Files  23 passed (23)
     Tests  426 passed (426)
  Start at  00:17:57
  Duration  11.51s (transform 7.32s, setup 2.79s, import 26.84s, tests 39.40s, environment 24.74s)
WALL 11.82 s
```

> Nota de horário: o relógio do host marca `00:17`, embora a conversa esteja datada de
> 02/10/2026 — as duas medições (cobertura logo abaixo e tempo aqui) são da mesma sessão,
> com ~20 s de intervalo.

## CT-79 — cobertura do módulo `src/components/catalog` (medida em 2026-10-02)

**Número: 84,41 % de linhas (1235/1463).** O aceite do CT-79 é "≥ 80 % linhas" → **cumprido**.

**Como foi medido (importante):** a config vigente do projeto **exclui o módulo** da
cobertura — `vitest.config.ts:17` limita `coverage.include` a `src/lib/**` e `src/services/**`.
Rodar `vitest --coverage src/components/catalog` **não** mediria o módulo (o argumento filtra
os *testes*, não o `coverage.include`). **Não editei `vitest.config.ts`**: o `include` foi
sobrescrito **por CLI**:

```console
$ bunx vitest run src/components/catalog --coverage --coverage.include='src/components/catalog/**'
RUN  v4.1.11 .../catalogo-bloco-i-2610020011ce71
     Coverage enabled with v8
Test Files  23 passed (23)
     Tests  426 passed (426)
  Duration  13.71s (transform 8.47s, setup 4.10s, import 37.07s, tests 49.04s, environment 23.75s)

% Coverage report from v8
=============================== Coverage summary ===============================
Statements   : 80.56% ( 1434/1780 )
Branches     : 79.77% ( 1388/1740 )
Functions    : 75.88% ( 428/564 )
Lines        : 84.41% ( 1235/1463 )
================================================================================
```

A flag `--coverage.include` **existe e funciona** na versão instalada (vitest 4.1.11). Prova de
que o override restringiu o escopo ao módulo (e não mediu `src/lib`/`src/services`): o
`coverage/lcov.info` gerado tem **20 entradas `SF:` e 0 delas fora de `src/components/catalog/`**.

```console
$ grep -c "^SF:" coverage/lcov.info
20
$ grep "^SF:" coverage/lcov.info | grep -vc "src/components/catalog/"
0
```

**A config vigente do projeto continua excluindo o módulo.** `vitest.config.ts` não foi tocado
(piso global de 36/35/43/31 linhas/stmts/funcs/branches segue valendo para `src/lib`+`src/services`).
Ou seja: o número de 84,41 % só existe com o override de CLI acima; o gate padrão (`bun run test:coverage`)
não mede `src/components/catalog` e por isso **não** trava 80 % no módulo.

## CT-97 — manifesto da edge: dois níveis do aceite (2026-10-02)

O aceite do CT-97 é *"`deployment-manifest.json` final = versão **deployada**
(digest confere)"*. Esse aceite tem **duas metades** e só uma é verificável
aqui — registradas separadamente, cada uma com a saída crua.

### Nível LOCAL — manifesto do repo está consistente (✅ PASSA)

`scripts/edge-deploy/generate-manifest.mjs --check` recalcula o manifesto a
partir da árvore e compara **byte a byte** com o `supabase/deployment-manifest.json`
commitado (`generate-manifest.mjs:41-45`). Saída crua:

```console
$ node scripts/edge-deploy/generate-manifest.mjs --check
Edge manifest OK: 67 functions, 123 source files, sha256=7c4ee37051ae7576d4c7fb8bfa211019012b5dc3fe230df5af60a4537ff1d0ec
EXIT=0
```

Leitura: o manifesto commitado **não está defasado** em relação ao código
(67 funções, 123 arquivos-fonte, digest
`7c4ee37051ae7576d4c7fb8bfa211019012b5dc3fe230df5af60a4537ff1d0ec`).

### Nível REMOTO — digest contra o que está **deployado** (⛔ NÃO MEDIDO)

O que o aceite chama de "= versão deployada" exige comparar o manifesto com o
inventário do projeto no Supabase Cloud. Isso **não** é feito pelo `--check`
local; exige `scripts/edge-deploy/collect-remote.mjs` com
`SUPABASE_ACCESS_TOKEN` no ambiente (`collect-remote.mjs:19`) e/ou um snapshot
prévio (`:23`), além de `PROJECT_REF` batendo com o canônico
(`tnnnlkbymytvtqngbbqh`, `:18`). **Nenhum token está disponível neste
ambiente** e o bloco não pede token nem deploya.

- **Portanto:** a metade remota do aceite do CT-97 **permanece aberta**. O que
  está provado é apenas que o manifesto **do repo** confere consigo mesmo — não
  que ele equivale ao conjunto de funções publicado.
- **Para fechar:** rodar `collect-remote.mjs` (com `SUPABASE_ACCESS_TOKEN` +
  `--snapshot` ou `--before`/`--git-sha`/`--run-id`/`--scope`) e anexar aqui a
  evidência de digest contra o deploy.

## CT-74 — Lighthouse na view autenticada do catálogo (medido em 2026-10-02)

**Aceite do plano:** *Lighthouse perf ≥ 90 na view em 4G; CLS < 0,05*.
**Resultado medido: os dois critérios NÃO foram atingidos — perf 44 e CLS 0,2455.**
O CT-74 **não pode ser marcado**.

### Método (por que a medição é da view, e não da tela de login)

O Lighthouse não tem sessão. Medir `?view=catalog` sem login faz o app redirecionar para
`/auth` e o número vira o da tela de **login**. O caminho usado foi:

1. Chrome headless com **perfil persistente** exposto por CDP (`--remote-debugging-port`);
2. **login real da conta de teste (COMPRAS) dentro desse perfil**, até `#main-navigation`;
3. confirmação de que a grade carregou (24 cartões) **antes** de medir;
4. `Network.clearBrowserCache` (sessão preservada) para não medir cache aquecido;
5. `lighthouse@12` anexado por `--port` (preset mobile = Slow 4G + CPU 4×) contra produção.

> **Armadilha medida e descartada.** `launchPersistentContext` **não aplica `storageState`**.
> As três primeiras rodadas (dev server, preview local e produção: perf 45, 71 e 69) mediram
> `https://zapp-web-v2.vercel.app/auth` — a **tela de login** — e foram jogadas fora. Só a
> rodada com login dentro do perfil mediu a view de verdade (`.finalDisplayedUrl` conferido).

### Resultado — produção `https://zapp-web-v2.vercel.app/?view=catalog`

```console
URL MEDIDO: https://zapp-web-v2.vercel.app/?view=catalog
PERF: 44      (aceite: >= 90)   -> NAO CUMPRIDO
CLS:  0.2455  (aceite: < 0.05)  -> NAO CUMPRIDO
FCP 3,4 s | LCP 7,3 s | TBT 460 ms | SI 4,3 s | TTI 7,3 s
202 requisicoes | 906 KB transferidos | 4 requisicoes da edge do catalogo
mobile (Slow 4G, CPU 4x) | lighthouse 12.8.2 | cache HTTP limpo
```

### Causas medidas (não supostas)

- **CLS 0,2455 — 0,2211 vem de UM elemento:** a faixa de KPIs
  (`data-testid="catalog-kpi…"`, classes `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6`)
  que **cresce quando os dados chegam** e empurra a grade para baixo. Os chips de categoria
  somam outros 0,0222. Correção provável: reservar a altura da faixa (skeleton com a altura
  final) e não inserir os chips depois do primeiro paint.
- **1210 ms de JavaScript não usado** no carregamento inicial (candidato a corte por import
  dinâmico — relacionado ao CT-75).
- **LCP 7,3 s** aponta para um `<p class="text-[13px] text-foreground-secondary mt-0.5">`,
  ou seja o LCP é **o conteúdo do catálogo chegando**, não o shell. Com 906 KB e 202
  requisições em Slow 4G, o peso de rede domina.

### O que fica aberto

- **CT-74 continua aberto:** falta a correção (faixa de KPIs + peso de JS) e nova medição.
  Corrigida a faixa, o CLS tende a entrar no aceite; o perf ≥ 90 exige mais que isso.
- Artefato cru desta medição: `.tmp/lh-prod.json` (relatório completo do Lighthouse).

### Re-medição depois do restart do banco canônico (02/10, ~15:30)

Com o banco de volta, a medição foi **repetida com a mesma metodologia** (produção, mobile/Slow 4G,
cache HTTP limpo, sessão COMPRAS dentro do perfil do Chrome):

```console
URL MEDIDO: https://zapp-web-v2.vercel.app/?view=catalog
PERF: 39      (1a medicao: 44)
CLS:  0.2451  (1a medicao: 0.2455)
FCP 3,4 s | LCP 7,3 s | TBT 680 ms | SI 3,8 s | TTI 7,3 s
203 requisicoes | 4 requisicoes da edge do catalogo
```

Leitura: duas medições independentes dão o **mesmo CLS (~0,245)** e perf na mesma faixa (39–44) —
o veredito do aceite (≥ 90 e < 0,05) **não muda** com o banco saudável, e a causa dominante do CLS
(a faixa de KPIs) fica confirmada. Artefatos crus: `~/.cache/hermes-pr/ct74-20261002-lh-prod.json`
(1ª) e `.tmp/lh-prod-2.json` (2ª, nesta rodada).
