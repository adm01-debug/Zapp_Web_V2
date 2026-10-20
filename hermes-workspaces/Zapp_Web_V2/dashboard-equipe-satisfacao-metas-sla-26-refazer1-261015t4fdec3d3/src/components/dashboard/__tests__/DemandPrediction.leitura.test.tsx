/**
 * `DemandPrediction` — os quatro cartões de leitura (tendência, pico, média,
 * capacidade) e a legenda, com o hook real de previsão.
 *
 * O `ResponsiveContainer` do recharts mede 0x0 no jsdom e não pinta nada; aqui ele
 * vira uma caixa comum (mesmo ajuste usado em outros testes de gráfico da base),
 * o resto do recharts fica real.
 *
 * Os caminhos de "sem dado" da previsão dependem de produção (`useDemandPrediction`
 * hoje assume que existe pelo menos um ponto previsto) — estão como `it.todo` no
 * fim do arquivo, com o motivo.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="grafico">{children}</div>,
  };
});

import { DemandPrediction } from '../DemandPrediction';
import type { PredictionPoint } from '@/hooks/business/useDemandPrediction';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

// A tela sempre consulta o histórico ao montar, mesmo recebendo série pronta.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      const mesmo = () => b;
      b.select = mesmo;
      b.gte = mesmo;
      b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok, falhou);
      return b;
    },
  },
}));

function renderizar(props: { data?: PredictionPoint[]; currentCapacity?: number }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return render(<DemandPrediction {...props} />, { wrapper: envolver });
}

function ponto(over: Partial<PredictionPoint> & { time: string }): PredictionPoint {
  return { predicted: 0, lower: 0, upper: 0, ...over };
}

const SERIE: PredictionPoint[] = [
  ponto({ time: '10:00', actual: 2, isPrediction: false }),
  ponto({ time: '11:00', actual: 3, isPrediction: false }),
  ponto({ time: '12:00', predicted: 1, lower: 0, upper: 3, isPrediction: true }),
  ponto({ time: '13:00', predicted: 8, lower: 6, upper: 10, isPrediction: true }),
];

describe('DemandPrediction — leitura da previsão', () => {
  it('com dados mostra tendência, pico com horário, média arredondada e capacidade OK', () => {
    renderizar({ data: SERIE, currentCapacity: 10 });

    expect(screen.getByText('Previsão de Demanda')).toBeInTheDocument();
    expect(screen.getByText('IA')).toBeInTheDocument();

    // média (1 + 8) / 2 = 4.5 -> arredondada para 5
    expect(screen.getByText('Subindo')).toBeInTheDocument();
    expect(screen.getByText('8 msgs')).toBeInTheDocument();
    expect(screen.getByText('5 msgs')).toBeInTheDocument();
    expect(screen.getByText('às 13:00')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.queryByText('Em Risco')).not.toBeInTheDocument();

    expect(screen.getByTestId('grafico')).toBeInTheDocument();
    expect(screen.getByText('Dados Reais')).toBeInTheDocument();
    expect(screen.getByText('Média 7 dias')).toBeInTheDocument();
    expect(screen.getByText('Intervalo de Confiança')).toBeInTheDocument();
    expect(screen.getByText('Capacidade Máxima')).toBeInTheDocument();
  });

  it('pico acima da capacidade marca "Em Risco"', () => {
    renderizar({ data: SERIE, currentCapacity: 5 });

    expect(screen.getByText('Em Risco')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });

  it('pico igual à capacidade não é risco (só acima conta)', () => {
    renderizar({ data: SERIE, currentCapacity: 8 });

    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('última previsão abaixo do último real vira tendência de queda', () => {
    const serie: PredictionPoint[] = [
      ponto({ time: '10:00', actual: 9, isPrediction: false }),
      ponto({ time: '11:00', predicted: 1, lower: 0, upper: 3, isPrediction: true }),
    ];

    renderizar({ data: serie, currentCapacity: 35 });

    expect(screen.getByText('Descendo')).toBeInTheDocument();
  });
});

describe('DemandPrediction — caminhos de dado vazio (dependem de produção)', () => {
  it.todo(
    'período sem histórico mostra "Estável" e não consulta a fonte: hoje `useDemandPrediction` quebra (`Math.max` de lista vazia) com `data: []` e, sem histórico, inventa "Descendo / 0 msgs"',
  );
  it.todo(
    'leitura do histórico com erro mostra aviso próprio em vez de série zerada (t_c9c4999f / cartão de produção da previsão)',
  );
});
