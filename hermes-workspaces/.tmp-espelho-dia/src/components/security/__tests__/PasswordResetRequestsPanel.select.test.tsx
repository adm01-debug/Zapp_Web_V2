import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';

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

describe('PasswordResetRequestsPanel — select explícito', () => {
  beforeEach(() => { selectColumns.mockClear(); });

  it('não usa select("*") — lista explícita de colunas', async () => {
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(selectColumns).toHaveBeenCalled();
    });

    const calledWith = selectColumns.mock.calls[0][0];
    expect(calledWith).not.toBe('*');
    expect(typeof calledWith).toBe('string');
    expect(calledWith).toContain('id');
    expect(calledWith).toContain('email');
    expect(calledWith).toContain('reason');
    expect(calledWith).toContain('status');
    expect(calledWith).toContain('reviewed_at');
    expect(calledWith).toContain('rejection_reason');
    expect(calledWith).toContain('ip_address');
    expect(calledWith).toContain('created_at');
  });

  it('renderiza o painel sem erro', () => {
    const { container } = render(<PasswordResetRequestsPanel />);
    expect(container).toBeTruthy();
  });
});