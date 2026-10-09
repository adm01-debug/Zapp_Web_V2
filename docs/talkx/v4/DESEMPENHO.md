# Talk X — Desempenho (X194 / card TL-177)

- **Data da medição:** 2026-10-09
- **Base:** `dia/2026-10-09` · **Branch do cartão:** `v2/t-bd501a84-2610090522c8c1`
- **Máquina:** WSL Ubuntu-24.04 (local; sem push, sem deploy)
- **Como medir:** `bun run build` e depois `node scripts/ci/bundle-budget.mjs`
  (os tamanhos abaixo são o gzip de cada arquivo de `dist/assets/`, o mesmo número que o
  navegador baixa da Vercel)

## 1. Cada tela em arquivo próprio, buscada só quando a aba abre

Antes, `src/components/talkx/TalkXView.tsx` importava as onze telas de uma vez (import
estático). Resultado: um único chunk com o módulo inteiro **e** o `vendor-charts`
(recharts) arrastado junto, por import estático.

Depois (correção deste cartão): cada tela é carregada por
`lazyWithRetry(() => import('./TalkX…'))` — `src/lib/lazyWithRetry.ts`, o mesmo
carregador da entrada do módulo (`src/pages/lazyViews.ts`), que repete a busca do chunk
3x com espera antes de desistir — e cada ponto de render tem `<Suspense>` com o esqueleto
do próprio kit (`TalkXSkeletonRows`).
O chunk do `TalkXView` passou a listar **10 `import()` dinâmicos** e **nenhum import
estático de gráficos**.

| Medida (gzip) | Antes | Depois |
| --- | ---: | ---: |
| chunk do módulo (`TalkXView`) | 69,2 KB (285.560 B) | 17,0 KB (60.180 B) |
| kit compartilhado (`talkxShared`) | — | 11,7 KB (41.135 B) |
| `vendor-charts` (recharts) no import do módulo | 122,9 KB | não entra no import do módulo |

## 2. Tamanho de cada tela (chunk próprio, gzip)

| Tela (arquivo) | raw | gzip |
| --- | ---: | ---: |
| `TalkXCampaignWizard` | 53.220 B | 13,3 KB |
| `TalkXTemplates` | 34.718 B | 8,7 KB |
| `TalkXCampaignRunning` | 34.100 B | 8,9 KB |
| `TalkXSegments` | 23.099 B | 6,8 KB |
| `TalkXAnalytics` | 20.593 B | 5,4 KB |
| `TalkXLiveMonitor` | 17.092 B | 5,5 KB |
| `TalkXSuppression` | 12.846 B | 4,2 KB |
| `TalkXCampaignScheduled` | 12.332 B | 4,0 KB |
| `TalkXMessageEditor` | 4.956 B | 2,0 KB |
| `TalkXHelp` | 4.824 B | 1,8 KB |
| `TalkXSettings` | 3.366 B | 1,4 KB |

`TalkXOverview` (Visão geral, a tela de entrada) continua no import direto: ela é
renderizada já na primeira pintura, então um `lazy` ali só acrescentaria uma ida
extra à rede sem tirar byte nenhum do caminho inicial.

## 3. Bibliotecas pesadas só na tela que usa

`vendor-charts` (recharts, 458.524 B / 122,9 KB gzip) é importado estaticamente por 16
chunks, entre eles as três telas do Talk X que desenham gráfico:

- `TalkXAnalytics` (Comparativo)
- `TalkXLiveMonitor` (Monitor ao vivo)
- `TalkXCampaignRunning` (Campanha em andamento)

O chunk do `TalkXView` **não** importa `vendor-charts`
(`grep -c 'from"\./vendor-charts' dist/assets/TalkXView-*.js` → `0`). A única referência
que sobra ali é a lista de pré-carregamento (`__vite__mapDeps`), que só é buscada quando o
`import()` da tela correspondente roda.

Confirmação no código-fonte antes da correção: só recharts aparecia como biblioteca
pesada no módulo (gráficos). PDF, leitor de planilha e leitor de markdown ainda não
existem no Talk X — entram já atrás de `lazy` quando as telas existirem.

## 4. Orçamento do carregamento inicial (`scripts/ci/bundle-budget.mjs`)

Medição de 2026-10-09, com e sem o diff do cartão:

| Medida | Base (`dia/2026-10-09`, sem o diff) | Com o cartão | Teto |
| --- | ---: | ---: | ---: |
| JS inicial | 342,6 KB | 342,6 KB | 341 KB |
| CSS inicial | 41,5 KB | 41,5 KB | 80 KB |
| Maior chunk JS (inclui lazy) | 492,3 KB | 492,3 KB | 550 KB |
| Assets totais | 3.028,6 KB | 3.046,5 KB | 4.100 KB |

O guard **já falhava antes do cartão** (`initial-js: 342,6 KB > 341 KB`), com o mesmo
número: o estouro está no grafo do entry (`vite.config.ts` / imports estáticos do entry),
que não é área de telas e não foi tocado aqui. O cartão **não aumenta** o orçamento —
`initial-js` e `largest-chunk` ficam idênticos; `total-assets` sobe 18 KB (o custo de
separar 11 chunks) e continua 26% abaixo do teto.

## 5. Listas grandes

`grep -rn "\.limit(" src/components/talkx src/hooks/integrations/useTalkX*`:

- as três telas de lista — Templates, Segmentos e Supressão — **não** têm teto fixo; as
  três paginam com `TalkXPagination` (`TalkXSegments.tsx:187`, `TalkXTemplates.tsx:160`,
  `TalkXSuppression.tsx:204`);
- os `.limit()` que existem são amostras para gráfico (`TalkXAnalytics.tsx:102`,
  `TalkXLiveMonitor.tsx:78`, `TalkXCampaignRunning.tsx:200/278/383/628`) e a lista de
  sugestão do "adicionar contato à supressão" (`TalkXSuppression.tsx:82`, teto nomeado
  `ADD_CONTACT_LIST_LIMIT = 50`);
- os `.limit()` de `src/hooks/integrations/useTalkX*.ts` são de hooks (outra área).

Nenhum teto fixo foi alterado neste cartão: mudar amostra de gráfico ou teto de consulta
muda semântica de dado, não é correção de tela.

## 6. O que este cartão não mediu

- **Tempo até a tela utilizável** com a fixture de X003 e com 5.000 destinatários: exige o
  harness de CI com o fixture carregado; não é medível do meu lado (sem navegador/CI aqui).
- **`EXPLAIN` das RPCs de listagem**: exige o banco local populado; não foi rodado.
- **Chunk de `vendor-pdf`, `vendor-maps`**: não têm relação com o Talk X — nenhuma tela do
  módulo importa PDF, leitor de planilha ou leitor de markdown hoje (o único import de
  biblioteca pesada em `src/components/talkx/**` é `recharts`). Quando essas telas
  existirem, entram atrás de `lazy` do mesmo jeito.

## 7. Como reproduzir

```bash
bun run build
node scripts/ci/bundle-budget.mjs
npx vitest run src/components/talkx/__tests__/TalkXView.carregamento.test.tsx
grep -c 'from"\./vendor-charts' dist/assets/TalkXView-*.js   # 0
```
