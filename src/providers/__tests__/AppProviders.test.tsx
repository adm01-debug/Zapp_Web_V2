/**
 * ACH-3 (SL-108) — nenhum teste renderizava `AppProviders`/`App`.
 *
 * Achado da auditoria de Telefonia (docs/design/TELEFONIA_STATUS.md:653): "a
 * rede que pegaria uma regressão nesses dois arquivos é o E2E, e não existe
 * spec de VoIP/aba-líder". Este arquivo monta a PILHA REAL dos dois e prova,
 * POR DENTRO dela, que o contexto de VoIP (`useCallSession`) existe — a
 * ligação que hoje só o E2E cobriria.
 *
 * O que este teste trava (e que nenhum outro arquivo trava):
 *  - `AppProviders` monta o `CallSessionProvider` (AppProviders.tsx:79) — a
 *    mesma linha que a auditoria provou ser a origem da eleição de aba global;
 *  - `App` (App.tsx:155) monta as rotas DENTRO de `AppProviders` — se o
 *    provider sair de cima do `AppRoutes`, a UI de chamada perde o contexto;
 *  - a pilha inteira monta sem derrubar o filho (o filho é o conteúdo real).
 *
 * Fronteira dublada (nunca o sujeito): o cliente do Supabase — rede/banco. A
 * guarda de rede de `src/test/setup.ts` recusa falar com o projeto real, então
 * o dublê é obrigatório aqui. `AppRoutes` é o outro sujeito (tem cobertura
 * própria); aqui ele é substituído por uma sonda, não pelo próprio teste.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          or: vi.fn(() => builder),
          is: vi.fn(() => builder),
          in: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: (resolver: (valor: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolver),
        };
        return builder;
      }),
      channel: vi.fn(() => canal),
      removeChannel: vi.fn(async () => 'ok'),
    },
  };
});

vi.mock('@/routes/AppRoutes', () => ({
  AppRoutes: () => (
    <div data-testid="rotas">
      {/* Sonda: exatamente o que a UI de chamada consome das rotas. */}
      <SondaVoip />
    </div>
  ),
}));

const { AppProviders } = await import('../AppProviders');
const { useCallSession } = await import('../CallSessionProvider');
const { default: App } = await import('@/App');

/** Consome o contexto que `VoIPPanel`/`ActiveCallBar`/`DialPad` consomem. */
function SondaVoip() {
  const api = useCallSession();
  return (
    <span data-testid="voip">
      {api.session.status}
      {'|'}
      {typeof api.dial}
      {'|'}
      {typeof api.hangup}
      {'|'}
      {typeof api.openDialer}
    </span>
  );
}

describe('AppProviders/App — a pilha real monta (ACH-3)', () => {
  it('`AppProviders` entrega o contexto de VoIP ao filho', () => {
    render(
      <AppProviders>
        <SondaVoip />
      </AppProviders>,
    );

    // `useCallSession` LANÇA fora do provider: chegar aqui já prova o provider
    // na pilha. A sonda confirma que é o valor real da máquina (não um dublê).
    expect(screen.getByTestId('voip')).toHaveTextContent('idle|function|function|function');
  });

  it('`App` monta as rotas DENTRO de `AppProviders` (contexto alcança a tela)', async () => {
    render(<App />);

    // As rotas são lazy-ish/suspensas: o conteúdo chega depois do 1º paint.
    const rotas = await screen.findByTestId('rotas', undefined, { timeout: 10_000 });
    expect(rotas).toBeInTheDocument();
    expect(screen.getByTestId('voip')).toHaveTextContent('idle|function|function|function');
  });
});
