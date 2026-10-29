import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { ContactCompareDialog } from '../ContactCompareDialog';
import type { Contact } from '../types';

afterEach(cleanup);

function contato(over: Partial<Contact>): Contact {
  return {
    id: 'c1',
    name: 'Ana Souza',
    surname: null,
    nickname: null,
    phone: '11 99999-0001',
    email: 'ana@exemplo.com',
    avatar_url: null,
    company: null,
    job_title: null,
    tags: null,
    contact_type: 'Cliente',
    created_at: '2026-01-01T12:00:00.000Z',
    ...over,
  };
}

const ana = contato({ id: 'a', name: 'Ana Souza', phone: '11 99999-0001', email: 'ana@exemplo.com', contact_type: 'Cliente' });
const bruno = contato({ id: 'b', name: 'Bruno Lima', phone: '11 99999-0002', email: 'ana@exemplo.com', contact_type: 'Fornecedor' });

/** Acha a <tr> de um campo pelo rótulo (o ícone não interfere no texto). */
function linhaDoCampo(rotulo: string): HTMLElement {
  const linha = screen
    .getAllByRole('row')
    .find((r) => r.textContent?.includes(rotulo) && r.querySelector('th[scope="row"]'));
  if (!linha) throw new Error(`linha do campo "${rotulo}" não encontrada`);
  return linha;
}

describe('ContactCompareDialog — novo visual (RD-083)', () => {
  it('não abre com menos de 2 contatos', () => {
    const { container } = render(
      <ContactCompareDialog open onOpenChange={vi.fn()} contacts={[ana]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra uma coluna por contato, com nome e tipo', () => {
    render(<ContactCompareDialog open onOpenChange={vi.fn()} contacts={[ana, bruno]} />);

    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    // O tipo aparece no selo da coluna e na linha "Tipo": basta existir.
    expect(screen.getAllByText('Cliente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fornecedor').length).toBeGreaterThan(0);
  });

  it('limita a comparação a 3 contatos, ignorando o quarto', () => {
    const quatro = [
      ana,
      bruno,
      contato({ id: 'c', name: 'Carla Dias' }),
      contato({ id: 'd', name: 'Diego Reis' }),
    ];
    render(<ContactCompareDialog open onOpenChange={vi.fn()} contacts={quatro} />);

    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Carla Dias')).toBeInTheDocument();
    expect(screen.queryByText('Diego Reis')).not.toBeInTheDocument();
  });

  it('destaca a linha e a célula onde os valores diferem', () => {
    render(<ContactCompareDialog open onOpenChange={vi.fn()} contacts={[ana, bruno]} />);

    // Telefone difere entre Ana e Bruno: a linha é marcada e a célula divergente também.
    const telefone = linhaDoCampo('Telefone');
    expect(telefone).toHaveAttribute('data-diff', 'true');
    const celulasTelefone = telefone.querySelectorAll('td');
    expect(celulasTelefone[1]).toHaveAttribute('data-diff', 'true');

    // E-mail é igual nos dois: nada destacado.
    const email = linhaDoCampo('E-mail');
    expect(email).not.toHaveAttribute('data-diff');

    // Tipo difere: a coluna do Bruno é a divergente.
    const tipo = linhaDoCampo('Tipo');
    expect(tipo.querySelectorAll('td')[1]).toHaveAttribute('data-diff', 'true');
  });

  it('mostra travessão nos campos vazios', () => {
    const semEmpresa = [
      contato({ id: 'a', name: 'Ana', company: null }),
      contato({ id: 'b', name: 'Bruno', company: 'Acme' }),
    ];
    render(<ContactCompareDialog open onOpenChange={vi.fn()} contacts={semEmpresa} />);

    const empresa = linhaDoCampo('Empresa');
    expect(empresa).toHaveTextContent('—');
    expect(empresa).toHaveTextContent('Acme');
  });

  it('fecha com Esc e devolve o foco ao gatilho', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir comparação
          </button>
          <ContactCompareDialog open={open} onOpenChange={setOpen} contacts={[ana, bruno]} />
        </>
      );
    }

    render(<Harness />);
    const gatilho = screen.getByRole('button', { name: 'Abrir comparação' });
    gatilho.focus();
    fireEvent.click(gatilho);

    expect(await screen.findByText('Comparar contatos')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Comparar contatos')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(gatilho));
  });
});
