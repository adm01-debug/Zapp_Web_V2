/**
 * Jornada do contato (timeline): transferência e encerramento param de mostrar o id cru.
 *
 * Prova que o hook REAL resolve os nomes de agente/fila a partir de
 * `conversation_events.{from,to}_agent_id` / `{from,to}_queue_id` e que o encerramento lê
 * `conversation_closures` (`close_reason`, `outcome`, `classification`) pelo `closure_id`.
 * Nenhuma consulta é feita quando o evento não aponta para nada (contato sem transferência nem
 * encerramento não paga consulta nova).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  consultas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const construir = (tabela: string) => {
    banco.consultas.push(tabela);
    const filtros: Array<(linha: Record<string, unknown>) => boolean> = [];
    const pagina = () => ({
      data: (banco.tabelas[tabela] ?? []).filter((linha) => filtros.every((f) => f(linha))),
      error: null,
    });
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (coluna: string, valor: unknown) => {
      filtros.push((linha) => linha[coluna] === valor);
      return c;
    };
    c.in = (coluna: string, valores: unknown[]) => {
      filtros.push((linha) => valores.includes(linha[coluna]));
      return c;
    };
    c.order = () => c;
    c.limit = () => c;
    c.gte = () => Promise.resolve(pagina());
    c.then = (resolver: (v: unknown) => unknown) => Promise.resolve(pagina()).then(resolver);
    return c;
  };
  return { supabase: { from: (tabela: string) => construir(tabela) } };
});

import { useConversationHistoryTimeline, type TimelineEvent } from '@/hooks/chat/useConversationHistoryTimeline';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

const montar = () => renderHook(() => useConversationHistoryTimeline('contato-1', 30, 'all', 50), { wrapper });

const evento = (over: Record<string, unknown> & { id: string; event_type: string }) => ({
  contact_id: 'contato-1',
  created_at: '2026-10-10T12:00:00.000Z',
  metadata: null,
  from_agent_id: null,
  to_agent_id: null,
  from_queue_id: null,
  to_queue_id: null,
  closure_id: null,
  ...over,
});

async function eventosDa(result: { current: { isSuccess: boolean; data?: { days: Array<{ events: TimelineEvent[] }> } } }) {
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data!.days.flatMap((dia) => dia.events);
}

describe('useConversationHistoryTimeline — transferência e encerramento', () => {
  beforeEach(() => {
    banco.tabelas = {};
    banco.consultas = [];
  });

  it('transferência mostra "De: nome · Para: nome" a partir dos ids do evento', async () => {
    banco.tabelas = {
      conversation_events: [
        evento({ id: 'e1', event_type: 'transfer', from_agent_id: 'u1', to_agent_id: 'u2' }),
      ],
      profiles: [
        { id: 'u1', name: 'Ana Souza' },
        { id: 'u2', name: 'João Lima' },
      ],
    };

    const eventos = await eventosDa(montar().result);
    const transferencia = eventos.find((e) => e.kind === 'transfer');

    expect(transferencia?.subtitle).toBe('De: Ana Souza · Para: João Lima');
  });

  it('transferência de fila usa o nome da fila quando não há agente', async () => {
    banco.tabelas = {
      conversation_events: [
        evento({ id: 'e1', event_type: 'queue_transfer', from_queue_id: 'q1', to_queue_id: 'q2' }),
      ],
      queues: [
        { id: 'q1', name: 'Comercial' },
        { id: 'q2', name: 'Suporte' },
      ],
    };

    const eventos = await eventosDa(montar().result);
    const transferencia = eventos.find((e) => e.kind === 'transfer');

    expect(transferencia?.subtitle).toBe('De: Comercial · Para: Suporte');
    expect(banco.consultas).toContain('queues');
    // Evento sem agente encerramento: nenhuma consulta nova para perfis/fechamentos.
    expect(banco.consultas).not.toContain('profiles');
    expect(banco.consultas).not.toContain('conversation_closures');
  });

  it('encerramento mostra motivo, resultado e classificação lidos de `conversation_closures`', async () => {
    banco.tabelas = {
      conversation_events: [evento({ id: 'e1', event_type: 'close', closure_id: 'cl1' })],
      conversation_closures: [
        { id: 'cl1', close_reason: 'resolved', outcome: 'lead_qualified', classification: 'sales' },
      ],
    };

    const eventos = await eventosDa(montar().result);
    const fechamento = eventos.find((e) => e.kind === 'close');

    expect(fechamento?.subtitle).toBe('Motivo: Resolvido · Resultado: Lead qualificado · Classificação: Comercial');
    expect(banco.consultas).toContain('conversation_closures');
  });

  it('vocabulário desconhecido do encerramento sai como veio, sem inventar rótulo', async () => {
    banco.tabelas = {
      conversation_events: [evento({ id: 'e1', event_type: 'close', closure_id: 'cl1' })],
      conversation_closures: [
        { id: 'cl1', close_reason: 'motivo_novo_do_produto', outcome: null, classification: null },
      ],
    };

    const eventos = await eventosDa(montar().result);
    const fechamento = eventos.find((e) => e.kind === 'close');

    expect(fechamento?.subtitle).toBe('Motivo: motivo_novo_do_produto');
  });

  it('sem nome visível (RLS), o id do agente fica no lugar do nome', async () => {
    banco.tabelas = {
      conversation_events: [
        evento({ id: 'e1', event_type: 'transfer', from_agent_id: 'u9', to_agent_id: 'u8' }),
      ],
      profiles: [],
    };

    const eventos = await eventosDa(montar().result);
    const transferencia = eventos.find((e) => e.kind === 'transfer');

    expect(transferencia?.subtitle).toBe('De: u9 · Para: u8');
  });
});
