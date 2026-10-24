import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * "Linha do Tempo" do contato (`ContactActivityTimeline`) — 3 defeitos medidos na tela:
 *
 * 1. Rótulo: `event_type` fora de `assign`/`transfer` caía no genérico "Evento" (close, reopen,
 *    unassign, queue_transfer, overload_reassign, absence_reassign); `tag_added` era o único com
 *    rótulo e não existe como evento da conversa.
 * 2. Erro: as 4 consultas descartavam `error` — consulta negada virava tela vazia (só "Contato
 *    criado"), sem aviso e sem saída. Agora aparece o alerta com "Tentar de novo".
 * 3. Teto: `.limit(10)` em `conversation_events` escondia o 11º evento e seguintes, e o botão
 *    "Ver mais" contava sobre a lista já cortada.
 *
 * Os testes renderizam o componente REAL e clicam como o usuário.
 */

const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, Array<Record<string, unknown>>>,
  erroPorTabela: {} as Record<string, { message: string } | null>,
  limitePorTabela: {} as Record<string, number | null>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = (n: number) => {
      h.limitePorTabela[tabela] = n;
      return chain;
    };
    chain.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({ data: h.porTabela[tabela] ?? [], error: h.erroPorTabela[tabela] ?? null }).then(onFulfilled);
    return chain;
  };
  return { supabase: { from: (tabela: string) => makeChain(tabela) } };
});

import { ContactActivityTimeline } from '../ContactActivityTimeline';

const evento = (id: string, event_type: string, hora: number, metadata: unknown = null) => ({
  id,
  event_type,
  created_at: new Date(Date.UTC(2026, 8, 8, hora, 0, 0)).toISOString(),
  metadata,
});

const renderTimeline = () =>
  render(<ContactActivityTimeline contactId="c1" contactCreatedAt="2026-01-01T00:00:00.000Z" />);

describe('ContactActivityTimeline — rótulo pt-BR de cada tipo de evento', () => {
  beforeEach(() => {
    h.porTabela = {};
    h.erroPorTabela = {};
    h.limitePorTabela = {};
  });

  it('mostra o rótulo certo para cada event_type e cai em "Evento" no desconhecido', async () => {
    h.porTabela = {
      conversation_events: [
        evento('e1', 'assign', 9),
        evento('e2', 'transfer', 8),
        evento('e3', 'close', 7),
        evento('e4', 'reopen', 6),
        evento('e5', 'unassign', 5),
        evento('e6', 'queue_transfer', 4),
        evento('e7', 'overload_reassign', 3),
        evento('e8', 'absence_reassign', 2),
        evento('e9', 'tipo_novo_do_banco', 1),
      ],
    };

    renderTimeline();
    expect(await screen.findByText('Atribuído a agente')).toBeInTheDocument();

    // 10 eventos na lista (9 do banco + "Contato criado"): o resto só depois do "Ver mais".
    fireEvent.click(screen.getByRole('button', { name: /Ver mais 5 eventos/ }));

    expect(screen.getByText('Transferido')).toBeInTheDocument();
    expect(screen.getByText('Conversa encerrada')).toBeInTheDocument();
    expect(screen.getByText('Conversa reaberta')).toBeInTheDocument();
    expect(screen.getByText('Liberou conversa')).toBeInTheDocument();
    expect(screen.getByText('Transferido para fila')).toBeInTheDocument();
    expect(screen.getAllByText('Reatribuição automática')).toHaveLength(2);
    expect(screen.getByText('Evento')).toBeInTheDocument();
  });
});

describe('ContactActivityTimeline — falha de consulta não vira tela vazia', () => {
  beforeEach(() => {
    h.porTabela = {};
    h.erroPorTabela = {};
    h.limitePorTabela = {};
  });

  it.each(['messages', 'contact_notes', 'conversation_events'])(
    'mostra o alerta quando %s falha, e "Tentar de novo" recarrega a linha do tempo',
    async (tabelaQueFalha) => {
      h.porTabela = { conversation_events: [evento('e1', 'transfer', 9)] };
      h.erroPorTabela = { [tabelaQueFalha]: { message: 'permission denied' } };

      renderTimeline();

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Não foi possível carregar a linha do tempo.')).toBeInTheDocument();
      expect(screen.queryByText('Transferido')).not.toBeInTheDocument();

      // O banco volta a responder: o botão refaz a consulta e a linha do tempo aparece.
      h.erroPorTabela = {};
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

      expect(await screen.findByText('Transferido')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    },
  );
});

describe('ContactActivityTimeline — "Ver mais" em vez de teto fixo de 10', () => {
  beforeEach(() => {
    h.porTabela = {};
    h.erroPorTabela = {};
    h.limitePorTabela = {};
  });

  it('busca todos os eventos (sem limit) e o "Ver mais" mostra o 11º e os seguintes', async () => {
    h.porTabela = {
      conversation_events: Array.from({ length: 12 }, (_, i) => evento(`e${i + 1}`, 'transfer', 12 - i)),
    };

    renderTimeline();

    expect(await screen.findByText('13 eventos')).toBeInTheDocument();
    expect(screen.getAllByText('Transferido')).toHaveLength(5);
    expect(h.limitePorTabela.conversation_events).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /Ver mais 8 eventos/ }));

    expect(screen.getAllByText('Transferido')).toHaveLength(12);
  });
});

describe('ContactActivityTimeline — acessibilidade (axe)', () => {
  beforeEach(() => {
    h.porTabela = {};
    h.erroPorTabela = {};
    h.limitePorTabela = {};
  });

  it('não tem violação do axe com a linha do tempo cheia (jsdom: contraste fora)', async () => {
    h.porTabela = {
      conversation_events: [evento('e1', 'transfer', 9), evento('e2', 'close', 8)],
      contact_notes: [{ id: 'n1', content: 'Nota', created_at: '2026-09-08T07:00:00.000Z' }],
    };

    renderTimeline();
    await screen.findByText('Transferido');

    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('não tem violação do axe no estado de erro', async () => {
    h.erroPorTabela = { conversation_events: { message: 'permission denied' } };

    renderTimeline();
    await screen.findByRole('alert');

    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
