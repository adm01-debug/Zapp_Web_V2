import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      Promise.resolve(resolve({ data: [], error: null })),
    );
  });

  it('getByRole acha o combobox Período pelo nome acessível', async () => {
    render(<PeriodComparison />, { wrapper: TestQueryWrapper });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument());
  });
});