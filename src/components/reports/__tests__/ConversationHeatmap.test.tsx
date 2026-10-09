import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      Promise.resolve(resolve({ data: [], error: null })),
    );
  });

  it('getByRole acha o combobox Período pelo nome acessível', async () => {
    render(<ConversationHeatmap />, { wrapper: TestQueryWrapper });
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });
});