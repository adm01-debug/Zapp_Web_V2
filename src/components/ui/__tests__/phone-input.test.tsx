import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhoneInput } from '../phone-input';

/**
 * UI-07 (paridade V3 → V2) — máscara do campo de telefone.
 *
 * O formulário de nova conexão usava `Input` livre. Aqui se prova o
 * comportamento portado do `PhoneInput` da V3:
 *   - celular BR (11 dígitos) → `+55 XX XXXXX-XXXX`
 *   - fixo BR (10 dígitos)    → `+55 XX XXXX-XXXX`
 *   - internacional            → passthrough `+CC restante` (sem grupo BR)
 *   - apagar                    → re-formata o que sobrou
 *   - colar com símbolos        → extrai só os dígitos e formata
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
  it('celular com 11 dígitos digitado sem máscara vira +55 XX XXXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '11987654321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });

  it('fixo com 10 dígitos vira +55 XX XXXX-XXXX', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '1132345678');

    expect(field().value).toBe('+55 11 3234-5678');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 3234-5678', '551132345678');
  });

  it('número internacional é aceito sem formato brasileiro', () => {
    render(<Harness initial="+351211234567" />);

    // E.164 passthrough: internacionais não ganham espaço (ver phone-input.tsx linha 41).
    expect(field().value).toBe('+351211234567');
  });

  it('apagar um dígito re-formata o restante', () => {
    render(<Harness />);

    change(field(), '11987654321');
    expect(field().value).toBe('+55 11 98765-4321');

    change(field(), '55119876');
    expect(field().value).toBe('+55 11 9876');
  });

  it('colar com símbolos extrai só os dígitos e formata', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    change(field(), '+55 (11) 98765-4321');

    expect(field().value).toBe('+55 11 98765-4321');
    expect(onChange).toHaveBeenLastCalledWith('+55 11 98765-4321', '5511987654321');
  });

  it('[refazer 1] P1: focar o campo vazio não pré-preenche +55 (placeholder faz esse papel)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.focus(field());

    expect(field().value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
