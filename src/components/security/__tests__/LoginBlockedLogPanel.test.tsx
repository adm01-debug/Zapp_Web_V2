import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LoginBlockedLogPanel } from '../LoginBlockedLogPanel';
import { LOGIN_BLOCK_ACTION } from '@/hooks/system/useLoginBlockedLog';

// Mock do client Supabase: registra tabelas/colunas/filtros e devolve dados
// scriptados. audit_logs usa select->eq->order->limit->abortSignal;
// geo_blocking_settings usa select->limit->maybeSingle.
const h = vi.hoisted(() => ({
  select: [] as Array<{ table: string; cols: string }>,
  eq: [] as Array<[string, unknown]>,
  rows: [] as unknown[],
  error: null as unknown,
  geo: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => {
        h.select.push({ table, cols });
        return b;
      };
      b.eq = (col: string, val: unknown) => {
        h.eq.push([col, val]);
        return b;
      };
      b.order = () => b;
      b.limit = () => b;
      b.abortSignal = () => Promise.resolve({ data: h.rows, error: h.error });
      b.maybeSingle = () => Promise.resolve({ data: h.geo, error: null });
      return b;
    },
  },
}));

beforeEach(() => {
  h.select = [];
  h.eq = [];
  h.rows = [];
  h.error = null;
  h.geo = { mode: 'disabled' };
});

describe('LoginBlockedLogPanel — log de bloqueio de login', () => {
  it('usa select explícito (nunca "*") e filtra pelo action de bloqueio', async () => {
    render(<LoginBlockedLogPanel />);

    await waitFor(() => expect(h.select.length).toBeGreaterThan(0));

    const audit = h.select.find((s) => s.table === 'audit_logs');
    expect(audit).toBeTruthy();
    // Colunas literais que o painel realmente usa — nunca '*'.
    expect(audit?.cols).not.toBe('*');
    for (const col of ['id', 'details', 'ip_address', 'user_agent', 'created_at']) {
      expect(audit?.cols).toContain(col);
    }
    // Nenhuma coluna sensível entra na consulta de leitura.
    expect(audit?.cols).not.toContain('password');
    expect(audit?.cols).not.toContain('token');
    expect(h.eq).toContainEqual(['action', LOGIN_BLOCK_ACTION]);
  });

  it('mostra e-mail, motivo, IP, país e quando de um bloqueio', async () => {
    h.rows = [
      {
        id: 'r1',
        details: { email: 'a@b.com', country_code: 'RU', reason: 'country_blocked' },
        ip_address: '9.9.9.9',
        user_agent: 'Mozilla/5.0 teste',
        created_at: '2026-10-10T12:34:56.000Z',
      },
    ];
    render(<LoginBlockedLogPanel />);

    expect(await screen.findByText('a@b.com')).toBeTruthy();
    expect(screen.getByText('País bloqueado')).toBeTruthy();
    expect(screen.getByText('9.9.9.9')).toBeTruthy();
    expect(screen.getByText('RU')).toBeTruthy();
    expect(screen.getByText('Mozilla/5.0 teste')).toBeTruthy();
  });

  it('motivo desconhecido aparece cru e motivo ausente é neutro', async () => {
    h.rows = [
      {
        id: 'r2',
        details: { reason: 'motivo_novo' },
        ip_address: null,
        user_agent: null,
        created_at: '2026-10-10T12:34:56.000Z',
      },
      {
        id: 'r3',
        details: {},
        ip_address: null,
        user_agent: null,
        created_at: '2026-10-10T12:34:56.000Z',
      },
    ];
    render(<LoginBlockedLogPanel />);

    expect(await screen.findByText('motivo_novo')).toBeTruthy();
    expect(screen.getByText('Motivo não informado')).toBeTruthy();
    expect(screen.getAllByText('E-mail não informado').length).toBe(2);
  });

  it('estado vazio é honesto: diz que nada foi registrado', async () => {
    render(<LoginBlockedLogPanel />);

    expect(await screen.findByText('Nenhum bloqueio de login registrado')).toBeTruthy();
  });

  it('erro de leitura mostra aviso, não uma lista vazia silenciosa', async () => {
    h.error = { message: 'permission denied' };
    render(<LoginBlockedLogPanel />);

    expect(
      await screen.findByText('Não foi possível carregar os bloqueios de login'),
    ).toBeTruthy();
  });
});
