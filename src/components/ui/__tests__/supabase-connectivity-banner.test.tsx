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
 *  - ao voltar, sai um "Conexão restabelecida" curto que some sozinho;
 *  - com movimento reduzido pedido pelo usuário, a faixa entra sem deslocamento
 *    (nenhum `translate` inline).
 *
 * O componente é o REAL; só as duas fontes de estado (a sonda e o status de
 * rede do navegador) são dubladas, que é o contrato consumido por ele.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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
  return { ...actual, useReducedMotion: () => h.reduced };
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

  it('mostra "Conexão restabelecida" ao voltar e some sozinho', async () => {
    h.status = 'degraded';
    const { rerender } = render(<SupabaseConnectivityBanner />);
    expect(screen.queryByText(RESTORED_TEXT)).toBeNull();

    h.status = 'online';
    rerender(<SupabaseConnectivityBanner />);
    expect(screen.getByText(RESTORED_TEXT)).toBeTruthy();

    // Some sozinho ~4 s depois (o AnimatePresence ainda roda a saída antes de
    // desmontar, por isso a espera é por condição, não por tempo fixo).
    await waitFor(() => expect(screen.queryByText(RESTORED_TEXT)).toBeNull(), {
      timeout: 5000,
    });
  });

  it('respeita movimento reduzido: a faixa entra sem deslocamento inline', () => {
    h.reduced = true;
    h.status = 'degraded';
    render(<SupabaseConnectivityBanner />);
    const region = screen.getByRole('status');
    expect(region.style.transform).not.toContain('translate');
  });
});
