# Prefetch das views quentes — E35 (PLANO_MELHORIAS_50)

**Data:** 2026-10-03 · **Etapa:** E35 · **Build:** `bun run build` + `node scripts/ci/bundle-budget.mjs`

## O que a etapa pede

> `modulepreload`/prefetch para Inbox e Chat **medido** (sem regredir initial)

## O que existia antes

**Nenhum prefetch ativo.** O repo tem um `src/components/performance/Prefetcher.tsx` (187 linhas, com `routePrefetchConfig`, `PrefetchLink`, `useIntersectionPrefetch`, `CriticalRoutePrefetcher`), mas ele **não é importado por nenhum módulo** — é código morto, e a config dele aponta para nomes de rota (`dashboard`, `contacts`, …) que não batem com o roteamento real do app.

## A arquitetura real do roteamento (para constar)

O app **não** usa rotas por URL para as telas internas: a rota `/` monta `pages/Index`, que é uma SPA com um `ViewRouter` e um `VIEW_MAP` (nome → view). As views são todas lazy, via `src/pages/lazyViews.ts` (`lazyWithRetry`, 3 tentativas com backoff).

Sobre o "Inbox e Chat" da etapa: na `NavigationService.getPrimaryNav()` a view **`inbox` tem label `Chat`** — são a mesma coisa. E o **`ChatPanel`** (o painel de conversa) é **lazy dentro** do `RealtimeInboxView` (`linha 27`) — é o chunk mais quente que não está no caminho crítico.

## O que foi implementado

`src/components/performance/HotRoutePrefetcher.tsx` (novo, ~110 linhas), ligado em `src/pages/Index.tsx` dentro do `<Suspense>` dos overlays (que já existe para componentes de efeito nulo).

- pré-carrega, em **tempo ocioso** (`requestIdleCallback`, com fallback para `setTimeout`), os chunks de: **`ChatPanel`**, **`RealtimeInboxView`** (`inbox`/Chat), **`TeamChatView`** (Teams), **`EmailChatInbox`** (Email) e **`DashboardView`**;
- **sequencial**, com 150 ms entre chunks, para não competir com a thread principal nem com a rede;
- **ignora** conexão `slow-2g`/`2g` e `saveData` (`navigator.connection`), como já fazia o `Prefetcher` morto;
- **falha em silêncio** com `log.warn`: é otimização, não requisito — se um chunk não vier agora, o `Suspense` da view o carrega no clique;
- cancela no unmount.

## Medição — o critério "sem regredir initial"

| Métrica | Antes | Depois |
|---|---|---|
| **JS inicial** | **337,8 KB** (13 chunks) | **337,8 KB** (13 chunks) ✅ |
| `initial-css` | 41,5 KB | 41,5 KB |
| Maior chunk (inclui lazy) | 492,3 KB | 492,3 KB |
| Assets totais | 2 956,7 KB | **2 961,5 KB** (+4,8 KB) |

**O `initial-js` não mudou um byte.** O prefetcher vira um chunk próprio (`HotRoutePrefetcher-*.js`, **9,81 KB** raw), carregado **fora** do grafo estático do entry — é por isso que o budget não sente. O `+4,8 KB` nos assets totais é o custo do próprio prefetcher.

Chunks quentes que o prefetch antecipa, todos **fora do initial**:

| Chunk | Tamanho |
|---|---|
| `ChatPanel` | 184,13 KB |
| `TeamChatView` | 93,81 KB |
| `EmailChatInbox` | 56,36 KB |
| `HotRoutePrefetcher` | 9,81 KB |

## Testes (e a prova de que eles funcionam)

`src/components/performance/__tests__/HotRoutePrefetcher.test.tsx` — **7 testes**, todos verdes:

| Caso | Prova |
|---|---|
| não renderiza nada | `container` vazio |
| pré-carrega todos os loaders no idle | cada loader chamado 1× |
| não carrega em `2g` | loaders não chamados |
| não carrega com `saveData` | loaders não chamados |
| sem `navigator.connection`, carrega | loader chamado 1× |
| um loader que falha não impede os outros | o segundo loader ainda é chamado |
| `shouldSkipPrefetch` por tipo de conexão | `4g`/`3g`/ausente = false; `2g`/`slow-2g`/`saveData` = true |

**Prova por mutação** (o teste só vale se falhar quando o código quebra):

| Mutação | Resultado |
|---|---|
| `if (false && shouldSkipPrefetch())` — desliga o guard | **2 testes falham** ✅ |
| remover o `try/catch` do loop | **1 teste falha** ✅ |
| código original | 7/7 passam |

**Dois defeitos meus que o teste pegou, e que valem registro:**

1. **Primeira versão do teste era tautológica** — importava os módulos por conta própria para "provar" o prefetch, sem observar o componente. Trocada por `vi.hoisted` + espião no factory do `vi.mock`.
2. **Mesmo assim os casos 3–5 não provavam nada**: o **ESM cacheia os módulos**, então o factory do `vi.mock` só dispara no primeiro import — os casos seguintes passariam com o guard DESLIGADO. Foi a mutação que revelou. Correção: os loaders passaram a ser **injetados por prop** (`views`), com default `HOT_VIEWS` em produção. Um teste que passa com o bug presente é pior que nenhum teste.

## Separação de arquivos (e por que)

`react-refresh/only-export-components` acusa arquivos que exportam componente **e** constantes (o fast refresh não funciona). A primeira versão exportava `HOT_VIEWS`/`shouldSkipPrefetch` do `.tsx` e criou **2 dívidas novas** no `lint-ratchet`. Dividido em:

- `src/components/performance/hotRoutePrefetch.ts` — dados e funções (`HOT_VIEWS`, `shouldSkipPrefetch`, `PAUSA_ENTRE_CHUNKS_MS`, `ViewLoaders`);
- `src/components/performance/HotRoutePrefetcher.tsx` — só o componente.

Resultado: `lint-ratchet` volta a **612/612, novas=0**.

## Limitação da medição (honestidade)

A etapa diz "medido". O que é **mensurável sem browser** foi medido: **o initial não regride** (o `bundle-budget`, que é o gate do CI) e **os chunks quentes existem fora do initial**. O ganho de **tempo** (quanto o usuário espera menos ao clicar em Teams/Email) só se mede com browser/Playwright, que **não foi usado nesta rodada** por orientação do coordenador (o WSL travou duas vezes por sobrecarga). **Não afirmo ganho de tempo que não medi.**

## Achados fora do escopo (não corrigidos)

1. **`src/components/performance/Prefetcher.tsx` é código morto** (187 linhas, ninguém importa) e a `routePrefetchConfig` dele aponta para nomes que não existem no roteamento real. Vale remover — mas é limpeza, não E35, e removê-lo mexeria no baseline de lint. **Registrado, não removido.**
2. **`src/components/performance/LazyRoutes.tsx` parece duplicar** o `lazyViews.ts` (ambos declaram `LazyDashboardView` etc.). Não investiguei a fundo; pode haver dois sistemas de lazy convivendo. Candidato a auditoria.
3. **A view `inbox` é a tela inicial** — para ela o prefetch só ajuda depois do primeiro carregamento; o ganho real do E35 está no `ChatPanel` e nas abas Teams/Email.
