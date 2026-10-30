import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Skeleton, SkeletonList, SkeletonRegion } from '@/components/ui/skeleton';
import { SkeletonList as SkeletonListLayout } from '@/components/ui/SkeletonList';
import { OverviewSkeleton } from '@/components/dashboard/overview/OverviewSkeleton';
import { LazyLoadFallback } from '@/components/performance/LazyRoutes';
import {
  StatsCardsSkeleton,
  ChartSkeleton,
  TimelineSkeleton,
} from '@/components/monitoring/MonitoringSkeletons';

// Prova (a11y) do cartão t_45cf7d9a: o Skeleton é decorativo e quem anuncia o
// carregamento é UMA região por lista, com nome em pt-BR — não mais "Loading..."
// repetido em cada bloco.

describe('Skeleton — uma região de carregamento por lista', () => {
  it('5 Skeletons soltos não criam nenhuma região role=status', () => {
    render(
      <div>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>,
    );

    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryByLabelText('Loading...')).toBeNull();
  });

  it('SkeletonRegion é exatamente 1 região, com aria-busy e nome em pt-BR', () => {
    render(
      <SkeletonRegion>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </SkeletonRegion>,
    );

    const regioes = screen.getAllByRole('status');
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toHaveAttribute('aria-busy', 'true');
    expect(regioes[0]).toHaveTextContent('Carregando…');
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('SkeletonList usa a região (1 anúncio para a lista inteira)', () => {
    render(
      <SkeletonList count={3}>
        {() => <Skeleton className="h-4 w-full" />}
      </SkeletonList>,
    );

    const regioes = screen.getAllByRole('status');
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toHaveTextContent('Carregando…');
  });

  it('SkeletonList (variante de layout) também anuncia uma única região', () => {
    const card = render(<SkeletonListLayout variant="card" count={2} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('Loading...')).toBeNull();
    card.unmount();

    render(<SkeletonListLayout variant="table" count={2} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});

describe('telas de consumo com mais Skeletons — 1 região cada', () => {
  it('OverviewSkeleton (dashboard) anuncia uma única região em pt-BR', () => {
    render(<OverviewSkeleton />);

    const regioes = screen.getAllByRole('status');
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toHaveTextContent('Carregando visão geral');
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('LazyLoadFallback (rotas) anuncia uma única região em pt-BR', () => {
    render(<LazyLoadFallback type="list" />);

    const regioes = screen.getAllByRole('status');
    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toHaveTextContent('Carregando lista');
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('blocos do monitoramento anunciam uma região cada, sem repetir "Loading..."', () => {
    const stats = render(<StatsCardsSkeleton />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando estatísticas');
    stats.unmount();

    const grafico = render(<ChartSkeleton />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando gráfico');
    grafico.unmount();

    render(<TimelineSkeleton />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando atividade recente');
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});
