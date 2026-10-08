import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * #273-B / R2-AUTH-049 — "Aba Mensagens: ausência em away_messages e
 * boas-vindas/encerramento como integração pendente".
 *
 * A aba Mensagens gravava welcome_message/away_message/closing_message na linha
 * PESSOAL `user_settings`, que nenhum executor versionado lê. O contrato
 * versionado da mensagem de ausência é `away_messages` POR CONEXÃO.
 *
 * Os primitivos do Radix são trocados por <select>/<option> nativos que
 * repassam o evento do usuário para o `onValueChange` REAL do componente
 * (mesmo padrão de src/components/settings/__tests__/SkillBasedRoutingSettings.test.tsx).
 * Conexões, mensagem e usuário são SINTÉTICOS.
 */

const h = vi.hoisted(() => {
  const toast = vi.fn();
  const conexoes = [
    { id: 'conn-vendas', name: 'WhatsApp Vendas', is_default: true },
    { id: 'conn-suporte', name: 'WhatsApp Suporte', is_default: false },
  ];
  const away: Record<string, { content: string; is_enabled: boolean } | null> = {
    'conn-vendas': { content: 'Estamos fora do horário. Voltamos amanhã!', is_enabled: true },
    'conn-suporte': null,
  };
  const upserts: Array<{ table: string; payload: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const consultasAway: string[] = [];
  return {
    toast,
    conexoes,
    away,
    upserts,
    updates,
    consultasAway,
    erroNoUpsert: null as Error | null,
  };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    defaultValue,
    onValueChange,
    children,
  }: {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    children?: ReactNode;
  }) => (
    <select value={value ?? defaultValue ?? ''} onChange={e => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    if (table === 'whatsapp_connections') {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: h.conexoes, error: null }),
        }),
      };
    }
    if (table === 'business_hours') {
      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        }),
        upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
          h.upserts.push({ table, payload, options });
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'away_messages') {
      return {
        select: () => ({
          eq: (_col: string, valor: string) => ({
            maybeSingle: () => {
              h.consultasAway.push(valor);
              const linha = h.away[valor];
              return Promise.resolve({
                data: linha ? { whatsapp_connection_id: valor, ...linha } : null,
                error: null,
              });
            },
          }),
        }),
        upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
          h.upserts.push({ table, payload, options });
          return Promise.resolve({ error: h.erroNoUpsert });
        },
      };
    }
    // Qualquer outra tabela (user_settings incluída): registra a escrita. Nenhuma
    // escrita fora de away_messages é esperada nesta aba.
    return {
      upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
        h.upserts.push({ table, payload, options });
        return Promise.resolve({ error: null });
      },
      update: (payload: Record<string, unknown>) => {
        h.updates.push({ table, payload });
        return { eq: () => Promise.resolve({ error: null }) };
      },
      insert: (payload: Record<string, unknown>) => {
        h.upserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    };
  };
  return {
    supabase: {
      from,
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({ toast: h.toast }));

// A lista de conexões vem do hook do repositório (componente não importa o
// client do Supabase); o hook da Evolution API só é usado para ações, que esta
// aba não dispara — fica stubado como no teste do próprio useConnectionsManager.
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { MessagesSettings } from '../MessagesSettings';

function renderMessages() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MessagesSettings />
    </QueryClientProvider>,
  );
}

/** Abre a aba com a conexão padrão e devolve o campo da mensagem de ausência. */
async function abrirComAusenciaCarregada() {
  renderMessages();
  const campo = await screen.findByLabelText('Mensagem de Ausência');
  await waitFor(() =>
    expect(campo).toHaveValue('Estamos fora do horário. Voltamos amanhã!'),
  );
  return campo;
}

const botaoSalvar = () => screen.getByRole('button', { name: /Salvar Mensagem de Ausência/i });

