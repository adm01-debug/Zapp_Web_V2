import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSLACalculation } from '@/hooks/sla/useSLACalculation';

// Prova o comportamento REAL do hook (nao uma copia da logica):
// limiar de atencao derivado do prazo (30%, minimo 1 min) quando
// warningMinutes nao e informado; parametro explicito continua mandando.

const BASE = new Date('2026-10-11T12:00:00Z');

interface RenderOpts {
  firstResponseMinutes: number;
  warningMinutes?: number;
  firstResponseAt?: Date | null;
}

function renderAt(elapsedMs: number, opts: RenderOpts) {
  vi.setSystemTime(new Date(BASE.getTime() + elapsedMs));
  return renderHook(() =>
    useSLACalculation({
      firstMessageAt: BASE,
      firstResponseMinutes: opts.firstResponseMinutes,
      warningMinutes: opts.warningMinutes,
      firstResponseAt: opts.firstResponseAt ?? null,
    })
  );
}

describe('useSLACalculation — limiar de atencao proporcional ao prazo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prazo de 5 min: ok antes de 30% restante, warning exatamente aos 30% e vencido no prazo', () => {
    const five = 5 * 60_000;

    const antes = renderAt(200_000, { firstResponseMinutes: 5 }); // restam 100s (33%)
    expect(antes.result.current.firstResponse.status).toBe('ok');
    antes.unmount();

    const limite = renderAt(210_000, { firstResponseMinutes: 5 }); // restam 90s (30%)
    expect(limite.result.current.firstResponse.status).toBe('warning');
    limite.unmount();

    const vencido = renderAt(five, { firstResponseMinutes: 5 });
    expect(vencido.result.current.firstResponse.status).toBe('breached');
    vencido.unmount();
  });

  it('prazo de 30 min: ok antes de 30% restante, warning exatamente aos 30% e vencido no prazo', () => {
    const thirty = 30 * 60_000;

    const antes = renderAt(1_200_000, { firstResponseMinutes: 30 }); // restam 10 min (33%)
    expect(antes.result.current.firstResponse.status).toBe('ok');
    antes.unmount();

    const limite = renderAt(1_260_000, { firstResponseMinutes: 30 }); // restam 9 min (30%)
    expect(limite.result.current.firstResponse.status).toBe('warning');
    limite.unmount();

    const vencido = renderAt(thirty, { firstResponseMinutes: 30 });
    expect(vencido.result.current.firstResponse.status).toBe('breached');
    vencido.unmount();
  });

  it('prazo de 60 min: ok antes de 30% restante, warning exatamente aos 30% e vencido no prazo', () => {
    const sixty = 60 * 60_000;

    const antes = renderAt(2_400_000, { firstResponseMinutes: 60 }); // restam 20 min (33%)
    expect(antes.result.current.firstResponse.status).toBe('ok');
    antes.unmount();

    const limite = renderAt(2_520_000, { firstResponseMinutes: 60 }); // restam 18 min (30%)
    expect(limite.result.current.firstResponse.status).toBe('warning');
    limite.unmount();

    const vencido = renderAt(sixty, { firstResponseMinutes: 60 });
    expect(vencido.result.current.firstResponse.status).toBe('breached');
    vencido.unmount();
  });

  it('warningMinutes explicito continua mandando (2 min) e ignora a regra de 30%', () => {
    // Aos 3 min de 60: 95% restante -> a regra de 30% diria "ok"; o parametro manda -> "warning".
    const explicito = renderAt(180_000, { firstResponseMinutes: 60, warningMinutes: 2 });
    expect(explicito.result.current.firstResponse.status).toBe('warning');
    explicito.unmount();

    // Aos 1 min de 60: antes do parametro explicito -> "ok".
    const antesParam = renderAt(60_000, { firstResponseMinutes: 60, warningMinutes: 2 });
    expect(antesParam.result.current.firstResponse.status).toBe('ok');
    antesParam.unmount();
  });

  it('prazo curto (2 min): piso de 1 min garante alerta com pelo menos 1 min de antecedencia', () => {
    // 30% de 2 min = 36s; sem o piso, restar 60s ainda seria "ok".
    const antes = renderAt(59_000, { firstResponseMinutes: 2 }); // restam 61s
    expect(antes.result.current.firstResponse.status).toBe('ok');
    antes.unmount();

    const noPiso = renderAt(60_000, { firstResponseMinutes: 2 }); // restam 60s (piso)
    expect(noPiso.result.current.firstResponse.status).toBe('warning');
    noPiso.unmount();

    const vencido = renderAt(120_000, { firstResponseMinutes: 2 });
    expect(vencido.result.current.firstResponse.status).toBe('breached');
    vencido.unmount();
  });

  it('quando a primeira resposta chegou: no prazo = ok, depois do prazo = breached', () => {
    const noPrazo = renderAt(300_000, {
      firstResponseMinutes: 5,
      firstResponseAt: new Date(BASE.getTime() + 240_000),
    });
    expect(noPrazo.result.current.firstResponse.breached).toBe(false);
    expect(noPrazo.result.current.firstResponse.status).toBe('ok');
    noPrazo.unmount();

    const atrasada = renderAt(300_000, {
      firstResponseMinutes: 5,
      firstResponseAt: new Date(BASE.getTime() + 360_000),
    });
    expect(atrasada.result.current.firstResponse.breached).toBe(true);
    expect(atrasada.result.current.firstResponse.status).toBe('breached');
    atrasada.unmount();
  });
});
