import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';

const mockInsert = vi.fn((_record: unknown) => Promise.resolve({ error: null }));
const mockUseContactPurchases = vi.fn();

vi.mock('@/hooks/crm/useContactPurchases', () => ({
  useContactPurchases: (...args: unknown[]) => mockUseContactPurchases(...args),
  contactPurchasesKey: (contactId: string) => ['contact-purchases', contactId] as const,
}));

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  contactCrm360Key: (contactId: string) => ['contact-crm-360', contactId] as const,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (record: unknown) => mockInsert(record),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const queryClient = new QueryClient();

function wrapper(ui: React.ReactElement) {
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('ContactPurchasesPanel — acessibilidade (N-042)', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockUseContactPurchases.mockReturnValue({ data: [], isLoading: false });
  });

  it('seletor de tipo tem aria-label "Período das compras"', () => {
    render(wrapper(<ContactPurchasesPanel contactId="c1" />));
    fireEvent.click(screen.getByRole('button', { name: 'Novo' }));
    expect(screen.getByRole('combobox', { name: 'Período das compras' })).toBeInTheDocument();
  });
});