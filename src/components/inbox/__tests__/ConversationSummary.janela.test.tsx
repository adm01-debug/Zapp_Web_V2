import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationSummary } from '../ConversationSummary';

const invokeMock = vi.hoisted(() => vi.fn());
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
vi.mock('@/components/inbox/summary/useSummaryTts', () => ({
  useSummaryTts: () => ({
    isTtsPlaying: false, isTtsLoading: false, autoplayBlocked: false,
    stopTts: stopTtsMock, startTtsPlayback: vi.fn(), handleRetryAutoplay: vi.fn(), handleDismissAutoplayWarning: vi.fn(),
  }),
}));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => <div {...(props as Record<string, never>)}>{children}</div> },
}));

const CONTATO = '11111111-1111-4111-8111-111111111111';

function mensagens(total: number, minutosAtras = 1) {
  return Array.from({ length: total }, (_, i) => ({
    id: `m${i}`,
    sender: (i % 2 === 0 ? 'contact' : 'agent') as 'contact' | 'agent',
    content: `mensagem ${i}`,
    created_at: new Date(Date.now() - (total - i) * minutosAtras * 60_000).toISOString(),
  }));
}

const respostaOk = {
  data: {
    status: 'ok',
    data: { summary: 'resumo da conversa', status: 'resolvido', keyPoints: [], sentiment: 'neutro' },
  },
  error: null,
};

describe('ConversationSummary — período gravado e janela limitada', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    invokeMock.mockResolvedValue(respostaOk);
  });

  it('envia getPeriodDays do período escolhido (7 dias por padrão)', async () => {
    render(<ConversationSummary messages={mensagens(20)} contactName="Ana" contactId={CONTATO} />);
    fireEvent.click(screen.getByText(/Gerar resumo/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body.periodDays).toBe(7);
  });

  it('com histórico mais antigo não carregado a janela não cobre 7 dias: não grava período', async () => {
    render(<ConversationSummary messages={mensagens(20)} contactName="Ana" contactId={CONTATO} hasOlderMessages />);
    fireEvent.click(screen.getByText(/Gerar resumo/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0][1].body.periodDays).toBeNull();
  });

  it('com 250 mensagens envia só as últimas 200', async () => {
    render(<ConversationSummary messages={mensagens(250)} contactName="Ana" contactId={CONTATO} />);
    fireEvent.click(screen.getByText(/Gerar resumo/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const body = invokeMock.mock.calls[0][1].body;
    expect(body.messages).toHaveLength(200);
    expect(body.messages[0].content).toBe('mensagem 50');
  });
});
