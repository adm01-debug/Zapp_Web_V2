import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '@/lib/emailHtml';

describe('R3: bypass CRLF pós-escape-hex e trava de line-continuation', () => {
  it('CRLF após \\70 conta como UM whitespace (spec CSS §4.3.7) — position bloqueado', () => {
    // entidades &#13;&#10; chegam como \r\n cru no attr; o \s? antigo consumia só o \r
    const out = sanitizeEmailHtml('<div style="\\70&#13;&#10;osition:fixed;color:blue">a</div>');
    expect(out).not.toContain('fixed');
    expect(out).toContain('color:blue');
  });

  it('CRLF pós-escape-hex em url( de tracker — sem rede (A3 PoC)', () => {
    const out = sanitizeEmailHtml('<div style="list-style:square u\\72&#13;&#10;l(https://evil.example/pixel.gif);color:red">a</div>');
    expect(out).not.toContain('evil.example');
    expect(out).toContain('color:red');
  });

  it('TRAVA E3: line-continuation puro u\\<LF>rl( SEM escape hex (mutação d não pode passar)', () => {
    // este teste existe para QUEBRAR se a regex de line-continuation for removida
    const BS = String.fromCharCode(92); const LF = String.fromCharCode(10);
    const hostile = `<div style="color:u${BS}${LF}rl(http://evil2.example/y)">a</div>`;
    const out = sanitizeEmailHtml(hostile);
    expect(out).not.toContain('evil2.example');
  });

  it('TRAVA E3: line-continuation puro em propriedade \\70<LF>osition', () => {
    const BS = String.fromCharCode(92); const LF = String.fromCharCode(10);
    const hostile = `<div style="\\70${BS}${LF}osition:fixed;color:green">a</div>`;
    const out = sanitizeEmailHtml(hostile);
    expect(out).not.toContain('fixed');
    expect(out).toContain('color:green');
  });

  it('hex com espaço simples e tab continuam funcionando', () => {
    const out = sanitizeEmailHtml('<div style="\\70 osition:fixed;\\7a\t-index:9;color:#000">a</div>');
    expect(out).not.toContain('fixed');
    expect(out).toContain('color:#000');
  });
});
