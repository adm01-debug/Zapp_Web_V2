/**
 * Testes da sincronização de grupos (`handleAutoSync` do `useGroupActions`).
 *
 * O alvo é o HOOK REAL; a fronteira dublada é a rede (cliente Supabase + functions.invoke),
 * o toast e o logger. O dublê do `upsert` grava cada chamada, então os casos provam
 * QUANTAS idas ao banco o hook faz e com que linhas — não o que a tela mostra.
 *
 * Antes: um `upsert` POR GRUPO (221 grupos = 221 idas, uma por grupo em cada conexão).
 * Agora: as linhas de todas as conexões são reunidas e vão em UM `upsert(rows, {
 * onConflict: 'group_id' })`. O contador de falhas continua no aviso: falha de conexão
 * (invoke recusado / recusa da Evolution) conta 1, e lote recusado conta as linhas que
 * não foram gravadas.
 *
 * Casos cobertos: 1 chamada para N grupos, deduplicação da MESMA chave no lote (o
 * `ON CONFLICT` recusaria o lote inteiro com a chave repetida), falha parcial de conexão
 * no aviso, lote recusado contando as linhas perdidas e grupo sem identificador ignorado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { WhatsAppGroup, WhatsAppConnection } from '@/hooks/groups/types';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  invoke: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke } },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/logger', () => ({
  log: { info: mocks.logInfo, error: mocks.logError, warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({ warning: vi.fn(), withFeedback: vi.fn(async (fn: () => Promise<void>) => { await fn(); }) }),
}));

import { useGroupActions } from '@/hooks/groups/actions';

let upsertResult: Record<string, unknown> = { error: null };

function conexao(id: string, instance = `inst-${id}`): WhatsAppConnection {
  return { id, name: `WPP ${id}`, phone_number: '5511', instance_id: instance };
}

/** Grupo no shape da Evolution v2: { id, subject, desc, size, announce }. */
function grupoDaApi(id: string, subject = `Grupo ${id}`) {
  return { id: `${id}@g.us`, subject, desc: null, size: 3, announce: false };
}

function montarHook(connections: WhatsAppConnection[]) {
  const setGroups = vi.fn();
  const fetchGroups = vi.fn(async () => {});
  const utils = renderHook(() => useGroupActions({
    connections,
    groups: [] as WhatsAppGroup[],
    selectedGroups: new Set<string>(),
    setGroups,
    setSelectedGroups: vi.fn(),
    fetchGroups,
  }));
  return { ...utils, fetchGroups };
}

/** Cada conexão recebe o seu próprio lote de grupos. */
function responderPorConexao(porConexao: Record<string, unknown>) {
  mocks.invoke.mockImplementation(async (_fn: string, args: { body: { instanceName: string } }) => ({
    data: porConexao[args.body.instanceName] ?? [],
    error: null,
  }));
}

function linhasDoUpsert(indice = 0): Array<Record<string, unknown>> {
  return mocks.upsert.mock.calls[indice][0] as Array<Record<string, unknown>>;
}

