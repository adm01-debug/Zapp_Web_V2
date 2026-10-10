import { describe, expect, it } from 'vitest';
import {
  formatTalkXOpenRoute,
  formatTalkXTabRoute,
  goTab,
  parseTalkXRoute,
  parseTalkXWizardRoute,
  parseTalkXScreenRoute,
  formatTalkXRoute,
  replaceTalkXRoute,
  screenForStatus,
  type TalkXRoute,
} from '@/components/talkx/talkxRoute';

describe('Talk X route contract (X052)', () => {
  it('sem parâmetros abre a Visão geral e não normaliza nada', () => {
    const parsed = parseTalkXRoute('');
    expect(parsed.tab).toBe('overview');
    expect(parsed.sub).toBeUndefined();
    expect(parsed.needsNormalization).toBe(false);
  });

  it('lê a aba e a sub-visão gravadas', () => {
    const parsed = parseTalkXRoute('?view=talkx&tab=analytics&sub=configuracoes');
    expect(parsed.tab).toBe('analytics');
    expect(parsed.sub).toBe('configuracoes');
    expect(parsed.needsNormalization).toBe(false);
  });

  it('tab=campaigns é alias de overview', () => {
    const parsed = parseTalkXRoute('?view=talkx&tab=campaigns');
    expect(parsed.tab).toBe('overview');
    expect(parsed.needsNormalization).toBe(false);
  });

  it('aba duplicada ou desconhecida não escolhe aba por conta própria', () => {
    const duplicated = parseTalkXRoute('?view=talkx&tab=analytics&tab=suppression');
    expect(duplicated.tab).toBe('overview');
    expect(duplicated.needsNormalization).toBe(true);

    const unknown = parseTalkXRoute('?view=talkx&tab=campanhas');
    expect(unknown.tab).toBe('overview');
    expect(unknown.needsNormalization).toBe(true);
  });

  it('sub duplicado ou vazio é rejeitado', () => {
    const duplicated = parseTalkXRoute('?view=talkx&tab=analytics&sub=a&sub=b');
    expect(duplicated.sub).toBeUndefined();
    expect(duplicated.needsNormalization).toBe(true);

    const empty = parseTalkXRoute('?view=talkx&tab=analytics&sub=');
    expect(empty.sub).toBeUndefined();
    expect(empty.needsNormalization).toBe(true);
  });

  it('lê o item aberto da URL e rejeita o duplicado', () => {
    expect(parseTalkXRoute('?view=talkx&campaign=c1').campaign).toBe('c1');
    expect(parseTalkXRoute('?view=talkx&segment=s1').segment).toBe('s1');
    expect(parseTalkXRoute('?view=talkx&template=t1').template).toBe('t1');

    const duplicated = parseTalkXRoute('?view=talkx&campaign=c1&campaign=c2');
    expect(duplicated.campaign).toBeUndefined();
    expect(duplicated.needsNormalization).toBe(true);

    const empty = parseTalkXRoute('?view=talkx&segment=');
    expect(empty.segment).toBeUndefined();
    expect(empty.needsNormalization).toBe(true);
  });

  it('mantém os parâmetros do wizard com um dono só', () => {
    expect(parseTalkXRoute('?view=talkx&wizard=draft_1&step=2').wizard).toEqual({
      route: { campaignId: 'draft_1', step: 2 },
      needsNormalization: false,
    });
    // O sinal do wizard é dele: um `step` duplicado não vira normalização do parser de aba.
    expect(parseTalkXRoute('?view=talkx&wizard=draft_1&step=1&step=2')).toEqual(
      expect.objectContaining({
        tab: 'overview',
        needsNormalization: false,
        wizard: { route: null, needsNormalization: true },
      }),
    );
    expect(parseTalkXWizardRoute('?view=talkx&wizard=one&wizard=two&step=1')).toEqual({
      route: null,
      needsNormalization: true,
    });
  });

  it('escreve a aba canônica e limpa a sub-visão que não acompanha', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=campaigns&sub=configuracoes#aba');
    expect(formatTalkXTabRoute(source, { tab: 'overview' })).toBe('/?view=talkx&tab=overview#aba');
    expect(formatTalkXTabRoute(source, { tab: 'analytics', sub: 'configuracoes' })).toBe(
      '/?view=talkx&tab=analytics&sub=configuracoes#aba',
    );
  });

  it('goTab grava a aba canônica mesmo recebendo o alias', () => {
    window.history.replaceState(null, '', '/?view=talkx');

    goTab('campaigns');
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('overview');

    goTab('analytics', 'configuracoes');
    expect(new URLSearchParams(window.location.search).get('sub')).toBe('configuracoes');
  });

  it('escreve um item aberto por vez e sabe limpá-lo', () => {
    const source = new URL('https://zapp.example/?view=talkx&tab=segments&segment=s1');
    expect(formatTalkXOpenRoute(source, { kind: 'campaign', id: 'c9' })).toBe(
      '/?view=talkx&tab=segments&campaign=c9',
    );
    expect(formatTalkXOpenRoute(source, null)).toBe('/?view=talkx&tab=segments');
  });
});

