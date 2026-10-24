/**
 * HZ1-10 — prova de MONTAGEM: o aviso de alerta de segurança é armado uma vez,
 * no nível do app, e não só dentro da Central de Segurança.
 *
 * Antes deste cartão o único chamador era `SecurityView`/painel: quem estava em
 * outra tela não era avisado de um alerta criado para ele. Aqui o sujeito é a
 * fiação — `App` monta `SecurityPushNotificationsListener` no slot de overlays
 * (`DeferredProviders`), dentro do `AuthProvider` e FORA das rotas. A mecânica
 * do hook (cursor pelo relógio do servidor, laço único por usuário, toasts) tem
 * cobertura própria em
 * `src/hooks/system/__tests__/useSecurityPushNotifications.test.ts`.
 *
 * Fronteiras dubladas: o próprio hook (contador de montagem), o cliente Supabase
 * (rede/banco — a guarda de rede do setup recusa falar com o projeto real) e as
 * rotas (têm cobertura própria; aqui só não interessam).
 */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ montagens: 0, enviar: vi.fn() }));

vi.mock('@/hooks/system/useSecurityPushNotifications', async () => {
  const react = await import('react');
  return {
    useSecurityPushNotifications: () => {
      react.useEffect(() => {
        h.montagens += 1;
        return () => { h.montagens -= 1; };
      }, []);
      return { sendSecurityNotification: h.enviar, isEnabled: false };
    },
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const canal = {
    on: vi.fn(() => canal),
    subscribe: vi.fn(() => canal),
    unsubscribe: vi.fn(),
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.or = vi.fn(() => builder);
        builder.is = vi.fn(() => builder);
        builder.in = vi.fn(() => builder);
        builder.limit = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        builder.then = (resolver: (valor: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolver);
        return builder;
      }),
      channel: vi.fn(() => canal),
      removeChannel: vi.fn(async () => 'ok'),
    },
  };
});

vi.mock('@/routes/AppRoutes', () => ({
  AppRoutes: () => <div data-testid="rotas">tela atual</div>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));

const { default: App } = await import('@/App');

beforeEach(() => {
  h.montagens = 0;
  h.enviar.mockClear();
});

afterEach(cleanup);

describe('App — aviso de alerta de segurança (HZ1-10)', () => {
  it('arma o aviso UMA vez, no nível do app, junto das rotas', async () => {
    const { unmount } = render(<App />);

    // O listener é lazy (chunk de overlay): monta depois do primeiro paint.
    await waitFor(() => expect(h.montagens).toBe(1));
    expect(document.querySelector('[data-testid="rotas"]')).toBeTruthy();

    unmount();
    await waitFor(() => expect(h.montagens).toBe(0));
    // A fiação não deixa resíduo: um novo mount arma de novo, uma única vez.
    render(<App />);
    await waitFor(() => expect(h.montagens).toBe(1));
  });

  it('o aviso vive FORA das rotas: monta mesmo com as rotas dubladas', async () => {
    // `AppRoutes` está dublado (não renderiza o listener). Se o aviso estivesse
    // dentro das rotas, o contador ficaria em 0 — em 1, ele é irmão das rotas,
    // no slot de overlays, e nenhuma tela precisa estar aberta.
    render(<App />);

    await waitFor(() => expect(h.montagens).toBe(1));
    expect(h.montagens).toBe(1);
  });
});
