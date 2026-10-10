import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/supabaseHelpers', () => {
  const supabaseMock = {
    rpc(this: unknown, ...args: unknown[]) {
      if (this !== supabaseMock) throw new Error('supabase.rpc perdeu o receptor (this)');
      return h.rpc(...args);
    },
  };
  return {
    fromTable: () => ({ insert: h.insert }),
    supabase: supabaseMock,
  };
});

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
