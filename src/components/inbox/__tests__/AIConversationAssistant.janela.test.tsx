import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AIConversationAssistant } from '../AIConversationAssistant';

/**
 * Janela limitada: com 250 mensagens no período e um texto gigante, o que sai no
 * corpo de `ai-conversation-analysis` precisa caber nos tetos do servidor
 * (200 mensagens / 5000 chars por mensagem). E, com histórico mais antigo não
 * carregado, `periodDays` não pode afirmar um período que não foi analisado.
 */

const invokeMock = vi.hoisted(() => vi.fn());
const checkAlertMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
// Estável entre renders: um `vi.fn()` novo a cada render re-dispara os efeitos do
// componente (que invalidam a requisição em voo) e nada é aplicado.
const stopTtsMock = vi.hoisted(() => vi.fn());
const noopMock = vi.hoisted(() => vi.fn());

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
  useConversationAnalyses: () => ({ analyses: [], refetch: refetchMock, getSentimentTrend: () => null, loading: false }),
}));
vi.mock('@/hooks/inbox/useSentimentAlerts', () => ({
  useSentimentAlerts: () => ({ checkAndTriggerAlert: checkAlertMock }),
}));
vi.mock('@/components/inbox/ai-tools/useAnalysisTts', () => ({
  useAnalysisTts: () => ({
    isTtsPlaying: false, isTtsLoading: false, autoplayBlocked: false,
    stopTts: stopTtsMock, startTtsPlayback: noopMock, handleRetryAutoplay: noopMock, handleDismissAutoplayWarning: noopMock,
  }),
}));
vi.mock('@/components/inbox/ai-tools/AnalysisTabs', () => ({ AnalysisTabs: () => <div data-testid="analysis-tabs" /> }));
vi.mock('@/components/inbox/ai-tools/VisionIcon', () => ({ VisionIcon: () => <span data-testid="vision-icon" /> }));
vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => <div {...(props as any)}>{children}</div>,
  },
}));

const LONG_TEXT = 'x'.repeat(12000);

/** Índice 0 = mais antiga; `created_at` recente para cair no período padrão (7d). */
const buildMessages = (total: number) =>
  Array.from({ length: total }, (_, i) => ({
    id: `m${i}`,
    sender: (i % 2 === 0 ? 'contact' : 'agent') as 'contact' | 'agent',
    content: i === total - 1 ? LONG_TEXT : `mensagem ${i}`,
    created_at: new Date(Date.now() - (total - i) * 60_000).toISOString(),
  }));

const renderAssistant = (total: number, hasOlderMessages = false) =>
  render(
    <AIConversationAssistant
      messages={buildMessages(total)}
      contactId="contact-A"
      contactName="Ana"
      isOpen
      onClose={vi.fn()}
      hasOlderMessages={hasOlderMessages}
    />,
  );

const ultimoCorpo = () => invokeMock.mock.calls[0][1].body as {
  messages: Array<{ id: string; content: string }>;
  periodDays?: number | null;
};

describe('AIConversationAssistant — janela limitada e período coberto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetchMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({
      data: { status: 'ok', data: { summary: 'ok', status: 'ok', keyPoints: [], nextSteps: [], sentiment: 'neutro', sentimentScore: 50 } },
      error: null,
    });
  });

  it('com 250 mensagens envia as últimas 200 e corta o texto gigante em 5000', async () => {
    renderAssistant(250);
    // o recorte é informado na tela antes de enviar
    expect(screen.getByText(/Analisar \(últimas 200 de 250 msgs\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Analisar \(/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const body = ultimoCorpo();

    expect(body.messages).toHaveLength(200);
    expect(body.messages[0].id).toBe('m50');
    expect(body.messages[body.messages.length - 1].id).toBe('m249');
    expect(body.messages[body.messages.length - 1].content).toHaveLength(5000);
  });

  it('sem histórico mais antigo grava o período escolhido (7 dias)', async () => {
    renderAssistant(30);
    fireEvent.click(screen.getByText(/Analisar \(/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(ultimoCorpo().periodDays).toBe(7);
  });

  it('com histórico mais antigo não carregado NÃO afirma o período e avisa na tela', async () => {
    renderAssistant(30, true);

    expect(screen.getByText(/Há mensagens mais antigas ainda não carregadas/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Analisar \(/));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    expect(ultimoCorpo().periodDays ?? null).toBeNull();
  });

  it('422 do servidor vira a mensagem do servidor (não o genérico de non-2xx)', async () => {
    const mensagemServidor = 'Payload inválido: um ou mais campos falharam na validação.';
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { clone: () => ({ json: async () => ({ error: { code: 'VALIDATION_ERROR', message: mensagemServidor, fields: [] } }) }) },
      },
    });

    renderAssistant(250);
    fireEvent.click(screen.getByText(/Analisar \(/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(mensagemServidor));
  });

  it('não muda o caminho curto: conversa de 6 mensagens envia as 6', async () => {
    renderAssistant(6);
    fireEvent.click(screen.getByText(/Analisar \(/));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(ultimoCorpo().messages).toHaveLength(6);
  });
});
