import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * TL-168 (X182 · T06-057, T06-068) — modal "Gerenciar motivos".
 *
 * Vermelho antes do fix: `grep "Gerenciar motivos"` na tela = 0. Os motivos
 * eram (e continuam sendo) os de sistema, na constante `REASONS`; a tabela
 * `talkx_suppression_reasons` ainda não existe (X070 é trilha de banco), então
 * o modal entrega o que o front pode provar sem inventar armazenamento: a
 * lista dos motivos de sistema, o uso de cada um e a marca de que são do
 * sistema — sem ação de desativar.
 */

const BL = [
  {
    id: 'bl-1',
    contact_id: 'c1',
    phone: '+5511999990001',
    reason: 'Opt-out solicitado',
    blocked_by: 'profile-1',
    created_at: '2026-09-01T10:00:00.000Z',
    origin: 'optout',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: { name: 'Ana Souza', phone: '+5511999990001', company: 'ACME', avatar_url: null },
  },
  {
    id: 'bl-2',
    contact_id: null,
    phone: '11988887777',
    reason: 'Opt-out solicitado',
    blocked_by: 'profile-1',
    created_at: '2026-09-02T10:00:00.000Z',
    origin: 'optout',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: null,
  },
  {
    id: 'bl-3',
    contact_id: 'c4',
    phone: null,
    reason: 'Bloqueio manual',
    blocked_by: 'profile-1',
    created_at: '2026-09-03T10:00:00.000Z',
    origin: 'manual',
    campaign_id: null,
    removed_by: null,
    removed_at: null,
    contacts: { name: 'Diego Alves', phone: '+5511966660004', company: null, avatar_url: null },
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (data: unknown[]) => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.not = () => self;
    self.is = () => self;
    self.or = () => self;
    self.order = () => self;
    self.limit = () => Promise.resolve({ data, error: null });
    self.then = (resolve: unknown, reject: unknown) =>
      Promise.resolve({ data, error: null }).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
    return self;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: (table: string) => chain(table === 'talkx_blacklist' ? BL : []),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({ insert: () => Promise.resolve({ error: null }) }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'profile-1' }, session: {}, loading: false }),
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

async function abrirMotivos() {
  renderView();
  const acao = await screen.findByRole('button', { name: /Gerenciar motivos/ });
  fireEvent.click(acao);
  return screen.findByRole('dialog');
}

describe('TalkXSuppression · modal Gerenciar motivos (X182/T06-057)', () => {
  it('lista os motivos de sistema com o uso de cada um', async () => {
    const dialog = await abrirMotivos();
    const dentro = within(dialog);

    expect(dentro.getByText('Opt-out solicitado')).toBeTruthy();
    expect(dentro.getByText('2 registros')).toBeTruthy();
    expect(dentro.getByText('Bloqueio manual')).toBeTruthy();
    expect(dentro.getByText('1 registro')).toBeTruthy();
    // Motivo sem uso aparece zerado, não sumido.
    expect(dentro.getByText('Reclamação de spam')).toBeTruthy();
    expect(dentro.getAllByText('0 registros').length).toBeGreaterThan(0);
  });

  it('marca cada motivo como de sistema, sem ação de desativar', async () => {
    const dialog = await abrirMotivos();
    const dentro = within(dialog);

    expect(dentro.getAllByText('Sistema')).toHaveLength(7);
    expect(dentro.queryByRole('button', { name: /Desativar|Excluir|Remover|Renomear|Salvar|Nova/i })).toBeNull();
    expect(dentro.getByRole('button', { name: /^Fechar$/i })).toBeTruthy();
  });

  it('fecha pelo botão Fechar', async () => {
    const dialog = await abrirMotivos();

    fireEvent.click(within(dialog).getByRole('button', { name: /^Fechar$/i }));

    expect(screen.queryByText('Motivos de supressão')).toBeNull();
  });
});
