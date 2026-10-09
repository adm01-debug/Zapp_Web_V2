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

describe('PeriodComparison — acessibilidade do filtro (N-091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThen.mockImplementation((resolve: unknown) =>
      Promise.resolve((resolve as (v: { data: unknown[]; error: null }) => unknown)({ data: [], error: null })),
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