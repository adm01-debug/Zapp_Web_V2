/**
 * A11Y: Switch sem nome acessível em NotificationTypeCards.
 * Cada Switch precisa de aria-label ligado ao rótulo visível.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationTypeSection } from '../NotificationTypeCards';

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

describe('a11y: Switch com nome acessível em NotificationTypeSection', () => {
  it('Switch de ativar tem aria-label', () => {
    render(
      <NotificationTypeSection
        title="Teste"
        desc="Descrição"
        enabled={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('switch', { name: /Ativar notificação/i })).toBeInTheDocument();
  });
});