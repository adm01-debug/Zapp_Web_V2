import { describe, expect, it } from 'vitest';
import { emailHtmlToText } from '../emailRichText';

describe('emailHtmlToText', () => {
  it('preserva blocos, listas e texto de links no multipart plain-text', () => {
    expect(emailHtmlToText('<p>Olá <strong>João</strong></p><ul><li>Primeiro</li><li><a href="https://example.com">Segundo</a></li></ul>'))
      .toBe('Olá João\nPrimeiro\nSegundo');
  });

  it('não inclui marcação HTML no corpo alternativo', () => {
    const result = emailHtmlToText('<blockquote>Resposta <em>segura</em></blockquote>');
    expect(result).toBe('Resposta segura');
    expect(result).not.toContain('<');
  });
});
