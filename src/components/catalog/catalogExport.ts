/**
 * Primitivas do link público do PromoGifts.
 *
 * Nasceu no CT-20 como a exportação CSV do catálogo (filtro atual → arquivo).
 * Toda a exportação saiu do produto (regra do dono: nenhuma informação sai do
 * sistema): primeiro a exportação de catálogo/seleção (CT-20/CT-21/CT-28) e,
 * agora, o CSV do histórico de envios. Aqui ficou só o que continua em uso:
 *
 *  - `PROMOGIFTS_BASE_URL` + `promogiftsProductUrl`: link PÚBLICO do produto
 *    (CatalogProductCard.tsx) e "Gerenciar no PromoGifts" do CatalogRail.tsx —
 *    link externo, não é saída de dado.
 */

/** Única URL pública do PromoGifts confirmada no repo. */
export const PROMOGIFTS_BASE_URL = 'https://promogifts.com.br';

/** URL do produto no PromoGifts a partir do `slug`. */
export function promogiftsProductUrl(slug: string | null | undefined): string {
  if (!slug) return '';
  return `${PROMOGIFTS_BASE_URL}/${encodeURIComponent(slug)}`;
}
