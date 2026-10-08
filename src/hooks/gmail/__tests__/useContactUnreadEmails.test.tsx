import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * U02 — contagem de e-mails não lidos de UM contato.
 *
 * O teste chama o hook REAL; só o cliente Supabase é falso, e o falso registra a
 * consulta (tabela, colunas, filtros), guarda o canal de tempo real e deixa o teste
 * controlar a ORDEM das respostas — é assim que a corrida é provada.
 */

type ResultadoConsulta = { count: number | null; error: unknown };

interface ConsultaRegistrada {
  tabela: string;
  selectArgs: unknown[];
  filtros: Array<[string, unknown]>;
  resolver: (resultado: ResultadoConsulta) => void;
}

interface PayloadRealtime {
  eventType?: string;
  new?: { contact_id?: string | null } | null;
  old?: { contact_id?: string | null } | null;
}

interface CanalRegistrado {
  topico: string;
  evento?: string;
  config?: Record<string, unknown>;
  callback?: (payload: PayloadRealtime) => void;
  inscrito: boolean;
  removido: boolean;
}

interface ConsultaBuilder {
  select: (...args: unknown[]) => ConsultaBuilder;
  eq: (coluna: string, valor: unknown) => ConsultaBuilder;
  then: (
    onFulfilled: (valor: ResultadoConsulta) => unknown,
    onRejected?: (erro: unknown) => unknown,
  ) => Promise<unknown>;
}

interface CanalBuilder {
  on: (
    evento: string,
    config: Record<string, unknown>,
    callback: (payload: PayloadRealtime) => void,
  ) => CanalBuilder;
  subscribe: () => CanalBuilder;
}

const estado = vi.hoisted(() => {
  const consultas: ConsultaRegistrada[] = [];
  const canais: CanalRegistrado[] = [];
  const registroPorCanal = new Map<object, CanalRegistrado>();

  function criarConsulta(tabela: string): ConsultaBuilder {
    let resolver: ((resultado: ResultadoConsulta) => void) | null = null;
    const pendente = new Promise<ResultadoConsulta>((resolve) => { resolver = resolve; });
    const registro: ConsultaRegistrada = {
      tabela,
      selectArgs: [],
      filtros: [],
      resolver: (resultado) => resolver?.(resultado),
    };
    consultas.push(registro);

    const builder: ConsultaBuilder = {
      select: (...args: unknown[]) => { registro.selectArgs = args; return builder; },
      eq: (coluna: string, valor: unknown) => { registro.filtros.push([coluna, valor]); return builder; },
      then: (onFulfilled, onRejected) => pendente.then(onFulfilled, onRejected),
    };
    return builder;
  }

  function criarCanal(topico: string): CanalBuilder {
    const registro: CanalRegistrado = { topico, inscrito: false, removido: false };
    canais.push(registro);

    const builder: CanalBuilder = {
      on: (evento, config, callback) => {
        registro.evento = evento;
        registro.config = config;
        registro.callback = callback;
        return builder;
      },
      subscribe: () => { registro.inscrito = true; return builder; },
    };
    registroPorCanal.set(builder as object, registro);
    return builder;
  }

  function removerCanal(canal: unknown): Promise<string> {
    const registro = typeof canal === 'object' && canal !== null
      ? registroPorCanal.get(canal)
      : undefined;
    if (registro) registro.removido = true;
    return Promise.resolve('ok');
  }

  return { consultas, canais, criarConsulta, criarCanal, removerCanal };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => estado.criarConsulta(tabela),
    channel: (topico: string) => estado.criarCanal(topico),
    removeChannel: (canal: unknown) => estado.removerCanal(canal),
  },
}));

import { useContactUnreadEmails } from '@/hooks/gmail/useContactUnreadEmails';

const consultas = () => estado.consultas as ConsultaRegistrada[];
const canais = () => estado.canais as CanalRegistrado[];

/** Emite um evento do canal realtime dentro de act (sem esperar o debounce). */
function emitir(indice: number, payload: PayloadRealtime) {
  const canal = canais()[indice];
  if (!canal.callback) throw new Error('canal sem listener registrado');
  act(() => { canal.callback?.(payload); });
}

beforeEach(() => {
  estado.consultas.length = 0;
  estado.canais.length = 0;
});

