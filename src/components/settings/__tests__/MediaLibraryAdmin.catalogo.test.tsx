import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * #344 (R2-INB-051) — a Biblioteca de Mídia fixava o catálogo na janela das 1000 entradas mais
 * novas (`select('*').order('created_at').limit(1000)`): busca, categorias, favoritos e os
 * contadores de StatsCards liam só esse recorte, e nada na tela alcançava o resto do catálogo.
 *
 * O mock abaixo é um PostgREST de mentira: aplica `order` no "servidor", `limit(n)` corta nas n
 * primeiras linhas (o teto que o defeito usava) e `range(from, to)` devolve a fatia pedida, com um
 * atraso curto para a busca ser digitada antes de a primeira página chegar. O dataset tem 1001
 * itens: o mais antigo (`Figurinha rara`) fica fora da janela de 1000 e só é alcançável quando a
 * leitura percorre TODAS as páginas.
 */
const h = vi.hoisted(() => {
  const TOTAL = 1001;
  const PAGE_DELAY_MS = 25;

  const stickers = Array.from({ length: TOTAL }, (_, i) => ({
    id: `sticker-${String(i).padStart(5, '0')}`,
    name: i === TOTAL - 1 ? 'Figurinha rara' : `Figurinha ${i}`,
    category: 'memes',
    is_favorite: i === TOTAL - 1,
    use_count: 0,
    // `created_at` decrescente na ordem do array: o índice 1000 é o mais antigo do catálogo.
    created_at: new Date(Date.UTC(2026, 0, 2) - i * 60_000).toISOString(),
    uploaded_by: 'user-1',
    image_url: `https://storage.example.com/stickers/${i}.webp`,
  }));

  type Row = Record<string, unknown>;
  interface OrderClause { column: string; ascending: boolean }

  function applyOrders(rows: Row[], orders: OrderClause[]) {
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of orders) {
        const av = a[column] as string | number;
        const bv = b[column] as string | number;
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return ascending ? cmp : -cmp;
      }
      return 0;
    });
  }

  function makeQuery(table: string) {
    const orders: OrderClause[] = [];
    let limit: number | null = null;
    let from: number | null = null;
    let to: number | null = null;
    const rows: Row[] = table === 'stickers' ? stickers : [];

    const q: Record<string, unknown> = {
      select: () => q,
      order: (column: string, opts?: { ascending?: boolean }) => {
        orders.push({ column, ascending: opts?.ascending ?? true });
        return q;
      },
      limit: (n: number) => { limit = n; return q; },
      range: (f: number, t: number) => { from = f; to = t; return q; },
      eq: () => q,
      in: () => q,
      then: (resolve: (value: unknown) => unknown) => {
        let out = applyOrders(rows, orders);
        if (limit !== null) out = out.slice(0, limit);              // teto pedido pela consulta
        if (from !== null) out = out.slice(from, (to ?? 0) + 1);    // página pedida
        return new Promise((r) => setTimeout(() => r(resolve({ data: out, error: null })), PAGE_DELAY_MS));
      },
    };
    return q;
  }

  return { makeQuery, TOTAL };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.makeQuery(table),
    storage: {
      from: () => ({
        remove: async () => ({ error: null }),
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage.example.com/file.webp' } }),
      }),
    },
    functions: { invoke: async () => ({ data: null, error: null }) },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';

describe('MediaLibraryAdmin — catálogo além da janela de 1000 itens (#344)', () => {
  it('a busca encontra o item mais antigo e os contadores refletem o catálogo inteiro', async () => {
    render(<MediaLibraryAdmin />);

    // Busca digitada antes de a primeira página chegar: o que a lista mostra é o filtro sobre o
    // catálogo carregado.
    fireEvent.change(await screen.findByPlaceholderText('Buscar por nome ou categoria...'), { target: { value: 'Figurinha rara' } });

    // Defeito: com `limit(1000)` o item mais antigo nunca chega ao filtro local e a busca volta vazia.
    expect(await screen.findByText('Figurinha rara')).toBeInTheDocument();
    // O rodapé e o card de total leem o catálogo carregado: 1001, não a janela de 1000.
    expect(screen.getByText(`Exibindo 1 de ${h.TOTAL} itens`)).toBeInTheDocument();
    expect(screen.getByText(String(h.TOTAL))).toBeInTheDocument();
  });
});
