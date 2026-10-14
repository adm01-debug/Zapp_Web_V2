import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ContactsTable } from '../ContactsTable';
import { ContactAdvancedFilters } from '../ContactAdvancedFilters';
import { ContactListItem } from '../ContactListItem';
import { CRMContactCard } from '../CRMContactCard';
import type { Contact } from '../types';
import type { SearchContactResult } from '@/types/contactSearch';
import { baseContact, noop, openMenu, trigger } from './contactDeleteFixtures';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

/**
 * Refazer 1 do conceito "remover tags de contatos": a remoção aconteceu nos
 * 4 componentes abaixo, mas nenhum teste provava a ausência. Cada teste aqui
 * renderiza o componente REAL com dados que CONTÊM tags e afirma que nenhum
 * texto/chip de etiqueta chega à tela.
 */
const contactWithTags = () => ({ ...baseContact(), tags: ['vip', 'atacado'] }) as unknown as Contact;

function filtersProps() {
  return {
    filterCompany: '', setFilterCompany: noop,
    filterJobTitle: '', setFilterJobTitle: noop,
    filterDateRange: 'all', setFilterDateRange: noop,
    uniqueCompanies: [], uniqueJobTitles: [],
    onClearFilters: noop, activeFiltersCount: 0,
  };
}

function crmContact(): SearchContactResult {
  return {
    contact_id: '40000000-0000-0000-0000-000000000001',
    full_name: 'Carla Nunes', nome_tratamento: null, apelido: null,
    cargo: null, departamento: null,
    relationship_score: 0, relationship_stage: null, sentiment: 'positive',
    tags: ['vip', 'atacado'],
    company_id: null, company_name: 'ACME', company_cnpj: null,
    company_logo: null, company_ramo: null, company_status: null,
    company_estado: null, company_cidade: null,
    vendedor_nome: null, cliente_ativado: true, ja_comprou: true,
    total_pedidos: 3, valor_total_compras: 1500.5, ticket_medio: 500.16,
    rfm_segment: 'Champions', rfm_score: 95,
    phone_primary: '5511999990001', email_primary: null,
    is_whatsapp: false,
  };
}

describe('Contatos · tags removidas (ausência)', () => {
  it('ContactsTable não mostra coluna Etiquetas mesmo com tags nos dados', () => {
    const { container } = render(
      <ContactsTable
        contacts={[contactWithTags()]}
        selectedIds={[]} onSelectIds={noop}
        onOpenDetails={noop} onOpenChat={noop} onEdit={noop} onDelete={noop}
        searchQuery=""
      />,
    );
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(headers.some((t) => t.includes('Etiqueta'))).toBe(false);
    // Prova que a linha renderizou de verdade com os dados (não é teste vazio).
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('vip');
  });

  it('ContactsTable não oferece "Gerenciar etiquetas" no menu da linha', async () => {
    render(
      <ContactsTable
        contacts={[contactWithTags()]}
        selectedIds={[]} onSelectIds={noop}
        onOpenDetails={noop} onOpenChat={noop} onEdit={noop} onDelete={noop}
        searchQuery=""
      />,
    );
    openMenu(trigger());
    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.queryByText('Gerenciar etiquetas')).not.toBeInTheDocument();
  });

  it('ContactAdvancedFilters não mostra filtro de Etiqueta', () => {
    render(<ContactAdvancedFilters {...filtersProps()} />);
    // Prova que o painel renderizou de verdade (não é teste vazio).
    expect(screen.getByText('Empresa')).toBeInTheDocument();
    expect(screen.queryByText('Etiqueta')).not.toBeInTheDocument();
    expect(screen.queryByText('Todas as etiquetas')).not.toBeInTheDocument();
  });

  it('ContactListItem não mostra chips de tag mesmo com tags nos dados', () => {
    const { container } = render(
      <ContactListItem
        contact={contactWithTags()}
        isSelected={false} onToggleSelect={noop}
        onOpenDetails={noop} onOpenChat={noop} onEdit={noop} onDelete={noop}
        index={0}
      />,
    );
    // Prova que o item renderizou de verdade (não é teste vazio).
    expect(screen.getByTestId('contact-list-item')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('vip');
    expect(container.textContent ?? '').not.toContain('atacado');
  });

  it('CRMContactCard não mostra chips de tag mesmo com tags nos dados', () => {
    const { container } = render(<CRMContactCard contact={crmContact()} />);
    // Prova que o card renderizou de verdade com os dados (não é teste vazio).
    expect(screen.getByText('Carla Nunes')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain('vip');
    expect(container.textContent ?? '').not.toContain('atacado');
  });
});
