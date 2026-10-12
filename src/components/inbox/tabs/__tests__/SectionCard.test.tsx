import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { axe } from 'vitest-axe';
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

  it('renders action as a pill with high-contrast text using --primary-text token', () => {
    const onClick = vi.fn();
    render(
      <SectionCard icon={FileText} title="Título" action={{ label: '+ Adicionar', onClick, variant: 'pill' }}>
        <p />
      </SectionCard>
    );
    const btn = screen.getByText('+ Adicionar');
    expect(btn.className).toContain('text-[hsl(var(--primary-text))]');
    expect(btn.className).toContain('bg-primary/15');
    expect(btn.className).toContain('rounded-lg');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults the heading level to h2 for accessibility', () => {
    render(<SectionCard icon={FileText} title="Título"><p /></SectionCard>);
    const heading = document.querySelector('h2');
    expect(heading).toBeInTheDocument();
    expect(heading?.textContent).toBe('Título');
  });

  it('accepts a custom headingLevel prop', () => {
    render(<SectionCard icon={FileText} title="Título" headingLevel="h3"><p /></SectionCard>);
    expect(document.querySelector('h2')).not.toBeInTheDocument();
    expect(document.querySelector('h3')).toBeInTheDocument();
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

  // Notas/IA/CRM 360° não têm título de página: os cartões abrem a hierarquia em h2.
  // color-contrast não é calculável no jsdom (sem CSS/layout); o contraste do botão é provado
  // pela asserção do token --primary-text acima.
  describe('axe heading-order', () => {
    const semContraste = { rules: { 'color-contrast': { enabled: false } } };

    it('cartões irmãos das abas Notas/IA/CRM 360° não geram violação', async () => {
      const { container } = render(
        <div>
          <SectionCard icon={FileText} title="Notas" action={{ label: '+ Adicionar', onClick: vi.fn(), variant: 'pill' }}>
            <p />
          </SectionCard>
          <SectionCard icon={FileText} title="Pendências" count={2}><p /></SectionCard>
          <SectionCard icon={FileText} title="Resumo da conversa" tone="blue"><p /></SectionCard>
        </div>
      );
      const results = await axe(container, semContraste);
      expect(results.violations.filter((v) => v.id === 'heading-order')).toEqual([]);
      expect(container.querySelectorAll('h2')).toHaveLength(3);
      expect(container.querySelector('h3')).toBeNull();
    });

    it('abas com título de página h2 (SalesView/Journey) usam cartão h3 sem pular nível', async () => {
      const { container } = render(
        <div>
          <h2>SalesView</h2>
          <SectionCard icon={FileText} title="Resumo comercial" headingLevel="h3"><p /></SectionCard>
        </div>
      );
      const results = await axe(container, semContraste);
      expect(results.violations.filter((v) => v.id === 'heading-order')).toEqual([]);
    });

    it('o axe acusa o salto quando o cartão pula nível (h4 logo após h2)', async () => {
      const { container } = render(
        <div>
          <h2>Página</h2>
          <SectionCard icon={FileText} title="Cartão" headingLevel="h4"><p /></SectionCard>
        </div>
      );
      const results = await axe(container, semContraste);
      expect(results.violations.some((v) => v.id === 'heading-order')).toBe(true);
    });
  });
});
