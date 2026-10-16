import { describe, expect, it } from 'vitest';

import { PRODUCT_NAME, formatDocumentTitle } from '../productName';

describe('productName', () => {
  it('usa "ZAPP WEB" — a mesma marca do index.html e do manifest', () => {
    expect(PRODUCT_NAME).toBe('ZAPP WEB');
  });

  it('monta "Tela | ZAPP WEB" e só a marca quando não há tela', () => {
    expect(formatDocumentTitle('Tela')).toBe('Tela | ZAPP WEB');
    expect(formatDocumentTitle('')).toBe('ZAPP WEB');
    expect(formatDocumentTitle(undefined)).toBe('ZAPP WEB');
  });
});
