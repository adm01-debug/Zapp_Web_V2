import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * #344 (R2-INB-051) — o seletor de stickers abria com as 1000 figurinhas mais usadas
 * (`select('*').order('use_count', { ascending: false }).limit(1000)`): busca, favoritas e
 * categorias eram filtradas dentro desse recorte, então uma figurinha fora da janela não tinha
 * caminho nenhum até a tela.
 *
 * O mock abaixo é um PostgREST de mentira: aplica `order` no "servidor", `limit(n)` corta nas n
 * primeiras linhas (o teto que o defeito usava) e `range(from, to)` devolve a fatia pedida, com
 * um atraso curto para a busca ser digitada antes de a primeira página chegar. O dataset tem 1001
 * figurinhas ordenadas por uso: a menos usada (`Figurinha rara`, índice 1000) fica fora da janela
 * e só aparece quando a leitura percorre TODAS as páginas.
 */
const h = vi.hoisted(() => {
  const TOTAL = 1001;
  const PAGE_DELAY_MS = 25;

  const stickers = Array.from({ length: TOTAL }, (_, i) => ({
    id: `sticker-${String(i).padStart(5, '0')}`,
    name: i === TOTAL - 1 ? 'Figurinha rara' : `Figurinha ${i}`,
    image_url: `https://storage.example.com/stickers/${i}.webp`,
    category: 'engraçado',
    is_favorite: false,
    // `use_count` decrescente na ordem do array: o índice 1000 é o menos usado do catálogo.
    use_count: TOTAL - 1 - i,
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

// Radix Popover não abre de forma confiável sob jsdom (mesmo padrão dos testes desta pasta): o
// gatilho real da tela abre o conteúdo, que só monta quando o hook marca `open` — é esse
// `onOpenChange` que dispara a carga do catálogo.
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

  return {
    Popover: ({ children, open, onOpenChange }: { children?: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
      <Ctx.Provider value={{ open: !!open, setOpen: onOpenChange ?? (() => {}) }}>{children}</Ctx.Provider>
    ),
    PopoverTrigger: ({ children }: { children?: ReactNode }) => {
      const { setOpen } = React.useContext(Ctx);
      const child = React.Children.only(children) as React.ReactElement<{ onClick?: (e: unknown) => void }>;
      return React.cloneElement(child, {
        onClick: (e: unknown) => { child.props.onClick?.(e); setOpen(true); },
      });
    },
    PopoverContent: ({ children }: { children?: ReactNode }) => {
      const { open } = React.useContext(Ctx);
      return open ? <div>{children}</div> : null;
    },
  };
});

import { StickerPicker } from '../StickerPicker';

describe('StickerPicker — catálogo além da janela de 1000 figurinhas (#344)', () => {
  it('a busca por nome encontra a figurinha que fica fora da primeira página', async () => {
    render(<StickerPicker onSendSticker={vi.fn()} />);

    // Abre o seletor pelo botão real da tela e busca antes de a primeira página chegar: assim o
    // que a grade mostra é o resultado do filtro sobre o catálogo carregado.
    fireEvent.click(screen.getByRole('button', { name: 'Figurinhas' }));
    fireEvent.change(screen.getByLabelText('Buscar figurinhas'), { target: { value: 'Figurinha rara' } });

    // Defeito: com `limit(1000)` a figurinha menos usada nunca chega ao filtro local e a grade
    // mostra "Nenhuma figurinha encontrada".
    expect(await screen.findByRole('gridcell', { name: /Figurinha rara/ })).toBeInTheDocument();
    // O contador do rodapé lê o catálogo carregado: 1001, não a amostra de 1000.
    expect(screen.getByText(`1/${h.TOTAL} figurinhas`)).toBeInTheDocument();
  });
});
