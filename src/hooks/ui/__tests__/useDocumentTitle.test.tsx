import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle', () => {
  afterEach(() => {
    document.title = '';
  });

  it('compõe o título com o nome do produto e sem ele quando não há título', () => {
    const { result, rerender } = renderHook(({ title }: { title?: string }) => useDocumentTitle(title), {
      initialProps: { title: 'Contatos' } as { title?: string },
    });
    expect(document.title).toBe('Contatos | ZAPP WEB');

    rerender({ title: undefined });
    expect(document.title).toBe('ZAPP WEB');

    rerender({ title: 'Conversas' });
    expect(document.title).toBe('Conversas | ZAPP WEB');
    expect(result.current).toBeUndefined();
  });

  it('restaura o título anterior ao desmontar', () => {
    document.title = 'Título anterior';
    const { unmount } = renderHook(() => useDocumentTitle('Inbox'));
    expect(document.title).toBe('Inbox | ZAPP WEB');

    unmount();
    expect(document.title).toBe('Título anterior');
  });

  it('usa o mesmo nome de produto do index.html (nada de marca antiga)', () => {
    renderHook(() => useDocumentTitle('Tela'));
    expect(document.title).toBe('Tela | ZAPP WEB');
    expect(document.title).not.toContain('WhatsApp Omnichannel');
  });
});
