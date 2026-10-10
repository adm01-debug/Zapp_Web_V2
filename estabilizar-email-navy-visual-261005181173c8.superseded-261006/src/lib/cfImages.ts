/**
 * E37 — srcSet do Cloudflare Images fora do catálogo.
 *
 * O helper vivia privado dentro de `catalogShared.tsx` (usado só pelo `ProductThumb`), então
 * nenhum outro ponto do app — em especial o Inbox — conseguia usar as variantes do CF Images.
 * Aqui ele passa a ser exportado, sem mudança de comportamento.
 *
 * Devolver `null` fora do CF Images é o que torna a aplicação segura em qualquer `<img>`: um
 * componente não precisa saber de onde vem a URL.
 */

export const CF_IMAGES_HOST = 'imagedelivery.net';

/**
 * Variantes reais do Cloudflare Images da conta, confirmadas via CF Images API em 2026-09-12
 * (todas JPEG): thumbnail 150×150, small 300×300, card 400×400, medium/public 600×600,
 * large 1200×1200.
 */
export const CF_VARIANT_WIDTHS: Record<string, number> = {
  thumbnail: 150,
  small: 300,
  card: 400,
  medium: 600,
  public: 600,
  large: 1200,
};

/**
 * Monta o `srcSet` das variantes do CF Images para uma URL de imagem. Devolve `null` quando a
 * URL não é do CF Images (WhatsApp/Evolution, Supabase Storage, data:, etc.), quando é inválida
 * ou quando o caminho não tem a variante — nesses casos o `<img>` deve seguir com o `src` puro.
 */
export function cfImagesSrcSet(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== CF_IMAGES_HOST) return null;
  const parts = parsed.pathname.split('/').filter(Boolean); // [accountHash, imageId, variant]
  if (parts.length < 3) return null;
  const base = `${parsed.origin}/${parts.slice(0, -1).join('/')}`;
  return Object.entries(CF_VARIANT_WIDTHS)
    .filter(([variant]) => variant !== 'public') // 'public' == 'medium' (mesmo byte a byte); evita w duplicado
    .map(([variant, w]) => `${base}/${variant} ${w}w`)
    .join(', ');
}
