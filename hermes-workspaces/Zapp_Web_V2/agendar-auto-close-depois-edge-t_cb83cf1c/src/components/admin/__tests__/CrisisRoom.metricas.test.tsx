import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * R2-AUTH-036 (item 260, P2) — Sala de Crise.
 *
 * Antes: `loadMetrics` tratava TODA mensagem `sender=contact` da última hora como
 * "sem resposta" (inclusive as já respondidas) e usava `profiles.is_active`
 * (conta habilitada) como se fosse presença de agente — tanto no cartão
 * "Agentes ativos" ("online") quanto no denominador da "Carga por agente"
 * (rotulada conv/agente). O payload abaixo tem mensagens todas respondidas e
 * contas habilitadas offline: nenhum desses proxies pode mexer no diagnóstico.
 *
 * A prova aqui é o que a tela MOSTRA (valor de cada cartão e banner de crise),
 * renderizando o componente real e deixando o efeito de montagem rodar.
 */

const { mockFrom, PRESENCE, FIXTURE } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  PRESENCE: {} as Record<string, string>,
  FIXTURE: {
    inbound: [] as unknown[],
    replies: [] as unknown[],
    profiles: [] as unknown[],
    slaCount: 0,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mesma origem de presença do Dashboard/War Room (`agent_presence`), não o cadastro.
vi.mock('@/hooks/crm/useAgentPresence', () => ({
  useAgentPresenceMap: () => PRESENCE,
}));

import { CrisisRoom } from '@/components/admin/CrisisRoom';

const MINUTE = 60_000;
const NOW = Date.now();

/** Mensagem recebida `minAgo` minutos atrás, já com `contact_id`. */
const inbound = (contactId: string, minAgo: number) => ({
  id: `in-${contactId}-${minAgo}`,
  contact_id: contactId,
  created_at: new Date(NOW - minAgo * MINUTE).toISOString(),
});

/** Resposta do atendimento — precisa ser POSTERIOR à recebida para tirá-la da pendência. */
const reply = (contactId: string, minAgo: number) => ({
  contact_id: contactId,
  created_at: new Date(NOW - minAgo * MINUTE).toISOString(),
});

const enabledAccount = (userId: string) => ({ user_id: userId });

function setPresence(map: Record<string, string>) {
  for (const key of Object.keys(PRESENCE)) delete PRESENCE[key];
  Object.assign(PRESENCE, map);
}

function setupFixture(input: {
  inbound: unknown[];
  replies?: unknown[];
  profiles: unknown[];
  online?: string[];
  awayOffline?: string[];
  slaCount?: number;
}) {
  FIXTURE.inbound = input.inbound;
  FIXTURE.replies = input.replies ?? [];
  FIXTURE.profiles = input.profiles;
  FIXTURE.slaCount = input.slaCount ?? 0;
  setPresence({
    ...Object.fromEntries((input.online ?? []).map(id => [id, 'online'])),
    ...Object.fromEntries((input.awayOffline ?? []).map(id => [id, 'offline'])),
  });
}

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
    if (table === 'messages') {
      let sender: string | null = null;
      return {
        select: (_columns?: unknown, options?: { count?: string; head?: boolean }) => {
          const node: Record<string, unknown> = {};
          node.eq = (column: string, value: string) => {
            if (column === 'sender') sender = value;
            return node;
          };
          node.gte = () => node;
          node.then = (resolve: (value: unknown) => unknown) => {
            // A consulta antiga era `select('id',{count:'exact',head:true})`: o
            // servidor devolve `count`, não linhas. Entregar o count real mantém
            // a versão antiga com o valor DEFEITUOSO (todo sender=contact da hora).
            if (options?.head) {
              return Promise.resolve({
                data: null,
                count: FIXTURE.inbound.length,
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({
              data: sender === 'agent' ? FIXTURE.replies : FIXTURE.inbound,
              error: null,
            }).then(resolve);
          };
          return node;
        },
      };
    }
    if (table === 'profiles') {
      // A consulta antiga era `select('id',{count:'exact',head:true})` e usava `count`
      // (contas habilitadas). Devolver o count real mantém a versão antiga com o
      // valor DEFEITUOSO em vez de zero por formato de mock.
      return {
        select: (_columns?: unknown, options?: { count?: string; head?: boolean }) =>
          chainable(options?.head
            ? { data: null, count: FIXTURE.profiles.length, error: null }
            : { data: FIXTURE.profiles, error: null }),
      };
    }
    if (table === 'conversation_sla') {
      return { select: () => chainable({ data: null, count: FIXTURE.slaCount, error: null }) };
    }
    return { select: () => chainable({ data: [], error: null }) };
  });
});

