/**
 * A11Y: Hierarquia de títulos em ThemeCustomizer.
 * A página "Aparência" precisa de h1 (SHELL-14).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCustomizer } from '../ThemeCustomizer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockResolvedTheme: 'light' | 'dark' = 'dark';
let mockTheme: 'light' | 'dark' | 'system' = 'dark';
const setThemeSpy = vi.fn((t: typeof mockTheme) => {
  mockTheme = t;
});
vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ theme: mockTheme, resolvedTheme: mockResolvedTheme, setTheme: setThemeSpy }),
}));

vi.mock('@/hooks/ui/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('./theme/useThemePreset', () => ({
  useThemePreset: () => ({
    config: { preset: 'classic', borderRadius: 8 },
    hasUnsavedChanges: false,
    updateConfig: vi.fn(),
    applyPreset: vi.fn(),
    handleSave: vi.fn(),
    handleReset: vi.fn(),
  }),
}));

describe('a11y: hierarquia de títulos em ThemeCustomizer', () => {
  it('Aparência está em h1', () => {
    render(<ThemeCustomizer />);
    expect(screen.getByRole('heading', { name: /Aparência/i, level: 1 })).toBeInTheDocument();
  });
});