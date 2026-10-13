import { describe, expect, it } from 'vitest';
import { normalizeMediaUrl } from '../normalizeMediaUrl';

/** Entradas vazias / inválidas */
describe('normalizeMediaUrl — entradas vazias ou invalidas', () => {
  it('devolve string vazia para undefined, null e string vazia', () => {
    expect(normalizeMediaUrl(undefined)).toBe('');
    expect(normalizeMediaUrl(null)).toBe('');
    expect(normalizeMediaUrl('')).toBe('');
  });

  it('nao lanca com valor que nao e string (antes: url.trim is not a function)', () => {
    // @ts-expect-error contrato defensivo: valor bruto do banco pode nao ser string
    expect(normalizeMediaUrl(123)).toBe('');
    // @ts-expect-error idem
    expect(normalizeMediaUrl({ url: 'https://x.supabase.co/a' })).toBe('');
  });
});

describe('normalizeMediaUrl — espacos e aspas soltas', () => {
  it('remove espacos das pontas', () => {
    expect(normalizeMediaUrl('  https://example.com/f.jpg  ')).toBe('https://example.com/f.jpg');
  });

  it('remove aspas duplas nas pontas', () => {
    expect(normalizeMediaUrl('"https://example.com/f.jpg"')).toBe('https://example.com/f.jpg');
    expect(normalizeMediaUrl('""https://example.com/f.jpg')).toBe('https://example.com/f.jpg');
  });
});

describe('normalizeMediaUrl — artefato de serializacao JSON', () => {
  it('corrige o .supabase.co"/ deixado pelo JSON', () => {
    expect(normalizeMediaUrl('https://xyz.supabase.co"/storage/v1/object/a.png'))
      .toBe('https://xyz.supabase.co/storage/v1/object/a.png');
  });

  it('corrige o host auto-hospedado .atomicabr.com.br"/', () => {
    expect(normalizeMediaUrl('https://cdn.atomicabr.com.br"/storage/media/audio.ogg'))
      .toBe('https://cdn.atomicabr.com.br/storage/media/audio.ogg');
  });
});

describe('normalizeMediaUrl — barras duplicadas', () => {
  it('colapsa /// no caminho', () => {
    expect(normalizeMediaUrl('https://x.supabase.co///storage/a.png'))
      .toBe('https://x.supabase.co/storage/a.png');
  });

  it('colapsa // repetidos no caminho', () => {
    expect(normalizeMediaUrl('https://example.com//storage//file.jpg'))
      .toBe('https://example.com/storage/file.jpg');
  });

  it('NAO colapsa o // do protocolo', () => {
    expect(normalizeMediaUrl('https://example.com/file.jpg')).toBe('https://example.com/file.jpg');
  });

  it('mantem URL limpa intacta (inclusive query)', () => {
    const url = 'https://storage.example.com/bucket/file.mp4?token=abc123';
    expect(normalizeMediaUrl(url)).toBe(url);
  });
});
