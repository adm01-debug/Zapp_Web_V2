import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductRecommendationCard } from '../ProductRecommendationCard';
import type { ProductRecommendationItem } from '@/hooks/copilot/useProductRecommendation';

const item = (over: Partial<ProductRecommendationItem> = {}): ProductRecommendationItem => ({
  product: 'Garrafa térmica inox 500ml',
  category: 'Bebidas',
  reasoning: 'O cliente citou evento ao ar livre no verão.',
  estimatedPrice: 'R$ 28 a R$ 42',
  confidence: 0.9,
  urgency: 'medium',
  ...over,
});

const base = {
  recommendations: [] as ProductRecommendationItem[],
  topPick: '',
  upsellOpportunity: '',
  isLoading: false,
  error: null as string | null,
  onRecommend: vi.fn(),
};

describe('CV-105 — ProductRecommendationCard', () => {
  it('ocioso mostra o convite e dispara a chamada no clique', () => {
    const onRecommend = vi.fn();
    render(<ProductRecommendationCard {...base} onRecommend={onRecommend} />);

    expect(screen.queryByText(/Consultando o catálogo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recomendar produtos/i }));
    expect(onRecommend).toHaveBeenCalledTimes(1);
  });

  it('sem mensagem do cliente o botão fica desabilitado e não chama a IA', () => {
    const onRecommend = vi.fn();
    render(<ProductRecommendationCard {...base} onRecommend={onRecommend} disabled />);

    const botao = screen.getByRole('button', { name: /Recomendar produtos/i });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(onRecommend).not.toHaveBeenCalled();
  });

  it('carregando anuncia o estado e esconde o convite', () => {
    render(<ProductRecommendationCard {...base} isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Consultando o catálogo');
    expect(screen.queryByRole('button', { name: /Recomendar produtos/i })).not.toBeInTheDocument();
  });

  it('erro aparece como alerta e deixa tentar de novo', () => {
    const onRecommend = vi.fn();
    render(<ProductRecommendationCard {...base} error="limite de IA atingido" onRecommend={onRecommend} />);

    expect(screen.getByRole('alert')).toHaveTextContent('limite de IA atingido');
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/i }));
    expect(onRecommend).toHaveBeenCalledTimes(1);
  });

  it('lista no máximo 3 produtos, marca a melhor escolha e mostra o upsell', () => {
    render(
      <ProductRecommendationCard
        {...base}
        recommendations={[
          item({ product: 'Garrafa térmica inox 500ml' }),
          item({ product: 'Boné bordado', urgency: 'high' }),
          item({ product: 'Mochila executiva', urgency: 'low' }),
          item({ product: 'Caneta metálica' }),
        ]}
        topPick="Boné bordado"
        upsellOpportunity="Fechar o kit com caneca economiza no frete."
      />,
    );

    expect(screen.getByText('Garrafa térmica inox 500ml')).toBeInTheDocument();
    expect(screen.getByText('Mochila executiva')).toBeInTheDocument();
    expect(screen.queryByText('Caneta metálica')).not.toBeInTheDocument();

    expect(screen.getByText('melhor escolha')).toBeInTheDocument();
    expect(screen.getByText(/urgente/)).toBeInTheDocument();
    expect(screen.getByText(/Fechar o kit com caneca/)).toBeInTheDocument();
  });

  it('"Usar no rascunho" entrega produto, motivo e faixa de preço ao rascunho', () => {
    const onUseSuggestion = vi.fn();
    render(
      <ProductRecommendationCard
        {...base}
        recommendations={[item()]}
        onUseSuggestion={onUseSuggestion}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Usar no rascunho/i }));
    const texto = onUseSuggestion.mock.calls[0][0] as string;
    expect(texto).toContain('Garrafa térmica inox 500ml');
    expect(texto).toContain('evento ao ar livre');
    expect(texto).toContain('R$ 28 a R$ 42');
  });

  it('sem destino para o texto, não oferece o botão de usar', () => {
    render(<ProductRecommendationCard {...base} recommendations={[item()]} />);
    expect(screen.queryByRole('button', { name: /Usar no rascunho/i })).not.toBeInTheDocument();
  });

  it('com resultado na tela, oferece recalcular em vez de um segundo convite', () => {
    const onRecommend = vi.fn();
    render(<ProductRecommendationCard {...base} recommendations={[item()]} onRecommend={onRecommend} />);

    expect(screen.queryByRole('button', { name: /Recomendar produtos/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recalcular/i }));
    expect(onRecommend).toHaveBeenCalledTimes(1);
  });
});
