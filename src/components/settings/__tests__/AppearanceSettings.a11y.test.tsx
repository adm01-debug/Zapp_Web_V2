/**
 * N-156 — selectores de aparência (tema, idioma, densidade) sem nome
 * acessível: os rótulos <Label> não ficam vinculados aos <SelectTrigger>
 * por falta de `aria-label`, o que quebra `getByLabelText` e gera
 * violação `button-name` no axe.
 *
 * Prova: os 3 selectores são encontráveis por label e o axe não
 * acusa violações na tela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { HTMLAttributes } from 'react';
import { AppearanceSettings } from '../AppearanceSettings';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/settings/AvatarUpload', () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));
vi.mock('@/components/ui/motion', () => ({
  motion: { div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
}));

const BASE = {
  settings: { theme: 'dark', language: 'pt-BR', compact_mode: false },
  updateSettings: vi.fn(),
  onResetOnboarding: vi.fn(),
  isSaving: false,
  onSave: vi.fn(),
};

describe('N-156 — selectores de aparência têm nome acessível', () => {
  it('getByLabelText encontra o seletor de Tema', () => {
    render(<AppearanceSettings {...BASE} />);
    expect(screen.getByLabelText('Tema')).toBeInTheDocument();
  });

  it('getByLabelText encontra o seletor de Idioma', () => {
    render(<AppearanceSettings {...BASE} />);
    expect(screen.getByLabelText('Idioma')).toBeInTheDocument();
  });

  it('getByLabelText encontra o seletor de Densidade', () => {
    render(<AppearanceSettings {...BASE} />);
    expect(screen.getByLabelText('Densidade da interface')).toBeInTheDocument();
  });

  it.todo('a tela oferece o tamanho do texto do chat escolhido pelo usuário — radiogroup ainda não implementado no componente');

  it('axe não acusa violações de acessibilidade na tela', async () => {
    const { container } = render(<AppearanceSettings {...BASE} />);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toHaveLength(0);
  });
});