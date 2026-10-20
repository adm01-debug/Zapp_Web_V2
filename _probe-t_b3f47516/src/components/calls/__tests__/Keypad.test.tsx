import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Keypad } from '../Keypad';

describe('Keypad (T58)', () => {
  it('tem as 12 teclas, com altura 46 (+-2)', () => {
    render(<Keypad onKey={() => {}} mode="edit" />);
    const teclas = screen.getAllByRole('button');
    expect(teclas).toHaveLength(12);
    for (const t of teclas) {
      expect(t.className).toContain('h-[46px]');
    }
    expect(teclas.map((t) => t.getAttribute('aria-label'))).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#',
    ]);
  });

  it('avisa o digito clicado', () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} mode="edit" />);
    fireEvent.click(screen.getByLabelText('7'));
    expect(onKey).toHaveBeenCalledWith('7');
  });

  it('nao avisa nada quando desabilitado', () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} mode="dtmf" disabled />);
    fireEvent.click(screen.getByLabelText('5'));
    expect(onKey).not.toHaveBeenCalled();
  });

  it('escuta o teclado fisico dentro do escopo', () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} mode="edit" />);
    fireEvent.keyDown(window, { key: '9' });
    expect(onKey).toHaveBeenCalledWith('9');
    // tecla que nao e digito nao passa
    onKey.mockClear();
    fireEvent.keyDown(window, { key: 'a' });
    expect(onKey).not.toHaveBeenCalled();
  });

  it('backspace fisico chama onBackspace quando o dono quer', () => {
    const apagar = vi.fn();
    render(<Keypad onKey={() => {}} onBackspace={apagar} mode="edit" />);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(apagar).toHaveBeenCalled();
  });

  it('marca o modo no escopo, para o CSS e os testes distinguirem', () => {
    const { container } = render(<Keypad onKey={() => {}} mode="dtmf" />);
    expect(container.querySelector('[data-keypad-scope]')?.getAttribute('data-keypad-mode')).toBe('dtmf');
  });
});
