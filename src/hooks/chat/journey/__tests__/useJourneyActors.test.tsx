import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Cliente do Supabase mockado: o hook NÃO fala com o banco direto — ele reaproveita
 * `fetchSenderProfiles` (R01), que é quem consulta `profiles`. Por isso as chamadas
 * observadas aqui são as daquele lote.
 */
const h = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), in: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

import {
  CONTACT_ACTOR_KEY,
  CONTACT_ACTOR_NAME,
  SYSTEM_ACTOR_KEY,
  SYSTEM_ACTOR_NAME,
  useJourneyActors,
} from '@/hooks/chat/journey/useJourneyActors';
import { useMediaSenderProfiles } from '@/hooks/chat/useMediaSenderProfiles';
import type { JourneyActor } from '@/lib/journey/model';

function makeClient() {
  // gcTime infinito: o cache de perfis tem de sobreviver entre consumidores no teste.
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const perfil = (id: string, name = `Atendente ${id}`) => ({
  id,
  name,
  nickname: null,
  avatar_url: `https://cdn.test/${id}.png`,
});

/** Ator de usuário sem nome/foto própria — o perfil em lote é quem manda para usuários. */
const atorUsuario = (id: string | null): JourneyActor => ({
  kind: 'user',
  id,
  name: null,
  avatarUrl: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.in.mockResolvedValue({ data: [], error: null });
  h.select.mockReturnValue({ in: h.in });
  h.from.mockImplementation(() => ({ select: h.select }));
});

describe('useJourneyActors — regras de quem agiu (S063)', () => {
  it('usuário com perfil: nome e foto do perfil, em UMA consulta em lote', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1'), perfil('p2')], error: null });
    const qc = makeClient();

    const { result } = renderHook(
      () => useJourneyActors({ actorIds: ['p2', 'p1', null, '  ', 'p2'] }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Ids duplicados/nulos: os únicos, em ordem estável, em uma única ida ao banco.
    expect(h.from).toHaveBeenCalledTimes(1);
    expect(h.from).toHaveBeenCalledWith('profiles');
    expect(h.in).toHaveBeenCalledTimes(1);
    expect(h.in).toHaveBeenCalledWith('id', ['p1', 'p2']);

    const view = result.current.resolve(atorUsuario('p1'));
    expect(view).toMatchObject({
      kind: 'user',
      name: 'Atendente p1',
      avatarUrl: 'https://cdn.test/p1.png',
      initials: 'AP',
    });
    // Cor da paleta do sistema (par bg/text), estável pelo id.
    expect(typeof view.color.bg).toBe('string');
    expect(typeof view.color.text).toBe('string');
  });

  it('perfil ausente: "Atendente", sem foto, com as iniciais (não inventa o nome do evento)', async () => {
    h.in.mockResolvedValue({ data: [], error: null });
    const qc = makeClient();

    const { result } = renderHook(() => useJourneyActors({ actorIds: ['p9'] }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const view = result.current.resolve({
      kind: 'user',
      id: 'p9',
      name: 'Fulano do evento',
      avatarUrl: 'https://cdn.test/fulano.png',
    });
    expect(view).toMatchObject({ kind: 'user', name: 'Atendente', avatarUrl: null, initials: 'A' });
  });

  it('erro/RLS negado não lança: o ator cai no "Atendente" com iniciais', async () => {
    h.in.mockResolvedValue({ data: null, error: { message: 'permission denied for table profiles' } });
    const qc = makeClient();

    const { result } = renderHook(() => useJourneyActors({ actorIds: ['p1'] }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.resolve(atorUsuario('p1'))).toMatchObject({
      kind: 'user',
      name: 'Atendente',
      avatarUrl: null,
    });
  });

  it('falha de rede (promessa rejeitada) não derruba a timeline: "Atendente" e sem carregando preso', async () => {
    h.in.mockRejectedValue(new Error('Failed to fetch'));
    const qc = makeClient();

    const { result } = renderHook(() => useJourneyActors({ actorIds: ['p1'] }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.resolve(atorUsuario('p1'))).toMatchObject({
      kind: 'user',
      name: 'Atendente',
      avatarUrl: null,
    });
    expect(result.current.people.map((p) => p.key)).toEqual([
      'p1',
      CONTACT_ACTOR_KEY,
      SYSTEM_ACTOR_KEY,
    ]);
  });

  it('ator de usuário sem id (nem id nem perfil): "Atendente", sem quebrar', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useJourneyActors({ actorIds: [] }), {
      wrapper: wrapperFor(qc),
    });

    expect(result.current.resolve(atorUsuario(null))).toMatchObject({
      kind: 'user',
      name: 'Atendente',
      avatarUrl: null,
    });
    // Um episódio sem ator (linha crua incompleta) também não derruba a timeline.
    expect(result.current.resolve(undefined)).toMatchObject({ kind: 'user', name: 'Atendente' });
    expect(h.from).not.toHaveBeenCalled();
  });

  it('contato: nome e avatar do contato da conversa', async () => {
    const qc = makeClient();
    const { result } = renderHook(
      () =>
        useJourneyActors({
          actorIds: [],
          contact: { name: 'Maria Souza', avatar_url: 'https://cdn.test/maria.png' },
        }),
      { wrapper: wrapperFor(qc) },
    );

    expect(result.current.resolve({ kind: 'contact', id: 'c1', name: null, avatarUrl: null }))
      .toMatchObject({
        kind: 'contact',
        name: 'Maria Souza',
        avatarUrl: 'https://cdn.test/maria.png',
        initials: 'MS',
      });
  });

  it('contato sem cadastro: usa o nome que veio no evento; sem nada, "Cliente"', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useJourneyActors({ actorIds: [], contact: null }), {
      wrapper: wrapperFor(qc),
    });

    expect(
      result.current.resolve({
        kind: 'contact',
        id: 'c1',
        name: 'Cliente do evento',
        avatarUrl: 'https://cdn.test/evento.png',
      }),
    ).toMatchObject({
      kind: 'contact',
      name: 'Cliente do evento',
      avatarUrl: 'https://cdn.test/evento.png',
    });

    expect(result.current.resolve({ kind: 'contact', id: 'c1', name: null, avatarUrl: null }))
      .toMatchObject({ kind: 'contact', name: CONTACT_ACTOR_NAME, avatarUrl: null });
  });

  it('sistema: "Sistema", sem foto — igual para IA, robô e automação (sem canal/origem)', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useJourneyActors({ actorIds: [] }), {
      wrapper: wrapperFor(qc),
    });

    expect(
      result.current.resolve({
        kind: 'system',
        id: null,
        name: 'Robô do WhatsApp',
        avatarUrl: 'https://cdn.test/robo.png',
      }),
    ).toMatchObject({
      kind: 'system',
      name: SYSTEM_ACTOR_NAME,
      avatarUrl: null,
      initials: 'S',
    });
  });

  it('"Você" quando o ator é o usuário logado — com a foto do perfil dele', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1'), perfil('eu', 'Eu Mesmo')], error: null });
    const qc = makeClient();

    const { result } = renderHook(
      () => useJourneyActors({ actorIds: ['p1', 'eu'], currentUserId: 'eu' }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.resolve(atorUsuario('eu'))).toMatchObject({
      kind: 'self',
      name: 'Você',
      avatarUrl: 'https://cdn.test/eu.png',
      initials: 'V',
    });
    // Outro atendente continua com o próprio nome.
    expect(result.current.resolve(atorUsuario('p1'))).toMatchObject({ kind: 'user', name: 'Atendente p1' });
  });
});

