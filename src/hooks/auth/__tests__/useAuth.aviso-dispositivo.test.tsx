import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuth, AuthProvider } from '../useAuth';
import { notificarDispositivoNovo, extrairSessionIdDoToken } from '@/lib/avisoDispositivo';
import { supabase } from '@/integrations/supabase/client';

/**
 * Aviso de "novo dispositivo" no login.
 *
 * Antes, `detect-new-device` só era chamado quando o usuário abria a tela de
 * Segurança (useDeviceDetection). O e-mail de alerta de acesso suspeito, que só
 * tem valor no momento do roubo de credencial, nunca saía sozinho.
 *
 * Estes testes provam, contra o AuthProvider real:
 *   1. o aviso sai no boot (sessão já aberta) e no SIGNED_IN;
 *   2. sai UMA vez por sessão Auth, mesmo com boot + login ou recarregamento;
 *   3. falha do aviso é silenciosa — o login não é bloqueado por ela;
 *   4. token sem claim `session_id` não dispara nada (contrato com a Edge).
 */

const harness = vi.hoisted(() => ({
  /** Callbacks registrados em `supabase.auth.onAuthStateChange`. */
  assinantes: [] as Array<(event: string, session: unknown) => void>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const construtorPerfil = {
    select: () => construtorPerfil,
    eq: () => construtorPerfil,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };

  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        refreshSession: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
          harness.assinantes.push(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
      from: vi.fn(() => construtorPerfil),
      functions: { invoke: vi.fn() },
    },
  };
});

/** JWT de acesso mínimo com o claim `session_id` (assinatura não é validada no cliente). */
const tokenJwt = (sessionId: string) => {
  const payload = btoa(JSON.stringify({ session_id: sessionId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `cabecalho.${payload}.assinatura`;
};

const sessao = (sessionId: string) =>
  ({ user: { id: `user-${sessionId}` }, access_token: tokenJwt(sessionId) }) as never;

function montarProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}

/** Chamadas do aviso (isoladas das demais invocações de Edge). */
const avisosDisparados = () =>
  vi
    .mocked(supabase.functions.invoke)
    .mock.calls.filter(([nome]) => nome === 'detect-new-device');

const corpoDoAviso = (indice = 0) => {
  const chamada = avisosDisparados()[indice] as unknown as [
    string,
    { body: Record<string, string> },
  ];
  return chamada[1].body;
};

const emitir = async (evento: string, sessaoOuNull: unknown) => {
  await act(async () => {
    harness.assinantes.forEach((cb) => cb(evento, sessaoOuNull));
    await Promise.resolve();
  });
};

describe('AuthProvider — aviso de novo dispositivo no login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.assinantes.length = 0;
    sessionStorage.clear();
    // jsdom não implementa canvas: fixa as duas pontas usadas pela impressão digital.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,') as never;
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { device_id: 'dev-novo' },
      error: null,
    } as never);
  });

  it('avisa o servidor no boot quando a sessão já existe', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('s-boot') },
      error: null,
    } as never);

    montarProvider();

    await waitFor(() => expect(avisosDisparados()).toHaveLength(1));
    const corpo = corpoDoAviso();
    expect(corpo.device_fingerprint).toBeTruthy();
    expect(corpo.browser).toBeTruthy();
    expect(corpo.os).toBeTruthy();
    expect(['Desktop', 'Dispositivo Móvel']).toContain(corpo.device_name);
  });

  it('avisa no SIGNED_IN e não repete a chamada na mesma sessão (nem ao remontar)', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    const primeiro = montarProvider();
    await waitFor(() => expect(primeiro.result.current.loading).toBe(false));
    expect(avisosDisparados()).toHaveLength(0);

    await emitir('SIGNED_IN', sessao('s-login'));
    await waitFor(() => expect(avisosDisparados()).toHaveLength(1));

    // Segundo evento da MESMA sessão Auth não pode gerar um segundo e-mail.
    await emitir('SIGNED_IN', sessao('s-login'));
    expect(avisosDisparados()).toHaveLength(1);

    // Recarregar a aba mantém a mesma sessão: o boot também não re-avisa.
    const segundo = montarProvider();
    await waitFor(() => expect(segundo.result.current.loading).toBe(false));
    expect(avisosDisparados()).toHaveLength(1);
  });

  it('reaproveita o aviso já gravado na sessão (abrir nova aba não re-avisa)', async () => {
    sessionStorage.setItem(
      'zapp:aviso-dispositivo:s-reuso',
      JSON.stringify({ deviceId: 'dev-9' }),
    );
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('s-reuso') },
      error: null,
    } as never);

    const { result } = montarProvider();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(avisosDisparados()).toHaveLength(0);
  });

  it('falha do aviso é silenciosa: o login segue e não há nova tentativa na sessão', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('edge fora do ar'));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: sessao('s-falha') },
      error: null,
    } as never);

    const { result } = montarProvider();

    await waitFor(() => expect(avisosDisparados()).toHaveLength(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // O aviso falhou, mas o usuário autenticado continua na sessão.
    expect(result.current.user).not.toBeNull();

    await emitir('SIGNED_IN', sessao('s-falha'));
    expect(avisosDisparados()).toHaveLength(1);
  });

  it('não avisa quando o token não tem claim de sessão (contrato com a Edge)', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-opaco' }, access_token: 'token-opaco' } },
      error: null,
    } as never);

    const { result } = montarProvider();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(avisosDisparados()).toHaveLength(0);
  });

  it('devolve o device_id do aviso para reuso por quem também precisa dele', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { device_id: 'dev-77' },
      error: null,
    } as never);

    await expect(notificarDispositivoNovo(tokenJwt('s-devolve'))).resolves.toBe('dev-77');
  });

  it('extrai o session_id do JWT e ignora token malformado', () => {
    expect(extrairSessionIdDoToken(tokenJwt('s-claim'))).toBe('s-claim');
    expect(extrairSessionIdDoToken('token-opaco')).toBeNull();
    expect(extrairSessionIdDoToken(null)).toBeNull();
  });
});
