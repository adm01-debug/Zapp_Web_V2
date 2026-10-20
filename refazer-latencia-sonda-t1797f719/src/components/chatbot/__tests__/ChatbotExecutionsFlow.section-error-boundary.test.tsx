import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Paridade V3 → V2, Parte 7 — falha num bloco do Chatbot não derruba a tela.
 *
 * A V3 protege a aba "Execuções do chatbot" com `SectionErrorBoundary`. Aqui o
 * dashboard de execuções lança e o aviso ocupa o lugar dele; a aba "Fluxos"
 * (bloco independente, mesmo painel) continua funcionando.
 */

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows: [],
    isLoading: false,
    createFlow: { mutate: vi.fn(), isPending: false },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: vi.fn() },
    toggleFlow: { mutate: vi.fn() },
  }),
}));

// Mock PRÓPRIO de framer-motion (não toca no mock de outro teste da mesma pasta).
vi.mock('framer-motion', () => {
  const MotionDiv = ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

vi.mock('../ChatbotExecutionsDashboard', () => ({
  ChatbotExecutionsDashboard: () => { throw new Error('falha das execuções'); },
}));

import { ChatbotFlowsView } from '@/components/chatbot/ChatbotFlowsView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatbotFlowsView — SectionErrorBoundary isola o bloco que falha (Parte 7)', () => {
  it('Execuções lançando mostra o aviso no lugar do bloco e mantém o cabeçalho', async () => {
    render(<ChatbotFlowsView />);

    // Radix Tabs ativa no mouseDown (o clique só não troca a aba).
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Execuções/ }));

    expect(await screen.findByText(/Erro em "Execuções do chatbot"/)).toBeInTheDocument();
    expect(screen.getByText('Chatbot Flows')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Fluxos/ })).toBeInTheDocument();
  });

  it('com Execuções quebrado, a aba Fluxos (bloco independente) ainda renderiza', async () => {
    render(<ChatbotFlowsView />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Execuções/ }));
    expect(await screen.findByText(/Erro em "Execuções do chatbot"/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Fluxos/ }));
    await waitFor(() => expect(screen.getByText('Total de Fluxos')).toBeInTheDocument());
  });
});
