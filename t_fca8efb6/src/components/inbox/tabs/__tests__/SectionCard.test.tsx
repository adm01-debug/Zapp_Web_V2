import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { SectionCard } from '../SectionCard';

describe('SectionCard', () => {
  it('renders title, count and children by default (link action, no tone)', () => {
    render(
      <SectionCard icon={FileText} title="Notas privadas" count={3}>
        <p>conteúdo</p>
      </SectionCard>
    );
    expect(screen.getByText('Notas privadas')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('defaults the icon tile to bg-primary/15 text-primary when no tone is given', () => {
    render(<SectionCard icon={FileText} title="Título"><p /></SectionCard>);
    const tile = document.querySelector('span');
    expect(tile?.className).toContain('bg-primary/15');
  });

  it('applies tone classes to the icon tile', () => {
    render(<SectionCard icon={FileText} title="Título" tone="yellow"><p /></SectionCard>);
    const tile = document.querySelector('span');
    expect(tile?.className).toContain('bg-kpi-yellow');
  });

  it('renders action as a plain link by default', () => {
    const onClick = vi.fn();
    render(
      <SectionCard icon={FileText} title="Título" action={{ label: 'Ver todas', onClick }}>
        <p />
      </SectionCard>
    );
    const btn = screen.getByText('Ver todas');
    expect(btn.className).toContain('hover:underline');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders action as a pill when variant="pill"', () => {
    render(
      <SectionCard icon={FileText} title="Título" action={{ label: '+ Adicionar', onClick: vi.fn(), variant: 'pill' }}>
        <p />
      </SectionCard>
    );
    const btn = screen.getByText('+ Adicionar');
    expect(btn.className).toContain('bg-primary/15');
    expect(btn.className).toContain('rounded-lg');
  });

  it('renders subtitle and headerRight when provided', () => {
    render(
      <SectionCard icon={FileText} title="Título" subtitle="Esta semana" headerRight={<span>Badge</span>}>
        <p />
      </SectionCard>
    );
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    expect(screen.getByText('Badge')).toBeInTheDocument();
  });
});