describe('useJourneyActors — lista de pessoas do filtro (D05)', () => {
  it('traz Você, os outros usuários com foto, Cliente e Sistema, com as chaves do filtro do J08', async () => {
    h.in.mockResolvedValue({
      data: [perfil('p1', 'Bruno'), perfil('p2', 'Maria'), perfil('eu', 'Eu Mesmo')],
      error: null,
    });
    const qc = makeClient();

    const { result } = renderHook(
      () =>
        useJourneyActors({
          actorIds: ['p2', 'eu', 'p1', 'p2'],
          currentUserId: 'eu',
          contact: { name: 'Cliente X', avatar_url: 'https://cdn.test/cliente.png' },
        }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.people.map((p) => [p.key, p.name])).toEqual([
      ['eu', 'Você'],
      ['p1', 'Bruno'],
      ['p2', 'Maria'],
      [CONTACT_ACTOR_KEY, 'Cliente X'],
      [SYSTEM_ACTOR_KEY, SYSTEM_ACTOR_NAME],
    ]);

    const opcao = (key: string) => result.current.people.find((p) => p.key === key);
    expect(opcao('p1')?.avatarUrl).toBe('https://cdn.test/p1.png');
    expect(opcao('p1')?.kind).toBe('user');
    expect(opcao('eu')?.avatarUrl).toBe('https://cdn.test/eu.png');
    expect(opcao(CONTACT_ACTOR_KEY)?.avatarUrl).toBe('https://cdn.test/cliente.png');
    expect(opcao(CONTACT_ACTOR_KEY)?.kind).toBe('contact');
    expect(opcao(SYSTEM_ACTOR_KEY)?.avatarUrl).toBeNull();
    expect(opcao(SYSTEM_ACTOR_KEY)?.kind).toBe('system');
  });

  it('sem o usuário logado entre os atores não existe opção "Você"', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1')], error: null });
    const qc = makeClient();

    const { result } = renderHook(() => useJourneyActors({ actorIds: ['p1'], currentUserId: 'eu' }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.people.map((p) => p.key)).toEqual(['p1', CONTACT_ACTOR_KEY, SYSTEM_ACTOR_KEY]);
  });

  it('perfil ausente na lista também cai no "Atendente" (a lista não quebra)', async () => {
    h.in.mockResolvedValue({ data: [], error: null });
    const qc = makeClient();

    const { result } = renderHook(() => useJourneyActors({ actorIds: ['p9'] }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.people[0]).toMatchObject({
      key: 'p9',
      name: 'Atendente',
      avatarUrl: null,
    });
  });

  it('sem ids de atores não consulta o banco — só Cliente e Sistema na lista', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useJourneyActors({ actorIds: null }), {
      wrapper: wrapperFor(qc),
    });

    expect(result.current.people.map((p) => p.key)).toEqual([CONTACT_ACTOR_KEY, SYSTEM_ACTOR_KEY]);
    expect(result.current.isLoading).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });
});

