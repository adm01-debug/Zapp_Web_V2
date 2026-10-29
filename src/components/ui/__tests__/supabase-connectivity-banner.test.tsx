/**
 * t_bc279fb5 — banner de conectividade com o backend Supabase.
 *
 * O que se prova aqui:
 *  - a faixa aparece quando a sonda do backend está `degraded` ou `offline`
 *    (backend inacessível) e NÃO aparece com a sonda `online` nem antes da
 *    primeira resposta (`checking`);
 *  - ela não duplica o `OfflineIndicator`: com o NAVEGADOR offline o banner não
 *    renderiza nada (o OfflineIndicator segue dono desse estado);
 *  - o anúncio sai por região viva (`role="status"` + `aria-live="polite"`);
 *  - o botão "Tentar agora" dispara uma nova sonda (`retryNow`);
 *  - ao voltar, sai um "Conexão restabelecida" curto que some sozinho — e NÃO
 *    fica preso se o navegador cair no meio do aviso;
 *  - com movimento reduzido pedido pelo usuário, a faixa entra sem deslocamento
 *    (nenhum `translate` inline).
 *
 * O componente é o REAL; só as duas fontes de estado (a sonda e o status de
 * rede do navegador) são dubladas, que é o contrato consumido por ele.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  status: 'online' as string,
  browserOnline: true,
  reduced: false,
  retryNow: vi.fn(),
}));

vi.mock('@/hooks/system/useSupabaseConnectivity', () => ({
  useSupabaseConnectivity: () => ({
    status: h.status,
    isOnline: h.status === 'online',
    isDegraded: h.status === 'degraded',
    isOffline: h.status === 'offline',
    isChecking: h.status === 'checking',
    lastCheckedAt: null,
    latencyMs: null,
    consecutiveFailures: h.status === 'offline' ? 3 : 0,
    retryNow: h.retryNow,
  }),
}));

vi.mock('@/hooks/system/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    isOnline: h.browserOnline,
    wasOffline: false,
    downSince: null,
  }),
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => h.reduced,
    // Sem animação de saída: o que se prova aqui é o ESTADO (o aviso sai da
    // árvore quando `restored` volta a false), não a transição. Com o
    // AnimatePresence real o filho só desmonta ao fim do exit e o teste
    // dependeria de rAF/relógio para enxergar isso.
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SupabaseConnectivityBanner } from '../supabase-connectivity-banner';

const BANNER_TEXT = 'Sem conexão com o servidor';
const RESTORED_TEXT = 'Conexão restabelecida';

beforeEach(() => {
  cleanup();
  h.status = 'online';
  h.browserOnline = true;
  h.reduced = false;
  h.retryNow.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SupabaseConnectivityBanner', () => {
  it('não aparece com a sonda online', () => {
    h.status = 'online';
    render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('não aparece antes da primeira resposta da sonda (checking)', () => {
    h.status = 'checking';
    render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it('aparece com o backend degradado', () => {
    h.status = 'degraded';
    render(<SupabaseConnectivityBanner />);
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: /tentar agora/i })).toBeTruthy();
    // A segunda linha fala do SERVIDOR, não da conexão do usuário (o banner só
    // aparece com o navegador online).
    expect(screen.getByText(/tentaremos de novo automaticamente/i)).toBeTruthy();
    expect(screen.queryByText(/verifique sua conexão/i)).toBeNull();
  });

  it('aparece com o backend inacessível (offline da sonda) e o navegador online', () => {
    h.status = 'offline';
    h.browserOnline = true;
    render(<SupabaseConnectivityBanner />);
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
  });

  it('não duplica o OfflineIndicator: navegador offline não mostra o banner', () => {
    h.status = 'offline';
    h.browserOnline = false;
    render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('anuncia por região viva (role=status + aria-live=polite)', () => {
    h.status = 'degraded';
    render(<SupabaseConnectivityBanner />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent(BANNER_TEXT);
  });

  it('o botão "Tentar agora" dispara uma nova sonda', () => {
    h.status = 'degraded';
    render(<SupabaseConnectivityBanner />);
    fireEvent.click(screen.getByRole('button', { name: /tentar agora/i }));
    expect(h.retryNow).toHaveBeenCalledTimes(1);
  });

  it('mostra "Conexão restabelecida" ao voltar e some sozinho', () => {
    vi.useFakeTimers();
    h.status = 'degraded';
    const { rerender } = render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(RESTORED_TEXT)).toBeNull();

    h.status = 'online';
    rerender(<SupabaseConnectivityBanner />);
    expect(screen.getByText(RESTORED_TEXT)).toBeTruthy();

    // 4 s depois o próprio banner zera o aviso. Fake timers: nada de corrida
    // com o timeout padrão de 5 s do vitest.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText(RESTORED_TEXT)).toBeNull();
  });

  it('não deixa o aviso "Conexão restabelecida" preso se o navegador cair antes de 4 s', () => {
    vi.useFakeTimers();
    h.status = 'degraded';
    const { rerender } = render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(RESTORED_TEXT)).toBeNull();

    // backend volta -> aviso verde na tela
    h.status = 'online';
    rerender(<SupabaseConnectivityBanner />);
    expect(screen.getByText(RESTORED_TEXT)).toBeTruthy();

    // navegador cai ANTES dos 4 s do timer do aviso
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    h.browserOnline = false;
    rerender(<SupabaseConnectivityBanner />);

    // navegador volta online: o aviso verde não pode reaparecer preso na tela
    h.browserOnline = true;
    rerender(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(RESTORED_TEXT)).toBeNull();
  });

  it('respeita movimento reduzido: a faixa entra sem deslocamento inline', () => {
    h.reduced = true;
    h.status = 'degraded';
    render(<SupabaseConnectivityBanner />);
    const region = screen.getByRole('status');
    expect(region.style.transform).not.toContain('translate');
  });
});
