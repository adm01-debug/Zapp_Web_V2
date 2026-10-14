/**
 * U7 (paridade V3→V2, doc 11) — `getFilename` de `media-gallery/mediaUtils.ts`
 * não tinha teste na V2 (a V3 tinha `media-gallery/__tests__/mediaUtils`, 6 casos para
 * esse helper).
 *
 * O esperado vem da semântica de URL (o último segmento do caminho), não da
 * implementação: URL completa, com query, relativa, só o arquivo, vazia e com barra final.
 */
import { describe, it, expect } from 'vitest';
import { getFilename } from '../media-gallery/mediaUtils';

describe('getFilename — nome do arquivo a partir da URL (U7)', () => {
  it('pega o último segmento de uma URL completa', () => {
    expect(getFilename('https://cdn.example.com/media/2026/relatorio.pdf')).toBe('relatorio.pdf');
  });

  it('ignora a query string (corta antes do "?")', () => {
    expect(getFilename('https://cdn.example.com/media/foto.png?token=abc&x=1')).toBe('foto.png');
  });

  it('ignora o hash', () => {
    expect(getFilename('https://cdn.example.com/media/foto.png#secao')).toBe('foto.png');
  });

  it('lida com caminho relativo (new URL lança e cai no split)', () => {
    expect(getFilename('pasta/subpasta/foto.png')).toBe('foto.png');
  });

  it('devolve o próprio nome quando só o arquivo é informado', () => {
    expect(getFilename('foto.png')).toBe('foto.png');
  });

  it('devolve "arquivo" para string vazia', () => {
    expect(getFilename('')).toBe('arquivo');
  });

  it('devolve "arquivo" quando a URL termina em barra (último segmento vazio)', () => {
    expect(getFilename('https://cdn.example.com/media/')).toBe('arquivo');
  });
});
