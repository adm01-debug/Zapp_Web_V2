import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PublicApiDashboard } from '../PublicApiDashboard';
import { NavigationService } from '@/services/navigation.service';

describe('PublicApiDashboard kill switch', () => {
  it('nao anuncia a API na navegacao avancada', () => {
    expect(NavigationService.getAdvancedNav().some((item) => item.id === 'public-api')).toBe(false);
  });

  it('nao renderiza token, gerador, copia ou endpoint de envio', () => {
    render(<PublicApiDashboard />);

    expect(screen.getByRole('status')).toHaveTextContent('API pública temporariamente desativada');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/x-api-key/i)).not.toBeInTheDocument();
  });
});
