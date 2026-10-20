import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFlow = vi.hoisted(() => ({
  id: 'flow-1',
  name: 'Chatbot IA L1',
  is_active: false,
  trigger_type: 'ai_l1',
  variables: { confidence_threshold: 60, welcome_message: 'Olá!', transfer_message: 'Transferindo...' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'chatbot_flows') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: mockFlow, error: null }),
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'knowledge_base_articles') {
        return {
          select: () => ({
            count: () => Promise.resolve({ data: 42, error: null }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { ChatbotL1Config } from '../ChatbotL1Config';

const renderConfig = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatbotL1Config />
    </QueryClientProvider>,
  );
};

describe('ChatbotL1Config — interruptor acessível por nome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('o interruptor de ativar chatbot é alcançável pelo nome', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toBeInTheDocument();
    });
  });

  it('o interruptor reflete o estado carregado da configuração', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('o axe não acusa violações de label na tela', async () => {
    renderConfig();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Ativar Chatbot IA L1' })).toBeInTheDocument();
    });
    const results = await axe(document.body, { rules: { region: { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'label')).toEqual([]);
  });
});
