/**
 * UK-14 — contrato do primitivo `select` (56 consumidores diretos).
 *
 * Prova o select REAL do projeto: o gatilho é um `combobox` que anuncia
 * `aria-expanded`, abre a lista (`listbox`) por interação de ponteiro, marca a
 * opção escolhida no `ItemIndicator` e devolve o valor ao gatilho.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';

// O Radix Select usa APIs de ponteiro que o jsdom não implementa.
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(cleanup);

function abrirSelect(nome: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: nome }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

function Exemplo() {
  return (
    <Select>
      <SelectTrigger aria-label="Canal">
        <SelectValue placeholder="Todos os canais" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Canais</SelectLabel>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
          <SelectItem value="instagram">Instagram</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

describe('select — contrato do primitivo (UK-14)', () => {
  it('o gatilho é combobox fechado e mostra o placeholder', () => {
    render(<Exemplo />);

    const gatilho = screen.getByRole('combobox', { name: 'Canal' });
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    expect(gatilho).toHaveTextContent('Todos os canais');
  });

  it('abre a listbox, expõe as opções e o rótulo do grupo', () => {
    render(<Exemplo />);
    const gatilho = screen.getByRole('combobox', { name: 'Canal' });
    abrirSelect('Canal');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Canais')).toBeInTheDocument();
    // Guardamos a referência antes de abrir: com a lista modal o Radix marca o
    // resto da página como `aria-hidden`, então `getByRole` não acharia mais.
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
  });

  it('escolher uma opção fecha a lista e escreve o valor no gatilho', () => {
    render(<Exemplo />);
    abrirSelect('Canal');

    fireEvent.click(screen.getByRole('option', { name: 'Instagram' }));

    expect(screen.queryByRole('listbox')).toBeNull();
    const gatilho = screen.getByRole('combobox', { name: 'Canal' });
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    expect(gatilho).toHaveTextContent('Instagram');
  });
});
