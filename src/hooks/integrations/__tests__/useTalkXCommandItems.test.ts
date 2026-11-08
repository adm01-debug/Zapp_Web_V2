import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTalkXCommandItems } from '../useTalkXCommandItems';

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('useTalkXCommandItems', () => {
  it('mapeia status `sending` para "Em andamento"', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['talkx-campaigns'], [
      { id: 'c1', name: 'Black Friday', status: 'sending' },
    ]);
    client.setQueryData(['talkx-segments'], []);
    client.setQueryData(['talkx-templates'], []);

    const { result } = renderHook(
      () => useTalkXCommandItems(undefined, true),
      { wrapper: makeWrapper(client) },
    );

    const item = result.current.find((i) => i.id === 'talkx-campaign-c1');
    expect(item).toBeDefined();
    expect(item?.description).toBe('Em andamento');
    expect(item?.badge).toBe('Em andamento');
  });

  it('action de campanha grava ?campaign= na URL', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['talkx-campaigns'], [
      { id: 'camp-42', name: 'Promo', status: 'draft' },
    ]);
    client.setQueryData(['talkx-segments'], []);
    client.setQueryData(['talkx-templates'], []);

    const { result } = renderHook(
      () => useTalkXCommandItems(undefined, true),
      { wrapper: makeWrapper(client) },
    );

    const item = result.current.find((i) => i.id === 'talkx-campaign-camp-42');
    expect(item).toBeDefined();
    item?.action();
    expect(new URLSearchParams(window.location.search).get('campaign')).toBe('camp-42');
  });

  it('action de segmento grava ?segment= e ?tab=segments', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['talkx-campaigns'], []);
    client.setQueryData(['talkx-segments'], [
      { id: 'seg-7', name: 'VIPs' },
    ]);
    client.setQueryData(['talkx-templates'], []);

    const { result } = renderHook(
      () => useTalkXCommandItems(undefined, true),
      { wrapper: makeWrapper(client) },
    );

    const item = result.current.find((i) => i.id === 'talkx-segment-seg-7');
    expect(item).toBeDefined();
    item?.action();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('segment')).toBe('seg-7');
    expect(params.get('tab')).toBe('segments');
  });

  it('retorna lista vazia quando open=false (enabled=false)', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Sem dados no cache e queries desabilitadas — não deve disparar fetch
    const { result } = renderHook(
      () => useTalkXCommandItems(undefined, false),
      { wrapper: makeWrapper(client) },
    );
    expect(result.current).toHaveLength(0);
  });
});
