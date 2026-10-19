import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { ConversationSummary } from '../ConversationSummary';

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })} , getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }), createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/components/inbox/summary/useSummaryTts', () => ({
  useSummaryTts: () => ({
    autoplayBlocked: true,
    isTtsPlaying: false,
    isTtsLoading: false,
    lastTtsText: '',
    startTtsPlayback: vi.fn(),
    handleRetryAutoplay: vi.fn(),
    handleDismissAutoplayWarning: vi.fn(),
  }),
}));

vi.mock('@/components/inbox/summary/SummaryResult', () => ({ SummaryResult: () => null }));
vi.mock('@/components/inbox/ai-tools/PeriodFilterSelector', () => ({
  PeriodFilterSelector: () => null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePeriodFilter: (messages: any[]) => ({
    analysisPeriod: '7d',
    setAnalysisPeriod: vi.fn(),
    customDateFrom: null,
    customDateTo: null,
    setCustomDateFrom: vi.fn(),
    setCustomDateTo: vi.fn(),
    clearCustomDates: vi.fn(),
    filteredMessages: messages,
  }),
}));

vi.mock('@/lib/aiRequest/context', () => ({
  buildPeriodKey: () => 'k',
  useAiRequestGeneration: () => ({
    begin: () => ({ isCurrent: () => true }),
    isCurrent: () => true,
    invalidate: () => {},
  }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('framer-motion', () => {
  const passthrough =
    (tag: 'div' | 'button' | 'span') =>
    ({ children, ...props }: AnyProps) => {
      const Tag = tag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Tag {...(props as any)}>{children}</Tag>;
    };
  return {
    motion: { div: passthrough('div'), button: passthrough('button'), span: passthrough('span') },
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

describe('ConversationSummary — dispensar aviso de áudio com nome acessível (A11Y-13)', () => {
  it('nomeia o botão de dispensar o aviso de autoplay bloqueado', () => {
    render(<ConversationSummary messages={[]} contactName="Ana" contactId="ct1" />);
    expect(
      screen.getByRole('button', { name: 'Dispensar aviso de áudio bloqueado' }),
    ).toBeInTheDocument();
  });
});
