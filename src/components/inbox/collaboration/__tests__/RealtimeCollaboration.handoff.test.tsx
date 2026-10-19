/**
 * t_90d875a4 — regressão do falso "Conversa transferida com sucesso!" no
 * painel do contato (segundo caminho de transferência, além do chat).
 *
 * Antes: `update({ assigned_to })` sem ler `error` nem as linhas afetadas e
 * insert em `contact_notes` sem conferência — clique negado pela policy
 * falhava em silêncio e o diálogo anunciava sucesso.
 *
 * Agora: a transferência passa pela MESMA RPC atômica do chat
 * (`transfer_conversation`, migration 20261005185729) e qualquer falha
 * rejeita; a nota interna é conferida à parte e vira sucesso PARCIAL
 * (`{ noteSaved: false }`), nunca "sucesso".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HandoffResult } from '../HandoffDialog';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { RealtimeCollaboration } from '../../RealtimeCollaboration';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  warn: vi.fn(),
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: [string, Record<string, unknown>]) => {
      mocks.rpcCalls.push({ name: args[0], args: args[1] });
      return mocks.rpc(...args);
    },
    from: (...args: [string]) => mocks.from(...args),
    auth: { getUser: (...args: []) => mocks.getUser(...args) },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: (...args: unknown[]) => mocks.warn(...args), error: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('../ViewersIndicator', () => ({ ViewersIndicator: () => null }));
vi.mock('../InternalNotesPanel', () => ({ InternalNotesPanel: () => null }));

type OnHandoff = (agentId: string, comment: string) => Promise<HandoffResult>;
let capturedOnHandoff: OnHandoff | null = null;
let capturedQueueId: string | null | undefined;
vi.mock('../HandoffDialog', () => ({
  HandoffDialog: (props: { onHandoff: OnHandoff; queueId?: string | null }) => {
    capturedOnHandoff = props.onHandoff;
    capturedQueueId = props.queueId;
    return null;
  },
}));

const CONTACT_ID = '11111111-1111-1111-1111-111111111111';
const AUTH_USER_ID = 'auth-user-1';

let invalidateSpy = vi.fn();

function renderComponent(contactId = CONTACT_ID) {
  const qc = new QueryClient();
  invalidateSpy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  return render(
    <QueryClientProvider client={qc}>
      <RealtimeCollaboration contactId={contactId} />
    </QueryClientProvider>
  );
}

/** Cadeia de `contacts` usada pela leitura da fila do contato (filtro do diálogo). */
const CONTACTS_TABLE = () => ({
  select: () => ({
    eq: () => ({
      maybeSingle: () => Promise.resolve({ data: { queue_id: 'queue-1' }, error: null }),
    }),
  }),
});

/** Cada tabela com a cadeia que o componente usa (a de `contacts` é padrão). */
function mockTables(tables: Record<string, () => unknown>) {
  const all: Record<string, () => unknown> = { contacts: CONTACTS_TABLE, ...tables };
  mocks.from.mockImplementation((table: string) => {
    const handler = all[table];
    if (!handler) throw new Error(`tabela inesperada no teste: ${table}`);
    return handler();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnHandoff = null;
  capturedQueueId = undefined;
  mocks.rpcCalls.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } } });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'contacts') return CONTACTS_TABLE();
    throw new Error(`tabela inesperada no teste: ${table}`);
  });
});

describe('RealtimeCollaboration — handleHandoff pelo painel do contato', () => {
  it('ID de contato que não é UUID: rejeita e não chama a RPC', async () => {
    renderComponent('(11) 99999-9999');
    expect(capturedOnHandoff).toBeTruthy();

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toThrow(
      'ID de contato inválido para transferência.'
    );
    expect(mocks.rpcCalls).toHaveLength(0);
  });

  it('permissão negada na RPC (RLS): rejeita com o erro real da RPC', async () => {
    renderComponent();
    const rlsError = new Error('Contato nao encontrado ou sem permissao para transferir.');
    mocks.rpc.mockResolvedValue({ data: null, error: rlsError });

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toBe(rlsError);
  });

  it('RPC sem evento gravado (zero linhas): rejeita em vez de fingir sucesso', async () => {
    renderComponent();
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(capturedOnHandoff!('agent-1', '')).rejects.toThrow(
      'Nenhuma transferência foi gravada.'
    );
  });

  it('sucesso sem comentário: RPC com o agente de destino e noteSaved=true, sem tocar na nota', async () => {
    renderComponent();
    mocks.rpc.mockResolvedValue({ data: 'evt-1', error: null });

    await expect(capturedOnHandoff!('agent-1', '')).resolves.toEqual({ noteSaved: true });

    expect(mocks.rpcCalls).toEqual([
      {
        name: 'transfer_conversation',
        args: {
          p_contact_id: CONTACT_ID,
          p_to_agent_id: 'agent-1',
          p_to_queue_id: null,
          p_note: null,
        },
      },
    ]);
    // Sem comentário, nenhuma tabela de nota é tocada — o único `from` é a
    // leitura da fila do contato que alimenta o filtro do diálogo.
    expect(mocks.from.mock.calls.map((c) => c[0])).toEqual(['contacts']);
    await waitFor(() => expect(capturedQueueId).toBe('queue-1'));
  });

  it('sucesso com nota salva: grava "Transferido: …" e invalida o painel de notas', async () => {
    renderComponent();
    mocks.rpc.mockResolvedValue({ data: 'evt-1', error: null });
    const noteInserts: Record<string, unknown>[] = [];
    mockTables({
      profiles: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'me-profile' }, error: null }) }) }),
      }),
      contact_notes: () => ({
        insert: (row: Record<string, unknown>) => {
          noteInserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    });

    await expect(capturedOnHandoff!('agent-1', 'cliente vip')).resolves.toEqual({ noteSaved: true });

    expect(noteInserts).toEqual([
      { contact_id: CONTACT_ID, author_id: 'me-profile', content: 'Transferido: cliente vip' },
    ]);
    // A transferência mexeu em assigned_to/fila: contadores das abas e as duas
    // famílias de notas precisam ser relidos.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contact-notes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['internal-notes', CONTACT_ID] });
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('transferência gravada mas insert da nota falha: sucesso parcial noteSaved=false', async () => {
    renderComponent();
    mocks.rpc.mockResolvedValue({ data: 'evt-1', error: null });
    mockTables({
      profiles: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'me-profile' }, error: null }) }) }),
      }),
      contact_notes: () => ({
        insert: () => Promise.resolve({ error: new Error('permission denied for table contact_notes') }),
      }),
    });

    await expect(capturedOnHandoff!('agent-1', 'cliente vip')).resolves.toEqual({ noteSaved: false });
    // A transferência FOI gravada (só a nota falhou): as caches derivadas do
    // contato são invalidadas mesmo assim — antes só o caminho de nota salva
    // invalidava, deixando os contadores das abas velhos.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contact-notes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['internal-notes', CONTACT_ID] });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it('perfil do atendente não encontrado: sucesso parcial, sem insert de nota', async () => {
    renderComponent();
    mocks.rpc.mockResolvedValue({ data: 'evt-1', error: null });
    mockTables({
      profiles: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      }),
    });

    await expect(capturedOnHandoff!('agent-1', 'cliente vip')).resolves.toEqual({ noteSaved: false });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });
});