describe('Talk X screen routing (TL-152)', () => {
  it('sem parâmetros de tela retorna rota nula', () => {
    const parsed = parseTalkXScreenRoute('');
    expect(parsed.route).toBeNull();
    expect(parsed.needsNormalization).toBe(false);
  });

  it('lê campaign e screen válidos', () => {
    const parsed = parseTalkXScreenRoute('?campaign=cmp_1&screen=monitor');
    expect(parsed.route).toEqual({ campaignId: 'cmp_1', screen: 'monitor' });
    expect(parsed.needsNormalization).toBe(false);
  });

  it('screen omitido significa que a situação decide', () => {
    const parsed = parseTalkXScreenRoute('?campaign=cmp_1');
    expect(parsed.route).toEqual({ campaignId: 'cmp_1' });
    expect(parsed.needsNormalization).toBe(false);
  });

  it('campaign duplicado ou vazio é normalização', () => {
    const duplicated = parseTalkXScreenRoute('?campaign=cmp_1&campaign=cmp_2');
    expect(duplicated.route).toBeNull();
    expect(duplicated.needsNormalization).toBe(true);

    const empty = parseTalkXScreenRoute('?campaign=');
    expect(empty.route).toBeNull();
    expect(empty.needsNormalization).toBe(true);
  });

  it('screen desconhecido é normalização (não abre campanha)', () => {
    const unknown = parseTalkXScreenRoute('?campaign=cmp_1&screen=invalid');
    expect(unknown.route).toBeNull();
    expect(unknown.needsNormalization).toBe(true);
  });

  it('campaign malformado é normalização', () => {
    const malformed = parseTalkXScreenRoute('?campaign=!@#&screen=monitor');
    expect(malformed.route).toBeNull();
    expect(malformed.needsNormalization).toBe(true);
  });

  it('?screen=help não conta como normalização', () => {
    const help = parseTalkXScreenRoute('?screen=help');
    expect(help.route).toBeNull();
    expect(help.needsNormalization).toBe(false);
  });

  it('formatTalkXRoute escreve campaign e screen', () => {
    const source = new URL('https://zapp.example/talkx');
    expect(formatTalkXRoute(source, { campaignId: 'cmp_1', screen: 'monitor' })).toBe(
      '/talkx?campaign=cmp_1&screen=monitor',
    );
  });

  it('formatTalkXRoute limpa screen quando não informado', () => {
    const source = new URL('https://zapp.example/talkx?campaign=cmp_1&screen=monitor');
    expect(formatTalkXRoute(source, { campaignId: 'cmp_1' })).toBe(
      '/talkx?campaign=cmp_1',
    );
  });

  it('formatTalkXRoute limpa tudo quando rota é null', () => {
    const source = new URL('https://zapp.example/talkx?campaign=cmp_1&screen=monitor');
    expect(formatTalkXRoute(source, null)).toBe('/talkx');
  });

  it('replaceTalkXRoute escreve a rota canônica', () => {
    window.history.replaceState(null, '', '/talkx?campaign=cmp_1&screen=monitor');
    replaceTalkXRoute({ campaignId: 'cmp_1', screen: 'monitor' });
    expect(window.location.search).toBe('?campaign=cmp_1&screen=monitor');
  });

  it('screenForStatus mapeia situações às telas corretas', () => {
    expect(screenForStatus('draft')).toBe('wizard');
    expect(screenForStatus('scheduled')).toBe('scheduled');
    expect(screenForStatus('sending')).toBe('running');
    expect(screenForStatus('paused')).toBe('running');
    expect(screenForStatus('completed')).toBe('report');
    expect(screenForStatus('cancelled')).toBe('report');
    expect(screenForStatus(null)).toBe('monitor');
    expect(screenForStatus(undefined)).toBe('monitor');
    expect(screenForStatus('unknown')).toBe('monitor');
  });
});
