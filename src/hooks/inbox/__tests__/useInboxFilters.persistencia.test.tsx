/**
 * A inbox lembra chip, fila e tipo de contato do MESMO usuário entre sessões
 * (localStorage, chave `zapp.inbox.filters:<profileId>`).
 *
 * O defeito: `useInboxFilters` guardava os três em `useState` puro — ao reabrir
 * a inbox voltavam chip "Em atendimento", fila e tipo vazios para qualquer
 * usuário. O storage é hostil por definição: JSON corrompido, valor de versão
 * antiga e id de OUTRO usuário não podem virar filtro nem estourar o render.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

import { useInboxFilters, inboxFiltersStorageKey } from '../useInboxFilters';

const conversa = (id: string) => ({
  id,
  unreadCount: 0,
  messages: [{ id: `m-${id}` }],
  lastMessage: { id: `m-${id}`, created_at: '2026-10-08T12:00:00.000Z' },
  contact: {
    id,
    name: `Contato ${id}`,
    phone: '5511999999999',
    email: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-08T12:00:00.000Z',
    assigned_to: 'p1',
    conversation_status: 'open',
    tags: [],
    queue_id: null,
  },
});

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const montar = (profileId?: string) =>
  renderHook(
    ({ id }: { id?: string }) => useInboxFilters({ conversations: [conversa('c1')] as never, profileId: id }),
    { wrapper, initialProps: { id: profileId } },
  );

const CHAVE_P1 = inboxFiltersStorageKey('p1');

beforeEach(() => {
  localStorage.clear();
  // `?type=` de um teste não pode vazar para o próximo.
  window.history.replaceState(null, '', '/');
});

describe('useInboxFilters — filtro lembrado por usuário', () => {
  it('sem dono não lê nem grava preferência (e a tela continua respondendo)', () => {
    const { result } = montar(undefined);

    act(() => {
      result.current.setChipTab('resolved');
    });

    expect(result.current.chipTab).toBe('resolved');
    expect(localStorage.length).toBe(0);
  });

  it('restaura chip, fila e tipo do dono ao reabrir a inbox', () => {
    localStorage.setItem(
      CHAVE_P1,
      JSON.stringify({ chipTab: 'waiting', queueId: 'q9', contactType: 'cliente' }),
    );

    const { result } = montar('p1');

    expect(result.current.chipTab).toBe('waiting');
    expect(result.current.selectedQueueId).toBe('q9');
    expect(result.current.selectedContactType).toBe('cliente');
    // o par mainTab/subTab acompanha o chip restaurado (derivação, não só o estado inicial)
    expect(result.current.mainTab).toBe('open');
    expect(result.current.subTab).toBe('waiting');
  });

  it('guarda o que o usuário escolheu e devolve na sessão seguinte', () => {
    const primeira = montar('p1');

    act(() => {
      primeira.result.current.setChipTab('resolved');
      primeira.result.current.setSelectedQueueId('q7');
      primeira.result.current.handleContactTypeChange('grupo');
    });

    expect(JSON.parse(localStorage.getItem(CHAVE_P1) as string)).toEqual({
      chipTab: 'resolved',
      queueId: 'q7',
      contactType: 'grupo',
    });

    primeira.unmount();
    const segunda = montar('p1');

    expect(segunda.result.current.chipTab).toBe('resolved');
    expect(segunda.result.current.mainTab).toBe('resolved');
    expect(segunda.result.current.selectedQueueId).toBe('q7');
    expect(segunda.result.current.selectedContactType).toBe('grupo');
  });

  it('não herda o filtro de outro usuário', () => {
    localStorage.setItem(
      CHAVE_P1,
      JSON.stringify({ chipTab: 'archived', queueId: 'q1', contactType: 'cliente' }),
    );

    const outro = montar('p2');

    expect(outro.result.current.chipTab).toBe('attending');
    expect(outro.result.current.selectedQueueId).toBeNull();
    expect(outro.result.current.selectedContactType).toBeNull();

    act(() => {
      outro.result.current.setChipTab('unread');
    });

    // a escolha de p2 não encosta na chave de p1
    expect(JSON.parse(localStorage.getItem(CHAVE_P1) as string).chipTab).toBe('archived');
    expect(JSON.parse(localStorage.getItem(inboxFiltersStorageKey('p2')) as string).chipTab).toBe('unread');
  });

  it('JSON corrompido é descartado sem derrubar o render', () => {
    localStorage.setItem(CHAVE_P1, '{isso não é json');

    expect(() => montar('p1')).not.toThrow();
    const { result } = montar('p1');
    expect(result.current.chipTab).toBe('attending');
    expect(result.current.selectedQueueId).toBeNull();
    expect(result.current.selectedContactType).toBeNull();
  });

  it('valores desconhecidos são descartados campo a campo', () => {
    localStorage.setItem(
      CHAVE_P1,
      JSON.stringify({ chipTab: 'aposentado', queueId: 42, contactType: 'tipo_antigo' }),
    );

    const { result } = montar('p1');
    expect(result.current.chipTab).toBe('attending');
    expect(result.current.selectedQueueId).toBeNull();
    expect(result.current.selectedContactType).toBeNull();

    // raiz que não é objeto também não vira filtro
    localStorage.setItem(CHAVE_P1, JSON.stringify(['archived']));
    const lista = montar('p1');
    expect(lista.result.current.chipTab).toBe('attending');
  });

  it('a identidade que chega depois ainda restaura o filtro do dono', () => {
    localStorage.setItem(
      CHAVE_P1,
      JSON.stringify({ chipTab: 'waiting', queueId: null, contactType: null }),
    );

    // primeiro render sem sessão (o perfil carrega assíncrono), depois com o id
    const { result, rerender } = montar(undefined);
    expect(result.current.chipTab).toBe('attending');

    rerender({ id: 'p1' });

    expect(result.current.chipTab).toBe('waiting');
    expect(result.current.subTab).toBe('waiting');
  });
});
