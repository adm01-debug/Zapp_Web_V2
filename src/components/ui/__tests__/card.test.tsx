import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { Card, MotionCardComponent, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// O ambiente do vitest entrega `import.meta.url` como URL http e `readFileSync` recusa
// esse esquema; a leitura da fonte vai pelo diretório da cópia de trabalho.
const FONTE = readFileSync(resolve(process.cwd(), 'src/components/ui/card.tsx'), 'utf8');

describe('Card Component', () => {
  it('renderiza com as variantes e o padding do design system', () => {
    const { rerender } = render(<Card data-testid="card">conteúdo</Card>);
    expect(screen.getByTestId('card').className).toContain('rounded-2xl');
    expect(screen.getByTestId('card').className).toContain('border-border');
    expect(screen.getByTestId('card').className).toContain('bg-card');

    rerender(
      <Card data-testid="card" variant="elevated" padding="lg">
        conteúdo
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('bg-card-elevated');
    expect(screen.getByTestId('card').className).toContain('p-8');
  });

  it('mantém o encadeamento das partes do card', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Resumo do dia</CardTitle>
        </CardHeader>
        <CardContent>42 conversas</CardContent>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Resumo do dia' })).toBeDefined();
    expect(screen.getByText('42 conversas')).toBeDefined();
    expect(screen.getByTestId('card').className).toContain('rounded-2xl');
  });
});

describe('MotionCardComponent — hover/tap em CSS', () => {
  it('aplica o hover só quando o movimento está liberado (motion-safe)', () => {
    render(<MotionCardComponent data-testid="motion-card">conteúdo</MotionCardComponent>);

    const card = screen.getByTestId('motion-card');
    expect(card.className).toContain('motion-safe:hover:scale-[var(--motion-card-scale)]');
    expect(card.className).toContain('motion-safe:hover:translate-y-[var(--motion-card-y)]');
    expect(card.className).toContain('motion-safe:hover:shadow-glow-primary-sm');
    expect(card.className).toContain('motion-safe:active:scale-[0.99]');
    // A sombra do hover precisa ANIMAR junto do transform: o `whileHover` do runtime
    // animava os dois (y/scale + boxShadow); só `transition-transform` deixaria o
    // realce de sombra entrar seco. A transição declarada tem de cobrir box-shadow.
    expect(card.className).toContain('motion-safe:transition-[transform,box-shadow]');
    const transicao = card.className.match(/motion-safe:transition-\[[^\]]+\]/)?.[0] ?? '';
    expect(transicao).toContain('box-shadow');
    // A variante padrão do card animado continua a interativa.
    expect(card.className).toContain('cursor-pointer');
  });

  it('publica hoverScale/hoverY como variáveis CSS lidas pelo hover', () => {
    render(
      <MotionCardComponent data-testid="motion-card" hoverScale={1.04} hoverY={-8}>
        conteúdo
      </MotionCardComponent>,
    );

    const card = screen.getByTestId('motion-card') as HTMLElement;
    expect(card.style.getPropertyValue('--motion-card-scale')).toBe('1.04');
    expect(card.style.getPropertyValue('--motion-card-y')).toBe('-8px');
  });

  it('com hover desligado o card não recebe nenhum efeito de movimento', () => {
    render(
      <MotionCardComponent data-testid="motion-card" hover={false}>
        conteúdo
      </MotionCardComponent>,
    );

    const card = screen.getByTestId('motion-card');
    expect(card.className).not.toContain('motion-safe:hover:scale');
    expect(card.className).not.toContain('motion-safe:active:scale');
  });
});

describe('card.tsx — sem o runtime de animação no caminho inicial (SL-103A)', () => {
  it('não importa nem usa o runtime de animação por JS', () => {
    expect(FONTE).not.toMatch(/from ['"]framer-motion['"]/);
    expect(FONTE).not.toMatch(/\bmotion\.[a-z]/);
    expect(FONTE).not.toMatch(/whileHover=/);
    expect(FONTE).not.toMatch(/whileTap=/);
    expect(FONTE).not.toMatch(/\bAnimatePresence\b/);
  });
});
