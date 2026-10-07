/**
 * R2-QUE-009 (item 456 / P2) — prova de ponta a ponta no consumidor real:
 * AddMemberDialog monta com o componente REAL sobre um supabase mockado.
 * Antes da correcao, a consulta de atendentes que FALHA deixava `profiles`
 * vazio e a tela caia na mensagem de vazio ("Todos os atendentes ja estao
 * nesta fila"), ou seja, um erro de rede era anunciado como fila completa.
 * Com a correcao, a falha mostra o estado de erro e o vazio real continua
 * mostrando a mensagem de "todos ja estao".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  // Resultado da consulta a `profiles` (nome/ativos) usado pelo mock abaixo.
  result: { data: null as Array<{ id: string; name: string; avatar_url: string | null; is_active: boolean }> | null, error: null as { message: string } | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder = {
        eq: vi.fn(() => builder),
        order: vi.fn(() => Promise.resolve(hoisted.result)),
      };
      return { select: vi.fn(() => builder) };
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { AddMemberDialog } from '@/components/queues/AddMemberDialog';

const PROFILES = [
  { id: 'p1', name: 'Ana Lima', avatar_url: null, is_active: true },
  { id: 'p2', name: 'Bruno Souza', avatar_url: null, is_active: true },
];

function renderDialog(existingMemberIds: string[] = []) {
  const onAddMember = vi.fn().mockResolvedValue(undefined);
  render(
    <AddMemberDialog
      open
      onOpenChange={vi.fn()}
      queueId="q1"
      existingMemberIds={existingMemberIds}
      onAddMember={onAddMember}
    />,
  );
  return { onAddMember };
}

describe('AddMemberDialog — falha ao buscar atendentes (R2-QUE-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.result = { data: null, error: null };
  });

  it('mostra erro de carregamento (e nao "fila completa") quando a busca falha', async () => {
    hoisted.result = { data: null, error: { message: 'falha de rede' } };

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os atendentes/)).toBeInTheDocument();
    });

    // O defeito: sem a correcao a tela anunciava fila completa com a busca falhando.
    expect(screen.queryByText(/Todos os atendentes já estão nesta fila/)).toBeNull();
  });

  it('"Tentar novamente" refaz a busca e mostra os atendentes quando ela volta a funcionar', async () => {
    hoisted.result = { data: null, error: { message: 'falha de rede' } };

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar os atendentes/)).toBeInTheDocument();
    });

    // A consulta volta a responder no retry.
    hoisted.result = { data: PROFILES, error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(screen.getByText('Ana Lima')).toBeInTheDocument();
    });
    expect(screen.getByText('Bruno Souza')).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar os atendentes/)).toBeNull();
  });

  it('sem erro e sem atendentes sobrando, mantem a mensagem de que todos ja estao na fila', async () => {
    hoisted.result = { data: PROFILES, error: null };

    renderDialog(PROFILES.map((p) => p.id));

    await waitFor(() => {
      expect(screen.getByText('Todos os atendentes já estão nesta fila.')).toBeInTheDocument();
    });
  });

  it('lista os atendentes que ainda nao estao na fila e adiciona pelo botao', async () => {
    hoisted.result = { data: PROFILES, error: null };

    const { onAddMember } = renderDialog(['p1']);

    await waitFor(() => {
      expect(screen.getByText('Bruno Souza')).toBeInTheDocument();
    });
    // Quem ja esta na fila nao aparece na lista.
    expect(screen.queryByText('Ana Lima')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() => {
      expect(onAddMember).toHaveBeenCalledWith('p2');
    });
  });
});
