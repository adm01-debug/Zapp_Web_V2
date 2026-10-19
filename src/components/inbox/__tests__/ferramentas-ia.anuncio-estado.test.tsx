/**
 * Acessibilidade das ferramentas de IA da conversa — anúncio de estado.
 *
 * As quatro ferramentas (Visão/análise, Resumo, Objeções e Ajuda dos
 * Universitários) mostravam carregamento e erro apenas por cor/ícone; um leitor
 * de tela não era avisado. Aqui cada uma é renderizada com o estado real
 * (hook/serviço simulados) e o anúncio é buscado por role=status/role=alert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { AIConversationAssistant } from '@/components/inbox/AIConversationAssistant';
import { ConversationSummary } from '@/components/inbox/ConversationSummary';
import { ObjectionDetector } from '@/components/inbox/ObjectionDetector';
import { UniversityHelp } from '@/components/inbox/UniversityHelp';

const invokeMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const stopTtsMock = vi.hoisted(() => vi.fn());
const startTtsPlaybackMock = vi.hoisted(() => vi.fn());
const objectionDetector = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const universityHelp = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),

  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/hooks/chat/useConversationAnalyses', () => ({
  useConversationAnalyses: () => ({ analyses: [], refetch: vi.fn(), getSentimentTrend: () => null, loading: false }),
}));

vi.mock('@/hooks/inbox/useSentimentAlerts', () => ({
  useSentimentAlerts: () => ({ checkAndTriggerAlert: vi.fn() }),
}));

vi.mock('@/components/inbox/ai-tools/useAnalysisTts', () => ({
  useAnalysisTts: () => ({
    isTtsPlaying: false,
    isTtsLoading: false,
    autoplayBlocked: false,
    // Identidade ESTÁVEL: `stopTts` entra nas deps de um efeito do componente;
    // recriado a cada render, o efeito rodaria em loop e zeraria o carregamento.
    stopTts: stopTtsMock,
    startTtsPlayback: startTtsPlaybackMock,
    handleRetryAutoplay: vi.fn(),
    handleDismissAutoplayWarning: vi.fn(),
  }),
}));

vi.mock('@/components/inbox/summary/useSummaryTts', () => ({
  useSummaryTts: () => ({
    isTtsPlaying: false,
    isTtsLoading: false,
    lastTtsText: null,
    autoplayBlocked: false,
    startTtsPlayback: vi.fn(),
    handleRetryAutoplay: vi.fn(),
    handleDismissAutoplayWarning: vi.fn(),
  }),
}));

vi.mock('@/hooks/inbox/useObjectionDetector', () => ({
  useObjectionDetector: () => objectionDetector.value,
}));

vi.mock('@/hooks/ui/useUniversityHelp', () => ({
  useUniversityHelp: () => universityHelp.value,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => (
      <div {...(props as Record<string, unknown>)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const recentMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    sender: (i % 2 === 0 ? 'contact' : 'agent') as 'contact' | 'agent',
    content: `Mensagem ${i}`,
    created_at: new Date().toISOString(),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  // Requisição de IA em voo: o componente fica no estado de carregamento.
  invokeMock.mockReturnValue(new Promise(() => {}));
});

describe('AIConversationAssistant — anúncio de carregamento', () => {
  it('publica o estado de análise em uma região role=status', async () => {
    render(
      <AIConversationAssistant
        messages={recentMessages(6)}
        contactId="c1"
        contactName="Cliente"
        isOpen
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Analisar/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Analisando');
  });
});

describe('ConversationSummary — anúncio de carregamento', () => {
  it('publica o estado de geração do resumo em uma região role=status', async () => {
    render(<ConversationSummary messages={recentMessages(10)} contactName="Cliente" />);

    fireEvent.click(screen.getByRole('button', { name: /Gerar resumo/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Gerando resumo');
  });
});

describe('ObjectionDetector — anúncio de carregamento e erro', () => {
  it('publica o carregamento em uma região role=status', () => {
    objectionDetector.value = {
      analyzed: true,
      loading: true,
      objections: [],
      error: null,
      clientMessages: [{ id: 'x', content: 'oi', sender: 'contact', timestamp: '' }],
    };
    render(<ObjectionDetector contactId="c1" lastMessages={['oi']} />);

    expect(screen.getByRole('status')).toHaveTextContent('Analisando mensagens');
  });

  it('publica o erro como role=alert', () => {
    objectionDetector.value = {
      analyzed: true,
      loading: false,
      objections: [],
      error: 'Falha de rede',
      clientMessages: [],
    };
    render(<ObjectionDetector contactId="c1" lastMessages={['oi']} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Erro na análise');
    expect(alert).toHaveTextContent('Falha de rede');
  });
});

describe('UniversityHelp — anúncio de carregamento e erro', () => {
  function baseProps(overrides: Record<string, unknown> = {}) {
    return {
      selectedIds: new Set<string>(),
      loading: false,
      response: null,
      selectedTone: 'profissional',
      setSelectedTone: vi.fn(),
      error: null,
      filterMode: 'all',
      setFilterMode: vi.fn(),
      filteredMessages: [],
      periodFilter: {
        analysisPeriod: 'all',
        setAnalysisPeriod: vi.fn(),
        customDateFrom: undefined,
        customDateTo: undefined,
        setCustomDateFrom: vi.fn(),
        setCustomDateTo: vi.fn(),
        clearCustomDates: vi.fn(),
        filteredMessages: [],
      },
      toggleMessage: vi.fn(),
      selectAll: vi.fn(),
      generateResponse: vi.fn(),
      handleRegenerate: vi.fn(),
      lastCallRef: { current: 0 },
      ...overrides,
    };
  }

  it('publica o estado de geração de resposta em uma região role=status', () => {
    universityHelp.value = baseProps({ loading: true });
    render(<UniversityHelp contactId="c1" messages={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent('Gerando resposta');
  });

  it('publica o erro como role=alert', () => {
    universityHelp.value = baseProps({ error: 'Falha ao consultar a IA' });
    render(<UniversityHelp contactId="c1" messages={[]} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Erro ao gerar resposta');
    expect(alert).toHaveTextContent('Falha ao consultar a IA');
  });
});
