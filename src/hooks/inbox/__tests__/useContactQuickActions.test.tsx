import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useContactQuickActions } from '../useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, unknown>,
    invokeError: null as { message: string } | null,
  };
  // `update` é a ÚNICA porta de escrita em `contacts` (era por ela que a
  // etiqueta de contato saía). Ele fica espionado para PROVAR que o hook não
  // persiste nada no contato em nenhum caminho.
  const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  // Cadeia de select usada pelo resolvedor de instância do useChatMediaSending:
  // select(...) → eq(...) → { maybeSingle | single | limit → maybeSingle }
  let currentTable = '';
  const terminal = (): Record<string, unknown> => ({
    maybeSingle: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    single: async () => ({ data: state.rows[currentTable] ?? null, error: null }),
    limit: () => terminal(),
  });
  const select = vi.fn(() => ({ eq: vi.fn(() => terminal()) }));
  const from = vi.fn((table: string) => {
    currentTable = table;
    return { update, select };
  });
  // supabase.functions.invoke — fronteira real do useEvolutionApiCore.callApi
  const invoke = vi.fn(async (_fn: string, _opts?: unknown) =>
    state.invokeError
      ? { data: null, error: state.invokeError }
      : { data: { ok: true }, error: null });
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, update, from, invoke, toast };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, functions: { invoke: h.invoke } },
}));
vi.mock('sonner', () => ({ toast: h.toast }));

// Fixture SEM o campo de marcador do contato: o hook do cartão pai (t_7aaefc5d)
// não lê nem grava etiquetas de contato, então o contato não precisa delas.
function makeContact(over: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'c1',
    name: 'Maria Silva',
    phone: '+55 00 00000-0000', // sintético: dígitos → 5500000000000
    conversation_status: 'open',
    ...over,
  };
}

/** Clica no "Desfazer" do último undoToast emitido (o toast é mockado). */
async function clickUndo() {
  const call = h.toast.mock.calls[h.toast.mock.calls.length - 1];
  expect(call?.[1]?.action?.onClick).toBeTypeOf('function');
  await act(async () => {
    call[1].action.onClick();
  });
}

const invokeCalls = () =>
  h.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body);

/** Todos os textos já mostrados ao usuário (toast direto + métodos do sonner). */
const toastTexts = () => {
  const texts: string[] = [];
  const push = (args: unknown[]) => {
    for (const a of args) {
      if (typeof a === 'string') texts.push(a);
      else if (a && typeof a === 'object') {
        for (const v of Object.values(a as Record<string, unknown>)) {
          if (typeof v === 'string') texts.push(v);
        }
      }
    }
  };
  push(h.toast.mock.calls.flat());
  for (const m of [h.toast.error, h.toast.info, h.toast.success, h.toast.warning]) {
    push(m.mock.calls.flat());
  }
  return texts.join(' | ');
};

describe('useContactQuickActions (ordem de 12/10: etiquetas de contato não existem)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.invokeError = null;
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: 'conn-1' },
      whatsapp_connections: { instance_id: 'inst-1' },
    };
  });

  it('expõe só a ação de bloqueio — sem VIP e sem as ações de etiqueta do painel', () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    expect(Object.keys(result.current)).toEqual(['block']);
    expect(result.current.block).toBeTypeOf('function');
    expect(result.current).not.toHaveProperty('addTag');
    expect(result.current).not.toHaveProperty('removeTag');
    expect(result.current).not.toHaveProperty('markVip');
    expect(result.current).not.toHaveProperty('removeVip');
  });

  it('block bloqueia de verdade na Evolution e NÃO persiste nada no contato', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await result.current.block();
    });
    // A instância é resolvida pelo fluxo real (contacts.whatsapp_connection_id
    // → whatsapp_connections.instance_id) e o bloqueio real vai para a edge.
    expect(h.from).toHaveBeenCalledWith('whatsapp_connections');
    expect(invokeCalls()).toContainEqual(
      expect.objectContaining({
        instanceName: 'inst-1',
        number: '5500000000000@s.whatsapp.net',
        status: 'block',
      }),
    );
    // Nenhuma escrita em `contacts` em nenhum momento.
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      'Maria Silva bloqueado',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }),
    );
  });

  it('o Desfazer do bloqueio desbloqueia de verdade na Evolution e não persiste nada', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await result.current.block();
    });
    await clickUndo();
    expect(invokeCalls().map((b) => b.status)).toEqual(['block', 'unblock']);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('block sem conexão resolvível: avisa e não chama a Evolution nem persiste', async () => {
    h.state.rows = {
      contacts: { assigned_to: 'agent-9', whatsapp_connection_id: null },
      whatsapp_connections: null, // nem a conexão do contato nem o fallback "connected"
    };
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await result.current.block();
    });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();
  });

  it('erro na chamada de bloqueio: avisa e não oferece Desfazer nem persiste', async () => {
    h.state.invokeError = { message: 'edge 500' };
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await result.current.block();
    });
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled(); // nenhum undoToast
    expect(h.update).not.toHaveBeenCalled();
  });

  it('dois cliques de Bloquear concorrentes disparam uma única chamada de bloqueio', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await Promise.all([result.current.block(), result.current.block()]);
    });
    expect(invokeCalls().filter((b) => b.status === 'block')).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('não expõe nenhum texto de etiqueta/marcador do contato nos avisos', async () => {
    const c = makeContact();
    const { result } = renderHook(() => useContactQuickActions(c));
    await act(async () => {
      await result.current.block();
    });
    const texto = toastTexts();
    expect(texto).not.toContain('VIP');
    expect(texto).not.toContain('Bloqueado');
    expect(texto.toLowerCase()).not.toContain('etiqueta');
    // O aviso fala do contato e do bloqueio real, não de um marcador.
    expect(texto).toContain('Maria Silva bloqueado');
  });
});
