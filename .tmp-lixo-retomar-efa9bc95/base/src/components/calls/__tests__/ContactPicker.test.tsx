import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactPicker } from '../ContactPicker';

const busca = vi.fn();
vi.mock('@/services/contact.service', () => ({
  ContactService: { searchContacts: (...a: unknown[]) => busca(...a) },
}));

const joao = { id: 'c1', name: 'João Silva', phone: '+5511988887777' };

describe('ContactPicker (T57)', () => {
  beforeEach(() => busca.mockReset().mockResolvedValue({ data: [
    { id: 'c1', name: 'João Silva', phone: '+5511988887777' },
    { id: 'c2', name: 'Joana Souza', phone: '+5511977776666' },
  ] }));

  it('so busca a partir de 2 letras', async () => {
    render(<ContactPicker selecionado={null} onEscolher={() => {}} onLimpar={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar contato'), { target: { value: 'j' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(busca).not.toHaveBeenCalled();
  });

  it('busca com 6 resultados no maximo e lista o telefone', async () => {
    render(<ContactPicker selecionado={null} onEscolher={() => {}} onLimpar={() => {}} />);
    fireEvent.change(screen.getByLabelText('Buscar contato'), { target: { value: 'jo' } });
    await waitFor(() => expect(busca).toHaveBeenCalled());
    expect(busca.mock.calls[0][0].page_size).toBe(6);
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes).toHaveLength(2);
    expect(opcoes[0].textContent).toContain('+5511988887777');
  });

  it('escolhe com Enter no item destacado e anda com as setas', async () => {
    const onEscolher = vi.fn();
    render(<ContactPicker selecionado={null} onEscolher={onEscolher} onLimpar={() => {}} />);
    const campo = screen.getByLabelText('Buscar contato');
    fireEvent.change(campo, { target: { value: 'jo' } });
    await screen.findAllByRole('option');
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onEscolher).toHaveBeenCalledWith({ id: 'c2', name: 'Joana Souza', phone: '+5511977776666' });
  });

  it('com contato escolhido vira chip e nao mostra a busca', () => {
    render(<ContactPicker selecionado={joao} onEscolher={() => {}} onLimpar={() => {}} />);
    expect(screen.getByTestId('tel-contact-chip').textContent).toContain('João Silva');
    expect(screen.queryByLabelText('Buscar contato')).toBeNull();
  });
});
