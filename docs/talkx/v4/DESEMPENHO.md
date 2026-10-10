# Talk X — Desempenho (X194 / card TL-177)

- **Máquina:** WSL Ubuntu-24.04 (local; sem push, sem deploy)
- **Como medir:** `bun run build` e depois `node scripts/ci/bundle-budget.mjs`
  (os tamanhos abaixo são o gzip de cada arquivo de `dist/assets/`, o mesmo número que o
  navegador baixa da Vercel)

## 1. Cada tela em arquivo próprio, buscada só quando a aba abre

Antes, `src/components/talkx/TalkXView.tsx` importava as onze telas de uma vez (import
estático: `TalkXHelpCenter`, `TalkXOverview`, `TalkXCampaignWizard`, `TalkXLiveMonitor`,
`TalkXSegments`, `TalkXTemplates`, `TalkXSuppression`, `TalkXAnalytics`, `TalkXSettings`,
`TalkXCampaignScheduled`, `TalkXCampaignRunning`). Resultado: um único chunk com o módulo
inteiro **e** o `vendor-charts` (recharts) arrastado junto, por import estático.

Depois (correção deste cartão): cada tela é carregada por
`lazyWithRetry(() => import('./TalkX…'))` — `src/lib/lazyWithRetry.ts`, o mesmo
carregador da entrada do módulo (`src/pages/lazyViews.ts`), que repete a busca do chunk
3x com espera antes de desistir — e cada ponto de render tem `<Suspense>` com o esqueleto
do próprio kit (`TalkXSkeletonRows`).
O chunk do `TalkXView` passou a listar **10 `import()` dinâmicos** e **nenhum import
estático de gráficos**.

| Medida (gzip) | Depois (medido neste workspace) |
| --- | ---: |
| chunk do módulo (`TalkXView-DidHW89J.js`) | 21,3 KB (72.966 B) |
| kit compartilhado (`talkxShared-BgUzfxGZ.js`) | 14,4 KB (50.167 B) |
| `vendor-charts` (recharts) no import do módulo | não entra no import do módulo |

## 2. Tamanho de cada tela (chunk próprio, gzip)

| Tela (arquivo) | raw | gzip |
| --- | ---: | ---: |
| `TalkXCampaignWizard` | 58.182 B | 15,1 KB |
| `TalkXCampaignRunning` | 43.100 B | 12,1 KB |
| `TalkXTemplates` | 36.079 B | 9,2 KB |
| `TalkXSegments` | 33.676 B | 9,7 KB |
| `TalkXSuppression` | 26.786 B | 8,0 KB |
| `TalkXAnalytics` | 25.362 B | 6,9 KB |
| `TalkXCampaignScheduled` | 17.135 B | 5,0 KB |
| `help/TalkXHelpCenter` | 17.106 B | 5,1 KB |
| `TalkXLiveMonitor` | 14.446 B | 4,9 KB |
| `TalkXSettings` | 3.364 B | 1,5 KB |

`TalkXOverview` (Visão geral, a tela de entrada) continua no import direto: ela é
renderizada já na primeira pintura, então um `lazy` ali só acrescentaria uma ida
extra à rede sem tirar byte nenhum do caminho inicial.

`TalkXMessageEditor` (`TalkXMessageEditor-DEshEw_d.js`, 40.926 B / 12,5 KB gzip) **não**
é tela do `TalkXView`: ele é importado estaticamente pelo `TalkXCampaignWizard` e pelo
`TalkXTemplateEditor` (usado dentro da aba Templates), então viaja dentro desses chunks
e nunca no carregamento inicial do módulo. Não existe componente `TalkXHelp` — a Ajuda
é `help/TalkXHelpCenter` (linha da tabela acima).

## 3. Bibliotecas pesadas só na tela que usa

`vendor-charts` (recharts, 458.524 B / 122,9 KB gzip) é importado estaticamente só pelas
três telas do Talk X que desenham gráfico (1 import em cada chunk, medido no `dist`):

- `TalkXAnalytics` (Comparativo)
- `TalkXLiveMonitor` (Monitor ao vivo)
- `TalkXCampaignRunning` (Campanha em andamento)

O chunk do `TalkXView` **não** importa `vendor-charts`
(`grep -c 'from"\./vendor-charts' dist/assets/TalkXView-*.js` → `0`; a única menção é a
lista de pré-carregamento (`__vite__mapDeps`), que só é buscada quando o `import()` da
tela correspondente roda). `help/TalkXHelpCenter` também não importa gráficos (→ `0`).

Confirmação no código-fonte: só recharts aparece como biblioteca pesada no módulo
(gráficos) — busca por `jspdf|xlsx|marked|react-markdown|pdfjs|leaflet|mapbox|monaco|ace-builds|draft-js|slate|tiptap|quill`
em `src/components/talkx/**` retorna 0. PDF, leitor de planilha e leitor de markdown
ainda não existem no Talk X — entram já atrás de `lazy` quando as telas existirem.

## 4. Orçamento do carregamento inicial (`scripts/ci/bundle-budget.mjs`)

Medido neste workspace, com o diff do cartão:

| Medida | Com o cartão | Teto |
| --- | ---: | ---: |
| JS inicial | 292,4 KB | 341 KB |
| CSS inicial | 42,1 KB | 80 KB |
| Maior chunk JS (inclui lazy) | 492,3 KB | 550 KB |
| Assets totais | 3.629,0 KB | 4.100 KB |

`OK: bundle inicial dentro do budget.` O `initial-js` **não estoura** o teto de 341 KB
(292,4 KB, 13 chunks no entry). Os números antigos (342,6 KB / 3.046,5 KB, medidos em
09/10 sobre outra base) não valem mais e foram substituídos pelos acima.

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
