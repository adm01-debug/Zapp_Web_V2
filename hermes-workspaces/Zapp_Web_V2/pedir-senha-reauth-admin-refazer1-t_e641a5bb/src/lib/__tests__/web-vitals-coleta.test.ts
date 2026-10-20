import { describe, it, expect, vi, afterEach } from 'vitest';
import budget from '../../../performance-budget.json';

/**
 * E36 — a coleta real de Web Vitals e o `notes` do budget que a documenta.
 *
 * O `notes` dizia "Coleta real: Speed Insights da Vercel, instrumentado em
 * src/lib/web-vitals.ts (initSpeedInsights)". O coletor NASCIA ali, mas foi
 * movido no mesmo E36 para `src/lib/speed-insights.ts` — para ficar FORA do
 * bundle inicial (import dinâmico em `main.tsx`). O texto ficou apontando para
 * um arquivo que não exporta `initSpeedInsights`: quem lesse o budget
 * procuraria o coletor no lugar errado.
 *
 * O teste amarra o que o arquivo DIZ ao que o código FAZ: pega o caminho citado
 * no `notes`, importa esse módulo de verdade e chama o coletor dele.
 */

const { injectSpeedInsights } = vi.hoisted(() => ({ injectSpeedInsights: vi.fn() }));
vi.mock('@vercel/speed-insights', () => ({ injectSpeedInsights }));

/** `requestIdleCallback` de mentira: roda o callback na hora (jsdom não tem). */
function idleNow() {
  (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback = (
    cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  ) => {
    cb({ didTimeout: false, timeRemaining: () => 0 });
    return 1;
  };
}

afterEach(() => {
  injectSpeedInsights.mockClear();
  vi.resetModules();
});

describe('budget × coleta real de Web Vitals (E36)', () => {
  it('o `notes` aponta a coleta para um módulo que realmente a instrumenta', async () => {
    const notes = (budget as { notes: string }).notes;

    const citado = notes.match(/instrumentado em (src\/lib\/[\w.-]+\.ts)/)?.[1];
    expect(citado, 'o notes precisa dizer ONDE a coleta é instrumentada').toBeTruthy();

    // O caminho citado tem de exportar o coletor — não basta citar um arquivo.
    const modulo = await import(/* @vite-ignore */ citado!.replace(/^src\/lib\//, '../').replace(/\.ts$/, ''));
    expect(typeof modulo.initSpeedInsights, `${citado} não exporta initSpeedInsights`).toBe('function');
  });

  it('não manda procurar o coletor no web-vitals.ts (ele só tem os alvos)', async () => {
    const notes = (budget as { notes: string }).notes;
    expect(notes).not.toMatch(/instrumentado em src\/lib\/web-vitals\.ts/);

    const doWebVitals = await import('../web-vitals');
    expect('initSpeedInsights' in doWebVitals).toBe(false);
    expect(typeof doWebVitals.getRating).toBe('function');
  });

  it('o coletor do módulo citado injeta o Speed Insights da Vercel — uma vez só', async () => {
    const { initSpeedInsights } = await import('../speed-insights');
    idleNow();

    initSpeedInsights();
    await vi.waitFor(() => expect(injectSpeedInsights).toHaveBeenCalledTimes(1));

    // A segunda chamada (remonte/StrictMode) não pode re-injetar o coletor.
    initSpeedInsights();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(injectSpeedInsights).toHaveBeenCalledTimes(1);
  });
});
