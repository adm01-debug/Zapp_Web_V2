import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Fronteira: só a chamada de rede da edge é dublada. Os hooks do painel e o
// card são os reais — o teste prova que o pedido do atendente chega à edge
// `ai-product-recommendation` e que a resposta volta para a tela.
const edge = vi.hoisted(() => ({ invokeEdge: vi.fn() }));
vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: edge.invokeEdge }));

import { RadarPhase8to15Panel } from '../RadarPhase8to15Panel';

describe('CV-105 integrado ao RADAR fases 8-15', () => {
  beforeEach(() => {
    edge.invokeEdge.mockReset();
  });

  it('sem mensagem do cliente o painel não aparece', () => {
    render(<RadarPhase8to15Panel lastClientMessage="" draftText="" onInsertText={() => {}} />);
    expect(screen.queryByTestId('cv105-recomendacao-produto')).not.toBeInTheDocument();
  });

  it('com mensagem do cliente o card aparece e NÃO chama a IA sozinho', () => {
    render(
      <RadarPhase8to15Panel
        lastClientMessage="Preciso de brinde para um evento ao ar livre em janeiro."
        draftText=""
        onInsertText={() => {}}
      />,
    );

    expect(screen.getByTestId('cv105-recomendacao-produto')).toBeInTheDocument();
    expect(edge.invokeEdge).not.toHaveBeenCalled();
  });

  it('o clique chama a edge com a mensagem do cliente e o resultado vai para o rascunho', async () => {
    edge.invokeEdge.mockResolvedValue({
      data: {
        recommendations: [
          {
            product: 'Squeeze 700ml',
            category: 'Bebidas',
            reasoning: 'Evento ao ar livre pede hidratação.',
            estimatedPrice: 'R$ 19 a R$ 31',
            confidence: 0.88,
            urgency: 'high',
          },
        ],
        topPick: 'Squeeze 700ml',
        upsellOpportunity: 'Gravação a laser sobe o valor percebido.',
      },
      error: null,
    });

    const onInsertText = vi.fn();
    render(
      <RadarPhase8to15Panel
        lastClientMessage="Preciso de brinde para um evento ao ar livre em janeiro."
        draftText=""
        clientName="Acme"
        onInsertText={onInsertText}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Recomendar produtos/i }));

    await waitFor(() => expect(edge.invokeEdge).toHaveBeenCalledTimes(1));
    const [nome, opcoes] = edge.invokeEdge.mock.calls[0];
    expect(nome).toBe('ai-product-recommendation');
    expect(opcoes.body.messages).toEqual([
      { content: 'Preciso de brinde para um evento ao ar livre em janeiro.', sender: 'contact' },
    ]);
    expect(opcoes.body.context).toBe('Acme');

    expect(await screen.findByText('Squeeze 700ml')).toBeInTheDocument();
    expect(screen.getByText(/Gravação a laser/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Usar no rascunho/i }));
    expect(onInsertText).toHaveBeenCalledWith(expect.stringContaining('Squeeze 700ml'));
  });

  it('falha da edge vira alerta na tela, sem derrubar o painel', async () => {
    edge.invokeEdge.mockResolvedValue({ data: null, error: { message: 'limite diário de IA atingido' } });

    render(
      <RadarPhase8to15Panel
        lastClientMessage="Quero sugestão de brinde."
        draftText=""
        onInsertText={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Recomendar produtos/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('limite diário de IA atingido');
    expect(screen.getByTestId('cv105-recomendacao-produto')).toBeInTheDocument();
  });
});
