/**
 * SendProductDialog — utility functions and message builders
 */
import { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';

export type MessageTemplate = 'formal' | 'informal' | 'promo';
export type SendMode = 'product' | 'variant';

export interface VariantGroup {
  colorName: string;
  colorHex: string | null;
  variants: ExternalProductVariant[];
  images: string[];
}

export type { ContactResult } from './useSendProduct';

export const templateLabels: Record<MessageTemplate, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
};

// ─── Group variants by color ──────────────────────────────────
export function groupVariantsByColor(variants: ExternalProductVariant[]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();

  variants.forEach((v) => {
    const key = v.color_name || v.name || 'Padrão';
    if (!map.has(key)) {
      map.set(key, { colorName: key, colorHex: v.color_hex, variants: [], images: [] });
    }
    const group = map.get(key)!;
    group.variants.push(v);
    if (v.selected_thumbnail && !group.images.includes(v.selected_thumbnail)) {
      group.images.push(v.selected_thumbnail);
    }
  });

  return Array.from(map.values());
}

// ─── Message builders ─────────────────────────────────────────
export function buildMessage(
  product: ExternalProduct,
  template: MessageTemplate,
  selectedVariant?: VariantGroup | null
): string {
  const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price);

  const variantInfo = selectedVariant
    ? `Cor: ${selectedVariant.colorName}`
    : product.colors && product.colors.length > 0
      ? `Cores disponíveis: ${product.colors.join(', ')}`
      : null;

  const stockInfo = selectedVariant
    ? `Estoque: ${selectedVariant.variants.reduce((s, v) => s + v.stock_quantity, 0)} un.`
    : product.is_stockout
      ? '⚠️ Sem estoque no momento'
      : `Em estoque: ${product.stock_quantity} un.`;

  switch (template) {
    case 'formal':
      return [
        `Prezado(a), segue informações do produto solicitado:`, ``,
        `*${product.name}*`,
        product.brand ? `Marca: ${product.brand}` : '', `Valor: ${price}`,
        variantInfo || '',
        product.min_quantity ? `Quantidade mínima: ${product.min_quantity} unidades` : '',
        product.dimensions_display ? `Dimensões: ${product.dimensions_display}` : '',
        product.allows_personalization ? `Permite personalização.` : '',
        product.lead_time_days ? `Prazo de entrega: ${product.lead_time_days} dias úteis` : '',
        stockInfo, ``,
        product.short_description || product.description
          ? (product.short_description || product.description || '').slice(0, 300) : '',
        ``, `Fico à disposição para qualquer dúvida.`,
      ].filter(Boolean).join('\n');

    case 'promo':
      return [
        `🔥 *OFERTA ESPECIAL* 🔥`, ``,
        `📦 *${product.name}*`,
        selectedVariant ? `🎨 Cor: *${selectedVariant.colorName}*` : '',
        product.brand ? `🏷️ ${product.brand}` : '', `💰 *${price}*`,
        !selectedVariant && product.colors?.length ? `🎨 ${product.colors.join(', ')}` : '',
        product.min_quantity ? `📋 A partir de ${product.min_quantity} un.` : '',
        product.allows_personalization ? `✅ Personalização disponível!` : '',
        `✅ ${stockInfo}`, ``, `Aproveite! Estoque limitado 🚀`,
      ].filter(Boolean).join('\n');

    case 'informal':
    default:
      return [
        `Oi! 😊`, ``, `Olha esse produto que separei pra você:`, ``,
        `*${product.name}*`,
        selectedVariant ? `🎨 *${selectedVariant.colorName}*` : '', ``,
        product.short_description || product.description
          ? (product.short_description || product.description || '').slice(0, 200) : '',
        ``,
        product.brand ? `Marca: ${product.brand}` : '', `Valor: ${price}`,
        !selectedVariant && product.colors?.length ? `Cores: ${product.colors.join(', ')}` : '',
        product.allows_personalization ? `Dá pra personalizar! ✨` : '',
        stockInfo.includes('⚠️') ? stockInfo : '', ``, `O que achou? 😉`,
      ].filter(Boolean).join('\n');
  }
}

// ─── Collect images ───────────────────────────────────────────
export function collectAllImages(product: ExternalProduct): { url: string; label: string }[] {
  const imgs: { url: string; label: string }[] = [];
  if (product.primary_image_url) {
    imgs.push({ url: product.primary_image_url, label: 'Principal' });
  }
  if (product.variants) {
    product.variants.forEach((v) => {
      if (v.selected_thumbnail && !imgs.some((i) => i.url === v.selected_thumbnail)) {
        imgs.push({ url: v.selected_thumbnail!, label: v.color_name || v.name });
      }
    });
  }
  return imgs;
}
