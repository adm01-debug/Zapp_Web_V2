import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EvolutionContactProfileSection } from '../EvolutionContactProfileSection';
import { buildJidVariants } from '@/hooks/integrations/useEvolutionContactProfile';

const h = vi.hoisted(() => ({
  role: { isSupervisor: true, loading: false },
  proxy: vi.fn(),
}));

vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => h.role }));
vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy: (...args: unknown[]) => h.proxy(...args) }));

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EvolutionContactProfileSection phone="+55 11 99999-0000" fallbackName="Maria" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.role = { isSupervisor: true, loading: false };
  h.proxy.mockReset();
});

describe('EvolutionContactProfileSection', () => {
  it('atendente sem papel de supervisor não consulta (a edge só libera admin/supervisor)', () => {
    h.role = { isSupervisor: false, loading: false };
    renderSection();
    expect(screen.getByTestId('evolution-profile-forbidden')).toBeInTheDocument();
    expect(h.proxy).not.toHaveBeenCalled();
  });

  it('carregando mostra esqueleto', () => {
    h.proxy.mockReturnValue(new Promise(() => {}));
    renderSection();
    expect(screen.getByTestId('evolution-profile-loading')).toBeInTheDocument();
  });

  it('mostra o perfil com conta comercial, links seguros e etiquetas da instância', async () => {
    h.proxy.mockResolvedValue({
      data: [{
        push_name: 'Maria Brindes',
        verified: true,
        is_business: true,
        about: 'Brindes para empresas',
        business_profile: { category: 'Comércio', website: ['https://exemplo.com.br', 'javascript:alert(1)'] },
        device_info: { device_manufacturer: 'Samsung', device_model: 'S23', wa_version: '2.24' },
        labels: ['Cliente novo'],
      }],
    });
    renderSection();
    expect(await screen.findByTestId('evolution-profile')).toHaveTextContent('Maria Brindes');
    expect(screen.getByRole('img', { name: 'Conta verificada' })).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://exemplo.com.br' })).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.queryByText('javascript:alert(1)')).toBeNull();
    expect(screen.getByTestId('evolution-profile-device')).toHaveTextContent('Samsung S23 · WA 2.24');
    expect(screen.getByText('Cliente novo')).toBeInTheDocument();

    const filters = h.proxy.mock.calls[0][0].filters;
    expect(h.proxy.mock.calls[0][0].table).toBe('evolution_contacts');
    expect(filters[0].operator).toBe('in');
  });

  it('sem perfil mostra vazio honesto', async () => {
    h.proxy.mockResolvedValue({ data: [] });
    renderSection();
    expect(await screen.findByTestId('evolution-profile-empty')).toBeInTheDocument();
  });

  it('VPS não configurada é dita como tal', async () => {
    h.proxy.mockResolvedValue({ data: [], notConfigured: true });
    renderSection();
    expect(await screen.findByTestId('evolution-profile-not-configured')).toBeInTheDocument();
  });

  it('erro do proxy não vira "sem perfil"', async () => {
    h.proxy.mockRejectedValue(new Error('Forbidden'));
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler o perfil do WhatsApp.');
  });

  it('buildJidVariants cobre com/sem DDI e os dois sufixos', () => {
    expect(buildJidVariants('11 99999-0000')).toEqual([
      '11999990000@s.whatsapp.net',
      '5511999990000@s.whatsapp.net',
      '11999990000@c.us',
      '5511999990000@c.us',
    ]);
    expect(buildJidVariants('')).toEqual([]);
  });
});
