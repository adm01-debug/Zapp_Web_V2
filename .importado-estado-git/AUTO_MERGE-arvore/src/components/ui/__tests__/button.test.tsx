import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button, MotionButton } from '@/components/ui/button';
import React from 'react';

// O ambiente do vitest entrega `import.meta.url` como URL http; a leitura da fonte vai
// pelo diretório da cópia de trabalho.
const FONTE = readFileSync(resolve(process.cwd(), 'src/components/ui/button.tsx'), 'utf8');

describe('Button Component', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeDefined();
    expect(button.className).toContain('bg-primary');
  });

  it('renders with different variants', () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>);
    let button = screen.getByRole('button', { name: /delete/i });
    expect(button.className).toContain('bg-destructive');

    rerender(<Button variant="outline">Outline</Button>);
    button = screen.getByRole('button', { name: /outline/i });
    expect(button.className).toContain('border-input');
  });

  it('renders in loading state and is disabled', () => {
    render(<Button isLoading loadingText="Loading...">Submit</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText(/loading../i)).toBeDefined();
    // Lucide Loader2 should be present (aria-hidden by default usually, but we check for text)
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});

describe('MotionButton — hover/tap em CSS', () => {
  it('aplica o efeito de hover/tap só com movimento liberado (motion-safe)', () => {
    render(<MotionButton>Animar</MotionButton>);
    const button = screen.getByRole('button', { name: /animar/i });

    expect(button.className).toContain('motion-safe:transition-transform');
    expect(button.className).toContain('motion-safe:duration-200');
    expect(button.className).toContain('motion-safe:hover:-translate-y-0.5');
    expect(button.className).toContain('motion-safe:hover:scale-[1.02]');
    expect(button.className).toContain('motion-safe:active:scale-[0.98]');
    // Continua sendo um <button> comum, com as variantes do design system.
    expect(button.tagName).toBe('BUTTON');
    expect(button.className).toContain('bg-primary');
  });

  it('mantém clique, carregamento e desabilitado iguais ao Button', () => {
    const handleClick = vi.fn();
    const { rerender } = render(<MotionButton onClick={handleClick}>Salvar</MotionButton>);
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);

    rerender(
      <MotionButton isLoading loadingText="Enviando…">
        Salvar
      </MotionButton>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(/enviando/i)).toBeDefined();
  });
});

describe('button.tsx — sem o runtime de animação no caminho inicial (SL-103A)', () => {
  it('não importa nem usa o runtime de animação por JS', () => {
    expect(FONTE).not.toMatch(/from ['"]framer-motion['"]/);
    expect(FONTE).not.toMatch(/\bmotion\.[a-z]/);
    expect(FONTE).not.toMatch(/\bAnimatePresence\b/);
    expect(FONTE).not.toMatch(/whileHover=/);
    expect(FONTE).not.toMatch(/whileTap=/);
  });
});
