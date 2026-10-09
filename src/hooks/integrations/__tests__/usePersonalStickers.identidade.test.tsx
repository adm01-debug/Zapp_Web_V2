import { renderHook, render, screen, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-API-051 / item 225 (P2) — a pasta de figurinhas pessoais quebrava para
// administradores/supervisores porque `my-profile-stickers` pedia
// `profiles.select('id,name').single()` SEM filtrar `user_id`: a policy deixa o
// admin enxergar várias linhas de profiles, o PostgREST devolve erro de
// cardinalidade (PGRST116, "JSON object requested, multiple (or no) rows
// returned"), o profile fica ausente, a query de figurinhas fica desabilitada
// (`enabled: !!profile?.id`) e o componente anuncia a pasta VAZIA — escondendo
// o erro de identidade.
//
// Este arquivo fixa o contrato: o perfil é resolvido pelo `user_id` do usuário
// autenticado (a linha do PRÓPRIO usuário, mesmo com outras visíveis), o
// loading/erro da identidade é exposto, e o componente não mostra o estado
// "Adicione suas fotos" quando a identidade falhou.

type Row = Record<string, unknown>;

const ADMIN_UID = 'user-admin';
const AGENT_UID = 'user-agent';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Tabelas em memória — o "PostgREST" falso aplica os filtros `.eq()` de verdade,
// como o servidor faria. O admin enxerga TRÊS perfis (o dele + dois de terceiros).
let PROFILE_ROWS: Row[] = [];
let STICKER_ROWS: Row[] = [];
let inserted: Row[] = [];

function tableRows(table: string): Row[] {
  if (table === 'profiles') return PROFILE_ROWS;
  if (table === 'stickers') return STICKER_ROWS;
  throw new Error(`tabela inesperada no teste: ${table}`);
}

const PGRST116 = {
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
};

function makeBuilder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let sortCol: string | null = null;
  let sortAsc = true;
  let limit: number | null = null;

  const apply = () => {
    let rows = tableRows(table).slice();
    for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
    if (sortCol) {
      const col = sortCol;
      rows = rows.sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        if (av === bv) return 0;
        return av < bv ? (sortAsc ? -1 : 1) : sortAsc ? 1 : -1;
      });
    }
    if (limit !== null) rows = rows.slice(0, limit);
    return rows;
  };

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val]);
    return builder;
  });
  builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
    sortCol = col;
    sortAsc = opts?.ascending ?? true;
    return builder;
  });
  builder.limit = vi.fn((n: number) => {
    limit = n;
    return builder;
  });
  builder.single = vi.fn(async () => {
    const rows = apply();
    if (rows.length !== 1) return { data: null, error: PGRST116 };
    return { data: rows[0], error: null };
  });
  builder.maybeSingle = vi.fn(async () => {
    const rows = apply();
    if (rows.length > 1) return { data: null, error: PGRST116 };
    return { data: rows[0] ?? null, error: null };
  });
  // Consultas sem `.single()/.maybeSingle()` são aguardadas direto (ex.: a lista
  // de figurinhas termina em `.order(...)`): o builder é "thenable".
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: apply(), error: null });
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'stickers') {
        const b = makeBuilder(table);
        // o insert da figurinha é terminal
        (b as Record<string, unknown>).insert = vi.fn(async (payload: Row) => {
          inserted.push(payload);
          mocks.insert(payload);
          return { error: null };
        });
        return b;
      }
      return makeBuilder(table);
    },
    auth: { getUser: mocks.getUser },
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/stickers/${path}` },
        }),
      }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { usePersonalStickers } from '@/hooks/integrations/usePersonalStickers';
import { PersonalStickers } from '@/components/inbox/stickers/PersonalStickers';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  STICKER_ROWS = [];
  mocks.upload.mockResolvedValue({ error: null });
  // por padrão: admin autenticado que enxerga três perfis (o dele + dois)
  mocks.getUser.mockResolvedValue({ data: { user: { id: ADMIN_UID } }, error: null });
  PROFILE_ROWS = [
    { id: 'p-admin', user_id: ADMIN_UID, name: 'Ana Admin' },
    { id: 'p-outro-1', user_id: 'user-outro-1', name: 'Bruno Outro' },
    { id: 'p-outro-2', user_id: 'user-outro-2', name: 'Carla Outra' },
  ];
});

describe('usePersonalStickers — identidade por user_id (R2-API-051)', () => {
  it('admin com VÁRIOS perfis visíveis resolve a PRÓPRIA pasta (não a de terceiros)', async () => {
    STICKER_ROWS = [
      {
        id: 's-minha',
        name: 'minha foto',
        image_url: 'https://exemplo/stickers/minha.png',
        owner_id: 'p-admin',
        category: 'pessoal',
        is_favorite: false,
        use_count: 0,
        created_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 's-de-outro',
        name: 'foto de outro',
        image_url: 'https://exemplo/stickers/outro.png',
        owner_id: 'p-outro-1',
        category: 'pessoal',
        is_favorite: false,
        use_count: 0,
        created_at: '2026-10-02T00:00:00Z',
      },
    ];

    const { result } = renderHook(() => usePersonalStickers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.profile?.id).toBe('p-admin'));
    expect(result.current.profileError).toBeFalsy();

    // a lista é a do PRÓPRIO usuário (owner_id = p-admin), não a de terceiros
    await waitFor(() => expect(result.current.stickers.length).toBe(1));
    expect(result.current.stickers.map((s) => s.id)).toEqual(['s-minha']);
  });

  it('agente comum (um único perfil visível) também resolve o próprio perfil', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: AGENT_UID } }, error: null });
    PROFILE_ROWS = [{ id: 'p-agent', user_id: AGENT_UID, name: 'Diego Agente' }];
    STICKER_ROWS = [
      {
        id: 's-agent',
        name: 'foto do agente',
        image_url: 'https://exemplo/stickers/agent.png',
        owner_id: 'p-agent',
        category: 'pessoal',
        is_favorite: false,
        use_count: 0,
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    const { result } = renderHook(() => usePersonalStickers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.profile?.id).toBe('p-agent'));
    await waitFor(() => expect(result.current.stickers.length).toBe(1));
  });

  it('expõe o erro de identidade (sessão ausente) em vez de esconder numa pasta vazia', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { result } = renderHook(() => usePersonalStickers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.profileError).toBeTruthy());
    expect(result.current.profile).toBeUndefined();
    expect(result.current.profileLoading).toBe(false);
    expect(result.current.stickers).toEqual([]);
  });

  it('admin autenticado consegue ENVIAR figurinha (handleUpload não retorna em silêncio)', async () => {
    const { result } = renderHook(() => usePersonalStickers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.profile?.id).toBe('p-admin'));

    const file = new File(['x'], 'minha_foto.png', { type: 'image/png' });
    const list = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;

    await act(async () => {
      await result.current.handleUpload(list);
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ category: 'pessoal', owner_id: 'p-admin', uploaded_by: 'p-admin' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe('PersonalStickers — estado de identidade (R2-API-051)', () => {
  it('não anuncia "Adicione suas fotos" quando a resolução de identidade falhou', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'sem sessão', status: 401 } });

    render(createElement(PersonalStickers, {}), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/pasta/i),
    );
    expect(screen.queryByText('Adicione suas fotos')).toBeNull();
  });
});
