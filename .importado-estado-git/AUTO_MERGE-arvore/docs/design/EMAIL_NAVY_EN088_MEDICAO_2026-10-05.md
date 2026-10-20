# EN-088 — medição de volume, memória, consultas, iframes, listeners e blobs do Email

**Achado coberto:** `OTH-014` (item #154 do `BACKLOG_VERIFICADO`).
**Critério (literal, `docs/design/PLANO_EMAIL_NAVY_100_ETAPAS_2026-10-02.md:621`):**
*"fixture de mil threads paginadas e thread longa; medir renderização, consultas, memória,
iframes, listeners e blobs. Virtualizar somente onde a medição exigir, com alturas variáveis
e âncoras."* **Aceite (linha 624):** *"sem N+1, download em massa ou crescimento ilimitado;
apresentar antes/depois e orçamento justificado, não número arbitrário de performance
«aprovado»."*

A auditoria registrou as fixtures (1.000 threads, thread extrema com 100 anexos) mas **não
localizou as medições** exigidas por EN-088. Esta página é a medição: cada número abaixo é
saída crua do medidor, não estimativa.

## Ambiente e fonte

- Medição: 2026-10-05, WSL2, `node`/`bun` do workspace do cartão #154, `vitest 4.1.11`, ambiente `jsdom`.
- Medidor: `src/components/email/__tests__/EmailVolumeMedicao.test.tsx` (5 casos, cada um
  imprime uma linha `EN088 | …` e **trava o orçamento**).
- Corpus de threads: `EmailThread` sintético de 20 e de 1.000 threads (fixture do próprio teste).
- **Consultas:** o medidor executa o `useGmail` **real** via `renderHook`, com o cliente Supabase
  **mockado**; o total sai exclusivamente das chamadas **observadas** na cadeia
  (`from`/`select`/`range`/`in`/`count: exact`). Não há fetcher próprio nem constante somada.
- Reprodução:
  `bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx`.

## O que foi medido (antes × depois do volume)

O "antes/depois" aqui é **corpus mínimo (20 threads) × corpus de volume (1.000 threads)** — não
há otimização nova neste cartão; o que se prova é que o custo **não cresce** com o volume
(medido: `3` consultas em 20 e em 1.000 threads — o mesmo custo nos dois corpora).

| dimensão | antes (20 threads) | depois (1.000 threads) | orçamento | veredito |
| --- | --- | --- | --- | --- |
| consultas (round-trips observados) | 3 (`1` página + `1` lote + `1` contador) | **3** (`1` página + `1` lote + `1` contador) | `O(páginas + lotes + contadores)`, **nunca `O(threads)`** | ✅ sem N+1 (3 ≪ 1.000) |
| memória — material do corpus | — | **643.451 B ≈ 628 KiB** | < 1 MiB | ✅ dentro |
| memória — linhas montadas no DOM | **20** / 295 nós | **20** / 295 nós | 20 (= página local); árvore plana | ✅ não cresce |
| iframes | 0 (fechado) | **1** (aberto) / 0 (desmontado) | ≤ 1 por leitura | ✅ |
| blobs (object URLs) | — | **40 criados / 40 revogados**, pico **2**, **1** vivo no repouso, **0** ao fechar | pico ≤ 2; 0 ao fechar | ✅ |
| listeners pendentes | — | **0** após 1 ciclo e **0** após 40 ciclos | não cresce com os ciclos | ✅ sem vazamento |

### Duas contagens parecidas, coisas diferentes

- **100 anexos** é o tamanho da thread extrema da **fixture canônica** `e2e/fixtures/email-navy.ts`
  (`extremeAttachments`, `length: 100`). É a fixture de volume do Email, coberta em Playwright.
- **40** são **ciclos sintéticos de prévia** de anexo que o medidor abre e fecha (casos de blobs e
  de listeners). Não é o tamanho de nenhuma fixture — é a repetição que expõe vazamento por ciclo.

### Justificativa dos orçamentos

- **Consultas.** A consulta padrão carrega as threads em **uma página** do servidor
  (`emailThreadPageRange`, `EMAIL_THREAD_PAGE_SIZE = 20`) com `count: exact` do mesmo filtro — o
  total exibido vem dessa própria resposta, sem round-trip só para contar. Os anexos vêm em lote
  por `chunkEmailIds` (`chunkSize = 500`); o caminho legado (`full`) ainda usa `collectEmailPages`
  (`pageSize = 1000`, `maxPages = 50`, teto de 50.000). O custo é `O(páginas + lotes + contadores)`,
  nunca `O(N)`: é isso que "sem N+1" significa. O único contador separado é a consulta
  `count: exact` de **não lidos** (`head: true`) que o selo dispara — **observada** no cliente
  mockado, não presumida.
- **Memória (DOM).** A página vem do servidor (`EMAIL_THREAD_PAGE_SIZE = 20`); a lista não recorta
  nem filtra o array em memória (OTH-005). A árvore montada tem de ser **a mesma** com 20 ou 1.000
  threads — medido: 295 nós nos dois casos.
- **Memória (material).** O módulo mantém o corpus em memória para filtrar/buscar localmente
  (comportamento registrado em `OTH-005`, que trata a paginação server-side em separado). O teto
  de 1 MiB para 1.000 threads dá folga confortável contra o limite duro de `collectEmailPages`.
- **Blobs.** O pico de 2 é a **transição** de prévia: o object URL novo nasce antes de o antigo
  ser revogado pelo cleanup. Em repouso há 1 vivo; ao fechar, 0. Os **40** ciclos de prévia reusam
  um object URL por vez — nunca 40 vivos.
- **Listeners.** Medido por identidade (listener → tipo) no `window` e no `document` durante
  abrir/fechar 40 vezes: se algum listener vazasse, o saldo cresceria por ciclo. Ficou em 0.

## Saída crua (verde)

```console
$ bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx
EN088 | consultas corpus=20  paginas=1 lotes=1 contadores=1 consultas=3 carregadas=20
EN088 | consultas corpus=1000 paginas=1 lotes=1 contadores=1 consultas=3 carregadas=20
EN088 | memoria corpus=1000 material_bytes=643451
EN088 | memoria dom corpus=20   linhas=20 nos=295
EN088 | memoria dom corpus=1000 linhas=20 nos=295
EN088 | iframes leitura fechado=0 aberto=1 desmontado=0
EN088 | blobs criados=40 revogados=40 pico_vivos=2 antes_de_fechar=1 depois_de_fechar=0
EN088 | listeners pendentes_apos_1_ciclo=0 pendentes_apos_40_ciclos=0
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Prova de que o medidor tem dentes (mutação N+1 → vermelho antes / verde depois)

O defeito coberto por OTH-014 não é um bug de produção observável, é a **ausência da medição**.
Para não entregar uma asserção tautológica, o orçamento de consultas foi validado por uma
**mutação N+1 no caminho do hook**: em `src/hooks/integrations/useGmail.ts`, a consulta de anexos
passou a rodar **uma vez por thread** (`.in('thread_id', [row.id])` dentro de `rows.map`) em vez de
um lote por `chunkEmailIds` (500 ids). O log cru da execução vermelha está em
`.tmp/email-en088-n1-mutacao.log` (anexado ao cartão #154).

> **Execução histórica (05/10).** O bloco abaixo é o log da mutação executada em 05/10, contra o
> hook de então (verde com `contadores=2` e `consultas=4/6`). A correção posterior (OTH-005) mudou o
> verde para `1` contador e `3` consultas nos dois corpora — ver o bloco "Saída crua" acima. Os
> números desta subseção **não** foram remedidos aqui; o que a mutação prova continua valendo:
> trocar o lote por uma consulta por thread faz o total crescer com o volume e o orçamento acusar.

```console
$ bunx vitest run --silent=false src/components/email/__tests__/EmailVolumeMedicao.test.tsx   # VERMELHO
EN088 | consultas corpus=20  paginas=1 lotes=20 contadores=2 consultas=23 carregadas=20
EN088 | consultas corpus=1000 paginas=2 lotes=1000 contadores=2 consultas=1004 carregadas=1000
 FAIL  ... > consultas: o número de round-trips não cresce com o tamanho da caixa (sem N+1)
      Tests  1 failed | 4 passed (5)
```

Leitura (execução histórica): os lotes de anexo vão de `ceil(N/500)` para **um por thread**
(20 e 1.000) e o total de 4/6 para **23/1.004** — o orçamento acusa "crescimento ilimitado" na hora.
Revertida a mutação (`git diff -- src/hooks/integrations/useGmail.ts` vazio), a suíte volta a **5/5**
(bloco "Saída crua" acima, já com os números atuais).

## Limites honestos (o que NÃO foi medido)

- **Heap JS do navegador.** `jsdom` não expõe `performance.memory` nem
  `measureUserAgentSpecificMemory`; medir isso de verdade exige browser real (Playwright/DevTools),
  fora do escopo deste cartão. No lugar de um número ruidoso, ficou medido o custo que `jsdom`
  representa fielmente (árvore DOM, material do corpus, ciclo de vida de iframes/object
  URLs/listeners), na mesma linha do que o `docs/catalogo/PERF.md` já declara.
- **Tempo/GPU/aceleração.** Não medido aqui (jsdom não tem layout nem pintura). Não se afirma
  número de renderização visual.
- **Thread extrema com 100 anexos no consumo vivo.** O ciclo de prévia medido usa anexos
  sintéticos; o `e2e/fixtures/email-navy.ts` já cobre a thread extrema (corpo longo, 100 anexos)
  em Playwright. A medição aqui é a de **retenção**, não a de um browser.
