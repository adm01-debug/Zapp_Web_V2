/**
 * UK-14 — contrato do primitivo `checkbox` (39 consumidores diretos).
 *
 * Prova o checkbox REAL do projeto: papel `checkbox`, `aria-checked` nos três
 * estados (desmarcado, marcado, indeterminado), clique avisa o dono e
 * `disabled` desliga a interação.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { Checkbox } from '@/components/ui/checkbox';

afterEach(cleanup);

describe('checkbox — contrato do primitivo (UK-14)', () => {
  it('tem papel checkbox e anuncia o estado desmarcado', () => {
    render(<Checkbox aria-label="Aceitar termos" checked={false} onCheckedChange={() => {}} />);

    const cb = screen.getByRole('checkbox', { name: 'Aceitar termos' });
    expect(cb).toHaveAttribute('aria-checked', 'false');
  });

  it('reflete o estado marcado quando controlado', () => {
    render(<Checkbox aria-label="Aceitar termos" checked={true} onCheckedChange={() => {}} />);

    const cb = screen.getByRole('checkbox', { name: 'Aceitar termos' });
    expect(cb).toHaveAttribute('aria-checked', 'true');
    expect(cb).toHaveAttribute('data-state', 'checked');
  });

  it('estado indeterminado é anunciado como "mixed"', () => {
    render(<Checkbox aria-label="Selecionar todos" checked="indeterminate" onCheckedChange={() => {}} />);

    const cb = screen.getByRole('checkbox', { name: 'Selecionar todos' });
    expect(cb).toHaveAttribute('aria-checked', 'mixed');
    expect(cb).toHaveAttribute('data-state', 'indeterminate');
  });

  it('clicar avisa o dono com o próximo valor', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Aceitar termos" checked={false} onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Aceitar termos' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('desabilitado não dispara onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Aceitar termos" disabled onCheckedChange={onCheckedChange} />);

    const cb = screen.getByRole('checkbox', { name: 'Aceitar termos' });
    fireEvent.click(cb);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
