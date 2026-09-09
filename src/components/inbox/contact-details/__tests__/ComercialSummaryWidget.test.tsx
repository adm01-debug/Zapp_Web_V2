import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/crm/useContactCrm360', () => ({
  useContactCrm360: () => ({
    isLoading: false,
    data: {
      resumo: { comprasTotal: 0, comprasCount: 0, propostas: 0, emAberto: 0 },
      ticketMedio: 0,
    },
  }),
}));

import { ComercialSummaryWidget } from '../ComercialSummaryWidget';

describe('ComercialSummaryWidget', () => {
  it('preserves legitimate zero monetary and count values', () => {
    render(<ComercialSummaryWidget contactId="contact-1" />);
    const values = screen.getAllByText((_, element) => element?.textContent?.replace(/\s/g, ' ') === 'R$ 0,00');
    expect(values).toHaveLength(2);
    expect(screen.getByText('Compras (0)')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
  });
});
