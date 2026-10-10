import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Target } from 'lucide-react';
import { DashboardCard, SectionHeader, VerTodasButton, StatusChip } from '../overview/DashboardCard';

describe('DashboardCard', () => {
  it('renderiza os filhos dentro do card', () => {
    render(<DashboardCard testid="my-card"><p>conteúdo</p></DashboardCard>);
    expect(screen.getByTestId('my-card')).toHaveTextContent('conteúdo');
  });
});

describe('SectionHeader', () => {
  it('renderiza título, subtítulo e tile no tamanho 44', () => {
    render(<SectionHeader icon={Target} title="Metas do Dia" subtitle="Progresso de hoje" tileSize={44} />);
    expect(screen.getByText('Metas do Dia')).toBeInTheDocument();
    expect(screen.getByText('Progresso de hoje')).toBeInTheDocument();
    expect(screen.getByTestId('section-tile')).toHaveClass('w-11');
  });

  it('tile no tamanho 34 usa classe menor', () => {
    render(<SectionHeader icon={Target} title="Inteligência Artificial" tileSize={34} />);
    expect(screen.getByTestId('section-tile')).toHaveClass('w-[34px]');
  });
});

describe('VerTodasButton', () => {
  it('chama onClick ao clicar', () => {
    const onClick = vi.fn();
    render(<VerTodasButton onClick={onClick} />);
    fireEvent.click(screen.getByTestId('ver-todas'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('StatusChip', () => {
  it('tone success renderiza com classe de sucesso', () => {
    render(<StatusChip label="Ao vivo" tone="success" pulse />);
    expect(screen.getByText('Ao vivo').closest('span')).toHaveClass('text-success');
  });

  it('tone muted renderiza sem classe de sucesso', () => {
    render(<StatusChip label="Offline" tone="muted" />);
    expect(screen.getByText('Offline').closest('span')).toHaveClass('text-muted-foreground');
  });
});
