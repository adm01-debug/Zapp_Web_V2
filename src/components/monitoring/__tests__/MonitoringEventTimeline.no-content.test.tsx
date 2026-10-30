import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O mock é criado no hoisted para sobreviver ao hoisting do vi.mock e ainda
// permitir inspecionar as colunas pedidas ao banco.
const mockState = vi.hoisted(() => {
  return {
    selects: {} as Record<string, string[]>,
    messages: [] as Array<Record<string, unknown>>,
    health: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const chainFor = (table: string) => {
    const chain = {
      select: (cols: string) => {
        mockState.selects[table] = [...(mockState.selects[table] ?? []), cols];
        return chain;
      },
      gte: () => chain,
      order: () => chain,
      limit: () =>
        Promise.resolve({
          data: table === 'messages' ? mockState.messages : mockState.health,
          error: null,
        }),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => chainFor(table),
    },
  };
});

import { MonitoringEventTimeline } from '@/components/monitoring/MonitoringEventTimeline';

describe('MonitoringEventTimeline — sem conteúdo de mensagem (LGPD)', () => {
  beforeEach(() => {
    mockState.selects = {};
    mockState.health = [];
    mockState.messages = [
      { id: 'm1', sender: 'contact', content: 'SEGREDO_LGPD_123', created_at: new Date().toISOString() },
      { id: 'm2', sender: 'agent', content: 'OUTRO_TEXTO_PRIVADO', created_at: new Date().toISOString() },
    ];
  });

  it('mostra direção e horário, mas nunca o texto da mensagem', async () => {
    render(<MonitoringEventTimeline />);

    // Direção/tipo continuam visíveis (o que o painel precisa mostrar).
    expect(await screen.findByText('Mensagem Recebida')).toBeInTheDocument();
    expect(screen.getByText('Mensagem Enviada')).toBeInTheDocument();

    // Nenhum trecho do conteúdo pode aparecer em qualquer lugar da linha do tempo.
    expect(screen.queryByText(/SEGREDO_LGPD_123/)).toBeNull();
    expect(screen.queryByText(/OUTRO_TEXTO_PRIVADO/)).toBeNull();
  });

  it('nem sequer pede a coluna de conteúdo das mensagens ao banco', async () => {
    render(<MonitoringEventTimeline />);

    await screen.findByText('Mensagem Recebida');

    const colunasMensagens = (mockState.selects['messages'] ?? []).join(',');
    expect(colunasMensagens).not.toContain('content');
  });
});
