/**
 * UK-14 — contrato do primitivo `switch` (35 consumidores diretos).
 *
 * Prova o switch REAL do projeto: papel `switch`, `aria-checked` reflete o
 * estado controlado, clicar dispara `onCheckedChange` com o novo valor e
 * `disabled` desliga a interação.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { Switch } from '@/components/ui/switch';

afterEach(cleanup);

describe('switch — contrato do primitivo (UK-14)', () => {
  it('tem papel switch e anuncia o estado desmarcado', () => {
    render(<Switch aria-label="Notificações" checked={false} onCheckedChange={() => {}} />);

    const sw = screen.getByRole('switch', { name: 'Notificações' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAttribute('data-state', 'unchecked');
  });

  it('reflete o estado marcado quando controlado', () => {
    render(<Switch aria-label="Notificações" checked={true} onCheckedChange={() => {}} />);

    const sw = screen.getByRole('switch', { name: 'Notificações' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('clicar avisa o dono com o próximo valor (true)', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notificações" checked={false} onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Notificações' }));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('o modo não controlado alterna sozinho e avisa', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notificações" defaultChecked={false} onCheckedChange={onCheckedChange} />);

    const sw = screen.getByRole('switch', { name: 'Notificações' });
    fireEvent.click(sw);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('desabilitado não dispara onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notificações" disabled onCheckedChange={onCheckedChange} />);

    const sw = screen.getByRole('switch', { name: 'Notificações' });
    expect(sw).toBeDisabled();
    fireEvent.click(sw);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
