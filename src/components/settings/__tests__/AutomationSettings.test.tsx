import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Escrita {
  table: string;
  tipo: 'update' | 'upsert';
  payload: Record<string, unknown>;
  eq: Array<[string, unknown]>;
}

// Estado do Supabase falso: as leituras vem dos arrays abaixo, toda ESCRITA
// (update/upsert) e registrada em `escritas` com a tabela de origem -- e por
// isso que o teste consegue provar que a aba nao toca user_settings.
const estado = vi.hoisted(() => ({
  globalRows: [] as Array<Record<string, unknown>>,
  autoClose: null as Record<string, unknown> | null,
  updateData: null as Array<{ key: unknown }> | null,
  updateError: null as { message: string } | null,
  escritas: [] as Escrita[],
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: estado.from } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

estado.from.mockImplementation((table: string) => ({
  select: () => ({
    order: async () => ({ data: estado.globalRows, error: null }),
    limit: () => ({
      single: async () => ({ data: estado.autoClose, error: null }),
    }),
  }),
  update: (payload: Record<string, unknown>) => {
    const escrita: Escrita = { table, tipo: 'update', payload, eq: [] };
    estado.escritas.push(escrita);
    return {
      eq: (col: string, val: unknown) => {
        escrita.eq.push([col, val]);
        return {
          select: async () => ({
            data: estado.updateError ? null : (estado.updateData ?? [{ key: val }]),
            error: estado.updateError,
          }),
        };
      },
    };
  },
  upsert: (payload: Record<string, unknown>) => {
    estado.escritas.push({ table, tipo: 'upsert', payload, eq: [] });
    return { select: () => ({ single: async () => ({ data: payload, error: null }) }) };
  },
}));

import { AutomationSettings } from '@/components/settings/AutomationSettings';
import { toast } from 'sonner';

const CHAVE = 'auto_transcription_enabled';

function linhaGlobal(valor: string | null) {
  return {
    id: 'g1',
    key: CHAVE,
    value: valor,
    description: null,
    updated_by: null,
    created_at: '2026-10-06T00:00:00Z',
    updated_at: '2026-10-06T00:00:00Z',
  };
}

const AUTO_CLOSE = {
  id: 'ac1',
  is_enabled: false,
  inactivity_hours: 24,
  close_message: null,
  updated_by: null,
  created_at: '2026-10-06T00:00:00Z',
  updated_at: '2026-10-06T00:00:00Z',
};

function renderAutomacao() {
  // retry:false -- o teste quer o primeiro resultado (sucesso ou erro), nao repeticoes.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AutomationSettings />
    </QueryClientProvider>,
  );
}

function switchTranscricao() {
  return screen.findByRole('switch', { name: 'Transcrição automática' });
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.globalRows = [linhaGlobal('true')];
  estado.autoClose = AUTO_CLOSE;
  estado.updateData = null;
  estado.updateError = null;
  estado.escritas = [];
});

describe('AutomationSettings — transcrição no contrato global_settings', () => {
  it('desligar a transcrição grava value=false na chave auto_transcription_enabled', async () => {
    estado.globalRows = [linhaGlobal('true')];
    renderAutomacao();

    const interruptor = await switchTranscricao();
    expect(interruptor).toBeChecked();

    fireEvent.click(interruptor);

    await waitFor(() => expect(estado.escritas).toHaveLength(1));
    expect(estado.escritas[0]).toMatchObject({
      table: 'global_settings',
      tipo: 'update',
      payload: { value: 'false' },
    });
    expect(estado.escritas[0].eq).toEqual([['key', CHAVE]]);
  });

  it('ligar a transcrição grava value=true na mesma chave', async () => {
    estado.globalRows = [linhaGlobal('false')];
    renderAutomacao();

    const interruptor = await switchTranscricao();
    expect(interruptor).not.toBeChecked();

    fireEvent.click(interruptor);

    await waitFor(() => expect(estado.escritas).toHaveLength(1));
    expect(estado.escritas[0].payload).toEqual({ value: 'true' });
    expect(estado.escritas[0].eq).toEqual([['key', CHAVE]]);
  });

  it('monta desligado somente com value=false; qualquer outro valor (inclusive ausente) e ligado', async () => {
    estado.globalRows = [linhaGlobal('false')];
    const primeira = renderAutomacao();
    expect(await switchTranscricao()).not.toBeChecked();
    primeira.unmount();

    estado.escritas = [];
    estado.globalRows = [linhaGlobal('true')];
    const segunda = renderAutomacao();
    expect(await switchTranscricao()).toBeChecked();
    segunda.unmount();

    // chave ausente: o executor transcreve (nada igual a 'false'), o switch tambem
    estado.globalRows = [];
    renderAutomacao();
    expect(await switchTranscricao()).toBeChecked();
  });

  it('a aba nao escreve nada em user_settings', async () => {
    renderAutomacao();

    const interruptor = await switchTranscricao();
    fireEvent.click(interruptor);

    await waitFor(() => expect(estado.escritas.length).toBeGreaterThan(0));
    expect(estado.escritas.filter((e) => e.table === 'user_settings')).toEqual([]);
    expect(estado.escritas.every((e) => e.table === 'global_settings')).toBe(true);
  });

  it('falha na gravacao avisa o erro na tela e o switch nao fica confirmado', async () => {
    estado.globalRows = [linhaGlobal('true')];
    estado.updateError = { message: 'permission denied' };
    renderAutomacao();

    const interruptor = await switchTranscricao();
    fireEvent.click(interruptor);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(await switchTranscricao()).toBeChecked();
  });
});

describe('AutomationSettings — inatividade e atribuição sem promessa falsa', () => {
  it('nao tem mais o tempo de inatividade pessoal e mantem o cartao de auto-fechamento', async () => {
    renderAutomacao();

    expect(await screen.findByText('Auto-fechamento de Conversas')).toBeInTheDocument();
    expect(screen.queryByText(/Tempo de inatividade \(minutos\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fechar chat automaticamente após inatividade/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/fechamento automático por inatividade é definido no cartão Auto-fechamento/i),
    ).toBeInTheDocument();
  });

  it('atribuição automática aparece como integração pendente, aponta o roteamento e nao promete distribuição', async () => {
    renderAutomacao();

    expect(await screen.findByText(/integração pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/aba Roteamento/)).toBeInTheDocument();
    expect(screen.queryByText(/Distribui chats automaticamente entre os atendentes online/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Habilitar atribuição automática/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Método de distribuição/i)).not.toBeInTheDocument();
  });
});
