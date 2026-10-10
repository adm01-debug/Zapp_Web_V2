import { describe, expect, it } from 'vitest';
import { MAX_EMAIL_ATTACHMENT_BYTES, normalizeEmailBase64, validateEmailAttachments } from '../emailAttachments';

describe('emailAttachments', () => {
  it('aceita conjunto dentro dos limites', () => {
    expect(validateEmailAttachments([new File(['ok'], 'documento.txt', { type: 'text/plain' })])).toBeNull();
  });

  it('rejeita total acima de 25 MB e nomes que permitiriam quebra MIME', () => {
    const large = new File([new Uint8Array(MAX_EMAIL_ATTACHMENT_BYTES + 1)], 'large.bin');
    expect(validateEmailAttachments([large])).toContain('25MB');
    expect(validateEmailAttachments([new File(['x'], 'bad\r\nname.txt')])).toContain('nome inválido');
  });

  it('normaliza base64url do Gmail para base64 padronizado', () => {
    expect(normalizeEmailBase64('AAEC_w')).toBe('AAEC/w==');
  });

  it('soma anexos originais e locais no limite agregado', () => {
    const local = new File(['x'], 'novo.txt', { type: 'text/plain' });
    expect(validateEmailAttachments([local], [{ name: 'original.bin', size: MAX_EMAIL_ATTACHMENT_BYTES }])).toContain('25MB');
  });
});
