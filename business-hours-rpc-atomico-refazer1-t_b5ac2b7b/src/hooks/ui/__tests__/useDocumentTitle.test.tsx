import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle', () => {
  afterEach(() => {
    document.title = '';
  });

  it('compõe o título com o sufixo do produto e sem ele quando não há título', () => {
    const { result, rerender } = renderHook(({ title }: { title?: string }) => useDocumentTitle(title), {
      initialProps: { title: 'Contatos' } as { title?: string },
    });
    expect(document.title).toBe('Contatos | WhatsApp Omnichannel');

    rerender({ title: undefined });
    expect(document.title).toBe('WhatsApp Omnichannel');

    rerender({ title: 'Conversas' });
    expect(document.title).toBe('Conversas | WhatsApp Omnichannel');
    expect(result.current).toBeUndefined();
  });

  it('restaura o título anterior ao desmontar', () => {
    document.title = 'Título anterior';
    const { unmount } = renderHook(() => useDocumentTitle('Inbox'));
    expect(document.title).toBe('Inbox | WhatsApp Omnichannel');

    unmount();
    expect(document.title).toBe('Título anterior');
  });
});
