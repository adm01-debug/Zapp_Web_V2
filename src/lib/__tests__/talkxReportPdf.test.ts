import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTalkXReportPdf } from '../talkxReportPdf';

describe('talkxReportPdf (X168)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gera PDF com 2+ páginas sem chamar window.print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const rows = Array.from({ length: 120 }, (_, i) => [`Campanha ${i}`, i]);
    const blob = await buildTalkXReportPdf({
      title: 'Relatório',
      kpis: [{ label: 'Enviados', value: '10' }],
      sections: [{ title: 'Campanhas', headers: ['Nome', 'Enviados'], rows }],
    });
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(print).not.toHaveBeenCalled();
  });

  it('cancelar aborta antes de montar', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(buildTalkXReportPdf({ title: 'x', kpis: [], sections: [] }, ctrl.signal)).rejects.toThrow();
  });
});
