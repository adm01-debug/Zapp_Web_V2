# Changelog — módulo Catálogo

Formato: `E<nn> · <título> · <commit/PR> · <data>`

## Fase 0 — Saneamento & base

- E02 · Branch `feat/catalog-f0-base`, plano + prints em `docs/catalogo/`, `scripts/catalog/validate-plan.mjs`, `catalog` em `COMPACT_GUTTER_VIEWS`, link em `docs/README.md` · 2026-09-11
- E01 · Diagnóstico de gates e disco (ver `ESTADO_INICIAL.md`) · 2026-09-11

## Fase 2 — Backend

- E21 · Edge `promogifts-catalog` v2: `PRODUCT_FIELDS` completos (images, color_swatches, materials, tags, flags is_featured/is_new/is_bestseller/is_on_sale/is_closeout + expirações, engraving_*, main_category_id, order_count, view_count, created_at/updated_at/last_sync_at, primary_image_fallback_url) e `compact=true` opcional para o card; tipos em `useExternalCatalog.ts`; manifest regenerado. Colunas validadas contra o DB externo (PO-13153: 6 imagens, 1 swatch, LASER). Deploy só via `deploy-functions.yml` a partir de main (PAT do VPS retorna 403) · 2026-09-11

**Deploy E21 executado** (run [34661069952](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/34661069952)): `promogifts-catalog` deployado com sucesso em produção (digest `sha256:c52405…`). O run aparece como falho por drift **pré-existente e não relacionado**: `talkx-report` consta no manifesto mas nunca foi deployado (módulo Talk X, pendente de `RESEND_API_KEY`) — fora do escopo do Catálogo.

- E03 · Remoção do legado órfão: `ProductManagement.tsx`, `ProductCatalog.tsx`, `ProductCard.tsx`, `ProductForm.tsx`, `ShoppingCart.tsx`, `ProductMessage.tsx`, `useProductManagement.ts`, `useShoppingCart.ts` (+teste) e a linha no barrel `hooks/business/index.ts`; `LazyProductManagement` removido de `LazyRoutes.tsx` (sem consumidor). Teste GAP tautológico convertido em regressão real (`fs.existsSync`). `WhatsAppTemplatesManager`, `useRecommendedProducts` e a tabela local `products` ficam intocados. Gates: tsc 0 · typecheck-ratchet 0 novas · lint-ratchet 1189→1125 (novas 0, -64 de dívida) · hook test 94/94 · 2026-09-11
