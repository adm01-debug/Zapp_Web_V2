import { describe, expect, it } from 'vitest';
import { formatTalkXSegmentsRoute, parseTalkXSegmentsRoute } from '@/components/talkx/segments/talkxSegmentsRoute';

/**
 * X111 — contrato do endereço da tela de segmentos (tela 03): ler e escrever o
 * segmento aberto, voltar/avançar do navegador e parâmetro inválido caindo na
 * biblioteca.
 */
describe('Talk X segments route contract (X111)', () => {
  it('round-trips the open segment while preserving unrelated query and hash state', () => {
    const source = new URL('https://zapp.example/?view=talkx&sub=previa&filter=mine#main');
    const path = formatTalkXSegmentsRoute(source, { segmentId: 'seg_1', mode: 'edit' });

    expect(path).toBe('/?view=talkx&sub=previa&filter=mine&tab=segments&segment=seg_1&mode=edit#main');
    expect(parseTalkXSegmentsRoute(new URL(path, source).search)).toEqual({
      route: { segmentId: 'seg_1', mode: 'edit' },
      needsNormalization: false,
    });
  });

  it('completes a segment address without an explicit mode as edit', () => {
    expect(parseTalkXSegmentsRoute('?view=talkx&tab=segments&segment=seg_1')).toEqual({
      route: { segmentId: 'seg_1', mode: 'edit' },
      needsNormalization: true,
    });
  });

  it('opens the empty builder for mode=new and writes it back', () => {
    expect(parseTalkXSegmentsRoute('?view=talkx&tab=segments&mode=new')).toEqual({
      route: { segmentId: null, mode: 'new' },
      needsNormalization: false,
    });
    const source = new URL('https://zapp.example/?view=talkx&tab=segments&segment=seg_1&mode=edit');
    expect(formatTalkXSegmentsRoute(source, { segmentId: null, mode: 'new' }))
      .toBe('/?view=talkx&tab=segments&mode=new');
  });

  it('falls back to the library for every invalid parameter', () => {
    for (const search of [
      '?view=talkx&tab=segments&segment=seg_1&mode=duplicar',
      '?view=talkx&tab=segments&mode=edit',
      '?view=talkx&tab=segments&mode=new&segment=seg_1',
      '?view=talkx&tab=segments&segment=not/a/segment&mode=edit',
      '?view=inbox&tab=segments&segment=seg_1&mode=edit',
      '?view=talkx&tab=overview&segment=seg_1&mode=edit',
      '?view=talkx&tab=segments&segment=one&segment=two&mode=edit',
      '?view=talkx&tab=segments&segment=seg_1&mode=edit&mode=new',
    ]) {
      expect(parseTalkXSegmentsRoute(search)).toEqual({ route: null, needsNormalization: true });
    }
  });

  it('keeps the library as the untouched default state', () => {
    expect(parseTalkXSegmentsRoute('?view=talkx&tab=segments')).toEqual({ route: null, needsNormalization: false });
    expect(parseTalkXSegmentsRoute('')).toEqual({ route: null, needsNormalization: false });
  });

  it('cleans the segment state without deleting the segment tab', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=segments&segment=seg_1&mode=edit&sub=previa');
    expect(formatTalkXSegmentsRoute(source, null)).toBe('/?view=talkx&tab=segments&sub=previa');
  });
});
