import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircleDot } from 'lucide-react';
import { KpiStrip, type KpiTone } from '../KpiStrip';

describe('KpiStrip', () => {
  it('renders label and value for each cell', () => {
    render(<KpiStrip cells={[{ icon: CircleDot, label: 'Total', value: 42 }]} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('defaults to bg-primary/15 text-primary when no tone/iconClassName is given', () => {
    render(<KpiStrip cells={[{ icon: CircleDot, label: 'Total', value: 1 }]} />);
    const tile = screen.getByTestId('kpi-cell').querySelector('span');
    expect(tile?.className).toContain('bg-primary/15');
    expect(tile?.className).toContain('text-primary');
  });

  const tones: { tone: KpiTone; bgClass: string; fgClass: string }[] = [
    { tone: 'blue', bgClass: 'bg-kpi-blue', fgClass: 'text-kpi-blue-fg' },
    { tone: 'green', bgClass: 'bg-kpi-green', fgClass: 'text-kpi-green-fg' },
    { tone: 'purple', bgClass: 'bg-kpi-purple', fgClass: 'text-kpi-purple-fg' },
    { tone: 'yellow', bgClass: 'bg-kpi-yellow', fgClass: 'text-kpi-yellow-fg' },
    { tone: 'red', bgClass: 'bg-destructive/15', fgClass: 'text-destructive' },
  ];

  it.each(tones)('applies the $tone tone classes to the tile', ({ tone, bgClass, fgClass }) => {
    render(<KpiStrip cells={[{ icon: CircleDot, label: 'Total', value: 1, tone }]} />);
    const tile = screen.getByTestId('kpi-cell').querySelector('span');
    expect(tile?.className).toContain(bgClass);
    expect(tile?.className).toContain(fgClass);
  });

  it('iconClassName takes priority over tone', () => {
    render(<KpiStrip cells={[{ icon: CircleDot, label: 'Total', value: 1, tone: 'red', iconClassName: 'bg-custom text-custom' }]} />);
    const tile = screen.getByTestId('kpi-cell').querySelector('span');
    expect(tile?.className).toContain('bg-custom');
    expect(tile?.className).not.toContain('bg-destructive/15');
  });

  it('renders sublabel when provided', () => {
    render(<KpiStrip cells={[{ icon: CircleDot, label: 'Total', value: 1, sublabel: 'vs. mês anterior' }]} />);
    expect(screen.getByText('vs. mês anterior')).toBeInTheDocument();
  });
});
