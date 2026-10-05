# EN-088 — medição de volume, memória, consultas, iframes, listeners e blobs do Email

**Achado coberto:** `OTH-014` (item #154 do `BACKLOG_VERIFICADO`).
**Critério (literal, `docs/design/PLANO_EMAIL_NAVY_100_ETAPAS_2026-10-02.md:621`):**
*"fixture de mil threads paginadas e thread longa; medir renderização, consultas, memória,
iframes, listeners e blobs. Virtualizar somente onde a medição exigir, com alturas variáveis
e âncoras."* **Aceite (linha 624):** *"sem N+1, download em massa ou crescimento ilimitado;
apresentar antes/depois e orçamento justificado, não número arbitrário de performance
«aprovado»."*

A auditoria registrou as fixtures (1.000 threads, thread extrema com 40 anexos) mas **não
localizou as medições** exigidas por EN-088. Esta página é a medição: cada número abaixo é
saída crua do medidor, não estimativa.

## Ambiente e fonte

- Medição: 2026-10-05, WSL2, `node`/`bun` do workspace do cartão #154, `vitest 4.1.11`, ambiente `jsdom`.
- Medidor: `src/components/email/__tests__/EmailVolumeMedicao.test.tsx` (5 casos, cada um
  imprime uma linha `EN088 | …` e **trava o orçamento**).
- Corpus: `EmailThread` sintético de 1.000 threads (fixture do próprio teste, igual à de
  `EmailThreadList.test.tsx`); anexos PDF sintéticos para o ciclo de prévia.
- Reprodução:
  `bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx`.

## O que foi medido (antes × depois do volume)

O "antes/depois" aqui é **corpus mínimo (20 threads) × corpus de volume (1.000 threads)** — não
há otimização nova neste cartão; o que se prova é que o custo **não cresce** com o volume.

| dimensão | antes (20 threads) | depois (1.000 threads) | orçamento | veredito |
| --- | --- | --- | --- | --- |
| consultas (round-trips) | 4 (`1` página + `1` lote + `2` counts) | **6** (`2` páginas + `2` lotes + `2` counts) | `ceil(N/1000)+1` páginas + `ceil(N/500)` lotes + `2` counts; **≪ N** | ✅ sem N+1 (6 ≪ 1.000) |
| memória — material do corpus | — | **643.451 B ≈ 628 KiB** | < 1 MiB | ✅ dentro |
| memória — linhas montadas no DOM | **20** / 295 nós | **20** / 295 nós | 20 (= página local); árvore plana | ✅ não cresce |
| iframes | 0 (fechado) | **1** (aberto) / 0 (desmontado) | ≤ 1 por leitura | ✅ |
| blobs (object URLs) | — | **40 criados / 40 revogados**, pico **2**, **1** vivo no repouso, **0** ao fechar | pico ≤ 2; 0 ao fechar | ✅ |
| listeners pendentes | — | **0** após 1 ciclo e **0** após 40 ciclos | não cresce com os ciclos | ✅ sem vazamento |

### Justificativa dos orçamentos

- **Consultas.** `useGmail` carrega as threads por `collectEmailPages` (`pageSize = 1000`) e os
  anexos por `chunkEmailIds` (`chunkSize = 500`) — os dois com tetos (`maxPages = 50`,
  `pageSize * maxPages = 50.000`). O custo é `O(N/página + N/lote)`, nunca `O(N)`: é isso que
  "sem N+1" significa. Os `+2` são os contadores `count: exact` (total e não lidos).
- **Memória (DOM).** A lista é paginada localmente em 20 itens (`EmailThreadList`, `pageSize = 20`);
  a árvore montada tem de ser **a mesma** com 20 ou 1.000 threads — medido: 295 nós nos dois casos.
- **Memória (material).** O módulo mantém o corpus em memória para filtrar/buscar localmente
  (comportamento registrado em `OTH-005`, que trata a paginação server-side em separado). O teto
  de 1 MiB para 1.000 threads dá folga confortável contra o limite duro de `collectEmailPages`.
- **Blobs.** O pico de 2 é a **transição** de prévia: o object URL novo nasce antes de o antigo
  ser revogado pelo cleanup. Em repouso há 1 vivo; ao fechar, 0. Nunca 40.
- **Listeners.** Medido por identidade (listener → tipo) no `window` e no `document` durante
  abrir/fechar 40 vezes: se algum listener vazasse, o saldo cresceria por ciclo. Ficou em 0.

## Saída crua (verde)

```console
$ bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx
EN088 | consultas corpus=20  paginas=1 lotes=1 consultas=4 carregadas=20
EN088 | consultas corpus=1000 paginas=2 lotes=2 consultas=6 carregadas=1000
EN088 | memoria corpus=1000 material_bytes=643451
EN088 | memoria dom corpus=20   linhas=20 nos=295
EN088 | memoria dom corpus=1000 linhas=20 nos=295
EN088 | iframes leitura fechado=0 aberto=1 desmontado=0
EN088 | blobs criados=40 revogados=40 pico_vivos=2 antes_de_fechar=1 depois_de_fechar=0
EN088 | listeners pendentes_apos_1_ciclo=0 pendentes_apos_40_ciclos=0
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  3.40s (transform 266ms, setup 140ms, import 452ms, tests 1.80s, environment 813ms)
```

## Prova de que o medidor tem dentes (mutação → vermelho antes / verde depois)

O defeito coberto por OTH-014 não é um bug de produção observável, é a **ausência da medição**.
Para não entregar uma asserção tautológica, o orçamento foi validado por **mutação**: injetando
o comportamento que o aceite proíbe (renderizar o corpus inteiro em vez de uma página), o teste
fica **VERMELHO**; removida a injeção, volta **VERDE**.

Injeção temporária em `EmailThreadList.tsx`
(`const visibleThreads = filteredThreads;` no lugar do `slice` da página) — depois revertida:

```console
$ bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx   # VERMELHO
EN088 | memoria dom corpus=20   linhas=20 nos=295
EN088 | memoria dom corpus=1000 linhas=1000 nos=12055
 FAIL  ... > memória: 1.000 threads retêm só uma página de 20 linhas montadas
      Tests  1 failed | 4 passed (5)
```

Leitura: com o corpus inteiro no DOM, as linhas vão de 20 para **1.000** e a árvore de 295 para
**12.055** nós — o orçamento acusa "crescimento ilimitado" na hora. Revertida a injeção, a suíte
volta a 5/5 (bloco "Saída crua" acima).

## Limites honestos (o que NÃO foi medido)

- **Heap JS do navegador.** `jsdom` não expõe `performance.memory` nem
  `measureUserAgentSpecificMemory`; medir isso de verdade exige browser real (Playwright/DevTools),
  fora do escopo deste cartão. No lugar de um número ruidoso, ficou medido o custo que `jsdom`
  representa fielmente (árvore DOM, material do corpus, ciclo de vida de iframes/object
  URLs/listeners), na mesma linha do que o `docs/catalogo/PERF.md` já declara.
- **Tempo/GPU/aceleração.** Não medido aqui (jsdom não tem layout nem pintura). Não se afirma
  número de renderização visual.
- **Thread extrema com 40 anexos no consumo vivo.** O ciclo de prévia medido usa anexos
  sintéticos; o `e2e/fixtures/email-navy.ts` já cobre a thread extrema (corpo longo, 100 anexos)
  em Playwright. A medição aqui é a de **retenção**, não a de um browser.
