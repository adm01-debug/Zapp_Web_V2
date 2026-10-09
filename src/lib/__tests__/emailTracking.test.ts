import { describe, expect, it } from 'vitest';
import {
  EMAIL_TRACKING_PIXEL_ATTR,
  buildEmailTrackingLinkUrl,
  buildEmailTrackingPixelHtml,
  buildEmailTrackingPixelUrl,
  resolveTrackingToken,
  stripEmailTrackingPixels,
} from '../emailTracking';

const MESSAGE_ID = '3f1c9d20-6b47-4a5e-9f0b-7c2d8e1a4b60';
const BASE = 'https://projeto.supabase.co';

describe('emailTracking (item 082 — metade cliente)', () => {
  it('aceita só o id UUID da mensagem como token opaco e normaliza a caixa', () => {
    expect(resolveTrackingToken(MESSAGE_ID)).toBe(MESSAGE_ID);
    expect(resolveTrackingToken(`  ${MESSAGE_ID.toUpperCase()}  `)).toBe(MESSAGE_ID);
  });

  it('recusa qualquer token que carregue PII do destinatário', () => {
    expect(resolveTrackingToken('cliente@empresa.com.br')).toBeNull();
    expect(resolveTrackingToken('msg-123')).toBeNull();
    expect(resolveTrackingToken('')).toBeNull();
    expect(resolveTrackingToken(undefined)).toBeNull();
    expect(resolveTrackingToken(`${MESSAGE_ID}\r\nBcc: espiao@empresa.com.br`)).toBeNull();
  });

  it('monta a URL do pixel sem nenhum dado do destinatário', () => {
    const url = buildEmailTrackingPixelUrl({ baseUrl: BASE, messageId: MESSAGE_ID });
    expect(url).toBe(`${BASE}/functions/v1/email-track-pixel?m=${MESSAGE_ID}`);
    expect(url).not.toContain('@');
  });

  it('não monta pixel quando o id não é UUID (nunca emite PII na URL)', () => {
    expect(buildEmailTrackingPixelUrl({ baseUrl: BASE, messageId: 'cliente@empresa.com.br' })).toBeNull();
    expect(buildEmailTrackingPixelUrl({ baseUrl: '', messageId: MESSAGE_ID })).toBeNull();
  });

  it('emite o pixel 1x1 marcado, para poder removê-lo depois', () => {
    const html = buildEmailTrackingPixelHtml({ baseUrl: BASE, messageId: MESSAGE_ID });
    expect(html).not.toBeNull();
    expect(html).toContain('<img ');
    expect(html).toContain('width="1"');
    expect(html).toContain('height="1"');
    expect(html).toContain(`${EMAIL_TRACKING_PIXEL_ATTR}="open"`);
    expect(html).toContain(`src="${BASE}/functions/v1/email-track-pixel?m=${MESSAGE_ID}"`);
    expect(buildEmailTrackingPixelHtml({ baseUrl: BASE, messageId: 'não-é-uuid' })).toBeNull();
  });

  it('só embrulha alvo absoluto http(s) — barra esquema perigoso e URL relativa', () => {
    const url = buildEmailTrackingLinkUrl({
      baseUrl: BASE,
      messageId: MESSAGE_ID,
      target: 'https://loja.com.br/pedido?id=9',
    });
    expect(url).toBe(
      `${BASE}/functions/v1/email-track-link?m=${MESSAGE_ID}&u=${encodeURIComponent('https://loja.com.br/pedido?id=9')}`,
    );
    expect(buildEmailTrackingLinkUrl({ baseUrl: BASE, messageId: MESSAGE_ID, target: 'javascript:alert(1)' })).toBeNull();
    expect(buildEmailTrackingLinkUrl({ baseUrl: BASE, messageId: MESSAGE_ID, target: 'data:text/html,<b>x</b>' })).toBeNull();
    expect(buildEmailTrackingLinkUrl({ baseUrl: BASE, messageId: MESSAGE_ID, target: '/caminho-relativo' })).toBeNull();
    expect(buildEmailTrackingLinkUrl({ baseUrl: BASE, messageId: 'cliente@empresa.com.br', target: 'https://loja.com.br' })).toBeNull();
  });

  it('remove só o pixel marcado (para responder/encaminhar sem rastrear de novo)', () => {
    const html = `<div>oi</div>${buildEmailTrackingPixelHtml({ baseUrl: BASE, messageId: MESSAGE_ID })}<img src="https://loja.com.br/logo.png" alt="logo">`;
    const once = stripEmailTrackingPixels(html);
    expect(once).toBe('<div>oi</div><img src="https://loja.com.br/logo.png" alt="logo">');
    expect(stripEmailTrackingPixels(once)).toBe(once);
  });
});
