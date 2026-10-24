import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml, buildBodyPreview } from '@/lib/emailHtml';

describe('hardening auditoria 5-agentes (F1-F3, B1, B2)', () => {
  it('F1: comentário CSS não fragmenta mais propriedades hostis', () => {
    const payloads = [
      'position/**/:fixed;z-index/**/:9999',
      'background/**/:#fff url(//tracker.exemplo/x)',
      'POSITION/*x*/:fixed',
    ];
    for (const p of payloads) {
      const out = sanitizeEmailHtml(`<div style="${p};color:blue">a</div>`);
      expect(out, `payload: ${p}`).not.toContain('fixed');
      expect(out, `payload: ${p}`).not.toContain('9999');
      expect(out, `payload: ${p}`).not.toContain('url(');
      expect(out, `payload: ${p}`).toContain('color:blue');
    }
  });

  it('F2: url() bloqueada em QUALQUER propriedade (cursor, mask-image, content)', () => {
    const props = ['cursor', 'list-style-image', 'mask-image', 'content', 'filter', 'border-image-source'];
    for (const prop of props) {
      const out = sanitizeEmailHtml(`<div style="${prop}:url(//tracker.exemplo/px);color:red">a</div>`);
      expect(out, `prop: ${prop}`).not.toContain('url(');
      expect(out, `prop: ${prop}`).toContain('color:red');
    }
  });

  it('F3: removeAllHooks() na instância default NÃO desarma o pipeline', async () => {
    const DOMPurify = (await import('dompurify')).default;
    const antes = sanitizeEmailHtml('<a href="https://x.com">l</a><table style="width:600px"></table>');
    expect(antes).toContain('noopener');
    expect(antes).not.toContain('width:600px');
    // ataque: terceiro código do bundle desarma a instância default
    DOMPurify.removeAllHooks();
    const depois = sanitizeEmailHtml('<a href="https://x.com">l</a><table style="width:600px"></table>');
    expect(depois).toContain('noopener');   // proteção intacta
    expect(depois).not.toContain('width:600px');
  });

  it('fronteira data:URL preservada (32768 ok / corta acima)', () => {
    const ok = 'data:image/png;base64,' + 'A'.repeat(32768 - 22);
    const big = 'data:image/png;base64,' + 'A'.repeat(40000);
    expect(sanitizeEmailHtml(`<img src="${ok}">`)).toContain('src');
    expect(sanitizeEmailHtml(`<img src="${big}">`)).not.toContain('src="data:');
  });

  it('height gigante continua filtrável pela blocklist? (informativo: height não bloqueado)', () => {
    const out = sanitizeEmailHtml('<div style="height:9999px;color:green">a</div>');
    // height não está na blocklist (decisão: conteúdo longo já é contido por max-height/colapso)
    expect(out).toContain('color:green');
  });

  it('B2-ish: decode de preview não re-introduz HTML', () => {
    expect(buildBodyPreview('&lt;script&gt;x&lt;/script&gt;')).toBe('<script>x</script>');
    expect(buildBodyPreview('a &amp;&amp; b')).toBe('a && b');
  });

  it('sanitize é idempotente sob a nova instância isolada', () => {
    const html = '<div style="width:50%;color:blue">a</div>';
    const once = sanitizeEmailHtml(html);
    expect(sanitizeEmailHtml(once)).toBe(once);
  });
});
