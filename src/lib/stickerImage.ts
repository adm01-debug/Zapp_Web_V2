/**
 * Item 069 (bloco Inbox/Chat 065-070) — conversão da figurinha para WebP no
 * cliente, ANTES de ela virar objeto do bucket `stickers`.
 *
 * O WhatsApp só aceita figurinha em WebP (`docs/COMPLETE_SYSTEM_FEATURES.md:157`
 * — "Stickers: WebP (max 100KB)") e a Evolution GO recusa o envio quando o
 * objeto guardado não é WebP. O seletor aceita `image/webp,image/png,image/gif,
 * image/jpeg` na entrada (src/components/inbox/StickerPicker.tsx:54) e subia os
 * bytes ORIGINAIS: o PNG escolhido ficava gravado como `..._<uuid>.png` +
 * `contentType: image/png` e só falhava na hora de enviar.
 *
 * A conversão usa só o que o navegador já tem — `createImageBitmap` para
 * decodificar e `OffscreenCanvas` (com o canvas do DOM como reserva) para
 * codificar —, então não entra dependência nova. Qualquer falha devolve o
 * ARQUIVO ORIGINAL: converter é melhoria do caminho, nunca motivo para o
 * usuário não conseguir subir a figurinha.
 *
 * Os tetos de tamanho dos seletores (500KB no picker do chat, 10MB na pasta
 * pessoal) NÃO mudam aqui — este módulo só cuida do formato.
 */
import { log } from '@/lib/logger';

/** MIME da figurinha aceita pelo WhatsApp/Evolution GO. */
export const STICKER_WEBP_TYPE = 'image/webp';

/** Lado máximo da figurinha (padrão do WhatsApp); o excedente é reduzido. */
export const STICKER_MAX_DIMENSION = 512;

/** Qualidade do WebP: figurinha é pequena, não vale destruir a borda. */
const QUALIDADE_WEBP = 0.85;

/**
 * A imagem precisa de conversão? GIF fica de fora de propósito: o canvas
 * devolveria só o primeiro quadro e a figurinha animada perderia a animação —
 * isso exigiria uma lib de WebP animado, que este cartão não pode adicionar.
 * WebP já está no formato aceito e não é reencodado (não se perde qualidade).
 */
export function precisaConverterParaWebp(file: File): boolean {
  return (
    file.type.startsWith('image/') &&
    file.type !== STICKER_WEBP_TYPE &&
    file.type !== 'image/gif'
  );
}

/** `figurinha.PNG` → `figurinha.webp` (sem extensão também vira `.webp`). */
export function nomeComExtensaoWebp(nome: string): string {
  const semExtensao = nome.replace(/\.[^.]+$/, '');
  return `${semExtensao || 'figurinha'}.webp`;
}

/** Reduz para o lado máximo preservando a proporção (nunca abaixo de 1px). */
export function dimensoesDaFigurinha(
  largura: number,
  altura: number,
  max: number = STICKER_MAX_DIMENSION,
): { width: number; height: number } {
  if (largura <= max && altura <= max) return { width: largura, height: altura };
  const proporcao = Math.min(max / largura, max / altura);
  return {
    width: Math.max(1, Math.round(largura * proporcao)),
    height: Math.max(1, Math.round(altura * proporcao)),
  };
}

/** Navegador que não sabe codificar WebP devolve PNG; isso não pode virar objeto rotulado de webp. */
function aceitarSeWebp(blob: Blob | null): Blob | null {
  return blob && blob.type === STICKER_WEBP_TYPE ? blob : null;
}

async function codificarWebp(origem: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(origem, 0, 0, width, height);
    return aceitarSeWebp(await canvas.convertToBlob({ type: STICKER_WEBP_TYPE, quality: QUALIDADE_WEBP }));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.toBlob !== 'function') return null;
  ctx.drawImage(origem, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, STICKER_WEBP_TYPE, QUALIDADE_WEBP);
  });
  return aceitarSeWebp(blob);
}

/**
 * Devolve a figurinha em WebP — ou o próprio `file`, sem alterar nada, quando
 * ela já é WebP/GIF ou quando o ambiente não permite converter.
 */
export async function converterFigurinhaParaWebp(file: File): Promise<File> {
  if (!precisaConverterParaWebp(file)) return file;
  // Sem `createImageBitmap` não há decodificação confiável: segue o original.
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) return file;
    const { width, height } = dimensoesDaFigurinha(bitmap.width, bitmap.height);
    const blob = await codificarWebp(bitmap, width, height);
    if (!blob) return file;
    return new File([blob], nomeComExtensaoWebp(file.name), { type: STICKER_WEBP_TYPE });
  } catch (err) {
    log.error('[StickerImage] Falha ao converter figurinha para WebP; seguindo com o arquivo original', err);
    return file;
  } finally {
    bitmap?.close?.();
  }
}
