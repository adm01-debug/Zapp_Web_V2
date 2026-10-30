import { describe, expect, it } from 'vitest';

import { normalizeMediaUrl } from '../normalizeMediaUrl';

// O esperado vem da REGRA documentada (URL de mídia do CRM/WhatsApp chega com
// espaços, aspas coladas e barra duplicada), não de uma cópia do código.
describe('normalizeMediaUrl', () => {
  it('vazio, nulo e indefinido viram string vazia', () => {
    expect(normalizeMediaUrl(undefined)).toBe('');
    expect(normalizeMediaUrl(null)).toBe('');
    expect(normalizeMediaUrl('')).toBe('');
    expect(normalizeMediaUrl('   ')).toBe('');
  });

  it('remove espaços nas pontas e aspas envolvendo a URL', () => {
    expect(normalizeMediaUrl('  https://x.supabase.co/a.jpg  ')).toBe('https://x.supabase.co/a.jpg');
    expect(normalizeMediaUrl('"https://x.supabase.co/a.jpg"')).toBe('https://x.supabase.co/a.jpg');
  });

  it('conserta a barra que vem depois do domínio quando há aspas coladas', () => {
    expect(normalizeMediaUrl('https://x.supabase.co"/b.jpg')).toBe('https://x.supabase.co/b.jpg');
  });

  it('colapsa barra duplicada sem tocar no protocolo', () => {
    expect(normalizeMediaUrl('https://x.supabase.co//storage/v1//obj.jpg')).toBe(
      'https://x.supabase.co/storage/v1/obj.jpg',
    );
    expect(normalizeMediaUrl('http://a.com//b')).toBe('http://a.com/b');
  });

  it('preserva URL já limpa e data URL (base64) com barra simples', () => {
    expect(normalizeMediaUrl('https://a.com')).toBe('https://a.com');
    expect(normalizeMediaUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });
});
