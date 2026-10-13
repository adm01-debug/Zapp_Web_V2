import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactCard } from '../ContactCard';
import { CRMContactCard } from '../CRMContactCard';
import { baseContact, noop } from './contactDeleteFixtures';
import type { Contact } from '../types';
import type { SearchContactResult } from '@/types/contactSearch';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

function cardProps(contact: Contact) {
  return {
    contact,
    isSelected: false,
    onToggleSelect: noop,
    onOpenDetails: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

// ── ContactCard (view padrão / "Cards") ──────────────────────────────────────
describe('ContactCard · cargo (view padrão)', () => {
  it('mostra o cargo quando o contato tem job_title', () => {
    render(<ContactCard {...cardProps(baseContact({ job_title: 'Gerente de Compras' }))} />);
    expect(screen.getByText('Gerente de Compras')).toBeInTheDocument();
  });

  it('não mostra cargo quando job_title é null', () => {
    render(<ContactCard {...cardProps(baseContact({ job_title: null }))} />);
    expect(screen.queryByText('Gerente de Compras')).not.toBeInTheDocument();
  });

  it('não renderiza etiquetas mesmo que o dado ainda venha com tags (função removida)', () => {
    const comTags = { ...baseContact(), tags: ['vip', 'atacado'] } as unknown as Contact;
    const { container } = render(<ContactCard {...cardProps(comTags)} />);
    expect(container.textContent).not.toContain('vip');
    expect(container.textContent).not.toContain('atacado');
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});

// ── CRMContactCard ───────────────────────────────────────────────────────────
function crmContact(overrides: Partial<SearchContactResult>): SearchContactResult {
  return {
    contact_id: 'c-1',
    full_name: 'Ana Souza',
    nome_tratamento: null,
    apelido: null,
    cargo: null,
    departamento: null,
    relationship_score: 0,
    relationship_stage: null,
    sentiment: null,
    tags: [],
    company_id: null,
    company_name: null,
    company_cnpj: null,
    company_logo: null,
    company_ramo: null,
    company_status: null,
    company_estado: null,
    company_cidade: null,
    vendedor_nome: null,
    cliente_ativado: null,
    ja_comprou: null,
    total_pedidos: null,
    valor_total_compras: null,
    ticket_medio: null,
    rfm_segment: null,
    rfm_score: null,
    phone_primary: null,
    email_primary: null,
    is_whatsapp: false,
    ...overrides,
  };
}

describe('CRMContactCard · cargo', () => {
  it('mostra o cargo quando o contato tem', () => {
    render(<CRMContactCard contact={crmContact({ cargo: 'Diretor Comercial' })} />);
    expect(screen.getByText('Diretor Comercial')).toBeInTheDocument();
  });

  it('não mostra cargo quando é null', () => {
    render(<CRMContactCard contact={crmContact({ cargo: null })} />);
    expect(screen.queryByText('Diretor Comercial')).not.toBeInTheDocument();
  });
});
