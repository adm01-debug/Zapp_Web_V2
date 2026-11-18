import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXAbTestResults } from '../tracking/TalkXAbTestResults';
import type { TalkXAbVariantStat } from '@/hooks/integrations/useTalkXAbStats';

const variante = (over: Partial<TalkXAbVariantStat> = {}): TalkXAbVariantStat => ({
  variant_id: '11111111-1111-1111-1111-111111111111',
  label: 'A',
  weight: 50,
  total: 100,
  sent: 100,
  deliveries: 100,
  reads: 80,
  replies: 40,
  clicks: 12,
  reply_rate: 40,
  click_rate: 12,
  delivery_rate: 100,
  ...over,
});

const base = {
  abEnabled: true,
  metric: 'reply_rate' as const,
  minSample: 50,
  winnerVariantId: null,
  variants: [] as TalkXAbVariantStat[],
};

describe('X065 — TalkXAbTestResults', () => {
  it('com o A/B desligado o painel não existe', () => {
    render(<TalkXAbTestResults {...base} abEnabled={false} variants={[variante()]} />);
    expect(screen.queryByTestId('talkx-ab-results')).not.toBeInTheDocument();
  });

  it('abaixo da amostra mínima mostra o quanto falta, não a comparação', () => {
    render(
      <TalkXAbTestResults
        {...base}
        minSample={200}
        variants={[variante({ total: 40 }), variante({ variant_id: 'b', label: 'B', total: 30 })]}
      />,
    );
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent('Amostra: 70 de 200');
    expect(screen.queryByText('Vencedora')).not.toBeInTheDocument();
  });

  it('carregando anuncia o estado sem inventar número', () => {
    render(<TalkXAbTestResults {...base} isLoading variants={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o resultado por variante');
  });

  it('com amostra suficiente mostra as taxas do servidor e marca a vencedora', () => {
    render(
      <TalkXAbTestResults
        {...base}
        winnerVariantId="vb"
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150, reply_rate: 18.5 }),
          variante({ variant_id: 'vb', label: 'B', total: 150, reply_rate: 31.2 }),
        ]}
      />,
    );
    expect(screen.getByText('18.5%')).toBeInTheDocument();
    expect(screen.getByText('31.2%')).toBeInTheDocument();
    expect(screen.getByText('Vencedora')).toBeInTheDocument();
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent('Amostra: 300 destinatários · mínima 50');
    expect(screen.getByText('Taxa de resposta')).toBeInTheDocument();
  });

  it('a métrica da campanha troca a taxa lida, sem a tela recalcular nada', () => {
    render(
      <TalkXAbTestResults
        {...base}
        metric="click_rate"
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150, reply_rate: 90, click_rate: 7.5 }),
          variante({ variant_id: 'vb', label: 'B', total: 150, reply_rate: 10, click_rate: 3.1 }),
        ]}
      />,
    );
    expect(screen.getByText('Taxa de clique')).toBeInTheDocument();
    expect(screen.getByText('7.5%')).toBeInTheDocument();
    expect(screen.queryByText('90.0%')).not.toBeInTheDocument();
  });

  it('variante sem rótulo vira A/B/C pela ordem, com o id no title', () => {
    render(
      <TalkXAbTestResults
        {...base}
        variants={[
          variante({ variant_id: 'va', label: null, total: 100 }),
          variante({ variant_id: 'vb', label: '  ', total: 100 }),
        ]}
      />,
    );
    expect(screen.getByText('Variante A')).toHaveAttribute('title', 'va');
    expect(screen.getByText('Variante B')).toHaveAttribute('title', 'vb');
  });

  it('cada barra tem nome acessível com a taxa e a base', () => {
    render(<TalkXAbTestResults {...base} variants={[variante({ variant_id: 'va', label: 'A', total: 150, reply_rate: 22.4 })]} />);
    expect(
      screen.getByRole('img', { name: /A: 22\.4% em taxa de resposta, sobre 150 destinatários/i }),
    ).toBeInTheDocument();
  });
});
