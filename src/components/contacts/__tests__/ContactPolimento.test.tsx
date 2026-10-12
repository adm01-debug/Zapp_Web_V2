import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CRMContactCard } from '../CRMContactCard';
import { ContactCard } from '../ContactCard';
import { ContactListItem } from '../ContactListItem';
import { ContactGroupedList } from '../ContactGroupedList';
import { baseContact, noop, openMenu, trigger } from './contactDeleteFixtures';
import type { Contact } from '../types';
import type { SearchContactResult } from '@/types/contactSearch';

/**
 * Onda 6 — lote de polimento do card de contato. Prova, pelo componente REAL:
 *  1. as 3 views compartilham o mesmo token de hover (card-lift card-glow);
 *  2. card sem telefone/e-mail não fica com a altura mínima cheia (sem vão vazio);
 *  3. Conversar/Editar existem num único lugar no ContactCard (o rodapé);
 *  4. a lista agrupada usa o mesmo espaçamento (space-y-2) da lista solta.
 */

const crmContact: SearchContactResult = {
  contact_id: 'c-crm',
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
};

function itemProps(contact: Contact) {
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

describe('Polimento · hover unificado nas 3 views', () => {
  it('CRMContactCard usa o token de efeito card-lift card-glow', () => {
    const { container } = render(<CRMContactCard contact={crmContact} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('card-lift');
    expect(root.className).toContain('card-glow');
  });

  it('ContactCard usa o token de efeito card-lift card-glow', () => {
    render(<ContactCard {...itemProps(baseContact())} />);
    const root = screen.getByTestId('contact-card');
    expect(root.className).toContain('card-lift');
    expect(root.className).toContain('card-glow');
  });

  it('ContactListItem usa o token de efeito card-lift card-glow', () => {
    render(<ContactListItem {...itemProps(baseContact())} />);
    const root = screen.getByTestId('contact-list-item');
    expect(root.className).toContain('card-lift');
    expect(root.className).toContain('card-glow');
  });
});

describe('Polimento · vão vazio no ContactCard', () => {
  it('sem telefone nem e-mail não força a altura mínima cheia', () => {
    render(<ContactCard {...itemProps(baseContact({ phone: '', email: null }))} />);
    const root = screen.getByTestId('contact-card');
    expect(root.className).not.toContain('min-h-[164px]');
    expect(root.className).toContain('min-h-[120px]');
  });

  it('com telefone mantém a altura mínima cheia (grade uniforme)', () => {
    render(<ContactCard {...itemProps(baseContact({ phone: '5511999999999' }))} />);
    const root = screen.getByTestId('contact-card');
    expect(root.className).toContain('min-h-[164px]');
  });
});

describe('Polimento · ações do ContactCard sem duplicação', () => {
  it('Conversar/Editar existem só no rodapé; o menu ⋮ traz apenas Excluir', async () => {
    render(<ContactCard {...itemProps(baseContact({ can_delete: true }))} />);

    // Um único alvo de cada ação — os botões do rodapé, identificados pelo title.
    expect(screen.getAllByTitle('Conversar')).toHaveLength(1);
    expect(screen.getAllByTitle('Editar')).toHaveLength(1);

    openMenu(trigger());

    expect(await screen.findByText('Excluir')).toBeInTheDocument();
    expect(screen.queryByText('Conversar')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });
});

describe('Polimento · espaçamento da lista agrupada', () => {
  it('ContactGroupedList usa o mesmo space-y-2 do ContactContentArea', () => {
    render(
      <ContactGroupedList
        contacts={[baseContact({ company: 'Acme' })]}
        selectedIds={[]}
        onToggleSelect={noop}
        onOpenDetails={noop}
        onOpenChat={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    const item = screen.getByTestId('contact-list-item');
    expect(item.parentElement?.className).toContain('space-y-2');
    expect(item.parentElement?.className).not.toContain('space-y-1');
  });
});
