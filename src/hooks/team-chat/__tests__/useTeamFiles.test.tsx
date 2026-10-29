import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * Mock do client Supabase: registra a cadeia de filtros de cada consulta e devolve
 * as respostas enfileiradas, na ordem. Assim o teste prova o que o hook MANDA para
 * o banco (filtros, ordem, limite, keyset) e o que ele devolve para a tela.
 */
const f = vi.hoisted(() => {
  type Op = { op: string; args: unknown[] };
  type Resposta = { data: unknown; error: unknown };
  const consultas: { table: string; ops: Op[] }[] = [];
  let fila: Resposta[] = [];

  function cadeia(table: string) {
    const ops: Op[] = [];
    consultas.push({ table, ops });
    const no: Record<string, unknown> = {};
    for (const op of ['select', 'not', 'eq', 'in', 'or', 'order', 'limit', 'ilike', 'is', 'gte', 'lte']) {
      no[op] = (...args: unknown[]) => {
        ops.push({ op, args });
        return no;
      };
    }
    no.then = (resolve: (v: Resposta) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(fila.shift() ?? { data: [], error: null }).then(resolve, reject);
    return no;
  }

  return {
    consultas,
    cadeia,
    enfileirar: (resposta: Resposta) => fila.push(resposta),
    limpar: () => {
      consultas.length = 0;
      fila = [];
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => f.cadeia(table) },
}));

import {
  TEAM_FILES_PAGE_SIZE,
  teamFilesLikePattern,
  teamFilesQueryKey,
  useTeamFiles,
  type TeamFileItem,
} from '@/hooks/team-chat/useTeamFiles';

interface Linha {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_type: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_url: string | null;
  created_at: string;
  sender: { name: string | null } | null;
}

const BASE: Linha = {
  id: 'm1',
  conversation_id: 'c1',
  sender_id: 'p1',
  content: 'foto.jpg',
  media_type: 'image',
  media_bucket: null,
  media_path: null,
  media_url: 'https://proj.supabase.co/storage/v1/object/public/team-chat-files/p1/c1/foto.jpg',
  created_at: '2026-10-11T12:00:00.000Z',
  sender: { name: 'Ana' },
};

const linha = (over: Partial<Linha> = {}): Linha => ({ ...BASE, ...over });

/** Todas as chamadas de um dado op da n-ésima consulta. */
const argsDe = (indice: number, op: string): unknown[][] =>
  f.consultas[indice].ops.filter((o) => o.op === op).map((o) => o.args);

const chamada = (indice: number, op: string): unknown[] | undefined =>
  f.consultas[indice].ops.find((o) => o.op === op)?.args;

beforeEach(() => {
  f.limpar();
});

describe('useTeamFiles — arquivos do chat de equipe', () => {
  it('lê team_messages sem filtrar conversa (a RLS é quem restringe) e ordena por data,id', async () => {
    f.enfileirar({ data: [linha()], error: null });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(f.consultas).toHaveLength(1);
    expect(f.consultas[0].table).toBe('team_messages');
    expect(chamada(0, 'eq')).toBeUndefined();
    expect(chamada(0, 'not')).toEqual(['media_type', 'is', null]);
    expect(argsDe(0, 'not')).toContainEqual(['media_type', 'in', '(sticker,emoji,audio_meme)']);
    expect(argsDe(0, 'order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(chamada(0, 'limit')).toEqual([TEAM_FILES_PAGE_SIZE + 1]);
  });

  it('mapeia nome, tipo, remetente, data e um locator por item', async () => {
    f.enfileirar({
      data: [
        linha(),
        linha({
          id: 'm2',
          content: 'contrato.pdf',
          media_type: 'document',
          media_bucket: 'team-chat-files',
          media_path: 'p2/c1/contrato.pdf',
          media_url: null,
          conversation_id: 'c2',
          sender_id: 'p2',
          sender: { name: 'Bia' },
          created_at: '2026-10-11T11:00:00.000Z',
        }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    const [primeiro, segundo] = result.current.items as [TeamFileItem, TeamFileItem];
    expect(primeiro).toMatchObject({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'p1',
      senderName: 'Ana',
      name: 'foto.jpg',
      mediaType: 'image',
      kind: 'image',
      createdAt: '2026-10-11T12:00:00.000Z',
    });
    // Histórico: o locator é o próprio media_url (URL-shaped, sem assinatura).
    expect(primeiro.source).toBe(
      'https://proj.supabase.co/storage/v1/object/public/team-chat-files/p1/c1/foto.jpg',
    );
    // Forma atual: bucket+path montam o locator canônico do projeto.
    expect(segundo.kind).toBe('document');
    expect(segundo.source).toMatch(/\/storage\/v1\/object\/team-chat-files\/p2\/c1\/contrato\.pdf$/);
  });

  it('não lista figurinha/emoji/áudio-meme nem linha sem locator abrível', async () => {
    f.enfileirar({
      data: [
        linha(),
        linha({ id: 'st', media_type: 'sticker', media_url: 'https://proj.supabase.co/storage/v1/object/public/team-chat-files/st.webp' }),
        linha({ id: 'sem-locator', media_url: null, media_bucket: null, media_path: null }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((i) => i.id)).toEqual(['m1']);
    // A exclusão das reações é feita no banco, não só na tela.
    expect(argsDe(0, 'not')).toContainEqual(['media_type', 'in', '(sticker,emoji,audio_meme)']);
  });

  it('cai para o último segmento do caminho quando content está vazio', async () => {
    f.enfileirar({
      data: [
        linha({
          content: '   ',
          media_url: 'https://proj.supabase.co/storage/v1/object/public/team-chat-files/p1/c1/relatorio-final.xlsx',
        }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    expect(result.current.items[0].name).toBe('relatorio-final.xlsx');
  });

  it('busca por nome casa o content e escapa os curingas do ilike', async () => {
    f.enfileirar({ data: [], error: null });

    renderHook(() => useTeamFiles({ search: '  re%l_1 ' }), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(f.consultas.length).toBe(1));

    expect(argsDe(0, 'ilike')).toEqual([['content', teamFilesLikePattern('re%l_1')]]);
    expect(argsDe(0, 'ilike')[0]).toEqual(['content', '%re\\%l\\_1%']);
    expect(teamFilesQueryKey('re%l_1', null)).toEqual(['team-files', null, 're%l_1']);
  });

  it('busca só de espaços não vira ilike', async () => {
    f.enfileirar({ data: [], error: null });

    renderHook(() => useTeamFiles({ search: '   ' }), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(f.consultas.length).toBe(1));

    expect(argsDe(0, 'ilike')).toEqual([]);
  });

  it('filtro por tipo conhecido usa media_type; "outro" exclui imagem/documento/áudio', async () => {
    f.enfileirar({ data: [], error: null });
    renderHook(() => useTeamFiles({ kind: 'audio' }), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(f.consultas.length).toBe(1));
    expect(chamada(0, 'eq')).toEqual(['media_type', 'audio']);

    f.enfileirar({ data: [], error: null });
    renderHook(() => useTeamFiles({ kind: 'other' }), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(f.consultas.length).toBe(2));
    expect(argsDe(1, 'not')).toContainEqual(['media_type', 'in', '(image,document,audio)']);
    expect(chamada(1, 'eq')).toBeUndefined();
  });

  it('pagina por keyset (created_at,id) e só encerra quando a página vem incompleta', async () => {
    const datas = Array.from({ length: TEAM_FILES_PAGE_SIZE + 1 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 11, 12, 0, 0) - i * 60_000).toISOString(),
    );
    const primeiraPagina = datas.map((created_at, i) =>
      linha({ id: `m${String(i).padStart(2, '0')}`, created_at, media_type: 'document', content: `f${i}.pdf` }),
    );
    f.enfileirar({ data: primeiraPagina, error: null });
    f.enfileirar({ data: [linha({ id: 'm-final', created_at: '2026-10-10T00:00:00.000Z' })], error: null });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(TEAM_FILES_PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.items[0].id).toBe('m00');
    expect(result.current.items[TEAM_FILES_PAGE_SIZE - 1].id).toBe('m49');

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(TEAM_FILES_PAGE_SIZE + 1));

    // O cursor é o ÚLTIMO item da página anterior (created_at, id), como AND extra.
    const ultimo = primeiraPagina[TEAM_FILES_PAGE_SIZE - 1];
    expect(chamada(1, 'or')).toEqual([
      `created_at.lt.${ultimo.created_at},and(created_at.eq.${ultimo.created_at},id.lt.m49)`,
    ]);
    expect(chamada(1, 'limit')).toEqual([TEAM_FILES_PAGE_SIZE + 1]);
    expect(result.current.items[result.current.items.length - 1].id).toBe('m-final');
    expect(result.current.hasMore).toBe(false);
  });

  it('lista vazia não fica presa em carregando', async () => {
    f.enfileirar({ data: [], error: null });

    const { result } = renderHook(() => useTeamFiles({ kind: 'document' }), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isFetchingNextPage).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('erro do banco vira isError (o painel precisa saber que falhou, não "vazio")', async () => {
    f.enfileirar({ data: null, error: new Error('permission denied') });

    const { result } = renderHook(() => useTeamFiles(), { wrapper: TestQueryWrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.items).toEqual([]);
  });
});