describe('useContactUnreadEmails — contagem de não lidos por contato (U02)', () => {
  it('conta os recebidos e não lidos do contato com uma consulta exata (`count: exact, head: true`)', async () => {
    const { result } = renderHook(() => useContactUnreadEmails('c1'));

    // Antes da resposta: carregando, sem herdar contagem de ninguém.
    expect(result.current).toEqual({ count: 0, status: 'loading' });
    expect(consultas()).toHaveLength(1);

    expect(consultas()[0].tabela).toBe('email_messages');
    expect(consultas()[0].selectArgs).toEqual([
      'id, email_threads!inner(contact_id)',
      { count: 'exact', head: true },
    ]);
    expect(consultas()[0].filtros).toEqual([
      ['is_read', false],
      ['direction', 'inbound'],
      ['email_threads.contact_id', 'c1'],
    ]);

    await act(async () => { consultas()[0].resolver({ count: 3, error: null }); });

    expect(result.current).toEqual({ count: 3, status: 'ok' });
  });

  it('sem não lidos → 0 com status ok (e `count` nulo do PostgREST também vira 0)', async () => {
    const primeiro = renderHook(() => useContactUnreadEmails('c1'));
    await act(async () => { consultas()[0].resolver({ count: 0, error: null }); });
    expect(primeiro.result.current).toEqual({ count: 0, status: 'ok' });
    primeiro.unmount();

    estado.consultas.length = 0;
    const segundo = renderHook(() => useContactUnreadEmails('c1'));
    await act(async () => { consultas()[0].resolver({ count: null, error: null }); });
    expect(segundo.result.current).toEqual({ count: 0, status: 'ok' });
  });

  it('trocar de contato descarta a resposta atrasada do contato anterior (ordem invertida)', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useContactUnreadEmails(id),
      { initialProps: { id: 'c1' } },
    );

    // A consulta do contato anterior fica EM VOO: é a condição da corrida.
    expect(consultas()).toHaveLength(1);

    rerender({ id: 'c2' });

    // Já no render do contato novo o valor antigo não aparece e não fica "preso".
    expect(result.current).toEqual({ count: 0, status: 'loading' });
    expect(consultas()).toHaveLength(2);
    expect(consultas()[1].filtros).toContainEqual(['email_threads.contact_id', 'c2']);

    // A resposta do contato NOVO chega primeiro…
    await act(async () => { consultas()[1].resolver({ count: 2, error: null }); });
    expect(result.current).toEqual({ count: 2, status: 'ok' });

    // …e a do contato ANTIGO chega depois: tem de ser descartada (nem volta a loading).
    await act(async () => { consultas()[0].resolver({ count: 99, error: null }); });
    expect(result.current).toEqual({ count: 2, status: 'ok' });
  });

  it('recontagem por tempo real: canal em `email_threads` filtrado por contato, com debounce de 500 ms', async () => {
    const { result } = renderHook(() => useContactUnreadEmails('c1'));
    await act(async () => { consultas()[0].resolver({ count: 1, error: null }); });

    const canal = canais()[0];
    expect(canal.topico).toContain('email-nao-lidos:c1');
    expect(canal.evento).toBe('postgres_changes');
    expect(canal.config).toMatchObject({
      event: '*',
      schema: 'public',
      table: 'email_threads',
      filter: 'contact_id=eq.c1',
    });
    expect(canal.inscrito).toBe(true);

    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c1' }, old: {} });

    // Debounce: nada de consulta imediata, e a contagem vigente NÃO pisca para loading.
    expect(consultas()).toHaveLength(1);
    expect(result.current).toEqual({ count: 1, status: 'ok' });

    await waitFor(() => expect(consultas()).toHaveLength(2), { timeout: 3000 });
    await act(async () => { consultas()[1].resolver({ count: 4, error: null }); });
    expect(result.current).toEqual({ count: 4, status: 'ok' });

    // DELETE só traz `old` (REPLICA IDENTITY FULL): o contato do evento ainda é lido.
    emitir(0, { eventType: 'DELETE', new: {}, old: { contact_id: 'c1' } });
    await waitFor(() => expect(consultas()).toHaveLength(3), { timeout: 3000 });
    await act(async () => { consultas()[2].resolver({ count: 3, error: null }); });
    expect(result.current).toEqual({ count: 3, status: 'ok' });
  });

  it('evento de OUTRO contato (fora do escopo) não reconta', async () => {
    const { result } = renderHook(() => useContactUnreadEmails('c1'));
    await act(async () => { consultas()[0].resolver({ count: 1, error: null }); });

    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c2' }, old: { contact_id: 'c1' } });
    emitir(0, { eventType: 'INSERT', new: { contact_id: null }, old: {} });

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });

    expect(consultas()).toHaveLength(1);
    expect(result.current).toEqual({ count: 1, status: 'ok' });
  });

  it('erro de consulta → `{ count: 0, status: \'erro\' }`, sem lançar, e volta a ok na recontagem', async () => {
    const { result } = renderHook(() => useContactUnreadEmails('c1'));

    await act(async () => { consultas()[0].resolver({ count: null, error: { message: 'falha de rede' } }); });

    expect(result.current).toEqual({ count: 0, status: 'erro' });

    emitir(0, { eventType: 'UPDATE', new: { contact_id: 'c1' }, old: {} });
    await waitFor(() => expect(consultas()).toHaveLength(2), { timeout: 3000 });
    await act(async () => { consultas()[1].resolver({ count: 5, error: null }); });

    expect(result.current).toEqual({ count: 5, status: 'ok' });
  });

  it('contato vazio → `{ count: 0, status: \'idle\' }` sem consulta e sem canal', () => {
    const nulo = renderHook(() => useContactUnreadEmails(null));
    expect(nulo.result.current).toEqual({ count: 0, status: 'idle' });

    const indefinido = renderHook(() => useContactUnreadEmails(undefined));
    expect(indefinido.result.current).toEqual({ count: 0, status: 'idle' });

    const vazio = renderHook(() => useContactUnreadEmails(''));
    expect(vazio.result.current).toEqual({ count: 0, status: 'idle' });

    expect(consultas()).toHaveLength(0);
    expect(canais()).toHaveLength(0);
  });

  it('limpa o canal ao trocar de contato e ao desmontar', () => {
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string | null }) => useContactUnreadEmails(id),
      { initialProps: { id: 'c1' } },
    );

    expect(canais()).toHaveLength(1);
    expect(canais()[0].removido).toBe(false);
    expect(canais()[0].topico).toContain('c1');

    rerender({ id: 'c2' });
    expect(canais()[0].removido).toBe(true);
    expect(canais()).toHaveLength(2);
    expect(canais()[1].topico).toContain('c2');

    unmount();
    expect(canais()[1].removido).toBe(true);
  });
});