/** Valor exibido no cartão cujo rótulo é `label` (o <p> do número precede o do rótulo). */
async function metricValue(label: string) {
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  const labelEl = screen.getByText(label);
  return labelEl.previousElementSibling?.textContent ?? null;
}

describe('CrisisRoom — pendência e presença reais, não proxies (R2-AUTH-036)', () => {
  it('mensagem já respondida na última hora não conta como "sem resposta"', async () => {
    // 40 mensagens recebidas em 8 conversas, TODAS com resposta posterior.
    const contacts = Array.from({ length: 8 }, (_, i) => `c-${i}`);
    const unansweredBox: unknown[] = [];
    const repliesBox: unknown[] = [];
    contacts.forEach((contactId, i) => {
      for (let n = 0; n < 5; n += 1) {
        unansweredBox.push(inbound(contactId, 50 - n));
        repliesBox.push(reply(contactId, 49 - n));
      }
    });
    setupFixture({
      inbound: unansweredBox,
      replies: repliesBox,
      profiles: ['u-1', 'u-2', 'u-3', 'u-4'].map(enabledAccount),
      online: ['u-1', 'u-2', 'u-3', 'u-4'],
    });

    render(<CrisisRoom />);

    // Antes do conserto: 40 (todo sender=contact da hora) -> "Crítico" -> banner de crise.
    expect(await metricValue('Msgs sem resposta (1h)')).toBe('0');
    expect(await metricValue('Agentes ativos')).toBe('4');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
    expect(screen.queryByText('Operação em estado crítico!')).not.toBeInTheDocument();
  });

  it('conta habilitada sem presença online não é agente ativo', async () => {
    setupFixture({
      inbound: [],
      profiles: ['u-1', 'u-2', 'u-3'].map(enabledAccount),
      online: ['u-1'],
      awayOffline: ['u-2', 'u-3'],
    });

    render(<CrisisRoom />);

    // Antes do conserto: 3 (profiles.is_active) e a operação aparecia como normal.
    expect(await metricValue('Agentes ativos')).toBe('1');
    expect(screen.getByText('🔴 MODO CRISE ATIVO')).toBeInTheDocument();
    expect(screen.getByText('Operação em estado crítico!')).toBeInTheDocument();
  });

  it('conta só a pendência real e divide a carga por agente online', async () => {
    setupFixture({
      inbound: [
        inbound('c-a', 40), inbound('c-a', 30), // respondidas
        inbound('c-b', 25), inbound('c-b', 20), // pendentes (mesma conversa)
        inbound('c-c', 10),                     // pendente
      ],
      replies: [reply('c-a', 35), reply('c-a', 28)],
      profiles: ['u-1', 'u-2'].map(enabledAccount),
      online: ['u-1', 'u-2'],
    });

    render(<CrisisRoom />);

    // 3 mensagens pendentes (2 já respondidas ficam de fora) / 2 agentes online -> 1
    expect(await metricValue('Msgs sem resposta (1h)')).toBe('3');
    expect(await metricValue('Carga por agente')).toBe('1');
  });

  it('sem agente online a carga não é medida — sai "—", não zero', async () => {
    setupFixture({
      inbound: [inbound('c-a', 10)],
      profiles: ['u-1', 'u-2'].map(enabledAccount),
      awayOffline: ['u-1', 'u-2'],
    });

    render(<CrisisRoom />);

    // Antes do conserto: round(1 / 2 contas habilitadas) = 1 no cartão "conv/agente".
    expect(await metricValue('Carga por agente')).toBe('—');
    expect(await metricValue('Agentes ativos')).toBe('0');
  });
});
