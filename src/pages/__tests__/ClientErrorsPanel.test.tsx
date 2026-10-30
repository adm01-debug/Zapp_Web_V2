import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Aba "Navegador" (auditoria de paridade V3 → V2, docs/estado/01-frontend.md): erros de
 * runtime do cliente (audit_logs action='client_error', gravados por @/lib/errorReporter)
 * agrupados por mensagem normalizada e rota, com contagem e última ocorrência.
 *
 * O mock reproduz o teto do PostgREST: sem `.range()` devolve só a primeira página (1000
 * linhas); com `.range()` devolve a fatia pedida. O dataset tem 1200 erros e o defeito
 * `ChunkLoadError` só aparece a partir do índice 1150 (fora da primeira página) — se o
 * hook deixasse de paginar, esse grupo desapareceria da contagem em silêncio.
 */

const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const FETCH_PAGE_SIZE = 500;
  const TOTAL = 1200;
  const CHUNK_FROM = 1150;

  const rows = Array.from({ length: TOTAL }, (_, i) => ({
    id: `e${String(i).padStart(5, '0')}`,
    user_id: 'u-1',
    created_at: new Date(Date.UTC(2026, 9, 11, 12, 0, i)).toISOString(),
    details: i < CHUNK_FROM
      ? { message: `Failed to fetch /v1/req${i}`, path: '/inbox', sessionId: `s-${i % 3}` }
      : { message: `ChunkLoadError: Loading chunk ${i} failed`, path: '/relatorios', sessionId: 's-9' },
  }));

  const calls: Array<{ from: number | null; to: number | null }> = [];

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      range: (f: number, t: number) => { from = f; to = t; calls.push({ from: f, to: t }); return q; },
      then: (resolve: (v: unknown) => unknown) => {
        const data = from === null
          ? rows.slice(0, PAGE_CAP) // teto do PostgREST quando não há `range`
          : rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, calls, TOTAL, CHUNK_FROM, FETCH_PAGE_SIZE, state: { resposta: null as unknown } };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q = h.makeQuery();
      const r = h.state.resposta;
      if (r !== null && typeof r === 'object' && 'error' in r) {
        q['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(r));
      }
      return q;
    },
  },
}));

import { ClientErrorsPanel } from '@/pages/admin-telemetria/ClientErrorsPanel';
import {
  normalizeClientErrorMessage,
  groupClientErrors,
  type ClientErrorRow,
} from '@/hooks/system/useClientErrors';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.calls.length = 0;
  h.state.resposta = null;
});

describe('normalizeClientErrorMessage', () => {
  it('colapsa ids, números, hashes e query strings para agrupar o mesmo defeito', () => {
    expect(normalizeClientErrorMessage('Failed to fetch /v1/req12345'))
      .toBe(normalizeClientErrorMessage('Failed to fetch /v1/req99999'));
    expect(normalizeClientErrorMessage('Erro no chunk 4242: hash 9f8e7d6c5b4a39281706'))
      .toContain('#');
    // Query string volátil não separa o grupo.
    expect(normalizeClientErrorMessage('GET /api/x?a=1&b=2'))
      .toBe(normalizeClientErrorMessage('GET /api/x?a=99&b=7'));
  });

  it('mensagem vazia/nula vira o rótulo (sem mensagem)', () => {
    expect(normalizeClientErrorMessage('')).toBe('(sem mensagem)');
    expect(normalizeClientErrorMessage('   ')).toBe('(sem mensagem)');
  });
});

describe('groupClientErrors', () => {
  const linha = (id: string, created_at: string, details: Record<string, unknown>): ClientErrorRow =>
    ({ id, created_at, user_id: null, details });

  it('conta por mensagem normalizada + rota e guarda a última ocorrência', () => {
    const grupos = groupClientErrors([
      linha('a', '2026-10-11T10:00:00.000Z', { message: 'Falha 1', path: '/inbox', sessionId: 's1' }),
      linha('b', '2026-10-11T11:30:00.000Z', { message: 'Falha 2', path: '/inbox', sessionId: 's2' }),
      linha('c', '2026-10-11T09:00:00.000Z', { message: 'Falha 3', path: '/relatorios' }),
    ]);

    // "Falha 1"/"Falha 2" normalizam para o MESMO texto ("Falha #") na mesma rota.
    expect(grupos).toHaveLength(2);
    const inbox = grupos.find((g) => g.route === '/inbox')!;
    expect(inbox.count).toBe(2);
    expect(inbox.lastSeenIso).toBe('2026-10-11T11:30:00.000Z');
    expect(inbox.sessions).toBe(2);
    // Rota diferente é grupo diferente, mesmo com mensagem parecida.
    expect(grupos.some((g) => g.route === '/relatorios')).toBe(true);
  });
});

describe('ClientErrorsPanel — aba Navegador', () => {
  it('pagina a leitura e agrega erro além da primeira página do PostgREST', async () => {
    render(<ClientErrorsPanel />, { wrapper });

    expect(await screen.findByText('Erros do Navegador')).toBeInTheDocument();

    // O grupo que só existe depois do índice 1150 (fora da 1ª página) precisa aparecer.
    const tabela = await screen.findByText('/relatorios');
    expect(tabela).toBeInTheDocument();

    const container = document.body;
    const badge1150 = [...container.querySelectorAll('td')].find((td) => td.textContent === '1150');
    const badge50 = [...container.querySelectorAll('td')].find((td) => td.textContent === '50');
    expect(badge1150).toBeTruthy();
    expect(badge50).toBeTruthy();
    // A leitura foi paginada de fato.
    expect(h.calls.length).toBeGreaterThanOrEqual(3);
    expect(h.calls[0]).toEqual({ from: 0, to: 499 });

    // Sem exportar/baixar (regra do dono): nenhum controle de saída de dados.
    expect(screen.queryByText(/exportar|baixar|csv/i)).toBeNull();
  });

  it('estado vazio: nenhum erro no período é lido como tal', async () => {
    h.state.resposta = { data: [], error: null };
    render(<ClientErrorsPanel />, { wrapper });

    expect(await screen.findByText('Nenhum erro do navegador no período')).toBeInTheDocument();
    expect(document.querySelector('[data-client-errors="vazio"]')).toBeTruthy();
  });

  it('falha de leitura: avisa que NÃO conseguiu medir, nunca bom desempenho', async () => {
    h.state.resposta = { data: null, error: { message: 'permission denied for table audit_logs' } };
    render(<ClientErrorsPanel />, { wrapper });

    expect(await screen.findByText('Não foi possível ler os erros do navegador.')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('permission denied for table audit_logs');
    expect(document.querySelector('[data-client-errors="falha"]')).toBeTruthy();
  });
});
