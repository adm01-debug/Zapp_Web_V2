import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl } from '../urlSafety';

describe('isSafeHttpUrl', () => {
  it('aceita URL https absoluta', () => {
    expect(isSafeHttpUrl('https://instagram.com/perfil')).toBe(true);
  });

  it('aceita URL http absoluta', () => {
    expect(isSafeHttpUrl('http://exemplo.com/perfil?q=1')).toBe(true);
  });

  it('rejeita javascript:', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejeita data:', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejeita URL protocol-relative e caminho relativo', () => {
    expect(isSafeHttpUrl('//evil.com/x')).toBe(false);
    expect(isSafeHttpUrl('/caminho/relativo')).toBe(false);
    expect(isSafeHttpUrl('instagram.com/perfil')).toBe(false);
  });

  it('rejeita não-string, vazio e URL longa demais', () => {
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(42)).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl(`https://x.com/${'a'.repeat(2050)}`)).toBe(false);
  });
});
