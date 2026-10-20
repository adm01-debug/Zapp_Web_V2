/**
 * t_9cc4f1c2 — trilha de auditoria por conexão (só leitura, só admin).
 *
 * Antes não havia como ver o que aconteceu com UMA conexão: o painel global de
 * auditoria mistura tudo. Aqui o componente REAL é renderizado e prova-se:
 *  - lista ação (rótulo pt-BR), quem e quando, sem pedir a linha inteira;
 *  - a conexão é filtrada por details.instance_id (contrato do CX0b/V3);
 *  - estado vazio honesto quando não há evento (ex.: antes do cartão de escrita);
 *  - paginação: 21 eventos = 2 páginas, e a 2ª busca o range seguinte;
 *  - fechado, o diálogo não consulta nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type Call = Record<string, unknown>;

const h = vi.hoisted(() => ({
  audit: { rows: [] as Call[], count: 0, error: null as unknown },
  profiles: [] as Call[],
  calls: [] as Call[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: Call = { table };
    h.calls.push(state);
    const builder: Call = {};
    builder.select = (cols: string, opts?: unknown) => {
      state.select = cols;
      state.opts = opts;
      return builder;
    };
    builder.contains = (col: string, val: unknown) => {
      state.contains = [col, val];
      return builder;
    };
    builder.order = (col: string, opts?: unknown) => {
      state.order = [col, opts];
      return builder;
    };
    builder.range = (from_: number, to: number) => {
      state.range = [from_, to];
      return Promise.resolve(
        table === 'audit_logs'
          ? { data: h.audit.rows, count: h.audit.count, error: h.audit.error }
          : { data: h.profiles, error: null },
      );
    };
    builder.in = (col: string, vals: unknown) => {
      state.in = [col, vals];
      return Promise.resolve({ data: h.profiles, error: null });
    };
    return builder;
  };
  return { supabase: { from } };
});

import { ConnectionAuditDialog } from '../ConnectionAuditDialog';

const auditCall = () => h.calls.find((c) => c.table === 'audit_logs');
const profileCall = () => h.calls.find((c) => c.table === 'profiles');

function renderDialog(open = true) {
  return render(
    <ConnectionAuditDialog
      open={open}
      onOpenChange={() => {}}
      connectionName="Principal"
      instanceId="inst-1"
    />,
  );
}

beforeEach(() => {
  h.audit = { rows: [], count: 0, error: null };
  h.profiles = [];
  h.calls = [];
});

describe('ConnectionAuditDialog — trilha de uma conexão (t_9cc4f1c2)', () => {
  it('lista ação em pt-BR, quem e quando; consulta só colunas explícitas e filtra por instance_id', async () => {
    h.audit = {
      rows: [{ id: 'a1', action: 'connection_deleted', user_id: 'u1', created_at: '2026-10-12T13:05:00Z' }],
      count: 1,
      error: null,
    };
    h.profiles = [{ user_id: 'u1', name: 'Ana' }];

    renderDialog();

    expect(await screen.findByText('Conexão excluída')).toBeTruthy();
    expect(screen.getByText(/Ana/)).toBeTruthy();
    const time = document.querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe('2026-10-12T13:05:00Z');

    const call = auditCall();
    expect(call?.select).toBe('id, action, user_id, created_at');
    expect(call?.contains).toEqual(['details', { instance_id: 'inst-1' }]);
    expect(call?.order).toEqual(['created_at', { ascending: false }]);
    expect(call?.range).toEqual([0, 19]);
    // Nada de telefone/QR/token: a linha inteira nunca é pedida.
    expect(call?.select).not.toBe('*');

    const pcall = profileCall();
    expect(pcall?.select).toBe('user_id, name');
    expect(pcall?.in).toEqual(['user_id', ['u1']]);
  });

  it('estado vazio honesto quando a conexão ainda não tem evento registrado', async () => {
    renderDialog();

    expect(await screen.findByText(/Nenhum evento de auditoria registrado/)).toBeTruthy();
    expect(screen.getByText('Nenhum evento')).toBeTruthy();
    expect(document.querySelector('time')).toBeNull();
    expect(profileCall()).toBeUndefined();
  });

  it('paginação: 21 eventos viram 2 páginas e a 2ª página busca o range seguinte', async () => {
    h.audit = {
      rows: Array.from({ length: 20 }, (_, i) => ({
        id: `e${i}`,
        action: 'connection_disconnected',
        user_id: null,
        created_at: `2026-10-12T10:${String(i).padStart(2, '0')}:00Z`,
      })),
      count: 21,
      error: null,
    };

    renderDialog();

    expect((await screen.findAllByText(/Sistema/))).toHaveLength(20);
    expect(screen.getByText(/21 eventos — página 1 de 2/)).toBeTruthy();

    const proxima = screen.getByRole('button', { name: 'Próxima página da auditoria' }) as HTMLButtonElement;
    expect(proxima.disabled).toBe(false);
    fireEvent.click(proxima);

    await waitFor(() => {
      const secondAuditCall = h.calls.filter((c) => c.table === 'audit_logs')[1];
      expect(secondAuditCall?.range).toEqual([20, 39]);
    });
  });

  it('fechado, o diálogo não consulta nada', () => {
    renderDialog(false);
    expect(h.calls).toHaveLength(0);
  });

  it('falha de leitura mostra erro e não deixa a tela vazia mentir', async () => {
    h.audit = { rows: [], count: 0, error: { message: 'rls' } };

    renderDialog();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Nenhum evento de auditoria registrado/)).toBeNull();
  });
});
