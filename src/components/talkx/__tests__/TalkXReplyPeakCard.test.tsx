import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TalkXReplyPeakCard } from '@/components/talkx/tracking/TalkXReplyPeakCard';

/**
 * X153 (tela 12) — card "Pico de Respostas", inventário T12-041…T12-044.
 *
 * Aceite do plano, caso a caso:
 *  - `prev10 = 2` não mostra percentual (a janela anterior tem menos de 5 respostas);
 *  - sem benchmark não mostra "Ótimo engajamento";
 *  - com base de comparação, a variação aparece e as mini-barras seguem a série.
 */
describe('TalkXReplyPeakCard — "Pico de Respostas" (X153)', () => {
  it('mostra o título e o selo "Em tempo real"', () => {
    render(<TalkXReplyPeakCard currentWindow={1} previousWindow={2} spark={[1, 0, 1]} replyRatePct={2} />);

    expect(screen.getByText('Pico de Respostas')).toBeTruthy();
    expect(screen.getByText('Em tempo real')).toBeTruthy();
  });

  it('com prev10 = 2 não mostra percentual e diz que ainda faltam respostas', () => {
    render(<TalkXReplyPeakCard currentWindow={3} previousWindow={2} spark={[0, 1, 1, 1]} replyRatePct={2} />);

    expect(screen.queryByText(/% nas respostas/)).toBeNull();
    expect(screen.getByText('Ainda sem respostas suficientes')).toBeTruthy();
    expect(screen.getByText(/São necessárias 5 respostas nos 10 minutos anteriores/)).toBeTruthy();
  });

  it('com 5+ respostas na janela anterior mostra a variação dos últimos 10 minutos', () => {
    render(<TalkXReplyPeakCard currentWindow={9} previousWindow={5} spark={[1, 2, 3, 3]} replyRatePct={8} />);

    expect(screen.getByText('+80% nas respostas')).toBeTruthy();
    expect(screen.getByText('Houve um aumento significativo de respostas nos últimos 10 minutos.')).toBeTruthy();
    expect(screen.queryByText('Ainda sem respostas suficientes')).toBeNull();
  });

  it('queda de respostas vira variação negativa, nunca "+-N%"', () => {
    render(<TalkXReplyPeakCard currentWindow={2} previousWindow={5} spark={[1, 1]} replyRatePct={1} />);

    expect(screen.getByText('-60% nas respostas')).toBeTruthy();
  });

  it('variação zero não mostra "aumento significativo"', () => {
    render(<TalkXReplyPeakCard currentWindow={5} previousWindow={5} spark={[1, 2, 3]} replyRatePct={10} />);

    expect(screen.getByText('0% nas respostas')).toBeTruthy();
    expect(screen.queryByText(/aumento significativo/)).toBeNull();
  });

  it('desenha uma mini-barra por minuto da série', () => {
    render(<TalkXReplyPeakCard currentWindow={9} previousWindow={5} spark={[0, 1, 2, 3, 4, 5, 6, 7]} replyRatePct={8} />);

    expect(screen.getAllByTestId('talkx-reply-peak-bar')).toHaveLength(8);
  });

  it('sem benchmark NÃO afirma "Ótimo engajamento", mesmo com muitas respostas', () => {
    render(<TalkXReplyPeakCard currentWindow={40} previousWindow={10} spark={[4, 4, 4]} replyRatePct={45} />);

    expect(screen.queryByText(/Ótimo engajamento/)).toBeNull();
  });

  it('com benchmark superado e base mínima satisfeita mostra "Ótimo engajamento"', () => {
    render(
      <TalkXReplyPeakCard
        currentWindow={9}
        previousWindow={5}
        spark={[1, 2, 3, 3]}
        replyRatePct={18}
        benchmark={{ averageRatePct: 12, minimumBase: 5 }}
      />,
    );

    expect(screen.getByText('Ótimo engajamento!')).toBeTruthy();
    expect(screen.getByText('Sua campanha está gerando mais resultados que o normal.')).toBeTruthy();
  });

  it('com benchmark mas base insuficiente (poucas respostas) NÃO mostra "Ótimo engajamento"', () => {
    render(
      <TalkXReplyPeakCard
        currentWindow={2}
        previousWindow={5}
        spark={[1, 1]}
        replyRatePct={90}
        benchmark={{ averageRatePct: 12, minimumBase: 5 }}
      />,
    );

    expect(screen.queryByText(/Ótimo engajamento/)).toBeNull();
  });

  it('taxa abaixo da média histórica NÃO mostra "Ótimo engajamento"', () => {
    render(
      <TalkXReplyPeakCard
        currentWindow={9}
        previousWindow={5}
        spark={[1, 2, 3, 3]}
        replyRatePct={4}
        benchmark={{ averageRatePct: 12, minimumBase: 5 }}
      />,
    );

    expect(screen.queryByText(/Ótimo engajamento/)).toBeNull();
  });
});
