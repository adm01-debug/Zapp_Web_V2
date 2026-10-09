import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('@/hooks/useGeoBlocking', () => ({
  useGeoBlocking: () => ({
    settings: { mode: 'whitelist' as const },
    allowedCountries: [{ id: '1', country_name: 'Brasil', country_code: 'BR', created_at: new Date().toISOString() }],
    blockedCountries: [],
    loading: false,
    addCountry: vi.fn(),
    removeCountry: vi.fn(),
    updateSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '1', email: 'test@test.com' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })), limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })), },
}));

import { GeoBlockingPanel } from '../GeoBlockingPanel';

describe('a11y: GeoBlockingPanel', () => {
  it('abas de filtro têm painel associado (aria-controls)', () => {
    render(<GeoBlockingPanel />);
    const triggers = screen.getAllByRole('tab');
    for (const trigger of triggers) {
      const controls = trigger.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      const panel = document.getElementById(controls!);
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('role', 'tabpanel');
    }
  });

  it('axe não acusa botões sem nome', async () => {
    render(<GeoBlockingPanel />);
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'button-name')).toEqual([]);
  });
});