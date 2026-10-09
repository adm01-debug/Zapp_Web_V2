/**
 * F50 (TL-028) — o monitor mostra os TRES numeros da estimativa do disparo, e
 * eles vem do SERVIDOR (acao `estimate` da edge `multiplix-dispatch`):
 *  - mensagens = destinatarios aptos x blocos (com a conta visivel na tela);
 *  - versoes de roteiro = DISTINCT dos roteiros finais;
 *  - caracteres de voz (e quantas renderizacoes de TTS).
 *
 * Antes deste cartao o front nao chamava `estimate` em lugar nenhum: o contrato
 * existia na edge e o numero nao aparecia para o operador. Aqui o hook REAL roda
 * (so o cliente do Supabase e mockado) — a prova e o caminho inteiro
 * monitor -> hook -> edge, nao um numero colado no componente.
 *
 * O ultimo caso fixa a diferenca entre "estimativa zerada" e "estimativa que
 * falhou": falha avisa, nunca vira zero (zero significa "nada a enviar").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    // O monitor abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

const DISPATCH = {
  id: 'd1', name: 'Disparo estimativa', message_template: 'oi', status: 'draft',
  total_recipients: 3, sent_count: 0, failed_count: 0, delivered_count: 0,
  outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
  completed_at: null, created_at: '2026-10-08T10:00:00Z',
};

type InvokeOptions = { body: { action: string; payload?: Record<string, unknown> } };

/** Responde cada action da edge como o roteador real responde. */
function respondWith(estimate: () => Promise<unknown>) {
  invoke.mockImplementation((fn: string, options: InvokeOptions) => {
    if (fn !== 'multiplix-dispatch') return Promise.resolve({ data: null, error: null });
    switch (options.body.action) {
      case 'dispatch.list':
        return Promise.resolve({ data: { data: { dispatches: [DISPATCH], total: 1 } }, error: null });
      case 'recipients.list':
        return Promise.resolve({ data: { data: { recipients: [], total: 0 } }, error: null });
      case 'estimate':
        return estimate();
      default:
        return Promise.resolve({ data: null, error: null });
    }
  });
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invoke.mockReset();
});

describe('MultiplixMonitor — estimativa do disparo (F50)', () => {
  it('mostra mensagens (aptos x blocos), versoes de roteiro e caracteres de voz vindos da edge', async () => {
    respondWith(() => Promise.resolve({
      data: {
        data: {
          messages: 6, script_versions: 4,
          voice: { characters: 1234, renderings: 3 },
          eligible_recipients: 3, blocks: 2,
        },
      },
      error: null,
    }));

    renderMonitor();

    const section = await screen.findByRole('region', { name: 'Estimativa do disparo' });
    // mensagens = aptos x blocos, com a conta visivel (6 = 3 x 2)
    expect(within(section).getByText('6')).toBeInTheDocument();
    expect(within(section).getByText('3 aptos × 2 blocos')).toBeInTheDocument();
    expect(within(section).getByText('Versões de roteiro')).toBeInTheDocument();
    expect(within(section).getByText('4')).toBeInTheDocument();
    expect(within(section).getByText('1.234')).toBeInTheDocument();
    expect(within(section).getByText('3 renderizações de voz')).toBeInTheDocument();

    expect(invoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'estimate', payload: { dispatch_id: 'd1' } },
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('avisa quando a estimativa falha em vez de mostrar zero', async () => {
    respondWith(() => {
      const context = new Response(JSON.stringify({ error: 'multiplix_estimate_shape' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
      return Promise.resolve({
        data: null,
        error: { message: 'Edge Function returned a non-2xx status code', context },
      });
    });

    renderMonitor();

    const section = await screen.findByRole('region', { name: 'Estimativa do disparo' });
    expect(within(section).getByText(/Não foi possível calcular a estimativa/)).toBeInTheDocument();
    // Nenhum numero inventado: zero significaria "nada a enviar".
    expect(within(section).queryByText('0')).toBeNull();
  });
});
