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
| `bunx vitest run src/components/catalog` (diretório inteiro) | **não medido antes desta mudança** | 14 files, 298 tests, `Duration 9.56s` (WALL 9.93s) |

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
| Assets totais, sem maps (gzip) | 4098,7 KB | 4100 KB | ✅ (folga de 1,3 KB) |

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
  Assets totais: 4098.7 KB gzip, sem maps (budget 4100 KB)
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
