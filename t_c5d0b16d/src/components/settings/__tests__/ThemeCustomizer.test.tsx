import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { STORAGE_KEY } from '../theme/presets';

// Radix Slider (usado no BorderRadiusControl) exige ResizeObserver, ausente no jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

let mockResolvedTheme: 'light' | 'dark' = 'dark';
let mockTheme: 'light' | 'dark' | 'system' = 'dark';
const setThemeSpy = vi.fn((t: typeof mockTheme) => {
  mockTheme = t;
});
vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ theme: mockTheme, resolvedTheme: mockResolvedTheme, setTheme: setThemeSpy }),
}));

function getVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

describe('ThemeCustomizer', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.presetId;
    mockResolvedTheme = 'dark';
    mockTheme = 'dark';
    setThemeSpy.mockClear();
  });

  it('renderiza 10 + 9 radios e o badge mostra a skin ativa (Padrão)', () => {
    render(<ThemeCustomizer />);
    expect(screen.getAllByRole('radio')).toHaveLength(19);
    expect(screen.getByText(/✓ Padrão/)).toBeInTheDocument();
  });

  it('clicar em gx-hackerman aplica data-preset-id, --radius 0.625rem e grava storage v6', () => {
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByTestId('preset-card-gx-hackerman'));
    expect(document.documentElement.dataset.presetId).toBe('gx-hackerman');
    expect(getVar('radius')).toBe('0.625rem');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.preset).toBe('gx-hackerman');
    expect(stored.borderRadius).toBe(10);
  });

  it('sair de uma GX para ocean faz snap do raio para 14 (0.875rem)', () => {
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByTestId('preset-card-gx-hackerman'));
    fireEvent.click(screen.getByTestId('preset-card-ocean'));
    expect(getVar('radius')).toBe('0.875rem');
  });

  it('Salvar chama toast.success', async () => {
    const { toast } = await import('sonner');
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByTestId('theme-save'));
    expect(toast.success).toHaveBeenCalledWith('Tema salvo com sucesso!', expect.any(Object));
  });

  it('Original → dialog → Restaurar padrão volta para corporate', () => {
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByTestId('preset-card-gx-classic'));
    fireEvent.click(screen.getByTestId('theme-reset'));
    fireEvent.click(screen.getByText('Restaurar padrão'));
    expect(document.documentElement.dataset.presetId).toBe('corporate');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.preset).toBe('corporate');
  });

  it('radius-preset-0 aplica --radius 0rem', () => {
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByTestId('radius-preset-0'));
    expect(getVar('radius')).toBe('0rem');
  });

  it('grid clássico tem role radiogroup com aria-label e 10 cards; GX com 9 e badge GAMER', () => {
    render(<ThemeCustomizer />);
    expect(screen.getByTestId('skins-classic-grid')).toHaveAttribute('aria-label', 'Skins clássicas');
    expect(screen.getByTestId('skins-gx-grid')).toHaveAttribute('aria-label', 'Skins Opera GX');
    expect(screen.getByText('GAMER')).toBeInTheDocument();
  });

  it('Modo de Cor: clicar em Claro chama setTheme', () => {
    render(<ThemeCustomizer />);
    fireEvent.click(screen.getByText('Claro'));
    expect(setThemeSpy).toHaveBeenCalledWith('light');
  });
});
