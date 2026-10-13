import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * A timeline somava 3 consultas e ignorava o `error` de cada uma: consulta
 * recusada virava lista vazia (ou só o evento "Contato criado") e a tela
 * anunciava uma timeline completa/`0 eventos` que o banco nunca devolveu.
 */
const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, { message: string } | null>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const build = (table: string) => {
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = () => query;
    query.order = () => query;
    query.limit = () => query;
    // Builder "thenable", como o do PostgREST: resolve no `await`.
    query.then = (onOk: (value: unknown) => unknown, onErr?: (error: unknown) => unknown) =>
      Promise.resolve({ data: h.rows[table] ?? [], error: h.errors[table] ?? null }).then(onOk, onErr);
    return query;
  };
  return { supabase: { from: (table: string) => build(table) } };
});

import { ContactActivityTimeline } from '../ContactActivityTimeline';

const CREATED_AT = '2026-01-01T00:00:00.000Z';

beforeEach(() => {
  h.rows = { messages: [], contact_notes: [], conversation_events: [] };
  h.errors = {};
});

describe('ContactActivityTimeline — erro das consultas não vira timeline falsa', () => {
  it('com as 3 consultas OK, mostra os eventos e a contagem', async () => {
    h.rows.messages = [
      { id: 'm1', content: 'Oi, tudo bem?', sender: 'agent', created_at: '2026-10-01T12:00:00.000Z' },
    ];

    render(<ContactActivityTimeline contactId="c1" contactCreatedAt={CREATED_AT} />);

    expect(await screen.findByText('Mensagem enviada')).toBeInTheDocument();
    expect(screen.getByText('Contato criado')).toBeInTheDocument();
    expect(screen.getByText(/2 eventos/)).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-error')).not.toBeInTheDocument();
  });

  it('consulta de mensagens com erro: estado de erro explícito, sem "0 eventos" nem "Contato criado"', async () => {
    h.errors.messages = { message: 'permission denied' };

    render(<ContactActivityTimeline contactId="c1" contactCreatedAt={CREATED_AT} />);

    expect(await screen.findByTestId('timeline-error')).toBeInTheDocument();
    expect(screen.queryByText(/eventos/)).not.toBeInTheDocument();
    expect(screen.queryByText('Contato criado')).not.toBeInTheDocument();
  });

  it.each([
    ['notas', 'contact_notes'],
    ['eventos de conversa', 'conversation_events'],
  ])('erro na consulta de %s também vira estado de erro', async (_name, table) => {
    h.errors[table] = { message: 'falha na consulta' };

    render(<ContactActivityTimeline contactId="c1" contactCreatedAt={CREATED_AT} />);

    expect(await screen.findByTestId('timeline-error')).toBeInTheDocument();
    expect(screen.queryByText(/eventos/)).not.toBeInTheDocument();
  });

  it('os eventos aparecem em ordem decrescente de data', async () => {
    h.rows.messages = [
      { id: 'm-old', content: 'antiga', sender: 'contact', created_at: '2026-05-01T10:00:00.000Z' },
      { id: 'm-new', content: 'recente', sender: 'contact', created_at: '2026-09-01T10:00:00.000Z' },
    ];

    render(<ContactActivityTimeline contactId="c1" contactCreatedAt={CREATED_AT} />);

    const items = await screen.findAllByText('Mensagem recebida');
    expect(items).toHaveLength(2);
    const texts = screen.getAllByText(/antiga|recente/).map((el) => el.textContent);
    expect(texts).toEqual(['recente', 'antiga']);
  });
});
