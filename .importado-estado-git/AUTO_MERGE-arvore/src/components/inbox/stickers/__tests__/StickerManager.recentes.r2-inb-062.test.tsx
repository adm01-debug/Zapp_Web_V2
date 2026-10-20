import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-INB-062 / item 488 (P3) — no ADMINISTRADOR de figurinhas compartilhadas
// (Configurações → Mídia → StickerManager), o controle "Recentes" só mudava o
// destaque visual da barra: `showRecent` era passado à StickerCategoryBar, mas
// `filteredStickers` não o consumia. A grade seguia com a MESMA coleção e a
// MESMA ordem (a consulta ordena por `use_count`), então alternar Recentes não
// tinha efeito nenhum sobre o que o usuário vê.
//
// Este arquivo fixa o contrato: "Recentes" ordena a grade pela recência real
// (`created_at`, a mesma base usada na pasta pessoal) e "Todas" volta à ordem
// padrão do administrador. O teste RENDERIZA o StickerManager real e lê a
// ordem das células da grade.

type Row = Record<string, unknown>;

const UID = 'user-admin';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

// Tabelas em memória: o "PostgREST" falso aplica `.eq()` e `.order()` de
// verdade, como o servidor faria.
let PROFILE_ROWS: Row[] = [];
let STICKER_ROWS: Row[] = [];
let inserted: Row[] = [];

function tableRows(table: string): Row[] {
  if (table === 'profiles') return PROFILE_ROWS;
  if (table === 'stickers') return STICKER_ROWS;
  throw new Error(`tabela inesperada no teste: ${table}`);
}

function makeBuilder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let sortCol: string | null = null;
  let sortAsc = true;

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
  builder.maybeSingle = vi.fn(async () => {
    const rows = apply();
    return { data: rows[0] ?? null, error: null };
  });
  builder.insert = vi.fn(async (payload: Row) => {
    inserted.push(payload);
    return { error: null };
  });
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  // Consultas encadeadas terminam em `.order(...)`: o builder é "thenable".
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: apply(), error: null });
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ remove: vi.fn(async () => ({ error: null })) }) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { StickerManager } from '@/components/inbox/stickers/StickerManager';
import { TooltipProvider } from '@/components/ui/tooltip';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: qc },
      // Na aplicação o TooltipProvider é ambiente (App/Providers); a grade do
      // administrador usa Tooltip e precisa dele no teste.
      createElement(TooltipProvider, null, children),
    );
}

function gridOrder(): string[] {
  return screen
    .getAllByRole('gridcell')
    .map((el) => (el.getAttribute('aria-label') || '').split(' - ')[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  PROFILE_ROWS = [{ id: 'p-admin', user_id: UID, name: 'Ana Admin' }];
  // Compartilhadas (owner_id nulo): a pasta pessoal fica vazia e a grade é só
  // a do administrador. A MAIS USADA é a MAIS ANTIGA — assim a ordem por uso
  // (padrão do administrador) difere da ordem por recência.
  STICKER_ROWS = [
    {
      id: 's-antiga',
      name: 'antiga top',
      image_url: 'https://exemplo/stickers/antiga.webp',
      category: 'riso',
      is_favorite: false,
      use_count: 50,
      owner_id: null,
      created_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 's-nova',
      name: 'nova recente',
      image_url: 'https://exemplo/stickers/nova.webp',
      category: 'riso',
      is_favorite: false,
      use_count: 1,
      owner_id: null,
      created_at: '2026-10-05T10:00:00Z',
    },
  ];
});

describe('StickerManager — controle Recentes (R2-INB-062)', () => {
  it('alternar Recentes muda a ordem da grade para a recência real', async () => {
    render(createElement(StickerManager, { mode: 'manager' }), { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(2));
    // ordem padrão do administrador: por uso (mais usada primeiro)
    expect(gridOrder()).toEqual(['antiga top', 'nova recente']);

    fireEvent.click(screen.getByRole('tab', { name: /Recentes/i }));

    await waitFor(() =>
      expect(gridOrder()).toEqual(['nova recente', 'antiga top']),
    );
    // Recentes reordena pela recência: não esconde figurinha da coleção
    expect(screen.getAllByRole('gridcell')).toHaveLength(2);
  });

  it('voltar para Todas desliga Recentes e devolve a ordem padrão', async () => {
    render(createElement(StickerManager, { mode: 'manager' }), { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getAllByRole('gridcell')).toHaveLength(2));

    fireEvent.click(screen.getByRole('tab', { name: /Recentes/i }));
    await waitFor(() => expect(gridOrder()).toEqual(['nova recente', 'antiga top']));

    fireEvent.click(screen.getByRole('tab', { name: /Todas/i }));

    await waitFor(() => expect(gridOrder()).toEqual(['antiga top', 'nova recente']));
    expect(screen.getByRole('tab', { name: /Todas/i })).toHaveAttribute('aria-selected', 'true');
  });
});
