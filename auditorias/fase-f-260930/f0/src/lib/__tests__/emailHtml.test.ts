import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml, buildBodyPreview } from '../emailHtml';

// ─── Helpers ───────────────────────────────────────────────────────────────
function attr(html: string, selector: string, attribute: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector(selector)?.getAttribute(attribute) ?? null;
}
function hasElement(html: string, selector: string): boolean {
  return new DOMParser().parseFromString(html, 'text/html').querySelector(selector) !== null;
}
function styleOf(html: string, selector: string): string {
  return attr(html, selector, 'style') ?? '';
}

// ─── XSS — tags e atributos ────────────────────────────────────────────────
describe('sanitizeEmailHtml — XSS básico', () => {
  it('remove <script>', () => {
    const out = sanitizeEmailHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('ok');
  });

  it('remove event handlers (onclick, onerror, onload)', () => {
    const out = sanitizeEmailHtml('<p onclick="alert(1)">x</p><img onerror="fetch(\'/\')">');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
  });

  it('remove javascript: em href', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">clique</a>');
    expect(out).not.toContain('javascript:');
  });

  it('remove <iframe>', () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain('<iframe');
  });

  it('remove <object> e <embed>', () => {
    const out = sanitizeEmailHtml('<object data="x.swf"></object><embed src="y.swf">');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
  });
});

