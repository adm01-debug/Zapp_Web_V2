import { describe, it, expect } from 'vitest';
import {
  isImageUrl,
  isVideoUrl,
  isYouTubeUrl,
  getYouTubeThumbnail,
  getDomain,
  getFavicon,
  extractLinks,
  escapeHtml,
} from '../linkPreviewUtils';

// ── isImageUrl ────────────────────────────────────────────────────────────────

describe('isImageUrl', () => {
  it('aceita as extensões de imagem conhecidas', () => {
    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].forEach((ext) => {
      expect(isImageUrl(`https://exemplo.com/foto${ext}`)).toBe(true);
    });
  });

  it('ignora maiúsculas/minúsculas', () => {
    expect(isImageUrl('https://exemplo.com/foto.JPG')).toBe(true);
    expect(isImageUrl('https://exemplo.com/foto.PNG')).toBe(true);
  });

  it('aceita quando a extensão vem antes de query string', () => {
    expect(isImageUrl('https://exemplo.com/foto.png?w=200')).toBe(true);
  });

  it('recusa o que não é imagem', () => {
    expect(isImageUrl('https://exemplo.com/pagina')).toBe(false);
    expect(isImageUrl('https://exemplo.com/video.mp4')).toBe(false);
  });
});

// ── isVideoUrl ────────────────────────────────────────────────────────────────

describe('isVideoUrl', () => {
  it('aceita as extensões de vídeo conhecidas', () => {
    ['.mp4', '.webm', '.ogg', '.mov'].forEach((ext) => {
      expect(isVideoUrl(`https://exemplo.com/clipe${ext}`)).toBe(true);
    });
  });

  it('recusa imagem e página comum', () => {
    expect(isVideoUrl('https://exemplo.com/foto.png')).toBe(false);
    expect(isVideoUrl('https://exemplo.com/pagina')).toBe(false);
  });
});

// ── isYouTubeUrl ──────────────────────────────────────────────────────────────

describe('isYouTubeUrl', () => {
  it('reconhece /watch e o domínio curto youtu.be', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('recusa outros domínios e o YouTube sem vídeo', () => {
    expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false);
    expect(isYouTubeUrl('https://www.youtube.com/channel/UC123')).toBe(false);
  });
});

// ── getYouTubeThumbnail ───────────────────────────────────────────────────────

describe('getYouTubeThumbnail', () => {
  it('monta a miniatura a partir de ?v=', () => {
    expect(getYouTubeThumbnail('https://www.youtube.com/watch?v=abc123'))
      .toBe('https://img.youtube.com/vi/abc123/mqdefault.jpg');
  });

  it('monta a miniatura a partir do domínio curto', () => {
    expect(getYouTubeThumbnail('https://youtu.be/abc123'))
      .toBe('https://img.youtube.com/vi/abc123/mqdefault.jpg');
  });

  it('descarta parâmetros extras depois do id no domínio curto', () => {
    expect(getYouTubeThumbnail('https://youtu.be/abc123?t=42'))
      .toBe('https://img.youtube.com/vi/abc123/mqdefault.jpg');
  });

  it('devolve null quando não há id de vídeo', () => {
    expect(getYouTubeThumbnail('https://www.youtube.com/channel/UC123')).toBeNull();
    expect(getYouTubeThumbnail('https://vimeo.com/12345')).toBeNull();
  });
});

// ── getDomain ─────────────────────────────────────────────────────────────────

describe('getDomain', () => {
  it('remove o www. do domínio', () => {
    expect(getDomain('https://www.exemplo.com/pagina')).toBe('exemplo.com');
  });

  it('mantém subdomínios que não são www', () => {
    expect(getDomain('https://blog.exemplo.com/post')).toBe('blog.exemplo.com');
  });

  it('devolve a entrada crua quando não é URL válida', () => {
    expect(getDomain('não é url')).toBe('não é url');
  });
});

// ── getFavicon ────────────────────────────────────────────────────────────────

describe('getFavicon', () => {
  it('monta o favicon a partir da origem (sem caminho)', () => {
    expect(getFavicon('https://www.exemplo.com/pagina?a=1'))
      .toBe('https://www.exemplo.com/favicon.ico');
  });

  it('preserva o esquema e a porta', () => {
    expect(getFavicon('http://localhost:3000/x')).toBe('http://localhost:3000/favicon.ico');
  });

  it('devolve string vazia quando não é URL válida', () => {
    expect(getFavicon('não é url')).toBe('');
  });
});

// ── extractLinks ──────────────────────────────────────────────────────────────

describe('extractLinks', () => {
  it('devolve array vazio quando o texto não tem link', () => {
    expect(extractLinks('olá, tudo bem?')).toEqual([]);
  });

  it('extrai um link https', () => {
    expect(extractLinks('veja https://exemplo.com/a')).toEqual(['https://exemplo.com/a']);
  });

  it('extrai vários links e remove repetidos', () => {
    const texto = 'https://a.com e https://b.com e de novo https://a.com';
    expect(extractLinks(texto)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('extrai também links http', () => {
    expect(extractLinks('http://exemplo.com')).toEqual(['http://exemplo.com']);
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#039;'
    );
  });

  it('escapa o & antes de tudo (não gera &amp;lt;)', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('deixa texto sem caracteres especiais intacto', () => {
    expect(escapeHtml('texto normal 123')).toBe('texto normal 123');
  });
});
