import { describe, expect, it } from 'vitest';
import { formatEmailComposerHtml, formatEmailComposerText } from '../emailComposeFormat';

describe('emailComposeFormat', () => {
  it('gera HTML efetivo para negrito, italico, lista e link seguro', () => {
    const html = formatEmailComposerHtml('Olá **João** e _Maria_\n- Primeiro\n- Segundo\n[Site](https://example.com)');
    expect(html).toContain('<strong>João</strong>');
    expect(html).toContain('<em>Maria</em>');
    expect(html).toContain('<ul><li>Primeiro</li><li>Segundo</li></ul>');
    expect(html).toContain('href="https://example.com"');
  });

  it('escapa HTML colado e não transforma protocolo hostil', () => {
    const html = formatEmailComposerHtml('<img src=x onerror=alert(1)> [X](javascript:alert(1))');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
  });

  it('mantem fallback textual sem marcadores visuais', () => {
    expect(formatEmailComposerText('**Olá** [Site](https://example.com)')).toBe('Olá Site (https://example.com)');
  });
});
