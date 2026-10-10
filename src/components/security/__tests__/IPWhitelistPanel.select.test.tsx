import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IPWhitelistPanel } from '../IPWhitelistPanel';

const selectColumns = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectColumns.mockReturnValue({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }),
    })),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
}));

describe('IPWhitelistPanel — select explícito', () => {
  beforeEach(() => { selectColumns.mockClear(); });

  it('não usa select("*") — lista explícita de colunas', async () => {
    render(<IPWhitelistPanel />);

    await waitFor(() => {
      expect(selectColumns).toHaveBeenCalled();
    });

    const calledWith = selectColumns.mock.calls[0][0];
    expect(calledWith).not.toBe('*');
    expect(typeof calledWith).toBe('string');
    expect(calledWith).toContain('id');
    expect(calledWith).toContain('ip_address');
    expect(calledWith).toContain('description');
    expect(calledWith).toContain('created_at');
  });

  it('renderiza o painel sem erro', () => {
    const { container } = render(<IPWhitelistPanel />);
    expect(container).toBeTruthy();
  });
});