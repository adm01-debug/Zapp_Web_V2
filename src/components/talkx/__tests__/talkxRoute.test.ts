import { describe, expect, it } from 'vitest';
import { formatTalkXRoute, parseTalkXRoute, screenForStatus } from '@/components/talkx/talkxRoute';

describe('Talk X campaign route contract (X143)', () => {
  it('round-trips a campaign screen while preserving unrelated query and hash state', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=overview#main-content');
    const path = formatTalkXRoute(source, { campaignId: 'cmp_1', screen: 'running' });

    expect(path).toBe('/?view=talkx&tab=overview&campaign=cmp_1&screen=running#main-content');
    expect(parseTalkXRoute(new URL(path, source).search)).toEqual({
      route: { campaignId: 'cmp_1', screen: 'running' },
      needsNormalization: false,
    });
  });

  it('aceita ?campaign= sem ?screen= (a situação decide) e limpa os dois ao sair', () => {
    expect(parseTalkXRoute('?view=talkx&campaign=cmp_1')).toEqual({
      route: { campaignId: 'cmp_1' }, needsNormalization: false,
    });

    const source = new URL('https://zapp.example/?view=talkx&campaign=cmp_1&screen=monitor&tab=templates');
    expect(formatTalkXRoute(source, null)).toBe('/?view=talkx&tab=templates');
  });

  it('rejects duplicated, foreign-view, and malformed campaign routes', () => {
    for (const search of [
      '?view=talkx&campaign=one&campaign=two&screen=monitor',
      '?view=talkx&campaign=cmp_1&screen=monitor&screen=running',
      '?view=inbox&campaign=cmp_1&screen=monitor',
      '?view=talkx&campaign=not/a/campaign',
      '?view=talkx&screen=monitor',
    ]) {
      expect(parseTalkXRoute(search)).toEqual({ route: null, needsNormalization: true });
    }
  });

  it('cai na situação da campanha quando a tela do endereço não existe', () => {
    expect(parseTalkXRoute('?view=talkx&campaign=cmp_1&screen=carrossel')).toEqual({
      route: { campaignId: 'cmp_1' }, needsNormalization: true,
    });
  });

  it('não mexe na URL quando não há campanha no endereço', () => {
    expect(parseTalkXRoute('?view=talkx&tab=overview')).toEqual({ route: null, needsNormalization: false });
  });

  it('a situação da campanha decide a tela de acompanhamento', () => {
    expect(screenForStatus('draft')).toBe('wizard');
    expect(screenForStatus('scheduled')).toBe('scheduled');
    expect(screenForStatus('sending')).toBe('running');
    expect(screenForStatus('paused')).toBe('running');
    expect(screenForStatus('completed')).toBe('report');
    expect(screenForStatus('cancelled')).toBe('report');
    expect(screenForStatus('desconhecido')).toBe('monitor');
  });
});
