/**
 * SendProductDialog — utility functions and message builders
 */
import { ExternalProduct, ExternalProductVariant } from '@/hooks/integrations/useExternalCatalog';
// R2-MOD-048 — snapshot de favorito (preço/estoque ausentes) não vira zero
// real na mensagem.
import { isSnapshotProduct } from './catalogShared';
// CT-45 — a personalização da mensagem reusa os helpers do Talk X (mesmas
// regras do envio real de campanha): {{nome}}/{{empresa}} resolvidos num
// único passe contra o contato selecionado.
import { personalizePreview, extractVariables } from '@/components/talkx/talkxShared';

export type MessageTemplate = 'formal' | 'informal' | 'promo';
export type SendMode = 'product' | 'variant';

export interface VariantGroup {
  colorName: string;
  colorHex: string | null;
  variants: ExternalProductVariant[];
  images: string[];
}

export type { ContactResult } from './useSendProduct';

/** Campos do contato usados na personalização da mensagem (CT-45). */
export interface MessageContact {
  name?: string | null;
  nickname?: string | null;
  company?: string | null;
}

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
  selectedVariant?: VariantGroup | null,
  contact?: MessageContact | null
): string {
  /**
   * R2-MOD-048 — snapshot de favorito não tem preço nem estoque: os zeros do
   * preenchimento do tipo não podem virar "R$ 0,00"/"0 un." como se fossem
   * dado comercial. Nesse caso as linhas de valor e estoque simplesmente não
   * entram na mensagem (o envio normal hidrata o produto antes — ver
   * SendProductDialog).
   */
  const semPrecoEstoque = isSnapshotProduct(product);
  const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price);
  const priceLine = semPrecoEstoque ? null : `Valor: ${price}`;

  // CT-45 — com contato a saudação entra como placeholder {{nome}} (resolvido
  // no fim por personalizePreview); sem contato o fallback é "Olá!" e nenhum
  // placeholder cru escapa para o preview.
  const greeting = contact?.name ? 'Olá, {{nome}}!' : 'Olá!';

  const variantInfo = selectedVariant
    ? `Cor: ${selectedVariant.colorName}`
    : product.colors && product.colors.length > 0
      ? `Cores disponíveis: ${product.colors.join(', ')}`
      : null;

  const stockInfo = semPrecoEstoque
    ? null
    : selectedVariant
      ? `Estoque: ${selectedVariant.variants.reduce((s, v) => s + v.stock_quantity, 0)} un.`
      : product.is_stockout
        ? '⚠️ Sem estoque no momento'
        : `Em estoque: ${product.stock_quantity} un.`;

  let raw: string;
  switch (template) {
    case 'formal':
      raw = [
        greeting,
        `Segue informações do produto solicitado:`, ``,
        `*${product.name}*`,
        product.brand ? `Marca: ${product.brand}` : '',
        contact?.company ? `Empresa: {{empresa}}` : '',
        priceLine,
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
      break;

    case 'promo':
      raw = [
        greeting, ``,
        `🔥 *OFERTA ESPECIAL* 🔥`, ``,
        `📦 *${product.name}*`,
        selectedVariant ? `🎨 Cor: *${selectedVariant.colorName}*` : '',
        product.brand ? `🏷️ ${product.brand}` : '', priceLine ? `💰 *${price}*` : '',
        !selectedVariant && product.colors?.length ? `🎨 ${product.colors.join(', ')}` : '',
        product.min_quantity ? `📋 A partir de ${product.min_quantity} un.` : '',
        product.allows_personalization ? `✅ Personalização disponível!` : '',
        stockInfo ? `✅ ${stockInfo}` : '', ``, `Aproveite! Estoque limitado 🚀`,
      ].filter(Boolean).join('\n');
      break;

    case 'informal':
    default:
      raw = [
        `${greeting} 😊`, ``,
        `Olha esse produto que separei pra você:`, ``,
        `*${product.name}*`,
        selectedVariant ? `🎨 *${selectedVariant.colorName}*` : '', ``,
        product.short_description || product.description
          ? (product.short_description || product.description || '').slice(0, 200) : '',
        ``,
        product.brand ? `Marca: ${product.brand}` : '', priceLine || '',
        !selectedVariant && product.colors?.length ? `Cores: ${product.colors.join(', ')}` : '',
        product.allows_personalization ? `Dá pra personalizar! ✨` : '',
        stockInfo?.includes('⚠️') ? stockInfo : '', ``, `O que achou? 😉`,
      ].filter(Boolean).join('\n');
      break;
  }

  // CT-45 — sem contato NÃO chamamos o helper: ele cairia no contato de
  // exemplo do preview ("João Silva"/"Sua Empresa") e mostraria dados que não
  // existem, em vez do fallback "Olá!".
  if (!contact || extractVariables(raw).length === 0) return raw;
  return personalizePreview(raw, contact);
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

// ─── Downloads (CT-39) ────────────────────────────────────────
/**
 * CT-39 — baixa uma foto de verdade.
 *
 * O atributo `download` do `<a>` é IGNORADO quando a URL é cross-origin (as
 * fotos vêm de imagedelivery.net), então o clique só abriria a imagem numa
 * aba e o toast "Download iniciado" mentiria. Aqui a foto vira Blob via
 * `fetch` e desce por uma object URL (mesma técnica do export CSV, CT-20).
 * Sem CORS/!ok devolve `false` — o chamador decide o aviso, sem prometer
 * download que não houve.
 */
export async function downloadImageAsBlob(url: string, filename: string): Promise<boolean> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return false;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}