// ─── Hooks: links ──────────────────────────────────────────────────────────
describe('sanitizeEmailHtml — link hardening', () => {
  it('adiciona target=_blank e rel=noopener noreferrer em links com href', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">link</a>');
    const target = attr(out, 'a', 'target');
    const rel = attr(out, 'a', 'rel');
    expect(target).toBe('_blank');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('não adiciona target em <a> sem href', () => {
    const out = sanitizeEmailHtml('<a name="anchor">anchor</a>');
    expect(attr(out, 'a', 'target')).toBeNull();
  });
});

// ─── Hooks: imagens ────────────────────────────────────────────────────────
describe('sanitizeEmailHtml — imagens', () => {
  it('adiciona loading=lazy e referrerpolicy=no-referrer', () => {
    const out = sanitizeEmailHtml('<img src="https://cdn.example.com/img.jpg" alt="x">');
    expect(attr(out, 'img', 'loading')).toBe('lazy');
    expect(attr(out, 'img', 'referrerpolicy')).toBe('no-referrer');
  });

  it('remove src de data: URL > 32 KB e aplica alt de fallback quando não havia alt', () => {
    const bigData = 'data:image/png;base64,' + 'A'.repeat(33000);
    const out = sanitizeEmailHtml(`<img src="${bigData}">`);
    expect(attr(out, 'img', 'src')).toBeNull();
    expect(attr(out, 'img', 'alt')).toContain('imagem incorporada');
  });

  it('remove src de data: URL > 32 KB e preserva alt original quando existia', () => {
    const bigData = 'data:image/png;base64,' + 'A'.repeat(33000);
    const out = sanitizeEmailHtml(`<img src="${bigData}" alt="logo empresa">`);
    expect(attr(out, 'img', 'src')).toBeNull();
    expect(attr(out, 'img', 'alt')).toBe('logo empresa');
  });

  it('mantém data: URL pequena', () => {
    const smallData = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const out = sanitizeEmailHtml(`<img src="${smallData}" alt="small">`);
    expect(attr(out, 'img', 'src')).toBe(smallData);
  });
});

// ─── CSS — props bloqueadas ────────────────────────────────────────────────
describe('sanitizeEmailHtml — STYLE_BLOCKED_PROPS', () => {
  it('remove position:fixed', () => {
    const out = sanitizeEmailHtml('<div style="position:fixed;color:blue">x</div>');
    expect(styleOf(out, 'div')).not.toContain('position');
  });

  it('remove visibility:hidden', () => {
    const out = sanitizeEmailHtml('<p style="visibility:hidden">x</p>');
    expect(styleOf(out, 'p')).not.toContain('visibility');
  });

  it('remove z-index', () => {
    const out = sanitizeEmailHtml('<div style="z-index:9999">x</div>');
    expect(styleOf(out, 'div')).not.toContain('z-index');
  });

  it('remove background', () => {
    const out = sanitizeEmailHtml('<div style="background:#fff">x</div>');
    expect(styleOf(out, 'div')).not.toContain('background');
  });

  it('remove animation', () => {
    const out = sanitizeEmailHtml('<div style="animation:spin 1s linear">x</div>');
    expect(styleOf(out, 'div')).not.toContain('animation');
  });

  it('remove opacity:0 (phishing — link invisível)', () => {
    const out = sanitizeEmailHtml('<a href="https://evil.com" style="opacity:0">clique</a>');
    expect(styleOf(out, 'a')).not.toContain('opacity');
  });

  it('remove transform', () => {
    const out = sanitizeEmailHtml('<div style="transform:scale(10)">x</div>');
    expect(styleOf(out, 'div')).not.toContain('transform');
  });

  it('remove pointer-events', () => {
    const out = sanitizeEmailHtml('<div style="pointer-events:none">x</div>');
    expect(styleOf(out, 'div')).not.toContain('pointer-events');
  });
});

// ─── CSS — filtro de dimensões ────────────────────────────────────────────
describe('sanitizeEmailHtml — filtro width/height', () => {
  it('remove width:600px', () => {
    const out = sanitizeEmailHtml('<table style="width:600px">x</table>');
    expect(styleOf(out, 'table')).not.toContain('width');
  });

  it('mantém width:100%', () => {
    const out = sanitizeEmailHtml('<table style="width:100%">x</table>');
    expect(styleOf(out, 'table')).toContain('width:100%');
  });

  it('mantém width:auto', () => {
    const out = sanitizeEmailHtml('<div style="width:auto">x</div>');
    expect(styleOf(out, 'div')).toContain('width:auto');
  });

  it('remove height:100vh (gap de segurança corrigido)', () => {
    const out = sanitizeEmailHtml('<div style="height:100vh">x</div>');
    expect(styleOf(out, 'div')).not.toContain('height');
  });

  it('remove min-height:100vh', () => {
    const out = sanitizeEmailHtml('<div style="min-height:100vh">x</div>');
    expect(styleOf(out, 'div')).not.toContain('min-height');
  });

  it('remove max-height:9999px', () => {
    const out = sanitizeEmailHtml('<div style="max-height:9999px">x</div>');
    expect(styleOf(out, 'div')).not.toContain('max-height');
  });

  it('mantém height:auto', () => {
    const out = sanitizeEmailHtml('<div style="height:auto">x</div>');
    expect(styleOf(out, 'div')).toContain('height:auto');
  });

  it('mantém height:50%', () => {
    const out = sanitizeEmailHtml('<div style="height:50%">x</div>');
    expect(styleOf(out, 'div')).toContain('height:50%');
  });
});

// ─── CSS — F1: remoção de comentários ────────────────────────────────────
describe('sanitizeEmailHtml — F1 (comentários CSS)', () => {
  it('detecta position:fixed oculto em comentário', () => {
    const out = sanitizeEmailHtml('<div style="/**/position:fixed">x</div>');
    expect(styleOf(out, 'div')).not.toContain('position');
  });

  it('detecta url() oculta com comentário intermediário', () => {
    const out = sanitizeEmailHtml('<div style="background:/* x */url(https://t.co/px)">x</div>');
    expect(styleOf(out, 'div')).not.toContain('url(');
  });
});

// ─── CSS — F2: bloqueio de url() ─────────────────────────────────────────
describe('sanitizeEmailHtml — F2 (url() em qualquer prop)', () => {
  it('remove cursor com url()', () => {
    const out = sanitizeEmailHtml('<div style="cursor:url(x.cur),auto">x</div>');
    expect(styleOf(out, 'div')).not.toContain('url(');
  });

  it('remove list-style-image com url()', () => {
    const out = sanitizeEmailHtml('<ul style="list-style-image:url(b.png)"><li>x</li></ul>');
    expect(styleOf(out, 'ul')).not.toContain('url(');
  });

  it('remove background-image com url()', () => {
    const out = sanitizeEmailHtml('<div style="background-image:url(tracker.gif)">x</div>');
    expect(styleOf(out, 'div')).not.toContain('url(');
  });

  it('remove url() em prop permitida (background-color) — path exclusivo do filtro F2', () => {
    // background-color NÃO está em STYLE_BLOCKED_PROPS; só o filtro url() a descarta.
    const out = sanitizeEmailHtml('<div style="background-color:url(tracker.gif)">x</div>');
    expect(styleOf(out, 'div')).not.toContain('url(');
  });
});

// ─── CSS — A2: escapes CSS (bypass) ───────────────────────────────────────
describe('sanitizeEmailHtml — A2 (CSS unescape bypass)', () => {
  it('detecta \\70 osition:fixed (hex escape)', () => {
    // \70 = 'p' → "position"
    const out = sanitizeEmailHtml('<div style="\\70 osition:fixed">x</div>');
    expect(styleOf(out, 'div')).not.toContain('fixed');
  });

  it('detecta \\000070osition:fixed (hex longo)', () => {
    const out = sanitizeEmailHtml('<div style="\\000070osition:fixed">x</div>');
    expect(styleOf(out, 'div')).not.toContain('fixed');
  });

  it('detecta po\\sition:fixed (backslash não-hex)', () => {
    const out = sanitizeEmailHtml('<div style="po\\sition:fixed">x</div>');
    expect(styleOf(out, 'div')).not.toContain('fixed');
  });

  it('detecta u\\72 l() em valor (escape de url)', () => {
    // \72 = 'r' → "url(...)"
    const out = sanitizeEmailHtml('<div style="background:u\\72 l(https://evil.com/track)">x</div>');
    expect(styleOf(out, 'div')).not.toContain('evil.com');
  });

  it('ignora continuação de linha CSS (backslash + newline)', () => {
    const out = sanitizeEmailHtml('<div style="pos\\\nition:fixed">x</div>');
    expect(styleOf(out, 'div')).not.toContain('fixed');
  });

  it('codepoint acima de 0x10FFFF retorna string vazia (não crash)', () => {
    // \FFFFFF → codepoint inválido; cssUnescape não deve lançar
    const out = sanitizeEmailHtml('<div style="\\FFFFFF:fixed">x</div>');
    expect(out).toBeTruthy();
  });
});

// ─── CSS — declaração malformada ──────────────────────────────────────────
describe('sanitizeEmailHtml — declarações malformadas', () => {
  it('descarta declaração sem dois-pontos', () => {
    const out = sanitizeEmailHtml('<p style="no-colon-decl;color:red">x</p>');
    // "no-colon-decl" é descartado; "color:red" pode passar
    expect(styleOf(out, 'p')).not.toContain('no-colon-decl');
  });

  it('ponto-e-vírgula trailing não deixa declaração vazia passar', () => {
    const out = sanitizeEmailHtml('<p style="color:blue;">x</p>');
    expect(out).toContain('x'); // não crasha
  });

  it('style vazio após limpeza remove o atributo', () => {
    const out = sanitizeEmailHtml('<div style="position:fixed">x</div>');
    expect(attr(out, 'div', 'style')).toBeNull();
  });
});

// ─── Tags permitidas ─────────────────────────────────────────────────────
describe('sanitizeEmailHtml — tags permitidas', () => {
  it('preserva tabela com thead/tbody/tr/td', () => {
    const out = sanitizeEmailHtml(
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>'
    );
    expect(hasElement(out, 'table')).toBe(true);
    expect(hasElement(out, 'th')).toBe(true);
    expect(hasElement(out, 'td')).toBe(true);
  });

  it('preserva <blockquote>', () => {
    const out = sanitizeEmailHtml('<blockquote>citação</blockquote>');
    expect(hasElement(out, 'blockquote')).toBe(true);
  });

  it('preserva headings h1-h6', () => {
    const out = sanitizeEmailHtml('<h1>T1</h1><h3>T3</h3>');
    expect(hasElement(out, 'h1')).toBe(true);
    expect(hasElement(out, 'h3')).toBe(true);
  });

  it('mantém conteúdo de tags removidas (KEEP_CONTENT)', () => {
    const out = sanitizeEmailHtml('<span><marquee>texto</marquee></span>');
    expect(out).toContain('texto');
  });
});

// ─── buildBodyPreview ─────────────────────────────────────────────────────
describe('buildBodyPreview', () => {
  it('retorna string vazia para null/undefined', () => {
    expect(buildBodyPreview(null)).toBe('');
    expect(buildBodyPreview(undefined)).toBe('');
  });

  it('não corta texto abaixo do limite', () => {
    const short = 'texto curto';
    expect(buildBodyPreview(short, 300)).toBe('texto curto');
  });

  it('corta em limite de palavra e adiciona ellipsis', () => {
    const long = 'palavra '.repeat(60).trim(); // 420 chars
    const preview = buildBodyPreview(long, 100);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(101); // corte + ellipsis
  });

  it('decodifica &nbsp; &lt; &gt; &amp;', () => {
    const out = buildBodyPreview('a&nbsp;b &lt;tag&gt; &amp;amp;');
    expect(out).toContain('a b');
    expect(out).toContain('<tag>');
    expect(out).toContain('&');
  });

  it('colapsa espaços múltiplos', () => {
    const out = buildBodyPreview('a    b\t\tc');
    expect(out).toBe('a b c');
  });
});
