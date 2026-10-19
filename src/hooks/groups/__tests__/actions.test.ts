/**
 * Testes do envio em massa de grupos (`handleBroadcast` do `useGroupActions`).
 *
 * O alvo é o HOOK REAL. A fronteira dublada é a rede (o cliente Supabase), o toast e o
 * logger — o dublê da RPC grava os argumentos de cada chamada, então os casos provam o
 * que o hook manda para o banco, não o que a tela mostra.
 *
 * Antes desta rodada o laço chamava a `evolution-api` aqui dentro, um grupo por vez, com
 * 2 s de pausa entre eles: fechar a aba, trocar de rota ou perder a rede matava os grupos
 * restantes sem registro. Agora cada grupo vira uma linha em `public.messages` pela RPC
 * `enqueue_group_outbound_message` e quem entrega é a fila do servidor.
 *
 * Casos cobertos: fan-out de uma RPC por grupo ANTES de qualquer resposta (a pausa de 2 s
 * e a chamada direta à Evolution não existem mais), resultado por grupo na falha parcial,
 * tentativa preservada quando NENHUM grupo entra na fila, idempotência do `client_message_id`
 * (mesmo texto + mesmo grupo reusa o id; texto novo ou TTL vencido geram id novo) e o
 * registro de auditoria sem o texto da mensagem.
 *
 * Fuso horário e paginação não se aplicam (não há data exibida nem leitura paginada aqui);
 * o "tempo" que importa é o TTL do mapa de idempotência, controlado por `Date.now`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { WhatsAppGroup, WhatsAppConnection } from '@/hooks/groups/types';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  rpc: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/logger', () => ({
  log: { info: mocks.logInfo, error: mocks.logError, warn: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({ warning: vi.fn(), withFeedback: vi.fn(async (fn: () => Promise<void>) => { await fn(); }) }),
}));

import { useGroupActions, BROADCAST_ACTION_TTL_MS } from '@/hooks/groups/actions';

const MENSAGEM = 'Aviso da semana: fechamos às 18h.';

function grupo(id: string, nome = `Grupo ${id}`): WhatsAppGroup {
  return {
    id, whatsapp_connection_id: 'c1', group_id: `${id}@g.us`, name: nome,
    description: null, participant_count: 3, avatar_url: null, is_admin: true,
    created_at: '2026-01-01', category: null,
  };
}

const conexao: WhatsAppConnection = { id: 'c1', name: 'WPP', phone_number: '5511', instance_id: 'inst-1' };

function montarHook(grupos: WhatsAppGroup[], selecionadas: string[]) {
  const setSelectedGroups = vi.fn();
  const utils = renderHook(() => useGroupActions({
    connections: [conexao], groups: grupos, selectedGroups: new Set(selecionadas),
    setGroups: vi.fn(), setSelectedGroups, fetchGroups: vi.fn(async () => {}),
  }));
  return { ...utils, setSelectedGroups };
}

interface ArgsEnfileiramento {
  p_group_id: string;
  p_client_message_id: string;
  p_content: string;
  p_whatsapp_connection_id?: string;
}

function argsDaChamada(indice: number): ArgsEnfileiramento {
  return mocks.rpc.mock.calls[indice][1] as ArgsEnfileiramento;
}

/** Promessa sob controle: só resolve quando o teste mandar. */
function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((res) => { resolver = res; });
  return { promessa, resolver };
}

