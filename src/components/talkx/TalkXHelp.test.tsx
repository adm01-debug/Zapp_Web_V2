import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  settings: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => {
    if (table === 'talkx_help_views') return { insert: h.insert };
    return { select: () => ({ in: () => Promise.resolve(h.settings) }) };
  },
  supabase: { rpc: (...args: unknown[]) => h.rpc(...args) },
}));

vi.mock('./help/talkxHelpIndex', () => ({
  loadTalkXHelpDocs: () => Promise.resolve([]),
  findHelpDoc: () => null,
}));

import { TalkXHelp } from './TalkXHelp';
import { recordTalkXHelpView } from './help/recordTalkXHelpView';

function renderHelp(props: React.ComponentProps<typeof TalkXHelp> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TalkXHelp {...props} />
    </QueryClientProvider>,
  );
}

describe('TalkXHelp (N-135)', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.insert.mockReset();
    h.insert.mockResolvedValue({ error: null });
    h.settings = { data: [], error: null };
  });

  it('lista os mais vistos sem expor usuário e abre o artigo', async () => {
    h.rpc.mockResolvedValue({
      data: [{ article_id: 'campanhas/criar', views: 3, unique_viewers: 2 }],
      error: null,
    });
    const onOpen = vi.fn();
    renderHelp({ days: 7, onOpenArticle: onOpen });

    const button = await screen.findByRole('button', { name: 'campanhas/criar' });
    expect(h.rpc).toHaveBeenCalledWith('talkx_help_top_topics', { p_days: 7 });
    expect(screen.getByText('3 visualizações')).toBeTruthy();
    expect(screen.queryByText(/unique_viewers/)).toBeNull();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith('campanhas/criar');
    await waitFor(() => expect(h.insert).toHaveBeenCalledWith({ article_id: 'campanhas/criar' }));
  });

  it('mostra estado vazio e erro', async () => {
    h.rpc.mockResolvedValueOnce({ data: [], error: null });
    const { unmount } = renderHelp();
    expect(await screen.findByText('Ainda não há visualizações.')).toBeTruthy();
    unmount();

    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    renderHelp();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('exibe contato preenchido no formato canal|destino|horário e omite os vazios ou inválidos', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    h.settings = {
      data: [
        {
          key: 'support_contact',
          value: { canal: 'whatsapp', destino: '+55 11 90000-0000', horario: 'Seg–Sex 9h–18h' },
        },
        { key: 'specialist_contact', value: { canal: null, destino: null, horario: null } },
      ],
      error: null,
    };
    renderHelp();
    expect(await screen.findByText(/Suporte · WhatsApp:/)).toBeTruthy();
    expect(screen.getByText(/\+55 11 90000-0000 · Seg–Sex 9h–18h/)).toBeTruthy();
    expect(screen.queryByText(/Especialista/)).toBeNull();
  });

  it('ignora contato com canal fora da lista, mesmo com o outro preenchido', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    h.settings = {
      data: [
        { key: 'support_contact', value: { canal: 'telegram', destino: '@suporte', horario: null } },
        { key: 'specialist_contact', value: { canal: 'email', destino: 'ajuda@zapp' } },
      ],
      error: null,
    };
    renderHelp();
    // O contato válido aparece: prova que a consulta terminou antes das negativas abaixo.
    expect(await screen.findByText(/ajuda@zapp/)).toBeTruthy();
    expect(screen.queryByText(/@suporte/)).toBeNull();
    expect(screen.queryByText(/Suporte/)).toBeNull();
  });

  it('recordTalkXHelpView grava só o article_id e não lança em erro', async () => {
    h.insert.mockResolvedValueOnce({ error: null });
    await recordTalkXHelpView('lgpd/optout');
    expect(h.insert).toHaveBeenCalledWith({ article_id: 'lgpd/optout' });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.insert.mockResolvedValueOnce({ error: { message: 'rls' } });
    await expect(recordTalkXHelpView('x')).resolves.toBeUndefined();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});
