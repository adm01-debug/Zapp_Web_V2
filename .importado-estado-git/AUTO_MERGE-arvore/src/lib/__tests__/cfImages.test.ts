/**
 * E37 — contrato do helper de srcSet do Cloudflare Images.
 *
 * Antes desta etapa o helper vivia privado dentro de `catalogShared.tsx`, então o Inbox não
 * tinha como usar as variantes. Este teste fixa o contrato que o catálogo já usava e que o
 * Inbox passa a usar: emitir srcSet **somente** quando a URL for do CF Images.
 */
import { describe, expect, it } from 'vitest';
import { CF_IMAGES_HOST, cfImagesSrcSet } from '../cfImages';

const CF_URL =
  'https://imagedelivery.net/AbCdEf123/2f8a1c5e-9b3d-4a71-8c22-1e4f6a9b0c33/public';

describe('cfImagesSrcSet (E37)', () => {
  it('emite srcSet com as variantes do CF Images, em w', () => {
    const srcSet = cfImagesSrcSet(CF_URL);
    expect(srcSet).not.toBeNull();
    const base = 'https://imagedelivery.net/AbCdEf123/2f8a1c5e-9b3d-4a71-8c22-1e4f6a9b0c33';
    // thumbnail 150, small 300, card 400, medium 600, large 1200 — 'public' sai por ser o mesmo
    // byte a byte de 'medium' e duplicar o w.
    expect(srcSet!.split(', ')).toEqual([
      `${base}/thumbnail 150w`,
      `${base}/small 300w`,
      `${base}/card 400w`,
      `${base}/medium 600w`,
      `${base}/large 1200w`,
    ]);
    expect(srcSet).not.toContain('/public ');
  });

  it('devolve null fora do CF Images — é o que torna seguro aplicar no Inbox', () => {
    // Mídia do Inbox: WhatsApp/Evolution e Supabase Storage. Nenhuma é CF.
    expect(cfImagesSrcSet('https://evolution.exemplo.com/media/abc.jpg')).toBeNull();
    expect(
      cfImagesSrcSet('https://tnnnlkbymytvtqngbbqh.supabase.co/storage/v1/object/sign/a.jpg')
    ).toBeNull();
    expect(cfImagesSrcSet('https://cdn.exemplo.com/imagedelivery.net/x/y/public')).toBeNull();
  });

  it('devolve null para URL inválida ou sem a variante no caminho', () => {
    expect(cfImagesSrcSet('nao-e-url')).toBeNull();
    expect(cfImagesSrcSet('')).toBeNull();
    // [accountHash, imageId] sem variante: não há como montar as variantes
    expect(cfImagesSrcSet('https://imagedelivery.net/AbCdEf123/2f8a1c5e')).toBeNull();
  });

  it('preserva o host do CF como constante nomeada', () => {
    expect(CF_IMAGES_HOST).toBe('imagedelivery.net');
  });
});
