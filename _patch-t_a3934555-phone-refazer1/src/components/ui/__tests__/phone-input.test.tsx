import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhoneInput } from '../phone-input';

/**
 * UI-07 (paridade V3 → V2) — máscara do campo de telefone + [refazer 1].
 *
 * Contrato vigente (recusa da rodada 1):
 *   - BR (dígitos começam com 55): máscara +55 XX XXXXX-XXXX / XXXX-XXXX,
 *     com teto de 13 dígitos;
 *   - resto: dígitos crus, sem prefixar 55 e sem truncar (passthrough);
 *   - pré-preenche +55 só a partir do vazio (focus no campo vazio);
 *   - limpar o campo resulta em '' (não em '+').
 * O componente é controlado (o pai guarda `value`), como no diálogo real.
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

describe('PhoneInput — máscara brasileira', () => {
  it('BR com 55 digitado vira +55 XX XXXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '5511987654321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });

  it('fixo BR com 55 vira +55 XX XXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '551132345678');

    expect(field().value).toBe('+55 11 3234-5678');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 3234-5678', '551132345678');
  });

  it('internacional digitado com + não ganha prefixo 55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+351211234567');

    expect(field().value).toBe('+35 1211234567');
    expect(onChange).toHaveBeenLastCalledWith('+35 1211234567', '351211234567');
  });

  it('internacional longo não é truncado (dígitos crus, sem teto BR)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+4915123456789');

    expect(onChange).toHaveBeenLastCalledWith('+49 15123456789', '4915123456789');
    expect(field().value).toBe('+49 15123456789');
  });

  it('DDD direto sem 55 passa cru, sem prefixar', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '11987654321');

    expect(field().value).toBe('+11 987654321');
    expect(onChange).toHaveBeenLastCalledWith('+11 987654321', '11987654321');
  });

  it('focus no campo vazio pré-preenche +55', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.focus(field());

    expect(onChange).toHaveBeenLastCalledWith('+55', '55');
    expect(field().value).toBe('+55');
  });

  it('apagar tudo resulta em vazio, não em +', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '5511987654321');
    change(field(), '');

    expect(field().value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('', '');
  });

  it('número internacional inicial exibe passthrough sem formato brasileiro', () => {
    render(<Harness initial="+351211234567" />);

    expect(field().value).toBe('+35 1211234567');
  });

  it('apagar um dígito re-formata o restante (BR)', () => {
    render(<Harness />);

    change(field(), '5511987654321');
    expect(field().value).toBe('+55 11 98765-4321');

    change(field(), '55119876');
    expect(field().value).toBe('+55 11 9876');
  });

  it('colar com símbolos extrai só os dígitos e formata (BR)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+55 (11) 98765-4321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });
});
