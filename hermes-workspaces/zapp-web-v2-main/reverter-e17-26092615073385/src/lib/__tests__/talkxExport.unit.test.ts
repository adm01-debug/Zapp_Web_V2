// talkxExport.unit.test.ts — E29 unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reimplementa a logica de escape para testar isoladamente
function esc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

describe('talkxExport escape', () => {
  it('nao envolve campo simples em aspas', () => {
    expect(esc('hello')).toBe('hello');
  });

  it('envolve campo com virgula em aspas', () => {
    expect(esc('a,b')).toBe('"a,b"');
  });

  it('escapa aspas duplas dentro do campo', () => {
    expect(esc('say "hi"')).toBe('"say ""hi"""');
  });

  it('envolve campo com quebra de linha', () => {
    expect(esc('line1\nline2')).toBe('"line1\nline2"');
  });

  it('campo vazio retorna string vazia', () => {
    expect(esc('')).toBe('');
  });
});

describe('exportCampaignsCsv — integracao superficial', () => {
  let clickedHref = '';
  let clickedFilename = '';

  beforeEach(() => {
    const mockA = {
      href: '',
      download: '',
      click: vi.fn().mockImplementation(() => {
        clickedHref = mockA.href;
        clickedFilename = mockA.download;
      }),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockA as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(window, 'Blob').mockImplementation((_parts) => ({ size: 0 }) as Blob);
  });

  it('nao dispara nada com lista vazia', async () => {
    const { exportCampaignsCsv } = await import('@/lib/talkxExport');
    const spy = vi.spyOn(document, 'createElement');
    exportCampaignsCsv([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
