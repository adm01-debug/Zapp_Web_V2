import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TalkXProgressRing } from '@/components/talkx/tracking/TalkXProgressRing';

/**
 * X153 (tela 12) — anel de progresso, inventário T12-028…T12-033.
 *
 * O anel anterior tinha cinco fatias em que "Enviadas" valia `sent − delivered`, não
 * tinha percentuais nem a linha de respondidos. Aqui o aceite do plano é literal:
 * 1.250 enviados / 1.180 entregues / 289 respondidos / 42 falhas / 5.000 total →
 * "25%", "1.250", "(94%)", "(23%)", "(3%)", "3.750".
 */
describe('TalkXProgressRing — anel da Visão Geral (X153)', () => {
  it('mostra o centro "N% · X de Y" e a legenda do mock com os percentuais sobre os enviados', () => {
    render(<TalkXProgressRing sent={1250} delivered={1180} replied={289} failed={42} total={5000} />);

    // centro: 1.250 de 5.000 enviados = 25%
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('1.250 de 5.000')).toBeTruthy();

    // legenda: o total ENVIADO (não `sent − delivered`), cada percentual sobre os enviados
    expect(screen.getByText('Enviados')).toBeTruthy();
    expect(screen.getByText('1.250')).toBeTruthy();
    expect(screen.getByText('Entregues')).toBeTruthy();
    expect(screen.getByText('(94%)')).toBeTruthy();
    expect(screen.getByText('Respondidos')).toBeTruthy();
    expect(screen.getByText('289')).toBeTruthy();
    expect(screen.getByText('(23%)')).toBeTruthy();
    expect(screen.getByText('Falhas')).toBeTruthy();
    expect(screen.getByText('(3%)')).toBeTruthy();
    expect(screen.getByText('Pendentes')).toBeTruthy();
    expect(screen.getByText('3.750')).toBeTruthy();
  });

  it('sem enviados não divide por zero nem mostra NaN', () => {
    render(<TalkXProgressRing sent={0} delivered={0} replied={0} failed={0} total={0} />);

    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('0 de 0')).toBeTruthy();
    expect(document.body.textContent).not.toContain('NaN');
    // os três percentuais sem base saem zerados
    expect(screen.getAllByText('(0%)')).toHaveLength(3);
  });

  it('não excede 360° quando failed > 0 — a soma das fatias não passa da circunferência', () => {
    render(<TalkXProgressRing sent={100} delivered={70} replied={10} failed={20} total={100} />);

    const circ = 2 * Math.PI * 72;
    const circles = document.querySelectorAll('svg circle');
    let totalDash = 0;
    circles.forEach((circle) => {
      const dashStr = circle.getAttribute('stroke-dasharray');
      if (dashStr) {
        const dash = parseFloat(dashStr.split(' ')[0]);
        totalDash += dash;
        expect(dash).toBeLessThanOrEqual(circ);
      }
    });
    expect(totalDash).toBeCloseTo(circ, 0);
  });
});
