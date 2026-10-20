/**
 * U01 — contador de conversas de e-mail não lidas do selo da barra lateral.
 *
 * O que este teste prova (e por que cada asserção existe):
 *  - a consulta é de CONTAGEM (`count: 'exact', head: true`) e o único filtro é
 *    `is_unread = true`: nenhum filtro de conta, porque o selo soma todas as contas
 *    que o RLS deixa ver (mesma definição do contador do módulo de E-mail);
 *  - o componente que consome o hook NÃO precisa da lista de conversas (nada de
 *    carregar linhas);
 *  - erro de consulta vira `status: 'erro'` com `count: 0`, sem lançar: a barra
 *    lateral não pode quebrar por causa do selo;
 *  - desabilitado (usuário sem acesso ao item Email) não consulta e não assina;
 *  - canal de realtime limpo ao desmontar.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, channel: mocks.channel, removeChannel: mocks.removeChannel },
}));

vi.mock('@/lib/realtimeTopic', () => ({
  uniqueRealtimeTopic: (base: string) => `${base}:teste`,
}));

import { useUnreadEmailCount } from '../useUnreadEmailCount';

/** `supabase.from('email_threads').select(...).eq(...)` — a contagem resolvida da consulta. */
function mockCount(result: { count: number | null; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  mocks.from.mockReturnValue({ select });
  return { select, eq };
}

/** Canal de realtime falso: guarda o handler registrado para o teste poder disparar o evento. */
function mockChannel() {
  const handlers: Array<() => void> = [];
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
      handlers.push(callback);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  mocks.channel.mockReturnValue(channel);
  return { channel, emitEvent: () => handlers.forEach(handler => handler()), subscribeFilters: handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCount({ count: 0, error: null });
  mockChannel();
});

describe('useUnreadEmailCount — contagem do selo do item Email', () => {
  it('conta as conversas não lidas de todas as contas, com uma consulta de contagem', async () => {
    const { select, eq } = mockCount({ count: 7, error: null });
    const { result } = renderHook(() => useUnreadEmailCount());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.count).toBe(7);

    expect(mocks.from).toHaveBeenCalledWith('email_threads');
    // `head: true` = o corpo da resposta vem vazio (não carrega a lista); só a contagem.
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    // Um filtro só: nada de `gmail_account_id` — o selo soma todas as contas visíveis por RLS.
    expect(eq.mock.calls).toEqual([['is_unread', true]]);
  });

  it('não lança e zera a contagem quando a consulta falha (a barra não pode quebrar)', async () => {
    mockCount({ count: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useUnreadEmailCount());

    await waitFor(() => expect(result.current.status).toBe('erro'));
    expect(result.current.count).toBe(0);
  });

  it('recontagem em tempo real: um evento em `email_threads` atualiza o número com debounce', async () => {
    mockCount({ count: 1, error: null });
    const { emitEvent } = mockChannel();
    const { result } = renderHook(() => useUnreadEmailCount());

    await waitFor(() => expect(result.current.count).toBe(1));
    expect(mocks.from).toHaveBeenCalledTimes(1);

    const canalRegistrado = mocks.channel.mock.results[0].value as { on: { mock: { calls: unknown[][] } } };
    expect(canalRegistrado.on.mock.calls[0][1]).toMatchObject({
      event: '*', schema: 'public', table: 'email_threads',
    });

    mockCount({ count: 4, error: null });
    await act(async () => { emitEvent(); });

    // O debounce segura a recontagem: o evento sozinho ainda não dispara consulta nova.
    expect(mocks.from).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.count).toBe(4), { timeout: 2000 });
    expect(result.current.status).toBe('ok');
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('desabilitado (sem acesso ao item Email) não consulta nem assina, e fica sem selo', async () => {
    const { result } = renderHook(() => useUnreadEmailCount(false));

    expect(result.current).toEqual({ count: 0, status: 'ok' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('limpa o canal de realtime ao desmontar', async () => {
    const { channel } = mockChannel();
    const { result, unmount } = renderHook(() => useUnreadEmailCount());
    await waitFor(() => expect(result.current.status).toBe('ok'));

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
});