describe('useGroupActions — sincronização de grupos em um lote só', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockReset();
    mocks.upsert.mockReset();
    upsertResult = { error: null };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'whatsapp_groups') {
        // `.upsert()` sem `.select()` é thenable: devolve { error } direto.
        mocks.upsert.mockImplementation(() => Promise.resolve(upsertResult));
        return { upsert: mocks.upsert };
      }
      return { upsert: vi.fn(() => Promise.resolve({ error: null })) };
    });
  });

  it('grava N grupos de 2 conexões em UMA única chamada de upsert', async () => {
    responderPorConexao({
      'inst-a': [grupoDaApi('ga', 'Grupo A'), grupoDaApi('gb', 'Grupo B')],
      'inst-b': [grupoDaApi('gc', 'Grupo C')],
    });
    const { result } = montarHook([conexao('a'), conexao('b')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][1]).toEqual({ onConflict: 'group_id' });
    const linhas = linhasDoUpsert();
    expect(linhas).toHaveLength(3);
    expect(linhas.map(l => l.group_id)).toEqual(['ga@g.us', 'gb@g.us', 'gc@g.us']);
    // A conexão de origem continua em cada linha (escopo por conexão).
    expect(linhas.map(l => l.whatsapp_connection_id)).toEqual(['a', 'a', 'b']);
    expect(linhas[0]).toMatchObject({
      name: 'Grupo A', participant_count: 3, is_admin: false,
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('3 grupo(s) sincronizados!');
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it('a mesma chave vinda das DUAS conexões entra UMA vez no lote', async () => {
    // Duas conexões no mesmo WhatsApp devolvem o mesmo grupo: com a chave repetida o
    // ON CONFLICT recusaria o lote INTEIRO ("cannot affect row a second time").
    responderPorConexao({
      'inst-a': [grupoDaApi('ga', 'Grupo A')],
      'inst-b': [grupoDaApi('ga', 'Grupo A')],
    });
    const { result } = montarHook([conexao('a'), conexao('b')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const linhas = linhasDoUpsert();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].group_id).toBe('ga@g.us');
    // A última conexão a devolver o grupo é dona da linha (mesma regra do upsert por grupo).
    expect(linhas[0].whatsapp_connection_id).toBe('b');
  });

  it('conexão que falha não impede o lote das outras e conta 1 no aviso', async () => {
    mocks.invoke.mockImplementation(async (_fn: string, args: { body: { instanceName: string } }) => {
      if (args.body.instanceName === 'inst-a') return { data: null, error: new Error('sem conexão') };
      return { data: [grupoDaApi('gc', 'Grupo C')], error: null };
    });
    const { result } = montarHook([conexao('a'), conexao('b')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(linhasDoUpsert().map(l => l.group_id)).toEqual(['gc@g.us']);
    expect(mocks.toast.warning).toHaveBeenCalledWith('Sincronização parcial: 1 grupos, 1 erro(s)');
  });

  it('recusa da Evolution (HTTP 200 com erro no corpo) conta erro e não entra no lote', async () => {
    mocks.invoke.mockImplementation(async (_fn: string, args: { body: { instanceName: string } }) => {
      if (args.body.instanceName === 'inst-a') return { data: { error: true, message: 'instance not found' }, error: null };
      return { data: [grupoDaApi('gc', 'Grupo C')], error: null };
    });
    const { result } = montarHook([conexao('a'), conexao('b')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(linhasDoUpsert().map(l => l.group_id)).toEqual(['gc@g.us']);
    expect(mocks.toast.warning).toHaveBeenCalledWith('Sincronização parcial: 1 grupos, 1 erro(s)');
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('lote recusado pelo banco conta as LINHAS perdidas no aviso', async () => {
    upsertResult = { error: { message: 'permission denied' } };
    responderPorConexao({
      'inst-a': [grupoDaApi('ga'), grupoDaApi('gb')],
      'inst-b': [grupoDaApi('gc')],
    });
    const { result } = montarHook([conexao('a'), conexao('b')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning).toHaveBeenCalledWith('Sincronização parcial: 0 grupos, 3 erro(s)');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('grupo sem identificador é ignorado e não entra no lote', async () => {
    responderPorConexao({
      'inst-a': [{ subject: 'Sem id' }, grupoDaApi('gb', 'Grupo B')],
    });
    const { result } = montarHook([conexao('a')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(linhasDoUpsert().map(l => l.group_id)).toEqual(['gb@g.us']);
    expect(mocks.toast.success).toHaveBeenCalledWith('1 grupo(s) sincronizados!');
  });

  it('conexão sem instance_id não é consultada e o lote fica vazio', async () => {
    const { result } = montarHook([conexao('a', '')]);

    await act(async () => { await result.current.handleAutoSync(vi.fn()); });

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
