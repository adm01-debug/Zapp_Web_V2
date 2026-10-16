import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CityWhitelistPanel } from '../CityWhitelistPanel';

const h = vi.hoisted(() => ({
  settingsUpdate: vi.fn(),
  cityRows: [] as Array<{ id: string; city_name: string; is_active: boolean; created_by: null; created_at: string }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'geo_blocking_settings') {
        return {
          select: () => ({
            limit: () => ({
              single: () => Promise.resolve({ data: { id: 's-1', city_whitelist_enabled: false }, error: null }),
            }),
          }),
          update: (payload: unknown) => {
            h.settingsUpdate(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {
        select: () => ({ order: () => Promise.resolve({ data: h.cityRows, error: null }) }),
      };
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('CityWhitelistPanel', () => {
  beforeEach(() => {
    h.settingsUpdate.mockClear();
    h.cityRows = [{ id: 'c-1', city_name: 'São Paulo', is_active: true, created_by: null, created_at: '2026-10-07T12:00:00Z' }];
  });

  it('nasce desligado e lista as cidades', async () => {
    render(<CityWhitelistPanel />);
    expect(await screen.findByText('São Paulo')).toBeTruthy();
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('ligar o toggle grava city_whitelist_enabled=true', async () => {
    render(<CityWhitelistPanel />);
    await screen.findByText('São Paulo');
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(h.settingsUpdate).toHaveBeenCalled());
    expect(h.settingsUpdate.mock.calls[0][0]).toMatchObject({ city_whitelist_enabled: true });
  });
});
