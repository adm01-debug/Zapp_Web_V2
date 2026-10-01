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
