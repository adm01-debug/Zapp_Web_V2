import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

const mockThen = vi.fn();
const mockOrder = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      gte: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: mockOrder,
      then: mockThen,
    })),
  },
}));

import { ConversationHeatmap } from '../ConversationHeatmap';

describe('ConversationHeatmap — acessibilidade do filtro (N-091)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThen.mockImplementation((resolve: unknown) =>
      Promise.resolve((resolve as (v: { data: unknown[]; error: null }) => unknown)({ data: [], error: null })),
    );
  });

  it('getByRole acha o combobox Período pelo nome acessível', async () => {
    render(<ConversationHeatmap />, { wrapper: TestQueryWrapper });
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });

  it('axe button-name zerado no filtro de período', async () => {
    const { container } = render(<ConversationHeatmap />, { wrapper: TestQueryWrapper });
    expect(await axe(container)).toHaveNoViolations();
  });
});
