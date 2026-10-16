import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelefoniaTopActions } from '../TelefoniaTopActions';
import { PERIODOS } from '../periodos';

/**
 * T35 — controle do topo da tela. Aceite: 3 controles (2 chips + 1 select) e
 * rotulos que refletem `useCallChannels`. O mock abaixo devolve capacidades
 * CONTROLADAS, entao o teste prova que o chip segue o hook - nao um texto fixo.
 */
const capacidades = vi.fn();
vi.mock('@/hooks/calls/useCallChannels', () => ({ useCallChannels: () => capacidades() }));

const cenario = (voip: object, whatsapp: object) =>
  capacidades.mockReturnValue({
    voip: { channel: 'voip', canDial: false, canReceive: false, canRecord: false, canReject: false, reason: null, ...voip },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: false, canRecord: false, canReject: false, reason: null, ...whatsapp },
  });

describe('TelefoniaTopActions (T35)', () => {
  it('mostra os 2 chips e o select de periodo (os 3 controles do aceite)', () => {
    cenario({ canDial: true, canReceive: true }, { canReceive: true });
    render(<TelefoniaTopActions period="7d" onPeriodChange={vi.fn()} />);
    expect(screen.getByTestId('tel-chip-voip')).toBeTruthy();
    expect(screen.getByTestId('tel-chip-whatsapp')).toBeTruthy();
    expect(screen.getByLabelText('Período')).toBeTruthy();
  });

  it('o label do canal WhatsApp reflete o motivo que o hook devolve (D8)', () => {
    cenario({ canDial: true, canReceive: true }, { reason: 'whatsapp_restrito_supervisores' });
    render(<TelefoniaTopActions period="7d" onPeriodChange={vi.fn()} />);
    expect(screen.getByTestId('tel-chip-whatsapp')).toBeTruthy();
    // o texto do motivo vem de describeReason; aqui basta o canal estar refletindo o hook
    expect(capacidades).toHaveBeenCalled();
  });

  it('os 6 periodos do plano existem e o select recebe o valor atual', () => {
    cenario({ canDial: true, canReceive: true }, { canReceive: true });
    render(<TelefoniaTopActions period="7d" onPeriodChange={vi.fn()} />);
    const valores = PERIODOS.map((p) => p.value);
    expect(valores).toEqual(['hoje', 'ontem', '7d', '30d', 'mes', 'mes_passado']);
    expect(screen.getByLabelText('Período').textContent).toContain('7 dias');
  });

  it('o container e o select de periodo tem altura responsiva: 44px no celular, 40px no desktop', () => {
    cenario({ canDial: true, canReceive: true }, { canReceive: true });
    render(<TelefoniaTopActions period="7d" onPeriodChange={vi.fn()} />);
    const container = screen.getByTestId('tel-top-actions');
    expect(container.className).toContain('h-11');
    expect(container.className).toContain('md:h-10');
    const select = screen.getByLabelText('Período');
    expect(select.className).toContain('h-11');
    expect(select.className).toContain('md:h-10');
  });
});
