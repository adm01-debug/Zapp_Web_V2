import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhoneInput } from '../phone-input';

/**
 * Ajuste ao UI-07 — a máscara do PhoneInput tem de PRESERVAR número
 * internacional: só o número brasileiro ganha `+55`.
 *
 * Números de outro país com `+` (E.164) passam sem virar `+55 ...`.
 * O formulário real é controlado (o pai guarda o `value` formatado).
 */
function Harness({ initial = '', onChange }: { initial?: string; onChange?: (f: string, r: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput
      value={value}
      onChange={(formatted, raw) => {
        setValue(formatted);
        onChange?.(formatted, raw);
      }}
    />
  );
}

function field() {
  return screen.getByPlaceholderText('+55 11 99999-0000') as HTMLInputElement;
}

function change(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('PhoneInput — BR e internacional', () => {
  it('celular BR digitado sem máscara vira +55 XX XXXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '11987654321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });

  it('fixo BR de 10 dígitos vira +55 XX XXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '1132345678');

    expect(field().value).toBe('+55 11 3234-5678');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 3234-5678', '551132345678');
  });

  it('+1 (EUA) permanece E.164, sem ganhar +55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+1 415 555 0100');

    expect(field().value).toBe('+14155550100');
    expect(field().value).not.toContain('+55');
    expect(onChange).toHaveBeenLastCalledWith('+14155550100', '14155550100');
  });

  it('+351 (Portugal) permanece E.164, sem ganhar +55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+351 912 345 678');

    expect(field().value).toBe('+351912345678');
    expect(field().value).not.toContain('+55');
    expect(onChange).toHaveBeenLastCalledWith('+351912345678', '351912345678');
  });

  it('+44 (Reino Unido) permanece E.164, sem ganhar +55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+44 20 7946 0958');

    expect(field().value).toBe('+442079460958');
    expect(field().value).not.toContain('+55');
    expect(onChange).toHaveBeenLastCalledWith('+442079460958', '442079460958');
  });

  it('+55 colado com espaços e traços ainda é o Brasil', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+55 (11) 98765-4321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });

  it('fixo BR colado com parênteses vira +55 XX XXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '(11) 3234-5678');

    expect(field().value).toBe('+55 11 3234-5678');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 3234-5678', '551132345678');
  });

  it('apagar com backspace re-formata o restante sem travar na máscara', () => {
    render(<Harness initial="+55 11 98765-4321" />);
    expect(field().value).toBe('+55 11 98765-4321');

    // o input controlado entrega o valor exibido menos o último dígito
    change(field(), '+55 11 98765-432');
    expect(field().value).toBe('+55 11 98765-432');

    change(field(), '+55 11 98765-43');
    expect(field().value).toBe('+55 11 98765-43');

    change(field(), '+55 11 9876');
    expect(field().value).toBe('+55 11 9876');
  });

  it('apagar um dígito de um internacional não inventa +55', () => {
    render(<Harness initial="+14155550100" />);
    expect(field().value).toBe('+14155550100');

    change(field(), '+1415555010');
    expect(field().value).toBe('+1415555010');
    expect(field().value).not.toContain('+55');
  });

  it('focar o campo vazio não pré-preenche +55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.focus(field());

    expect(field().value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
