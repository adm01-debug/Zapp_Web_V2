# Talk X — Desempenho (TL-177)

- Data da medição: 2026-10-13
- Base comparada: `dia/2026-10-13` sem o diff do cartão (extraída por `git archive` em `.tmp/basecheck`)
- Branch do cartão: `v2/t-eb92e356-26101322391312`
- Máquina: WSL Ubuntu-24.04 local; sem push, sem deploy
- Comandos rodados para medir: `bun run build`, `node scripts/ci/bundle-budget.mjs` e script Node local com `zlib.gzipSync` sobre `dist/assets/*.js`

## 1. O que mudou no carregamento inicial do Talk X

Antes, `src/components/talkx/TalkXView.tsx` importava estaticamente as telas de wizard, monitor, listas, analytics, ajuda, configurações e telas de acompanhamento. Isso fazia o chunk da View trazer código que só é usado depois que a pessoa abre uma aba ou tela específica.

Depois, a Visão geral continua no import direto porque é a primeira tela renderizada, e as demais telas entram por `lazyWithRetry(() => import('./TalkX...'))` com `<Suspense>` e fallback `TalkXSkeletonRows` nos pontos de render. O fallback não muda a rota nem o estado da tela; só cobre o intervalo em que o chunk chega.

Medida do chunk da View:

| Medida | Antes (`dia/2026-10-13`) | Depois (este cartão) |
| --- | ---: | ---: |
| `TalkXView` gzip | 121.772 B / 118,9 KB | 23.495 B / 22,9 KB |
| `TalkXView` raw | 448.200 B | 77.990 B |
| import top-level de `vendor-charts` no chunk da View | sim | não |

O `vendor-charts` continua existindo como chunk separado porque o módulo tem telas com gráfico. Depois da correção ele aparece só como dependência de importação lazy gerada pelo bundler, não como import top-level da `TalkXView`.

## 2. Tamanho dos chunks do Talk X depois da correção

| Chunk | raw | gzip |
| --- | ---: | ---: |
| `talkxShared` | 53.707 B | 15.722 B / 15,4 KB |
| `TalkXCampaignWizard` | 61.122 B | 16.374 B / 16,0 KB |
| `TalkXTemplates` | 40.858 B | 11.404 B / 11,1 KB |
| `TalkXCampaignRunning` | 46.861 B | 13.499 B / 13,2 KB |
| `TalkXSegments` | 38.957 B | 11.544 B / 11,3 KB |
| `TalkXAnalytics` | 32.765 B | 9.361 B / 9,1 KB |
| `TalkXLiveMonitor` | 16.821 B | 5.882 B / 5,7 KB |
| `TalkXSuppression` | 33.513 B | 10.332 B / 10,1 KB |
| `TalkXCampaignScheduled` | 22.301 B | 6.886 B / 6,7 KB |
| `TalkXMessageEditor` | 40.955 B | 12.845 B / 12,5 KB |
| `TalkXHelpCenter` | 17.224 B | 5.229 B / 5,1 KB |
| `TalkXSettings` | 3.550 B | 1.581 B / 1,5 KB |
| `vendor-charts` | 458.524 B | 126.447 B / 123,5 KB |

## 3. Orçamento de bundle

`node scripts/ci/bundle-budget.mjs` falha hoje também na base limpa, antes deste cartão, porque o teto atual de JS inicial é 300 KB e a aplicação já está acima disso no entry. Este cartão não cria esse estouro; nesta medição reduziu o JS inicial em 1,7 KB.

| Medida | Base sem o diff | Com este cartão | Teto |
| --- | ---: | ---: | ---: |
| JS inicial | 339,1 KB | 337,4 KB | 300 KB |
| CSS inicial | 42,4 KB | 42,4 KB | 80 KB |
| Maior chunk JS (inclui lazy) | 499,6 KB | 492,3 KB | 550 KB |
| Assets totais gzip, sem maps | 3.804,1 KB | 3.810,4 KB | 4.100 KB |

Resultado do guard:

- base limpa: `initial-js: 339.1 KB gzip > budget 300 KB`
- com este cartão: `initial-js: 337.4 KB gzip > budget 300 KB`

O aumento de assets totais é o custo normal de separar chunks; o total permanece abaixo do teto. O estouro restante está no grafo inicial da aplicação, fora do escopo deste cartão.

## 4. Listas grandes

Este cartão não muda limites de consulta nem paginação. As telas de lista existentes continuam usando a paginação própria do módulo; os limites que aparecem em consultas de gráfico/amostra não foram alterados para não mudar semântica de dados em um cartão de carregamento de tela.

## 5. Como reproduzir esta medição

```bash
bun run build
node scripts/ci/bundle-budget.mjs
bunx vitest run src/components/talkx/__tests__/TalkXView.carregamento.test.tsx src/components/talkx/__tests__/TalkXView.route.test.tsx
```

A comparação da base foi feita sem tocar em produção: `git archive dia/2026-10-13` gerou `.tmp/basecheck`, a build rodou nesse diretório e o mesmo `bundle-budget.mjs` foi executado ali.