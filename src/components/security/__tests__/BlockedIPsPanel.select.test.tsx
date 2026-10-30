import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BlockedIPsPanel } from '../BlockedIPsPanel';

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

describe('BlockedIPsPanel — select explícito', () => {
  beforeEach(() => { selectColumns.mockClear(); });

  it('não usa select("*") — lista explícita de colunas', async () => {
    render(<BlockedIPsPanel />);

    await waitFor(() => {
      expect(selectColumns).toHaveBeenCalled();
    });

    const calledWith = selectColumns.mock.calls[0][0];
    expect(calledWith).not.toBe('*');
    expect(typeof calledWith).toBe('string');
    expect(calledWith).toContain('id');
    expect(calledWith).toContain('ip_address');
    expect(calledWith).toContain('reason');
    expect(calledWith).toContain('expires_at');
    expect(calledWith).toContain('is_permanent');
    expect(calledWith).toContain('request_count');
  });

  it('renderiza o painel sem erro', () => {
    const { container } = render(<BlockedIPsPanel />);
    expect(container).toBeTruthy();
  });
});