describe('useGroupActions — envio em massa de grupos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.invoke.mockReset();
  });

  it('enfileira TODOS os grupos antes de qualquer resposta, sem chamar a Evolution', async () => {
    const pendentes = [adiada<unknown>(), adiada<unknown>()];
    mocks.rpc.mockImplementationOnce(() => pendentes[0].promessa).mockImplementationOnce(() => pendentes[1].promessa);
    const { result } = montarHook([grupo('ga', 'Grupo A'), grupo('gb', 'Grupo B')], ['ga', 'gb']);

    let execucao!: Promise<unknown>;
    await act(async () => {
      execucao = result.current.handleBroadcast(MENSAGEM);
      // Um único flush de microtarefas: o laço antigo (com 2 s de pausa) teria
      // disparado no máximo UMA chamada e ficado preso esperando o relógio.
      await Promise.resolve();
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.map((_, i) => argsDaChamada(i).p_group_id)).toEqual(['ga', 'gb']);
    expect(argsDaChamada(0).p_content).toBe(MENSAGEM);
    expect(argsDaChamada(0).p_whatsapp_connection_id).toBe('c1');
    // A aba não fala mais com a Evolution: quem entrega é a fila do servidor.
    expect(mocks.invoke).not.toHaveBeenCalled();

    pendentes.forEach((p) => p.resolver({ data: { id: 'msg-1' }, error: null }));
    await act(async () => { await execucao; });

    expect(mocks.toast.success).toHaveBeenCalledWith('2 grupo(s) na fila — o envio continua mesmo se você fechar a aba');
  });

  it('devolve o resultado POR GRUPO e não descarta a falha parcial', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { id: 'msg-a' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('sem conexão de WhatsApp') });
    const { result, setSelectedGroups } = montarHook([grupo('gc', 'Grupo C'), grupo('gd', 'Grupo D')], ['gc', 'gd']);

    let resultado!: Awaited<ReturnType<typeof result.current.handleBroadcast>>;
    await act(async () => { resultado = await result.current.handleBroadcast(MENSAGEM); });

    expect(resultado?.sent).toBe(1);
    expect(resultado?.failed).toBe(1);
    expect(resultado?.results).toEqual([
      { groupId: 'gc', name: 'Grupo C', status: 'queued', messageId: 'msg-a' },
      { groupId: 'gd', name: 'Grupo D', status: 'failed' },
    ]);
    // O aviso nomeia quem falhou, e não promete que nada foi mantido.
    expect(mocks.toast.warning).toHaveBeenCalledWith('1 grupo(s) na fila, 1 falha(s): Grupo D');
    expect(mocks.toast.warning.mock.calls[0][0]).not.toMatch(/mantid/i);
    // A falha do grupo D fica no log com o nome do grupo — sem o texto da mensagem.
    expect(mocks.logError).toHaveBeenCalledWith('Falha ao enfileirar o envio ao grupo Grupo D:', expect.anything());
    // Alguém entrou na fila: a tentativa termina e a seleção inteira é descartada.
    expect(setSelectedGroups).toHaveBeenCalledWith(new Set());
  });

  it('preserva mensagem e seleção quando NENHUM grupo entra na fila', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('sem conexão de WhatsApp') });
    const { result, setSelectedGroups } = montarHook([grupo('ge', 'Grupo E')], ['ge']);

    let resultado!: Awaited<ReturnType<typeof result.current.handleBroadcast>>;
    await act(async () => { resultado = await result.current.handleBroadcast(MENSAGEM); });

    expect(resultado?.sent).toBe(0);
    expect(setSelectedGroups).not.toHaveBeenCalled();
    expect(mocks.toast.warning).toHaveBeenCalledWith('Nenhum grupo entrou na fila (1 falha(s)) — mensagem e seleção mantidas');
  });

  it('reusa o client_message_id no reenvio da MESMA mensagem ao MESMO grupo (a fila não duplica)', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'msg-reuso' }, error: null });
    const { result } = montarHook([grupo('gf', 'Grupo F')], ['gf']);

    await act(async () => { await result.current.handleBroadcast(MENSAGEM); });
    const primeiro = argsDaChamada(0).p_client_message_id;

    // Segundo clique (retry de rede, duplo clique ou reenvio imediato): mesma ação.
    let reenvio!: Awaited<ReturnType<typeof result.current.handleBroadcast>>;
    await act(async () => { await result.current.handleBroadcast(MENSAGEM); });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(argsDaChamada(1).p_client_message_id).toBe(primeiro);
    // Mesmo id → a RPC acha a linha pelo índice único e devolve a MESMA linha:
    // o cliente recebe o registro que já existe, não um segundo.
    await act(async () => { reenvio = await result.current.handleBroadcast(MENSAGEM); });
    expect(reenvio?.results[0].messageId).toBe('msg-reuso');
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(argsDaChamada(2).p_client_message_id).toBe(primeiro);
  });

  it('gera id NOVO para texto novo e depois do TTL (o reenvio deliberado continua possível)', async () => {
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    mocks.rpc.mockResolvedValue({ data: { id: 'msg-novo' }, error: null });
    const { result } = montarHook([grupo('gg', 'Grupo G')], ['gg']);

    await act(async () => { await result.current.handleBroadcast(MENSAGEM); });
    const primeiro = argsDaChamada(0).p_client_message_id;

    await act(async () => { await result.current.handleBroadcast('Outro aviso'); });
    expect(argsDaChamada(1).p_client_message_id).not.toBe(primeiro);

    relogio.mockReturnValue(1_700_000_000_000 + BROADCAST_ACTION_TTL_MS + 1);
    await act(async () => { await result.current.handleBroadcast(MENSAGEM); });
    expect(argsDaChamada(2).p_client_message_id).not.toBe(primeiro);

    relogio.mockRestore();
  });

  it('registra a auditoria sem o texto da mensagem', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'msg-h' }, error: null });
    const { result } = montarHook([grupo('gh', 'Grupo H')], ['gh']);

    await act(async () => { await result.current.handleBroadcast(MENSAGEM); });

    expect(mocks.logInfo).toHaveBeenCalledWith(
      'Broadcast de grupos: 1 enfileirado(s), 0 falha(s) de 1 grupo(s) selecionado(s)',
    );
    const registros = [...mocks.logInfo.mock.calls, ...mocks.logError.mock.calls]
      .map((chamada) => JSON.stringify(chamada)).join(' ');
    expect(registros).not.toContain(MENSAGEM);
  });

  it('não enfileira nada sem texto ou sem grupo selecionado', async () => {
    const semTexto = montarHook([grupo('gi', 'Grupo I')], ['gi']);
    await act(async () => { await semTexto.result.current.handleBroadcast('   '); });

    const semSelecao = montarHook([grupo('gj', 'Grupo J')], []);
    await act(async () => { await semSelecao.result.current.handleBroadcast(MENSAGEM); });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenNthCalledWith(1, 'Digite uma mensagem');
    expect(mocks.toast.error).toHaveBeenNthCalledWith(2, 'Selecione pelo menos um grupo');
  });
});
