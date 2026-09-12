# Changelog — módulo Catálogo

Formato: `E<nn> · <título> · <commit/PR> · <data>`

## Fase 0 — Saneamento & base

- E02 · Branch `feat/catalog-f0-base`, plano + prints em `docs/catalogo/`, `scripts/catalog/validate-plan.mjs`, `catalog` em `COMPACT_GUTTER_VIEWS`, link em `docs/README.md` · 2026-09-11
- E01 · Diagnóstico de gates e disco (ver `ESTADO_INICIAL.md`) · 2026-09-11

## Fase 2 — Backend

- E21 · Edge `promogifts-catalog` v2: `PRODUCT_FIELDS` completos (images, color_swatches, materials, tags, flags is_featured/is_new/is_bestseller/is_on_sale/is_closeout + expirações, engraving_*, main_category_id, order_count, view_count, created_at/updated_at/last_sync_at, primary_image_fallback_url) e `compact=true` opcional para o card; tipos em `useExternalCatalog.ts`; manifest regenerado. Colunas validadas contra o DB externo (PO-13153: 6 imagens, 1 swatch, LASER). Deploy só via `deploy-functions.yml` a partir de main (PAT do VPS retorna 403) · 2026-09-11