describe('MessagesSettings — ausência no contrato por conexão (away_messages)', () => {
  beforeEach(() => {
    h.upserts = [];
    h.updates = [];
    h.consultasAway = [];
    h.erroNoUpsert = null;
    h.toast.mockClear();
  });

  it('editar e salvar grava em away_messages com o id da conexão e onConflict whatsapp_connection_id', async () => {
    const campo = await abrirComAusenciaCarregada();

    fireEvent.change(campo, { target: { value: 'Fechamos por hoje. Voltamos às 9h.' } });
    fireEvent.click(botaoSalvar());

    await waitFor(() => expect(h.upserts).toHaveLength(1));
    expect(h.upserts[0]?.table).toBe('away_messages');
    expect(h.upserts[0]?.payload).toEqual({
      whatsapp_connection_id: 'conn-vendas',
      content: 'Fechamos por hoje. Voltamos às 9h.',
      is_enabled: true,
    });
    expect(h.upserts[0]?.options).toEqual({ onConflict: 'whatsapp_connection_id' });
  });

  it('nenhuma escrita em user_settings (nem em business_hours) sai desta aba', async () => {
    const campo = await abrirComAusenciaCarregada();

    fireEvent.change(campo, { target: { value: 'Mensagem editada' } });
    fireEvent.click(botaoSalvar());

    await waitFor(() => expect(h.upserts.length).toBeGreaterThan(0));
    expect(h.upserts.map(u => u.table)).toEqual(['away_messages']);
    expect(h.upserts.filter(u => u.table === 'user_settings')).toHaveLength(0);
    expect(h.updates.filter(u => u.table === 'user_settings')).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it('trocar a conexão no seletor carrega e salva no contrato da outra conexão', async () => {
    await abrirComAusenciaCarregada();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conn-suporte' } });

    await waitFor(() => expect(h.consultasAway).toContain('conn-suporte'));
    await waitFor(() =>
      expect(screen.getByLabelText('Mensagem de Ausência')).toHaveValue(
        'Estamos fora do horário de atendimento. Retornaremos em breve!',
      ),
    );

    fireEvent.click(botaoSalvar());

    await waitFor(() => expect(h.upserts).toHaveLength(1));
    expect(h.upserts[0]?.table).toBe('away_messages');
    expect(h.upserts[0]?.payload).toMatchObject({
      whatsapp_connection_id: 'conn-suporte',
      content: 'Estamos fora do horário de atendimento. Retornaremos em breve!',
    });
  });

  it('falha do upsert aparece na tela e a mensagem editada não some', async () => {
    h.erroNoUpsert = new Error('falha de rede');
    const campo = await abrirComAusenciaCarregada();

    fireEvent.change(campo, { target: { value: 'Editada que não pode sumir' } });
    fireEvent.click(botaoSalvar());

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(screen.getByLabelText('Mensagem de Ausência')).toHaveValue('Editada que não pode sumir');
  });
});

describe('MessagesSettings — boas-vindas e encerramento como integração pendente', () => {
  beforeEach(() => {
    h.upserts = [];
    h.updates = [];
    h.consultasAway = [];
    h.erroNoUpsert = null;
    h.toast.mockClear();
  });

  it('os dois cartões pendentes aparecem com aviso e sem controle de edição', async () => {
    await abrirComAusenciaCarregada();

    expect(screen.getByText('Mensagem de Boas-Vindas')).toBeInTheDocument();
    expect(screen.getByText('Mensagem de Encerramento')).toBeInTheDocument();
    expect(screen.getAllByText(/Integração pendente/i).length).toBeGreaterThanOrEqual(2);

    // Só a mensagem de ausência tem campo de texto; os pendentes não têm editor.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByLabelText('Mensagem de Boas-Vindas')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mensagem de Encerramento')).not.toBeInTheDocument();
  });

  it('nenhum texto da aba promete envio automático', async () => {
    await abrirComAusenciaCarregada();

    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/Enviada automaticamente/i);
    expect(texto).not.toMatch(/Enviada ao finalizar/i);
    expect(texto).not.toMatch(/Enviada fora do horário/i);
  });
});
