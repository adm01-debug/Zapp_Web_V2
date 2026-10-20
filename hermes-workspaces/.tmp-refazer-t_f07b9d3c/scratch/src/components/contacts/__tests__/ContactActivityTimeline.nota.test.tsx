import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Nota escrita na transferência na "Linha do Tempo" do contato (`ContactActivityTimeline`).
 *
 * O defeito: a consulta de `conversation_events` JÁ lia a coluna `metadata` (e a descartava), então
 * o evento saía só com o título "Transferido" — a nota do atendente não aparecia em lugar nenhum.
 *
 * Casos cobertos:
 * 1. nota longa aparece cortada em 120 na linha e inteira no `title` (o detalhe);
 * 2. nota curta aparece inteira, com espaços/quebras normalizados;
 * 3. transferência SEM nota não inventa a linha "Nota:".
 */

const NOTA_MAX = 120;

const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({ data: h.porTabela[tabela] ?? [], error: null }).then(onFulfilled);
    return chain;
  };
  return { supabase: { from: (tabela: string) => makeChain(tabela) } };
});

import { ContactActivityTimeline } from '../ContactActivityTimeline';

const renderTimeline = () =>
  render(<ContactActivityTimeline contactId="c1" contactCreatedAt="2026-01-01T00:00:00.000Z" />);

describe('ContactActivityTimeline — nota da transferência', () => {
  beforeEach(() => {
    h.porTabela = {};
  });

  it('corta a nota em 120 na linha e guarda o texto completo no detalhe (title)', async () => {
    const completa = `${'b'.repeat(NOTA_MAX)} e o resto que só aparece no detalhe`;
    h.porTabela = {
      conversation_events: [
        { id: 'ev-1', event_type: 'transfer', created_at: '2026-09-08T12:00:00.000Z', metadata: { note: completa } },
      ],
    };

    renderTimeline();

    expect(await screen.findByText('Transferido')).toBeInTheDocument();
    const linha = screen.getByText(`Nota: ${'b'.repeat(NOTA_MAX)}…`);
    expect(linha).toBeInTheDocument();
    expect(linha).toHaveAttribute('title', completa);
  });

  it('mostra a nota curta inteira, normalizando espaços e quebras de linha', async () => {
    h.porTabela = {
      conversation_events: [
        { id: 'ev-2', event_type: 'transfer', created_at: '2026-09-08T12:00:00.000Z', metadata: { note: '  Cliente   pediu\n retorno amanhã  ' } },
      ],
    };

    renderTimeline();

    const linha = await screen.findByText('Nota: Cliente pediu retorno amanhã');
    expect(linha).toBeInTheDocument();
    expect(linha).toHaveAttribute('title', 'Cliente pediu retorno amanhã');
  });

  it('transferência sem nota não cria a linha "Nota:" (nada muda)', async () => {
    h.porTabela = {
      conversation_events: [
        { id: 'ev-3', event_type: 'transfer', created_at: '2026-09-08T12:00:00.000Z', metadata: null },
        { id: 'ev-4', event_type: 'transfer', created_at: '2026-09-08T13:00:00.000Z', metadata: { note: '   ' } },
      ],
    };

    renderTimeline();

    expect(await screen.findAllByText('Transferido')).toHaveLength(2);
    expect(screen.queryByText(/^Nota:/)).not.toBeInTheDocument();
  });
});
