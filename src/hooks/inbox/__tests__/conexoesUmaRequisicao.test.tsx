import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import { EvolutionDisconnectBanner } from '@/components/alerts/EvolutionDisconnectBanner';
import { useWhatsAppStatus } from '@/hooks/integrations/useWhatsAppStatus';
import { queryClient } from '@/lib/queryClient';

/**
 * Medição: quantas idas a `whatsapp_connections` DUAS telas montadas ao mesmo
 * tempo disparam.
 *
 * No codigo antigo a faixa de desconexão lia a tabela por conta propria e o
 * painel de status do contato lia de novo (instância da conexão), cada um com
 * o seu filtro. Com a lista compartilhada as duas telas dividem UMA entrada de
 * cache `['connections']`.
 *
 * Este teste NÃO importa o módulo da lista compartilhada de propósito: roda
 * igual no código antigo (para medir o "antes") e no novo.
 */
const h = vi.hoisted(() => ({
  consultas: 0,
  linhas: [] as Record<string, unknown>[],
  contatoComConexao: true,
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/integrations/supabase/client', () => {
  const canal = { on: () => canal, subscribe: () => canal, unsubscribe: () => canal };

  return {
    supabase: {
      from: (tabela: string) => ({
        select: () => {
          // conta a IDA ao banco por tabela consultada
          if (tabela === 'whatsapp_connections') h.consultas += 1;
          const corrente: Record<string, unknown> = {};
          corrente.eq = () => corrente;
          corrente.limit = () => corrente;
          corrente.order = () => corrente;
          corrente.maybeSingle = async () =>
            tabela === 'contacts'
              ? {
                  data: {
                    name: 'Contato',
                    whatsapp_connection_id: h.contatoComConexao ? 'conn-1' : null,
                  },
                  error: null,
                }
              : { data: h.linhas[0] ?? null, error: null };
          corrente.then = (cb: (v: unknown) => void) =>
            cb({ data: tabela === 'whatsapp_connections' ? h.linhas : [], error: null });
          return corrente;
        },
      }),
      channel: () => canal,
      removeChannel: vi.fn(),
      functions: { invoke: async () => ({ data: [], error: null }) },
    },
  };
});

const CONEXAO = {
  id: 'conn-1',
  name: 'Principal',
  phone_number: null,
  status: 'connected',
  instance_id: 'inst-1',
  is_default: true,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  // cache de módulo: cada caso mede a partir do zero
  queryClient.clear();
  h.consultas = 0;
  h.linhas = [CONEXAO];
  h.contatoComConexao = true;
});

describe('duas telas montadas leem a lista de conexões uma vez', () => {
  it('faixa de desconexão + status do contato = 1 ida a whatsapp_connections', async () => {
    render(<EvolutionDisconnectBanner />);
    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(h.consultas).toBeGreaterThan(0));

    expect(h.consultas).toBe(1);
  });

  it('contato sem conexão própria: 1 ida (antes: primeira conectada + instância)', async () => {
    h.contatoComConexao = false;
    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(h.consultas).toBe(1);
  });
});
