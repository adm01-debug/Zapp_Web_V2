import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { KpiCard } from '../kpi';

const motion = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => motion.reduce };
});

const base = { icon: Users, label: 'Métricas' };

afterEach(() => {
  motion.reduce = false;
  cleanup();
});

describe('KpiCard — variação calculada e estados', () => {
  it('(1) previous nulo → sem variação', () => {
    render(<KpiCard {...base} value={10} comparison={{ previous: null, kind: 'relative' }} />);
    expect(screen.queryByTestId('kpi-comparison')).toBeNull();
  });

  it('(2) previous 0 → sem variação', () => {
    render(<KpiCard {...base} value={10} comparison={{ previous: 0, kind: 'relative' }} />);
    expect(screen.queryByTestId('kpi-comparison')).toBeNull();
  });

  it('(3) base abaixo de minBase → sem variação', () => {
    render(
      <KpiCard {...base} value={10} comparison={{ previous: 10, kind: 'relative', minBase: 50 }} />,
    );
    expect(screen.queryByTestId('kpi-comparison')).toBeNull();
  });

  it('(4) 18 contra 14,75 → +22% em pt-BR', () => {
    render(<KpiCard {...base} value={18} comparison={{ previous: 14.75, kind: 'relative' }} />);
    const delta = screen.getByTestId('kpi-comparison');
    expect(delta).toHaveTextContent('↗');
    expect(delta).toHaveTextContent('+22%');
    expect(delta).toHaveAttribute('title', 'vs. período anterior');
  });

  it('(5) 96,4 contra 94,3 em pontos → +2,1% com título de pontos percentuais', () => {
    render(<KpiCard {...base} value={96.4} comparison={{ previous: 94.3, kind: 'points' }} />);
    const delta = screen.getByTestId('kpi-comparison');
    expect(delta).toHaveTextContent('+2,1%');
    expect(delta.getAttribute('title')).toContain('pontos percentuais');
  });

  it('(6) value nulo → Sem dados ainda', () => {
    render(<KpiCard {...base} value={null} />);
    expect(screen.getByText('Sem dados ainda')).toBeInTheDocument();
  });

  it('(7) prefers-reduced-motion zera a animação escalonada', () => {
    motion.reduce = true;
    render(<KpiCard {...base} value={5} index={3} />);
    expect(screen.getByTestId('kpi-card').style.animationDelay).toBe('');
    cleanup();

    motion.reduce = false;
    render(<KpiCard {...base} value={5} index={3} />);
    expect(screen.getByTestId('kpi-card').style.animationDelay).toBe('120ms');
  });
});
