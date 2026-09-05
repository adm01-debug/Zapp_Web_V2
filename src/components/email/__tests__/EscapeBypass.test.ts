import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '@/lib/emailHtml';

describe('A2-rodada2: escapes CSS não burlam mais a política', () => {
  it('A1: mask:u\\72 l(...) com escape hex é bloqueado', () => {
    const out = sanitizeEmailHtml('<div style="mask:u\\72 l(http://tracker.exemplo/x);color:blue">a</div>');
    expect(out).not.toContain('tracker');
    expect(out).not.toMatch(/mask/u);
    expect(out).toContain('color:blue');
  });

  it('A1: background com url escapado em variants', () => {
    const variants = [
      'background:\\75 rl(//t.exemplo/a)',
      'background-image:UR\\4c (//t.exemplo/b)',
      'cursor:\\63 u\\72 sor',
    ];
    for (const v of variants) {
      const out = sanitizeEmailHtml(`<div style="${v};color:red">a</div>`);
      expect(out, `variant: ${v}`).not.toContain('t.exemplo');
      expect(out, `variant: ${v}`).toContain('color:red');
    }
  });

  it('A2: \\70 osition (position escapado) é bloqueado', () => {
    const out = sanitizeEmailHtml('<div style="\\70 osition:fixed;\\7a -index:9999;color:green">a</div>');
    expect(out).not.toContain('fixed');
    expect(out).not.toContain('9999');
    expect(out).toContain('color:green');
  });

  it('A3: translate/rotate/scale e vendor transforms bloqueados', () => {
    for (const prop of ['translate', 'rotate', 'scale', '-webkit-transform', '-webkit-filter', 'mask', '-webkit-mask']) {
      const out = sanitizeEmailHtml(`<div style="${prop}:50px;color:#000">a</div>`);
      expect(out, `prop: ${prop}`).not.toMatch(new RegExp(prop.replace(/[-]/g, '\\-'), 'i'));
      expect(out, `prop: ${prop}`).toContain('color:#000');
    }
  });

  it('escapes legítimos não quebram cores válidas', () => {
    const out = sanitizeEmailHtml('<div style="color:#fff;background-color:#00ff00">ok</div>');
    expect(out).toContain('color:#fff');
    expect(out).toContain('background-color:#00ff00');
  });

  it('url( com escape DENTRO do nome da propriedade legítima também cai', () => {
    const out = sanitizeEmailHtml('<div style="color:u\\72 l(x)">a</div>');
    expect(out).not.toContain('u\\72');
  });

  it('continuação de linha CSS (backslash+newline) não esconde url(', () => {
    const out = sanitizeEmailHtml('<div style="mask:u\\72 \n l(http://t.exemplo/x);color:blue">a</div>');
    expect(out).not.toContain('t.exemplo');
    expect(out).toContain('color:blue');
  });

  it('continuação de linha em CRLF e form-feed idem', () => {
    for (const nl of ['\r\n', '\r', '\f']) {
      const out = sanitizeEmailHtml(`<div style="\\70${nl}osition:fixed;color:red">a</div>`);
      expect(out, JSON.stringify(nl)).not.toContain('fixed');
      expect(out, JSON.stringify(nl)).toContain('color:red');
    }
  });
});
