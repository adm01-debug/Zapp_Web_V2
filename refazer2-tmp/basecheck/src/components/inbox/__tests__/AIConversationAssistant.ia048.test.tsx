import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AIConversationAssistant } from '../AIConversationAssistant';

const invokeMock = vi.hoisted(() => vi.fn());
const checkAlertMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const stopTtsMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  generateCorrelationId: () => 'corr-test',
}));

vi.mock('@/hooks/chat/useConversationAnalyses', () => ({
  useConversationAnalyses: () => ({
    analyses: [],
    refetch: refetchMock,
    getSentimentTrend: () => null,
    loading: false,
  }),
}));

vi.mock('@/hooks/inbox/useSentimentAlerts', () => ({
  useSentimentAlerts: () => ({ checkAndTriggerAlert: checkAlertMock }),
}));

vi.mock('@/components/inbox/ai-tools/useAnalysisTts', () => ({
  useAnalysisTts: () => ({
    isTtsPlaying: false,
    isTtsLoading: false,
    autoplayBlocked: false,
    stopTts: stopTtsMock,
    startTtsPlayback: vi.fn(),
    handleRetryAutoplay: vi.fn(),
    handleDismissAutoplayWarning: vi.fn(),
  }),
}));

vi.mock('@/components/inbox/ai-tools/AnalysisTabs', () => ({
  AnalysisTabs: () => <div data-testid="analysis-tabs" />,
}));
vi.mock('@/components/inbox/ai-tools/VisionIcon', () => ({
  VisionIcon: () => <span data-testid="vision-icon" />,
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <div {...(props as any)}>{children}</div>;
    },
  },
}));

const messages = Array.from({ length: 6 }, (_, i) => ({
  id: `m${i}`,
  sender: (i % 2 === 0 ? 'contact' : 'agent') as 'contact' | 'agent',
  content: `Mensagem ${i}`,
  created_at: new Date().toISOString(),
}));

const envelope = {
  status: 'ok' as const,
  analysisId: 'analysis-A',
  data: {
    summary: 'Resumo da conversa do contato A',
    status: 'ok',
    keyPoints: [],
    nextSteps: [],
    sentiment: 'positivo',
    sentimentScore: 80,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const renderAssistant = (contactId: string) =>
  render(
    <AIConversationAssistant
      messages={messages}
      contactId={contactId}
      contactName={contactId}
      isOpen
      onClose={vi.fn()}
    />,
  );

describe('AIConversationAssistant — descarte e efeito no servidor (IA-048)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetchMock.mockResolvedValue(undefined);
  });

  it('aplica a análise e dispara o alerta quando o contexto é o do clique', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    renderAssistant('contact-A');
    fireEvent.click(screen.getByText(/Analisar \(/));

    await act(async () => { pending.resolve({ data: envelope, error: null }); });

    expect(await screen.findByText('Reanalisar conversa')).toBeInTheDocument();
    expect(checkAlertMock).toHaveBeenCalledTimes(1);
    expect(checkAlertMock.mock.calls[0][0]).toMatchObject({ contactId: 'contact-A' });
  });

  it('DESCARTA a análise em voo ao trocar de contato e NÃO dispara checkAndTriggerAlert', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = renderAssistant('contact-A');
    fireEvent.click(screen.getByText(/Analisar \(/));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    rerender(
      <AIConversationAssistant
        messages={messages}
        contactId="contact-B"
        contactName="contact-B"
        isOpen
        onClose={vi.fn()}
      />,
    );

    await act(async () => { pending.resolve({ data: envelope, error: null }); });

    // Nada de análise do contato A na tela do contato B...
    expect(screen.queryByText('Reanalisar conversa')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-tabs')).not.toBeInTheDocument();
    // ...nem efeito no servidor para o contato errado.
    expect(checkAlertMock).not.toHaveBeenCalled();
    expect(refetchMock).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('NÃO descarta por mensagem viva: mais mensagens no mesmo contato mantêm a análise', async () => {
    const pending = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(pending.promise);

    const { rerender } = renderAssistant('contact-A');
    fireEvent.click(screen.getByText(/Analisar \(/));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    rerender(
      <AIConversationAssistant
        messages={[...messages, { id: 'm9', sender: 'contact', content: 'chegou agora', created_at: new Date().toISOString() }]}
        contactId="contact-A"
        contactName="contact-A"
        isOpen
        onClose={vi.fn()}
      />,
    );

    await act(async () => { pending.resolve({ data: envelope, error: null }); });

    expect(await screen.findByText('Reanalisar conversa')).toBeInTheDocument();
    expect(checkAlertMock).toHaveBeenCalledTimes(1);
  });
});
