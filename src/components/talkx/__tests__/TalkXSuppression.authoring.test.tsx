import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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

// X050 — controle da resposta do UPDATE de "Remover": com `segurar` ligado, a
// promessa só resolve quando o teste chama o liberador. É assim que se prova
// que o modal do kit fica aberto enquanto a mutation não volta.
const updateGate = { segurar: false, liberar: [] as Array<() => void> };

vi.mock('@/integrations/supabase/client', () => {
  const chain = (data: unknown[]) => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.not = () => self;
    self.eq = () => self;
    self.maybeSingle = () => Promise.resolve({ data: { id: 'profile-1' }, error: null });
    // #407: a busca de contato passou a mandar filtro ao servidor e a fechar a
    // consulta com .order(...).limit(...) — o mock precisa aceitar o encadeamento.
    self.order = () => Object.assign(Promise.resolve({ data, error: null }), {
      limit: () => Promise.resolve({ data, error: null }),
    });
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
            return {
              eq: () => {
                if (!updateGate.segurar) return Promise.resolve({ error: null });
                return new Promise((resolve) => { updateGate.liberar.push(() => resolve({ error: null })); });
              },
            };
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
import { toast } from 'sonner';

const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;

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
    toastSuccess.mockClear();
    updateGate.segurar = false;
    updateGate.liberar.length = 0;
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

  // X050 — o diálogo cru de "Remover da lista de supressão?" virou o preset
  // `removerSupressao` do kit (barra de título, ✕, tile e botão violeta) e o
  // modal só fecha quando o UPDATE volta: o `onConfirm` devolve a Promise.
  it('"Remover" abre o modal do kit com os textos do mock e só fecha quando a mutation resolve', async () => {
    updateGate.segurar = true;
    renderView();

    fireEvent.click((await screen.findAllByRole('button', { name: /^Remover$/i }))[0]);

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Remover da Supressão')).toBeTruthy();
    expect(within(modal).getByText('Remover da supressão')).toBeTruthy();
    expect(within(modal).getByText('Deseja remover este contato da lista de supressão?')).toBeTruthy();
    expect(within(modal).getByText('O contato poderá receber mensagens nas próximas campanhas.')).toBeTruthy();
    // O nome do contato aparece nas linhas de detalhe (não na pergunta).
    expect(within(modal).getByText('Contato')).toBeTruthy();
    expect(within(modal).getByText('Ana Souza')).toBeTruthy();

    fireEvent.click(within(modal).getByRole('button', { name: /^Remover$/i }));

    // O UPDATE saiu, mas ainda não voltou: nada de fechar nem de anunciar sucesso.
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();

    await act(async () => { updateGate.liberar.splice(0).forEach((liberar) => liberar()); });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastSuccess).toHaveBeenCalledWith('Contato removido da lista de supressão');
  });
});
