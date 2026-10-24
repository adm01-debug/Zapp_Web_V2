import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ConversationSummary } from '../ConversationSummary';

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/components/inbox/summary/useSummaryTts', () => ({
  useSummaryTts: () => ({
    isTtsPlaying: false,
    isTtsLoading: false,
    lastTtsText: '',
    autoplayBlocked: false,
    startTtsPlayback: vi.fn(),
    handleRetryAutoplay: vi.fn(),
    handleDismissAutoplayWarning: vi.fn(),
  }),
}));

// O resultado só nos interessa como marcador: o foco é se a resposta foi aplicada.
vi.mock('@/components/inbox/summary/SummaryResult', () => ({
  SummaryResult: () => <div data-testid="summary-result" />,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const makeMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    sender: (i % 2 === 0 ? 'contact' : 'agent') as 'contact' | 'agent',
    content: `Message ${i}`,
    created_at: new Date().toISOString(),
  }));

const summaryFor = (contactName: string) => ({
  summary: `Resumo do contato ${contactName}`,
  status: 'pendente' as const,
  keyPoints: ['ponto'],
  nextSteps: [],
  sentiment: 'neutro' as const,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('ConversationSummary — descarte de resposta superada (IA-048)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aplica o resumo quando contato e período não mudam durante a requisição', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    render(<ConversationSummary messages={makeMessages(12)} contactName="Ana" contactId="contact-A" />);
    fireEvent.click(screen.getByText(/Gerar resumo/));

    await act(async () => {
      pending.resolve({ data: { status: 'ok', data: summaryFor('Ana') }, error: null });
    });

    expect(await screen.findByTestId('summary-result')).toBeInTheDocument();
    expect(screen.getByText('Regenerar resumo')).toBeInTheDocument();
  });

  it('DESCARTA o resumo em voo quando o contato muda antes da resposta', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = render(
      <ConversationSummary messages={makeMessages(12)} contactName="Ana" contactId="contact-A" />,
    );
    fireEvent.click(screen.getByText(/Gerar resumo/));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    // Troca de contato com a promessa ainda pendente.
    rerender(<ConversationSummary messages={makeMessages(12)} contactName="Bruno" contactId="contact-B" />);

    await act(async () => {
      pending.resolve({ data: { status: 'ok', data: summaryFor('Ana') }, error: null });
    });

    // Nem o resultado, nem o estado "já gerou", nem toast de sucesso.
    expect(screen.queryByTestId('summary-result')).not.toBeInTheDocument();
    expect(screen.queryByText('Regenerar resumo')).not.toBeInTheDocument();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('NÃO descarta por mensagem viva: novas mensagens no mesmo contato mantêm o resumo em voo', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = render(
      <ConversationSummary messages={makeMessages(12)} contactName="Ana" contactId="contact-A" />,
    );
    fireEvent.click(screen.getByText(/Gerar resumo/));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    // Chega mensagem nova (mesmo contato/período): não pode invalidar a análise.
    rerender(<ConversationSummary messages={makeMessages(14)} contactName="Ana" contactId="contact-A" />);

    await act(async () => {
      pending.resolve({ data: { status: 'ok', data: summaryFor('Ana') }, error: null });
    });

    expect(await screen.findByTestId('summary-result')).toBeInTheDocument();
  });
});
