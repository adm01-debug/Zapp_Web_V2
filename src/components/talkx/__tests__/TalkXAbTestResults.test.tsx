import { describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent('Menor amostra: 30 de 200');
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
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent(
      'Menor amostra: 150 · total 300 destinatários · mínima 50 por variante',
    );
    expect(screen.getByText('Taxa de resposta')).toBeInTheDocument();
  });

  // Reprova com a regra antiga (soma 100 >= 50): a divergencia que a revisao
  // da PR #3262 apontou entre a tela e `decide_talkx_ab_winner`, que calcula
  // `min(s.total)` e recusa com `insufficient_data`.
  it('distribuição desigual não libera a comparação que o banco recusaria', () => {
    render(
      <TalkXAbTestResults
        {...base}
        minSample={50}
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 99, reply_rate: 22 }),
          variante({ variant_id: 'vb', label: 'B', total: 1, reply_rate: 100 }),
        ]}
      />,
    );
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent('Menor amostra: 1 de 50');
    expect(screen.queryByText('22.0%')).not.toBeInTheDocument();
  });

  it('uma variante só não vira comparação de um lado', () => {
    render(<TalkXAbTestResults {...base} minSample={10} variants={[variante({ total: 500 })]} />);
    expect(screen.getByTestId('talkx-ab-results')).toHaveTextContent('Só há uma variante com dados');
    expect(screen.queryByText('40.0%')).not.toBeInTheDocument();
  });

  // Antes, falha da RPC chegava como lista vazia e a tela dizia "Amostra: 0" —
  // afirmava zero destinatário onde o estado real era desconhecido.
  it('falha da RPC aparece como erro com nova tentativa, não como amostra zero', () => {
    const tentar = vi.fn();
    render(<TalkXAbTestResults {...base} isError onRetry={tentar} variants={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o resultado por variante');
    expect(screen.getByTestId('talkx-ab-results')).not.toHaveTextContent('de 50 destinatários');
    screen.getByRole('button', { name: 'Tentar novamente' }).click();
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  // X065 — a acao de decidir a vencedora. Sem ela, `decide_talkx_ab_winner`
  // nao tinha NENHUM chamador em src/: a RPC existia e era inalcancavel.
  it('com amostra suficiente oferece decidir automática e escolha manual', () => {
    const decidir = vi.fn();
    render(
      <TalkXAbTestResults
        {...base}
        onDecidir={decidir}
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150, reply_rate: 18.5 }),
          variante({ variant_id: 'vb', label: 'B', total: 150, reply_rate: 31.2 }),
        ]}
      />,
    );
    screen.getByRole('button', { name: 'Decidir vencedora' }).click();
    expect(decidir).toHaveBeenCalledWith(null);
    // Escolha manual: uma por variante, levando o id.
    const manuais = screen.getAllByRole('button', { name: 'Escolher' });
    expect(manuais).toHaveLength(2);
    manuais[1].click();
    expect(decidir).toHaveBeenLastCalledWith('vb');
  });

  it('com vencedora já definida a decisão não é oferecida de novo', () => {
    render(
      <TalkXAbTestResults
        {...base}
        onDecidir={vi.fn()}
        winnerVariantId="vb"
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150 }),
          variante({ variant_id: 'vb', label: 'B', total: 150 }),
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Decidir vencedora' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escolher' })).not.toBeInTheDocument();
    expect(screen.getByText('Vencedora')).toBeInTheDocument();
  });

  // `insufficient_data` nao e erro: a tela diz POR QUE nao decidiu.
  it('motivo da recusa aparece como estado, não como falha', () => {
    render(
      <TalkXAbTestResults
        {...base}
        onDecidir={vi.fn()}
        motivoNaoDecidiu="A diferença entre as variantes ainda está dentro do ruído."
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150 }),
          variante({ variant_id: 'vb', label: 'B', total: 150 }),
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('dentro do ruído');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  // Duas variantes porque a comparacao agora exige par (uma barra sozinha nao e
  // resultado de A/B). A assercao continua sendo o nome acessivel da barra.
  it('cada barra tem nome acessível com a taxa e a base', () => {
    render(
      <TalkXAbTestResults
        {...base}
        variants={[
          variante({ variant_id: 'va', label: 'A', total: 150, reply_rate: 22.4 }),
          variante({ variant_id: 'vb', label: 'B', total: 150, reply_rate: 11.1 }),
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: /A: 22\.4% em taxa de resposta, sobre 150 destinatários/i }),
    ).toBeInTheDocument();
  });
});
