import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  LoginBlockedLogPanel,
  LOGIN_BLOCK_ACTION,
  motivoLabel,
} from '../LoginBlockedLogPanel';

// Mock do client Supabase: registra as tabelas/colunas/filtros e devolve dados
// scriptados. audit_logs usa a cadeia select->eq->order->limit; geo_blocking_settings
// usa select->limit->maybeSingle.
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
      b.limit = () =>
        table === 'audit_logs' ? Promise.resolve({ data: h.rows, error: h.error }) : b;
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

  it('motivo conhecido vira rótulo pt-BR; desconhecido aparece cru; vazio é neutro', () => {
    expect(motivoLabel('country_blocked')).toBe('País bloqueado');
    expect(motivoLabel('ip_blocked')).toBe('IP bloqueado');
    expect(motivoLabel('motivo_novo')).toBe('motivo_novo');
    expect(motivoLabel(null)).toBe('Motivo não informado');
  });
});
