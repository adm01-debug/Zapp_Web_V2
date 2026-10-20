import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SupervisorCopilot } from '../SupervisorCopilot';
import { supabase } from '@/integrations/supabase/client';

/**
 * IA-117 — a resposta gerencial tem de ser reproduzível: o contexto enviado ao
 * modelo identifica a consulta, o período, a amostra e o que NÃO foi medido.
 */
vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = (result: unknown) => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.eq = () => self;
    self.gte = () => self;
    self.limit = () => self;
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return self;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'queues') return makeBuilder({ data: [{ id: 'q1', name: 'Vendas' }], error: null });
        if (table === 'profiles') return makeBuilder({ data: [{ id: 'p1', name: 'Ana', role: 'agent', is_active: true }], error: null });
        return makeBuilder({ count: 42, error: null });
      }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { content: 'ok' }, error: null }) },
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    },
  };
});

describe('SupervisorCopilot (IA-117)', () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockClear();
  });

  it('envia um contexto gerencial reproduzível (consulta, período, amostra e lacunas)', async () => {
    render(<SupervisorCopilot />);

    fireEvent.click(screen.getByText('Quais filas estão em risco de SLA?'));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));

    const chamada = vi.mocked(supabase.functions.invoke).mock.calls[0];
    const corpo = chamada[1]?.body as { messages: Array<{ role: string; content: string }> };
    const sistema = corpo.messages[0].content;

    expect(sistema).toContain('Consulta gerencial (base reproduzível)');
    expect(sistema).toContain('Período: últimas 24h');
    expect(sistema).toContain('Amostra: 1 fila(s), 1 agente(s) ativo(s)');
    expect(sistema).toContain('Mensagens no período: 42');
    expect(sistema).toContain('Vendas');
    expect(sistema).toContain('Não medido nesta consulta');
    expect(sistema).toContain('não estime nem invente');
  });
});
