/**
 * N-043 — botões da janela avulsa (ChatPopup) têm nome acessível.
 *
 * Auditoria: os 3 botões da barra de controle (minimizar, maximizar, fechar)
 * não tinham `aria-label`, causando violação `button-name` no axe.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  contactId: 'contato-popup-a11y',
  messages: [],
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: mocks.messages,
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    sendAudio: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ contactId: mocks.contactId }) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: mocks.contactId, name: 'Contato A11y' },
            error: null,
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: vi.fn(),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: vi.fn(),
      }),
    },
  },
}));

import ChatPopup from '../ChatPopup';

function renderPopup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPopup />
    </QueryClientProvider>,
  );
}

describe('N-043 — botões da janela avulsa têm nome acessível', () => {
  it('o botão de minimizar tem nome "Minimizar"', async () => {
    renderPopup();
    await screen.findByRole('button', { name: 'Minimizar' }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Minimizar' })).toBeInTheDocument();
  });

  it('o botão de maximizar tem nome "Maximizar" quando não está maximizado', async () => {
    renderPopup();
    await screen.findByRole('button', { name: 'Maximizar' }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Maximizar' })).toBeInTheDocument();
  });

  it('o botão de fechar tem nome "Fechar"', async () => {
    renderPopup();
    await screen.findByRole('button', { name: 'Fechar' }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('axe não acusa violações de button-name na barra de controle', async () => {
    const { unmount } = renderPopup();
    await screen.findByRole('button', { name: 'Fechar' }, { timeout: 3000 });
    const results = await axe(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const buttonNameViolations = results.violations.filter(
      (v) => v.id === 'button-name',
    );
    expect(buttonNameViolations).toEqual([]);
    unmount();
  });
});