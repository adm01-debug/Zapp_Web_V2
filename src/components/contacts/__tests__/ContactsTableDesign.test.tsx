import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ContactsTable } from '../ContactsTable';
import { baseContact, noop } from './contactDeleteFixtures';
import type { Contact } from '../types';

/**
 * ZD-063..066 — a tabela segue o `.zc-table` do design aprovado: cabeçalho com
 * botão de ordenação (seta de 11px + `aria-sort`), cabeçalho e células com o
 * respiro de 13/14px, etiquetas no chip do design, ações em `.zc-icon-button`
 * e rolagem horizontal no celular. Também cobre a escolha de colunas (ZD-064).
 */

const contatos: Contact[] = [
  baseContact({ id: 'c-1', name: 'Bruno Lima', company: 'Zeta', job_title: 'Diretor' }),
  baseContact({ id: 'c-2', name: 'Ana Souza', company: 'Alfa', job_title: 'Analista' }),
  baseContact({ id: 'c-3', name: 'Carla Dias', company: 'Meio', job_title: 'Gerente' }),
];

function renderTable(overrides: Partial<React.ComponentProps<typeof ContactsTable>> = {}) {
  return render(
    <ContactsTable
      contacts={contatos}
      selectedIds={[]}
      onSelectIds={noop}
      onOpenDetails={vi.fn()}
      onOpenChat={noop}
      onEdit={noop}
      onDelete={noop}
      {...overrides}
    />,
  );
}

function nomesNaOrdem(): string[] {
  const corpo = screen.getByTestId('contacts-table-body');
  return within(corpo)
    .getAllByRole('row')
    .map((linha) => (linha.textContent || '').match(/[A-Z][a-z]+ [A-Z][a-z]+/)?.[0] ?? '');
}

describe('ContactsTable · visual e comportamento do design (ZD-063..066)', () => {
  it('envolve a tabela num contêiner rolável com a moldura de 10px do design', () => {
    renderTable();
    const tabela = screen.getByRole('grid', { name: 'Lista de contatos' });
    const wrap = tabela.parentElement as HTMLElement;
    expect(wrap.className).toContain('overflow-x-auto');
    expect(wrap.className).toContain('rounded-[10px]');
  });

  it('o cabeçalho ordenável usa botão de verdade e publica aria-sort', () => {
    renderTable();
    const cabecalhos = screen.getAllByRole('columnheader');
    const nome = cabecalhos.find((th) => th.textContent?.includes('Contato')) as HTMLElement;
    const botao = within(nome).getByRole('button');
    expect(nome.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(botao);
    expect(nome.getAttribute('aria-sort')).toBe('ascending');
    expect(nomesNaOrdem()[0]).toBe('Ana Souza');

    fireEvent.click(botao);
    expect(nome.getAttribute('aria-sort')).toBe('descending');
    expect(nomesNaOrdem()[0]).toBe('Carla Dias');
  });

  it('as setas de ordenação têm 11px e o cabeçalho usa o respiro 13x11 do design', () => {
    renderTable();
    const cabecalhos = screen.getAllByRole('columnheader');
    const nome = cabecalhos.find((th) => th.textContent?.includes('Contato')) as HTMLElement;
    expect(nome.className).toContain('p-[13px_11px]');
    const seta = nome.querySelector('svg') as SVGElement;
    expect(seta.getAttribute('class')).toContain('h-[11px]');
    expect(seta.getAttribute('class')).toContain('w-[11px]');
  });

  it('células usam o respiro de 14x11 e o texto de 11px da tabela', () => {
    renderTable();
    const corpo = screen.getByTestId('contacts-table-body');
    const celula = within(corpo).getAllByRole('row')[0].querySelector('td:nth-child(2)') as HTMLElement;
    expect(celula.className).toContain('p-[14px_11px]');
    const tabela = screen.getByRole('grid', { name: 'Lista de contatos' });
    expect(tabela.className).toContain('text-[11px]');
  });

  it('etiquetas viram chips do design, sem truncar em duas', () => {
    renderTable({
      contacts: [baseContact({ id: 'c-9', name: 'Dina Reis', tags: ['VIP', 'Indicação', 'Feira'] })],
    });
    const corpo = screen.getByTestId('contacts-table-body');
    for (const tag of ['VIP', 'Indicação', 'Feira']) {
      expect(within(corpo).getByText(tag)).toBeInTheDocument();
    }
    expect(within(corpo).queryByText('+1')).not.toBeInTheDocument();
  });

  it('a coluna Ações expõe Conversar, menu e abrir ficha em icones de 30px', () => {
    renderTable();
    const corpo = screen.getByTestId('contacts-table-body');
    expect(within(corpo).getAllByTitle('Conversar')).toHaveLength(3);
    const abrir = within(corpo).getByLabelText('Abrir ficha de Ana Souza');
    expect(abrir.className).toContain('h-[30px]');
    expect(abrir.className).toContain('w-[30px]');
    expect(abrir.querySelector('svg')?.getAttribute('class')).toContain('h-[14px]');
  });

  it('ZD-064 · o painel de colunas esconde Cargo mas mantém Contato', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Colunas/ }));

    const cargo = screen.getByLabelText('Mostrar coluna Cargo');
    fireEvent.click(cargo);

    const cabecalhos = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(cabecalhos.some((t) => t === 'Cargo')).toBe(false);
    expect(cabecalhos.some((t) => t?.includes('Contato'))).toBe(true);
  });

  it('ZD-064 · o painel de colunas volta a mostrar a coluna desligada', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Colunas/ }));
    const email = screen.getByLabelText('Mostrar coluna Email');
    fireEvent.click(email);
    expect(screen.queryAllByRole('columnheader').some((th) => th.textContent?.trim() === 'Email')).toBe(false);

    fireEvent.click(email);
    expect(screen.queryAllByRole('columnheader').some((th) => th.textContent?.trim() === 'Email')).toBe(true);
  });
});