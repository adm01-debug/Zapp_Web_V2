/**
 * X178 — a lista de supressão pagina NO SERVIDOR: página/tamanho/filtros/
 * ordenação vão na consulta e o rodapé usa o `count` do servidor; 42501 vira o
 * estado "sem permissão". Antes a tela consultava a tabela inteira e fatiava em
 * memória. Vermelho antes do fix: nenhuma chamada com `.range(...)`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const h = vi.hoisted(() => ({
  ranges: [] as Array<[number, number]>,
  ors: [] as string[],
  eqs: [] as Array<[string, string]>,
  orders: [] as string[],
  total: 4892,
  error: null as null | { code: string; message: string },
  rows: [] as Array<Record<string, unknown>>,
}));

const agora = '2026-10-01T10:00:00.000Z';

function fabricarLinhas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `bl-${i + 1}`,
    contact_id: `contato-${i + 1}`,
    phone: null,
    reason: 'Opt-out solicitado',
    reason_code: 'opt_out',
    origin: 'optout',
    campaign_id: null,
    blocked_by: null,
    removed_by: null,
    removed_at: null,
    expires_at: null,
    created_at: agora,
    contacts: { name: `Contato ${i + 1}`, phone: `55119999900${i}`, email: `contato${i + 1}@acme.test`, company: 'ACME', avatar_url: null },
    campaign: null,
  }));
}

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    let headOnly = false;
    let from = 0;
    let to = Number.POSITIVE_INFINITY;
    const self: Record<string, unknown> = {};
    self.select = (_cols: string, opts?: { head?: boolean }) => { if (opts?.head) headOnly = true; return self; };
    self.is = () => self;
    self.not = () => self;
    self.in = () => self;
    self.gte = () => self;
    self.eq = (col: string, val: string) => { h.eqs.push([col, val]); return self; };
    self.order = (col: string) => { h.orders.push(col); return self; };
    self.limit = () => self;
    self.or = (f: string) => { h.ors.push(f); return self; };
    self.range = (f: number, t: number) => { from = f; to = t; h.ranges.push([f, t]); return self; };
    self.then = (resolve: unknown, reject: unknown) => {
      if (h.error) return Promise.resolve({ data: null, error: h.error, count: null }).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
      if (headOnly) return Promise.resolve({ data: null, error: null, count: h.total }).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
      const rows = headOnly ? [] : h.rows.slice(from, to + 1);
      return Promise.resolve({ data: rows, error: null, count: h.total }).then(resolve as (v: unknown) => unknown, reject as (e: unknown) => unknown);
    };
    return self;
  };
  return { supabase: { from: () => builder() } };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' }, user: { id: 'auth-user-1' }, session: {}, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '@/components/talkx/TalkXSuppression';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function escolherTamanhoPagina(n: number) {
  const linha = screen.getByText(/^Mostrando/).parentElement;
  fireEvent.pointerDown(within(linha as HTMLElement).getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(screen.getByRole('option', { name: `${n} por página` }));
}

beforeEach(() => {
  h.ranges.length = 0;
  h.ors.length = 0;
  h.eqs.length = 0;
  h.orders.length = 0;
  h.total = 4892;
  h.error = null;
  h.rows = fabricarLinhas(10);
});

describe('TalkXSuppression · listagem no servidor (X178)', () => {
  it('mostra no rodapé o total DO SERVIDOR, não o da página', async () => {
    wrap(<TalkXSuppression />);
    expect(await screen.findByText('Mostrando 1 a 10 de 4.892 contatos suprimidos')).toBeTruthy();
    // A primeira página pediu exatamente o primeiro lote.
    expect(h.ranges[0]).toEqual([0, 9]);
  });

  it('a segunda página pede range(10, 19) ao servidor', async () => {
    wrap(<TalkXSuppression />);
    await screen.findByText('Mostrando 1 a 10 de 4.892 contatos suprimidos');

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('Mostrando 11 a 20 de 4.892 contatos suprimidos')).toBeTruthy();
    expect(h.ranges[h.ranges.length - 1]).toEqual([10, 19]);
  });

  it('trocar o tamanho da página manda o novo limite ao servidor e volta à página 1', async () => {
    wrap(<TalkXSuppression />);
    await screen.findByText('Mostrando 1 a 10 de 4.892 contatos suprimidos');

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await screen.findByText('Mostrando 11 a 20 de 4.892 contatos suprimidos');

    escolherTamanhoPagina(20);

    expect(await screen.findByText('Mostrando 1 a 20 de 4.892 contatos suprimidos')).toBeTruthy();
    expect(h.ranges[h.ranges.length - 1]).toEqual([0, 19]);
  });

  it('registro sem contato vinculado mostra o telefone gravado', async () => {
    h.rows = [
      { ...fabricarLinhas(1)[0], id: 'bl-avulso', contact_id: null, phone: '5511987654321', contacts: null },
    ];
    h.total = 1;
    wrap(<TalkXSuppression />);
    expect(await screen.findByText('Sem contato vinculado')).toBeTruthy();
    // O texto do telefone é o da ponta (`+` + dígitos, `fmtPhone` do cartão
    // #406/2610080423ee44): o teste do registro só-por-telefone consulta o
    // mesmo texto e não pode ser afrouxado aqui.
    expect(screen.getAllByText('+5511987654321').length).toBeGreaterThan(0);
  });

  it('erro 42501 mostra o estado "sem permissão", não o erro genérico', async () => {
    h.error = { code: '42501', message: 'permission denied for table talkx_blacklist' };
    wrap(<TalkXSuppression />);
    expect(await screen.findByText(/não tem permissão para ver a lista de supressão/i)).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
    expect(screen.queryByText('Nenhum contato na lista de supressão')).toBeNull();
  });
});
