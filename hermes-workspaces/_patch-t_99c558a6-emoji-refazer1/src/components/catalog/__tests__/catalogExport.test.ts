import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CATALOG_EXPORT_BOM,
  PROMOGIFTS_BASE_URL,
  esc,
  promogiftsProductUrl,
  triggerCsvDownload,
} from '../catalogExport';

// A exportação CSV do catálogo (CT-20/CT-21/CT-28) saiu do produto. O módulo
// ficou com as primitivas ainda consumidas por outros caminhos: `esc`/BOM (CSV
// do histórico de envios), `promogiftsProductUrl` (link público do card e do
// rail) e `triggerCsvDownload` (única porta de gravação, com o gate de
// `profiles.can_download`). Os casos abaixo cobrem só o que sobrou.

describe('esc (escape CSV)', () => {
  it('deixa passar valor simples', () => {
    expect(esc('Caneta')).toBe('Caneta');
  });

  it('envolve em aspas quando ha virgula, aspas ou quebra de linha', () => {
    expect(esc('Caneta, azul')).toBe('"Caneta, azul"');
    expect(esc('Caneta "premium"')).toBe('"Caneta ""premium"""');
    expect(esc('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(esc('a\r\nb')).toBe('"a\r\nb"');
  });

  it('null/undefined viram vazio (nunca a string "null")', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });

  it('converte numero e booleano', () => {
    expect(esc(3.9)).toBe('3.9');
    expect(esc(true)).toBe('true');
  });
});

describe('promogiftsProductUrl', () => {
  it('sem slug nao inventa link', () => {
    expect(promogiftsProductUrl(null)).toBe('');
    expect(promogiftsProductUrl('copos')).toBe(`${PROMOGIFTS_BASE_URL}/copos`);
  });
});

describe('download real (Blob + link)', () => {
  const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:mock-url');
  const revokeObjectURL = vi.fn((_url: string) => undefined);

  beforeEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    // jsdom nao navega: o click do <a download> so precisa existir.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('baixa um text/csv com o nome pedido e revoga a URL', async () => {
    // Y29 — a permissão é do chamador (`useDownloadPermission`); aqui, concedida.
    triggerCsvDownload(`${CATALOG_EXPORT_BOM}A,B\n1,2`, 'catalogo_todos_20260101.csv', true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    // O BOM tem de estar nos BYTES do arquivo (é o que o Excel lê): Blob.text()
    // remove o BOM ao decodificar, então a prova é no arrayBuffer.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(`${CATALOG_EXPORT_BOM}A,B\n1,2`);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download="catalogo_todos_20260101.csv"]')).toBeNull();
  });
});
