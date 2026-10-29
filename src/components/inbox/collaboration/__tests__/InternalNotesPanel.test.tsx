import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const db = vi.hoisted(() => ({
  notes: [] as Array<Record<string, unknown>>,
  notesError: null as null | Error,
  insertSpy: vi.fn(),
  insertError: null as null | Error,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { id: 'perfil-1' }, error: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: db.notes, error: db.notesError }) }) }),
        }),
        insert: (row: Record<string, unknown>) => {
          db.insertSpy(row);
          return Promise.resolve({ error: db.insertError });
        },
      };
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/inbox/useMentionableProfiles', () => ({
  useMentionableProfileNames: () => ({ data: undefined }),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => (props: Record<string, unknown>) => {
      const { children, initial, animate, exit, transition, layout, ...rest } = props;
      return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/inbox/collaboration/MentionInput', () => ({
  MentionInput: ({ value, onChange, onSubmit, placeholder, disabled }: {
    value: string; onChange: (v: string) => void; onSubmit: () => void;
    placeholder?: string; disabled?: boolean;
  }) => (
    <div>
      <textarea aria-label="nova nota" placeholder={placeholder} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={onSubmit} disabled={disabled}>Enviar nota</button>
    </div>
  ),
}));

import { InternalNotesPanel } from '../InternalNotesPanel';
import { contactNotesKey } from '@/hooks/crm/useContactNotes';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';

function renderPanel(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <InternalNotesPanel contactId="c1" />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  db.notes = [];
  db.notesError = null;
  db.insertError = null;
  db.insertSpy.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  cleanup();
});

describe('InternalNotesPanel — leitura', () => {
  it('mostra o título e avisa quando não há notas', async () => {
    renderPanel();
    expect(screen.getByText('Notas Internas')).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma nota ainda')).toBeInTheDocument();
  });

  it('mostra a nota, o autor e a contagem', async () => {
    db.notes = [{
      id: 'n1', content: 'Cliente quer 500 canecas',
      created_at: '2026-01-06T12:00:00',
      author: { id: 'a1', name: 'Ana Lima', avatar_url: null },
    }];
    renderPanel();

    expect(await screen.findByText('Cliente quer 500 canecas')).toBeInTheDocument();
    expect(screen.getByText('Ana Lima')).toBeInTheDocument();
    expect(screen.getByText('06/01 12:00')).toBeInTheDocument();
  });

  it('transforma @menção em destaque e mantém o texto em volta', async () => {
    db.notes = [{
      id: 'n1', content: 'Falar com @ana sobre o pedido',
      created_at: '2026-01-06T12:00:00',
      author: { id: 'a1', name: 'Ana Lima', avatar_url: null },
    }];
    renderPanel();

    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByText(/Falar com/)).toBeInTheDocument();
    expect(screen.getByText(/sobre o pedido/)).toBeInTheDocument();
  });

  it('mostra "Anônimo" quando o autor não tem nome', async () => {
    db.notes = [{ id: 'n1', content: 'sem autor', created_at: '2026-01-06T12:00:00', author: null }];
    renderPanel();
    expect(await screen.findByText('Anônimo')).toBeInTheDocument();
  });

  it('propaga erro da consulta sem quebrar a tela', async () => {
    db.notesError = new Error('sem permissão');
    renderPanel();
    expect(await screen.findByText('Notas Internas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma nota ainda')).toBeNull();
  });

  it('mostra o erro (não "vazio") e refaz a consulta no "Tentar novamente"', async () => {
    db.notesError = new Error('sem permissão');
    renderPanel();

    expect(await screen.findByText('Não foi possível carregar as notas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma nota ainda')).toBeNull();

    db.notesError = null;
    db.notes = [{
      id: 'n1', content: 'Nota recuperada', created_at: '2026-01-06T12:00:00',
      author: { id: 'a1', name: 'Ana Lima', avatar_url: null },
    }];
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nota recuperada')).toBeInTheDocument();
  });
});

describe('InternalNotesPanel — escrita', () => {
  it('grava a nota vinculada ao contato e ao perfil do usuário', async () => {
    renderPanel();
    await screen.findByText('Nenhuma nota ainda');

    fireEvent.change(screen.getByLabelText('nova nota'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));

    await waitFor(() => expect(db.insertSpy).toHaveBeenCalledTimes(1));
    expect(db.insertSpy).toHaveBeenCalledWith({ contact_id: 'c1', content: 'Ligar amanhã', author_id: 'perfil-1' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Nota adicionada!'));
  });

  it('não grava nota vazia nem só com espaços', async () => {
    renderPanel();
    await screen.findByText('Nenhuma nota ainda');

    fireEvent.change(screen.getByLabelText('nova nota'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));

    expect(db.insertSpy).not.toHaveBeenCalled();
  });

  it('avisa quando a gravação falha', async () => {
    db.insertError = new Error('falha');
    renderPanel();
    await screen.findByText('Nenhuma nota ainda');

    fireEvent.change(screen.getByLabelText('nova nota'), { target: { value: 'Nota' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao adicionar nota'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('ao gravar, invalida as três chaves que leem a mesma nota', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderPanel(client);
    await screen.findByText('Nenhuma nota ainda');

    fireEvent.change(screen.getByLabelText('nova nota'), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nota' }));

    await waitFor(() => expect(db.insertSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['internal-notes', 'c1'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: contactNotesKey('c1', 'u1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey('c1') });
  });
});
