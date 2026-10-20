import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { ProfessionalSection } from '../ProfessionalSection';
import type { ConversationContact as Contact } from '@/types/chat';
import type { ContactSidebarData } from '@/types/contactSidebar';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

const contact: Contact = {
  id: 'contact-1',
  name: 'João Silva',
  phone: '+55 11 99999-0000',
  email: 'joao@local.com',
} as Contact;

const rpcData: ContactSidebarData = {
  found: true,
  contact_id: 'crm-1',
  professional: {
    whatsapp: { numero_e164: '+5511988776655', numero: '11988776655', phone_type: 'mobile' },
    email_corporativo: { email: 'joao@empresa.com', is_verified: true },
    empresa: { id: 'e1', nome: 'Promo Brindes', logo_url: null },
    departamento: 'Comercial',
    cargo: 'Diretor',
  },
};

function renderSection(overrides: Partial<Parameters<typeof ProfessionalSection>[0]> = {}) {
  const props = {
    index: 0, status: 'ok' as const, data: rpcData, contact,
    enrichedData: null, onQuickAction: vi.fn(), onBuscarCRM: vi.fn(), ...overrides,
  };
  render(
    <Accordion type="multiple" defaultValue={['professional']}>
      <ProfessionalSection {...props} />
    </Accordion>,
  );
  return props;
}

describe('ProfessionalSection (etapas 52–60)', () => {
  it('5 linhas na ordem WhatsApp, E-mail, Empresa, Departamento, Cargo (etapa 52)', () => {
    renderSection();
    const order = ['sidebar-row-whatsapp', 'sidebar-row-email', 'sidebar-row-company', 'sidebar-row-department', 'sidebar-row-job_title'];
    const rows = screen.getAllByTestId(/^sidebar-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(order);
  });

  it('WhatsApp só leitura: número inteiro e sem copiar nem abrir wa.me', () => {
    renderSection();
    const row = screen.getByTestId('sidebar-row-whatsapp');
    // Número completo na linha (nada de "(11) 9…") e sem quebra de linha.
    const numero = within(row).getByText('(11) 98877-6655');
    expect(numero).toHaveClass('whitespace-nowrap');
    expect(row.textContent).not.toContain('…');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(row.querySelector('a[href^="https://wa.me"]')).toBeNull();
  });

  it('e-mail verificado mostra o selo BadgeCheck (etapa 54)', () => {
    renderSection();
    expect(screen.getByLabelText('Verificado no Singu')).toBeInTheDocument();
    const row = screen.getByTestId('sidebar-row-email');
    expect(within(row).getByRole('link')).toHaveAttribute('href', 'mailto:joao@empresa.com');
  });

  it('empresa com logo_url nulo cai no fallback de iniciais (etapa 55)', () => {
    renderSection();
    const row = screen.getByTestId('sidebar-row-company');
    expect(within(row).getByText('Promo Brindes')).toBeInTheDocument();
    expect(within(row).queryByRole('img')).not.toBeInTheDocument();
    expect(within(row).getByText('PB')).toBeInTheDocument();
  });

  it('status not_found usa fallback local com marcador "Dado local do Zapp" (etapa 57)', () => {
    renderSection({ status: 'not_found', data: null });
    const row = screen.getByTestId('sidebar-row-email');
    expect(within(row).getByText('joao@local.com')).toBeInTheDocument();
    expect(within(row).getByLabelText('Dado local do Zapp')).toBeInTheDocument();
  });

  it('linha vazia em fallback vira "Adicionar" que abre o editor (etapa 58)', () => {
    const semEmail = { ...contact, email: null };
    const props = renderSection({ status: 'not_found', data: null, contact: semEmail });
    fireEvent.click(screen.getByTestId('sidebar-add-email'));
    fireEvent.click(screen.getByTestId('sidebar-add-company'));
    fireEvent.click(screen.getByTestId('sidebar-add-job_title'));
    expect(props.onQuickAction).toHaveBeenCalledWith('edit');
    expect(props.onQuickAction).toHaveBeenCalledTimes(3);
    // Departamento não oferece "Adicionar": EditContactDialog não tem o campo.
    expect(screen.queryByTestId('sidebar-add-department')).not.toBeInTheDocument();
  });

  it('numero nacional sem e164 continua formatado e sem link wa.me', () => {
    const nacional: ContactSidebarData = {
      ...rpcData,
      professional: {
        ...rpcData.professional!,
        whatsapp: { numero_e164: null, numero: '11988776655', phone_type: 'mobile' },
      },
    };
    renderSection({ data: nacional });
    const row = screen.getByTestId('sidebar-row-whatsapp');
    expect(within(row).getByText('(11) 98877-6655')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });

  it('not_found mostra "Contato não vinculado" + CTA Buscar no CRM (etapa 59)', () => {
    const props = renderSection({ status: 'not_found', data: null });
    expect(screen.getByText('Contato não vinculado ao Singu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar no CRM' }));
    expect(props.onBuscarCRM).toHaveBeenCalledTimes(1);
  });

  it('Dados Profissionais sem subtítulo (etapa 60)', () => {
    renderSection();
    expect(screen.queryByText('Informações da sua vida profissional')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-section-subtitle')).not.toBeInTheDocument();
  });

  it('e-mail: rótulo "E-mail" e cópia mantida', () => {
    renderSection();
    const row = screen.getByTestId('sidebar-row-email');
    expect(within(row).getByText('E-mail')).toBeInTheDocument();
    expect(within(row).queryByText('E-mail corporativo')).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Copiar E-mail' }));
    expect(writeText).toHaveBeenCalledWith('joao@empresa.com');
  });

  it('loading mostra skeletons', () => {
    renderSection({ status: 'loading', data: null });
    expect(screen.getByTestId('sidebar-professional-loading')).toBeInTheDocument();
  });
});
