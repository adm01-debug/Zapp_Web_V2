import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

const mockThen = vi.fn();
const mockOrder = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockLte = vi.fn().mockReturnThis();
const mockLt = vi.fn().mockReturnThis();
const mockGte = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      gte: mockGte,
      lte: mockLte,
      lt: mockLt,
      eq: mockEq,
      limit: mockLimit,
      order: mockOrder,
      then: mockThen,
    })),
  },
}));

import { PeriodComparison } from '../PeriodComparison';

// Ordem das 4 consultas (chamadas de `.then()`):
// 0 = mensagens do período atual, 1 = mensagens do período anterior,
// 2 = encerradas atual, 3 = encerradas anterior.
const COUNTS = [10, 8, 6, 4];

let counts: number[];
let errorIndex: number;
let callIndex: number;

function withCounts(overrides: Partial<Record<number, number>>) {
  counts = [...COUNTS];
  for (const [i, v] of Object.entries(overrides)) counts[Number(i)] = v as number;
}

describe('PeriodComparison — comparativo entre períodos (falha e base)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counts = [...COUNTS];
    errorIndex = -1;
    callIndex = 0;
    mockThen.mockImplementation((resolve: (v: unknown) => unknown) => {
      const idx = callIndex++;
      const error = idx === errorIndex ? { message: 'permission denied' } : null;
      return Promise.resolve(resolve({ data: [], error, count: error ? null : counts[idx] ?? 0 }));
    });
  });

  it('período anterior 0 NÃO vira +100%: mostra "sem base de comparação"', async () => {
    withCounts({ 1: 0 }); // mensagens do período anterior = 0
    render(<PeriodComparison />, { wrapper: TestQueryWrapper });

    await waitFor(() => expect(screen.getByText('Mensagens recebidas')).toBeInTheDocument());
    expect(screen.getByText('sem base de comparação')).toBeInTheDocument();
    expect(screen.queryByText('+100%')).toBeNull();
  });

  it('falha nas 4 consultas: erro visível e nenhum valor exibido como 0', async () => {
    for (const idx of [0, 1, 2, 3]) {
      vi.clearAllMocks();
      callIndex = 0;
      errorIndex = idx;
      mockThen.mockImplementation((resolve: (v: unknown) => unknown) => {
        const i = callIndex++;
        const error = i === errorIndex ? { message: 'permission denied' } : null;
        return Promise.resolve(resolve({ data: [], error, count: error ? null : counts[i] ?? 0 }));
      });

      const { unmount } = render(<PeriodComparison />, { wrapper: TestQueryWrapper });
      await waitFor(() => expect(screen.getByTestId('reports-error')).toBeInTheDocument());

      // A consulta que falhou vira "—" (desconhecido), nunca 0 confirmado.
      expect(screen.getAllByText('—')).toHaveLength(1);
      expect(screen.getAllByTestId('variation-no-base')).toHaveLength(1);
      unmount();
    }
  });
});

describe('PeriodComparison — acessibilidade do filtro (N-091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callIndex = 0;
    mockThen.mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null, count: 0 })),
    );
  });

  it('getByRole acha o combobox Período pelo nome acessível', async () => {
    render(<PeriodComparison />, { wrapper: TestQueryWrapper });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument());
  });

  it('axe button-name zerado no filtro de período', async () => {
    const { container } = render(<PeriodComparison />, { wrapper: TestQueryWrapper });
    expect(await axe(container)).toHaveNoViolations();
  });
});
