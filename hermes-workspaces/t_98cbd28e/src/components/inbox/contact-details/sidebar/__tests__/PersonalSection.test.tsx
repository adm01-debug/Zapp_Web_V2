import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { PersonalSection } from '../PersonalSection';
import type { ContactSidebarData } from '@/types/contactSidebar';

const rpcData: ContactSidebarData = {
  found: true,
  contact_id: 'crm-1',
  personal: {
    social: [
      { plataforma: 'instagram', handle: 'joaosilva', url: 'https://instagram.com/joaosilva' },
      { plataforma: 'linkedin', handle: null, url: 'https://linkedin.com/in/joao-silva' },
      { plataforma: 'facebook', handle: 'joao.silva', url: 'https://facebook.com/joao.silva' },
    ],
    data_nascimento: '1985-03-14',
  },
};

function renderSection(overrides: Partial<Parameters<typeof PersonalSection>[0]> = {}) {
  const props = {
    index: 0, status: 'ok' as const, data: rpcData, onBuscarCRM: vi.fn(), ...overrides,
  };
  render(
    <Accordion type="multiple" defaultValue={['personal']}>
      <PersonalSection {...props} />
    </Accordion>,
  );
  return props;
}

afterEach(() => vi.useRealTimers());

describe('PersonalSection (etapas 61–67)', () => {
  it('5 linhas na ordem Instagram, LinkedIn, Facebook, X, Nascimento (etapa 61)', () => {
    renderSection();
    const rows = screen.getAllByTestId(/^sidebar-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'sidebar-row-instagram', 'sidebar-row-linkedin', 'sidebar-row-facebook', 'sidebar-row-x', 'sidebar-row-birthday',
    ]);
  });

  it('redes: @handle para Instagram/X e /caminho para LinkedIn/Facebook, com link seguro (etapa 62)', () => {
    renderSection();
    const ig = screen.getByTestId('sidebar-row-instagram');
    expect(within(ig).getByText('@joaosilva')).toBeInTheDocument();
    expect(within(ig).getByRole('link')).toHaveAttribute('href', 'https://instagram.com/joaosilva');
    const li = screen.getByTestId('sidebar-row-linkedin');
    expect(within(li).getByText('/in/joao-silva')).toBeInTheDocument();
    const fb = screen.getByTestId('sidebar-row-facebook');
    expect(within(fb).getByText('joao.silva')).toBeInTheDocument();
    expect(within(fb).getByRole('link')).toHaveAttribute('href', 'https://facebook.com/joao.silva');
  });

  it('URL javascript: não renderiza link nem valor (etapa 62)', () => {
    renderSection({
      data: { found: true, personal: { social: [{ plataforma: 'instagram', handle: null, url: 'javascript:alert(1)' }], data_nascimento: null } },
    });
    const ig = screen.getByTestId('sidebar-row-instagram');
    expect(within(ig).queryByRole('link')).not.toBeInTheDocument();
    expect(within(ig).getByText('—')).toBeInTheDocument();
  });

  it('sem rede → "—" sem ação (etapa 63/D5: X sempre visível)', () => {
    renderSection();
    const x = screen.getByTestId('sidebar-row-x');
    expect(within(x).getByText('—')).toBeInTheDocument();
    expect(within(x).queryByRole('link')).not.toBeInTheDocument();
  });

  it('nascimento dd/MM/yyyy + "N anos" (etapa 64)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2));
    renderSection();
    const row = screen.getByTestId('sidebar-row-birthday');
    expect(within(row).getByText('14/03/1985')).toBeInTheDocument();
    expect(within(row).getByText('41 anos')).toBeInTheDocument();
  });

  it('aniversário no mês corrente → Cake em warning (etapa 65)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20)); // março
    renderSection();
    expect(screen.getByLabelText('Aniversário este mês')).toBeInTheDocument();
    vi.setSystemTime(new Date(2026, 3, 20)); // abril
    const { unmount } = render(<Accordion type="multiple" defaultValue={['personal']}><PersonalSection index={0} status="ok" data={rpcData} onBuscarCRM={vi.fn()} /></Accordion>);
    expect(screen.getAllByLabelText('Aniversário este mês')).toHaveLength(1); // só o do 1º painel (março)
    unmount();
  });

  it('status !== ok → 5 linhas com "—" + estado vazio por status (etapa 66)', () => {
    const props = renderSection({ status: 'not_found', data: null });
    expect(screen.getByText('Contato não vinculado ao Singu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar no CRM' }));
    expect(props.onBuscarCRM).toHaveBeenCalled();
  });

  it('disabled → "Integração com o Singu desligada" sem CTA (etapa 66)', () => {
    renderSection({ status: 'disabled', data: null });
    expect(screen.getByText('Integração com o Singu desligada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar no CRM' })).not.toBeInTheDocument();
  });

  it('subtítulo exato do mock (etapa 67)', () => {
    renderSection();
    expect(screen.getByText('Conecte-se nas redes e saiba mais sobre a pessoa')).toBeInTheDocument();
  });

  it('loading mostra skeletons', () => {
    renderSection({ status: 'loading', data: null });
    expect(screen.getByTestId('sidebar-personal-loading')).toBeInTheDocument();
  });
});
