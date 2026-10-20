import { describe, expect, it } from 'vitest';
import { companySocialLinks, normalizeExternalUrl } from '../emailCompanyLinks';

describe('email company links', () => {
  it('normalizes a bare HTTPS website without inventing a domain', () => {
    expect(normalizeExternalUrl('empresa.example.com/catalogo?x=1#sobre')).toBe('https://empresa.example.com/catalogo?x=1#sobre');
  });

  it('rejects executable, credentialed, and misleading social URLs', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,boom', 'https://user:pass@linkedin.com/company/acme', 'https://linkedin.com.evil.example/acme']) {
      expect(normalizeExternalUrl(value, ['linkedin.com'])).toBeNull();
    }
  });

  it('keeps only valid company social links, never a handle or unknown platform', () => {
    expect(companySocialLinks([
      { platform: 'linkedin', url: 'https://www.linkedin.com/company/acme' },
      { platform: 'instagram', url: 'instagram.com/acme' },
      { platform: 'linkedin', url: 'https://linkedin.com.evil.example/acme' },
      { platform: 'facebook', url: 'https://facebook.com/acme' },
      { platform: 'instagram', handle: '@acme' },
    ])).toEqual([
      { platform: 'linkedin', url: 'https://www.linkedin.com/company/acme' },
      { platform: 'instagram', url: 'https://instagram.com/acme' },
    ]);
  });
});
