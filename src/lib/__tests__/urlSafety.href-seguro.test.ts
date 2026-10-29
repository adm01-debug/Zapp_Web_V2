/**
 * SEC-FRONTEND-02 — o guard de URL que entrou no achado de 07/10/2026.
 * O `href` de dado externo aceitava qualquer esquema; o guard novo aceita só os
 * esquemas legítimos de um link de contato e barra o resto (javascript:, data:, …).
 */
import { describe, it, expect } from 'vitest';
import { isSafeExternalHref, isSafeHttpUrl } from '../urlSafety';

describe('isSafeExternalHref (SEC-FRONTEND-02)', () => {
  it('aceita os esquemas legítimos de um link', () => {
    expect(isSafeExternalHref('https://empresa.example.com')).toBe(true);
    expect(isSafeExternalHref('http://empresa.example.com/catalogo?x=1#sobre')).toBe(true);
    expect(isSafeExternalHref('mailto:contato@empresa.example.com')).toBe(true);
    expect(isSafeExternalHref('tel:+5511999999999')).toBe(true);
  });

  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example.com/x',
    '/caminho/relativo',
    'empresa.example.com',
  ])('barra %s', (valor) => {
    expect(isSafeExternalHref(valor)).toBe(false);
  });

  it('barra valor que não é string, vazio ou acima do teto de tamanho', () => {
    expect(isSafeExternalHref(null)).toBe(false);
    expect(isSafeExternalHref(undefined)).toBe(false);
    expect(isSafeExternalHref(42)).toBe(false);
    expect(isSafeExternalHref('')).toBe(false);
    expect(isSafeExternalHref(`https://x.example.com/${'a'.repeat(2050)}`)).toBe(false);
  });

  it('isSafeHttpUrl segue restrito a http(s) — é o guard do src de imagem', () => {
    expect(isSafeHttpUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isSafeHttpUrl('mailto:contato@empresa.example.com')).toBe(false);
    expect(isSafeHttpUrl('tel:+5511999999999')).toBe(false);
  });
});