describe('useJourneyActors — um lote e um cache só', () => {
  it('compartilha o cache de perfis com useMediaSenderProfiles (mesmos ids, uma consulta)', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1')], error: null });
    const qc = makeClient();

    const media = renderHook(() => useMediaSenderProfiles(['p1']), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(media.result.current.isLoading).toBe(false));

    const journey = renderHook(() => useJourneyActors({ actorIds: ['p1'] }), {
      wrapper: wrapperFor(qc),
    });
    await waitFor(() =>
      expect(journey.result.current.resolve(atorUsuario('p1')).name).toBe('Atendente p1'),
    );

    // A segunda tela não refaz a consulta: o lote do R01 já está no cache.
    expect(h.from).toHaveBeenCalledTimes(1);
  });
});

describe('useJourneyActors — sem canal e sem origem', () => {
  it('o que o resolve devolve são só os campos da tela (nada de selo de canal/origem)', async () => {
    h.in.mockResolvedValue({ data: [perfil('p1')], error: null });
    const qc = makeClient();

    const { result } = renderHook(
      () => useJourneyActors({ actorIds: ['p1'], contact: { name: 'Cliente X', avatar_url: null } }),
      { wrapper: wrapperFor(qc) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current.resolve(atorUsuario('p1'))).sort()).toEqual([
      'avatarUrl',
      'color',
      'initials',
      'kind',
      'name',
    ]);
    expect(Object.keys(result.current.people[0]).sort()).toEqual([
      'avatarUrl',
      'color',
      'initials',
      'key',
      'kind',
      'name',
    ]);
  });
});
