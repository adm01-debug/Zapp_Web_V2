import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * PJ-06 — cartão "Canais no WhatsApp" na Sala de Crise: o eixo "canais ativos" do
 * monitor de realtime (paridade com o `ConnectionsHealthBlock` da
 * `AdminRealtimeMonitorPage` da V3).
 *
 * A prova é o que a TELA mostra, com o `CrisisRoom` REAL montado e o store global de
 * conexões (`useConnectionsHealth`) controlado pelo teste — a Sala de Crise não abre
 * assinatura de realtime própria, ela lê o estado que o app já mantém.
 *
 * Os outros quatro cartões ficam em estado saudável no teste (4 agentes online,
 * nenhuma pendência, nenhum SLA estourado) para que a ÚNICA métrica que varia seja a
 * das conexões: assim o banner de crise só pode vir dela.
 */

const { mockFrom, CONNECTIONS, PRESENCE } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  CONNECTIONS: {
    connections: [] as unknown[],
    loading: false,
    error: null as string | null,
  },
  PRESENCE: {
    u1: 'online',
    u2: 'online',
    u3: 'online',
    u4: 'online',
  } as Record<string, string>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => PRESENCE,
}));

vi.mock('@/hooks/connections/useConnectionsHealth', () => ({
  useConnectionsHealth: () => ({
    ...CONNECTIONS,
    history: [],
    reconnecting: null,
    reconnectingAll: false,
  }),
}));

import { CrisisRoom } from '@/components/admin/CrisisRoom';

/** Conexão como o store global entrega (status `connected` = saudável). */
const conn = (id: string, healthy: boolean) => ({
  id,
  name: id,
  phoneNumber: null,
  instanceId: id,
  status: healthy ? 'connected' : 'disconnected',
  isDefault: false,
  healthy,
});

const ENABLED_PROFILES = ['u1', 'u2', 'u3', 'u4'].map((user_id) => ({ user_id }));

function chainable(finalResponse: unknown) {
  const node: Record<string, unknown> = {};
  node.eq = () => node;
  node.in = () => node;
  node.gte = () => node;
  node.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(finalResponse).then(resolve);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return { select: () => chainable({ data: ENABLED_PROFILES, error: null }) };
    if (table === 'conversation_sla') return { select: () => chainable({ data: null, count: 0, error: null }) };
    return { select: () => chainable({ data: [], error: null }) };
  });
  CONNECTIONS.connections = [];
  CONNECTIONS.loading = false;
  CONNECTIONS.error = null;
});

/** Valor exibido no cartão cujo rótulo é `label` (o <p> do número precede o do rótulo). */
async function metricValue(label: string) {
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  const labelEl = screen.getByText(label);
  return labelEl.previousElementSibling?.textContent ?? null;
}

describe('CrisisRoom — canais de WhatsApp ativos (PJ-06)', () => {
  it('conta as conexões conectadas e mantém a operação normal com todas no ar', async () => {
    CONNECTIONS.connections = [conn('c-1', true), conn('c-2', true)];

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('2');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
    expect(screen.queryByText('Operação em estado crítico!')).not.toBeInTheDocument();
  });

  it('conexão fora do ar com as outras conectadas é atenção, não crise', async () => {
    CONNECTIONS.connections = [conn('c-1', true), conn('c-2', false)];

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('1');
    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(screen.queryByText('MODO CRISE ATIVO')).not.toBeInTheDocument();
  });

  it('nenhuma conexão conectada vira crise — ninguém recebe nem envia', async () => {
    CONNECTIONS.connections = [conn('c-1', false), conn('c-2', false)];

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('0');
    expect(screen.getByText('🔴 MODO CRISE ATIVO')).toBeInTheDocument();
    expect(screen.getByText('Operação em estado crítico!')).toBeInTheDocument();
  });

  it('sem conexão cadastrada o cartão é "não medido" (—), não zero e não alarme', async () => {
    CONNECTIONS.connections = [];

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('—');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
  });

  it('leitura pendente sai "não medido" (—), sem crise falsa', async () => {
    CONNECTIONS.connections = [conn('c-1', false)];
    CONNECTIONS.loading = true;

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('—');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
  });

  it('falha na leitura também sai "não medido" (—), sem crise falsa', async () => {
    CONNECTIONS.connections = [conn('c-1', false)];
    CONNECTIONS.error = 'falha ao ler whatsapp_connections';

    render(<CrisisRoom />);

    expect(await metricValue('Canais no WhatsApp')).toBe('—');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
  });
});
