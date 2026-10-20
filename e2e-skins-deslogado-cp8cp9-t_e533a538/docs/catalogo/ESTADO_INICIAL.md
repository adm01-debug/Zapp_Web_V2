# Estado inicial — módulo Catálogo (E01, 2026-09-11)

**main:** `33d02292` (plano gerado sobre `9c99b164`) · **branch:** `feat/catalog-f0-base` · **VPS:** `claude-code` reativado (estava pausado pelo `disk-actioner`), disco 84% → 79% após `docker image prune -a --filter until=48h` (8,6 GB).

## Gates

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | 0 erros |
| `node scripts/ci/lint-ratchet.mjs` | baseline 1189 · atual 1129 · removidas 60 · **novas 0** (baseline pode descer 60) |
| `npx vitest run src/hooks/__tests__/useExternalCatalog.test.ts` | 94/94 em 13 s |
| `promogifts-catalog` no `supabase/deployment-manifest.json` | presente |

## ESLint no módulo (17 ocorrências)

| Arquivo | Ocorrências |
|---|---|
| `ExternalProductCatalog.tsx` | 4 |
| `ExternalProductManagement.tsx` | 3 |
| `SendProductDialog.tsx` | 3 |
| `ProductCatalog.tsx` (legado) | 2 |
| `ProductDetailDialog.tsx` | 2 |
| `useProductManagement.ts` (legado) | 2 |
| `useSendProduct.ts` | 1 |
| `src/hooks/integrations/useExternalCatalog.ts` | **0** |

Por regra: `react-hooks/exhaustive-deps` 8 · `react-hooks/set-state-in-effect` 5 · `no-restricted-imports` 3 · `react-hooks/immutability` 1.

## Mapa de importadores de `src/components/catalog/` (fora da pasta)

| Importador | Importa | Situação |
|---|---|---|
| `src/components/inbox/chat/ChatDialogs.tsx`, `InputExtraTools.tsx`, `ChatInputToolbars.tsx` | `ExternalProductCatalog` | vivo (dialog do chat) |
| `src/pages/lazyViews.ts` | `ExternalProductManagement` (view `catalog`), `WhatsAppTemplatesManager` (view `wa-templates`) | vivo |
| `src/components/performance/LazyRoutes.tsx` | `LazyProductManagement` (`ExternalProductManagement`) | **sem consumidor** — remover na E03 |
| `src/hooks/business/useShoppingCart.ts` | tipos `Product` (`ProductCard.tsx`) e `CartItem` (`ShoppingCart.tsx`) | hook só re-exportado em `hooks/business/index.ts` e testado em `useShoppingCart.test.ts`; **nenhum componente usa** — cadeia inteira removível na E03 |
| `src/hooks/__tests__/useExternalCatalog.test.ts:1099-1106` | cita `ProductCatalog.tsx`, `ProductManagement.tsx`, `ProductCard.tsx` em testes "GAP" tautológicos | atualizar na E03 |

Dentro da pasta: `ProductCard` é importado 5×, `useProductManagement` 2×, `ProductForm` 1× — todos pelo grupo legado (`ProductCatalog`/`ProductManagement`/`ShoppingCart`).

## Achado fora do plano original

`src/hooks/chat/useRecommendedProducts.ts` (usado por `inbox/tabs/AiTab.tsx`) lê a tabela **local** `public.products` do ZAPP (`price, currency, image_url, category`), não o PromoGifts. A tabela local **fica** em `scripts/db-audit/catalog.sql`/`manifest.sql`. Migrar o AiTab para o catálogo externo é etapa fora deste plano (candidata a E92+).
