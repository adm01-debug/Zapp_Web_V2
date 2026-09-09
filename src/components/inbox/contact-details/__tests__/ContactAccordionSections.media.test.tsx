import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * Regressão do bug: "clicar no botão de detalhes do contato abre a
 * Galeria de Mídia por cima da tela".
 *
 * Causa raiz: MediaGallery era renderizado dentro da seção "Mídia
 * Compartilhada" do accordion de detalhes como um Dialog modal com
 * open travado em true e onOpenChange vazio — quando a seção
 * expandia, o overlay cobria tudo e o X não fechava. A correção
 * separa o corpo da galeria (inline) do wrapper de diálogo opcional.
 *
 * Painel tabbed (#287): a seção "Mídia Compartilhada" saiu do accordion
 * de ContactAccordionSections e virou a aba "Arquivos" de ContactDetails.tsx
 * (MediaGalleryContent lazy, fase 3). A cobertura da regressão continua
 * garantida abaixo, exercitando diretamente o mesmo componente MediaGallery
 * usado nessa aba: controlado externamente (open=false), nunca deve
 * renderizar como Dialog travado aberto.
 */

// ---- mocks (padrão do repo: ver ImagePreviewDownload.test.tsx) ----

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...filterDomProps(props), ref }, children)),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

// Formato retornado por useContactMedia (src/hooks/chat/useContactMedia.ts):
// { items: ContactMediaItem[], counts }. useQuery e mockado globalmente, entao
// a queryFn real nunca roda — os dados aqui simulam o resultado ja classificado.
const mockMediaResult = {
  items: [
    { id: 'm1', url: 'https://example.com/foto.jpg', type: 'image', filename: 'foto.jpg', created_at: '2026-09-01T10:00:00Z', caption: 'primeira', mimetype: 'image/jpeg', size: null, meta: null, sender: 'contact' },
    { id: 'm2', url: 'https://example.com/doc.pdf', type: 'document', filename: 'doc.pdf', created_at: '2026-09-01T11:00:00Z', caption: 'segunda', mimetype: 'application/pdf', size: null, meta: null, sender: 'agent' },
  ],
  counts: { all: 2, image: 1, video: 0, audio: 0, document: 1 },
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockMediaResult, isLoading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (url: string) => ({ url, isLoading: false, refresh: vi.fn() }),
}));

describe('MediaGallery — regressão bug modal travado (usado na aba Arquivos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('wrapper de diálogo da galeria continua funcional quando controlado externamente', async () => {
    const { MediaGallery } = await import('@/components/inbox/MediaGallery');
    const onOpenChange = vi.fn();
    const { unmount } = render(React.createElement(MediaGallery, { contactId: 'c1', open: false, onOpenChange }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    render(React.createElement(MediaGallery, { contactId: 'c1', open: true, onOpenChange }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
