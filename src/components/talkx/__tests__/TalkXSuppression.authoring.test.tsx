import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// V04 (plano Talk X V3, achado P1-4): a autoria da supressão tem de sair do
// perfil ativo. blocked_by e removed_by referenciam profiles(id) e o id do
// auth.users não é o mesmo id — 0 dos 6 perfis tem id = user_id (conferido no
// banco canônico), então gravar auth.uid() violava a FK e o "Adicionar
// contato" falhava em produção.
//
// Vermelho antes do fix: as duas asserções de payload falhavam (gravava
// 'auth-user-1') e o spy de getUser era chamado. Verde depois.
// Este teste também é a trava anti-regressão: qualquer volta do
// supabase.auth.getUser para autoria quebra aqui (por isso o comentário evita
// a forma com parênteses: o aceite da etapa cobra grep zerado no diretório).

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
const getUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const chain = (data: unknown[]) => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.not = () => self;
    self.eq = () => self;
    self.maybeSingle = () => Promise.resolve({ data: { id: 'profile-1' }, error: null });
    self.order = () => Promise.resolve({ data, error: null });
    return self;
  };
  return {
    supabase: {
      // Fiel ao cliente real: getUser resolve um usuário (id de auth.users, que
      // NÃO é o id de profiles). Com o código antigo isso gravava esse id na FK.
      auth: {
        getUser: (...args: unknown[]) => {
          getUser(...args);
          return Promise.resolve({ data: { user: { id: 'auth-user-1' } }, error: null });
        },
      },
      from: (table: string) => {
        if (table === 'contacts') {
          return chain([{ id: 'c2', name: 'Ana Souza', phone: '+5511988887777', company: 'ACME' }]);
        }
        if (table === 'talkx_blacklist') {
          const self: Record<string, unknown> = {};
          self.select = () => self;
          self.is = () => self;
          self.order = () => Promise.resolve({
            data: [{
              id: 'bl-1',
              contact_id: 'c1',
              reason: 'Manual',
              blocked_by: 'profile-1',
              created_at: '2026-09-01T10:00:00.000Z',
              origin: 'manual',
              campaign_id: null,
              removed_by: null,
              contacts: { name: 'Ana Souza', phone: '+5511988887777', company: 'ACME', avatar_url: null },
            }],
            error: null,
          });
          self.update = (payload: Record<string, unknown>) => {
            updated.push(payload);
            return { eq: () => Promise.resolve({ error: null }) };
          };
          return self;
        }
        return chain([]);
      },
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: (payload: Record<string, unknown>) => {
      inserted.push(payload);
      return Promise.resolve({ error: null });
    },
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'auth-user-1' },
    profile: { id: 'profile-1' },
    session: {},
    loading: false,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '@/components/talkx/TalkXSuppression';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSuppression />
    </QueryClientProvider>,
  );
}

describe('TalkXSuppression · autoria (V04)', () => {
  beforeEach(() => {
    inserted.length = 0;
    updated.length = 0;
    getUser.mockClear();
  });

  it('grava blocked_by com o id do perfil ativo, nunca com o id do auth', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /Adicionar contato/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Bloquear$/i }));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({
      contact_id: 'c2',
      blocked_by: 'profile-1',
      origin: 'manual',
    });
    expect(inserted[0].blocked_by).not.toBe('auth-user-1');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('grava removed_by com o id do perfil ativo, sem nova ida ao auth nem a profiles', async () => {
    renderView();

    const rowButtons = await screen.findAllByRole('button', { name: /Remover/i });
    fireEvent.click(rowButtons[0]);
    const confirmButtons = await screen.findAllByRole('button', { name: /^Remover$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toMatchObject({ removed_by: 'profile-1' });
    expect(updated[0].removed_by).not.toBe('auth-user-1');
    expect(getUser).not.toHaveBeenCalled();
  });
});
