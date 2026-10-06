/**
 * R2-API-066 (backlog 238, P2) — Monitor de quarentena conserva decisão antiga
 * após liberação e para em erro transitório.
 *
 * O defeito, medido na fonte:
 *  - o poll do monitor pede só `pending`/`deleted` e hidrata o store com
 *    `upsertMany`, que nunca remove nem atualiza registro ausente do resultado.
 *    Quando um admin libera (decisão vira `allowed`/`whitelisted`), o registro
 *    deixa de voltar no filtro e o cache — que alimenta o selo do MessageBubble —
 *    conserva a decisão antiga;
 *  - qualquer exceção no tick liga `disabledRef` e mata o monitor para o resto
 *    da sessão, mesmo sendo falha transitória.
 *
 * Este arquivo monta o PROVIDER real contra um proxy EXTERNO falso que aplica os
 * filtros como o servidor aplicaria (resposta autoritativa em memória). Não há
 * rede: `@/lib/externalProxy` é dublê e o store testado é o real.
 *
 * Vermelho antes da correção, verde depois.
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuarantineRecord } from '@/hooks/integrations/useQuarantineMedia';

const h = vi.hoisted(() => ({
  // Referências ESTÁVEIS: um objeto novo a cada render reiniciaria o efeito do
  // provider (deps `[user, toast]`) e o monitor reiniciaria por baixo do teste.
  user: { id: 'u1' },
  toast: vi.fn(),
  fetchUserRoles: vi.fn(async () => [] as string[]),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/services/role.service', () => ({
  RoleService: { fetchUserRoles: h.fetchUserRoles },
}));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/externalProxy', () => ({
  queryExternalProxy: vi.fn(),
}));

import { queryExternalProxy } from '@/lib/externalProxy';
import { quarantineStore } from '@/lib/quarantineStore';
import { quarantineMonitorStatus, resetQuarantineMonitorStatus } from '@/lib/quarantineMonitorStatus';
import { QuarantineMonitorProvider } from '@/providers/QuarantineMonitorProvider';

const INTERVALO_MS = 30_000;

type Resposta = { data: QuarantineRecord[]; count?: number } | 'throw' | 'notConfigured';

/** "Banco" externo falso: a resposta autoritativa que o proxy devolveria. */
let linhas: QuarantineRecord[] = [];
let roteiro: Resposta[] = [];
let chamadas: Array<Record<string, unknown>> = [];

/** Aplica filtros/ordenação/limite exatamente como o proxy real faria. */
function responder(params: Record<string, unknown>): { data: QuarantineRecord[]; count: number } {
  let rows = linhas.slice();
  const filtros = (params.filters as Array<{ column: string; operator: string; value: unknown }>) ?? [];
  for (const f of filtros) {
    if (f.operator === 'in' && Array.isArray(f.value)) {
      const permitidos = new Set(f.value as string[]);
      rows = rows.filter((r) => permitidos.has(String(r[f.column as keyof QuarantineRecord])));
    } else if (f.operator === 'eq') {
      rows = rows.filter((r) => r[f.column as keyof QuarantineRecord] === f.value);
    }
  }
  const ordem = params.order as { column: string; ascending?: boolean } | undefined;
  if (ordem?.column) {
    const col = ordem.column as keyof QuarantineRecord;
    rows.sort((a, b) => {
      const av = String(a[col] ?? '');
      const bv = String(b[col] ?? '');
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    if (ordem.ascending === false) rows.reverse();
  }
  const count = rows.length;
  const limite = typeof params.limit === 'number' ? params.limit : 500;
  const deslocamento = typeof params.offset === 'number' ? params.offset : 0;
  return { data: rows.slice(deslocamento, deslocamento + limite), count };
}

/** Chamadas de LIBERAÇÃO: as que filtram por `message_id in (...)` do cache. */
function chamadasDeLiberacoes(): Array<Record<string, unknown>> {
  return chamadas.filter((c) =>
    ((c.filters as Array<{ column: string }>) ?? []).some((f) => f.column === 'message_id'),
  );
}

const mockProxy = vi.mocked(queryExternalProxy);

beforeEach(() => {
  vi.useFakeTimers();
  quarantineStore.clear();
  resetQuarantineMonitorStatus();
  linhas = [];
  roteiro = [];
  chamadas = [];
  h.toast.mockClear();
  h.fetchUserRoles.mockResolvedValue([]);
  mockProxy.mockReset();
  mockProxy.mockImplementation(async (params: unknown) => {
    const p = params as Record<string, unknown>;
    chamadas.push(p);
    const proximo = roteiro.shift() ?? 'ok';
    if (proximo === 'throw') throw new Error('Edge Function returned a non-2xx status code');
    if (proximo === 'notConfigured') return { data: [], count: 0, notConfigured: true };
    return responder(p);
  });
});

afterEach(() => {
  vi.useRealTimers();
  quarantineStore.clear();
});

/** Drena microtasks (detectAdmin + tick + consulta de liberações) SEM avançar o relógio falso. */
async function drenar() {
  await act(async () => {
    // A consulta de liberações pode paginar (N páginas sequenciais): drenar
    // fundo o bastante para o tick inteiro terminar antes de checar o estado.
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
  });
}

function montar() {
  return render(
    <QuarantineMonitorProvider>
      <div />
    </QuarantineMonitorProvider>,
  );
}

/** Avança o relógio (dispara o próximo tick agendado) e drena. */
async function avancar(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await drenar();
}

describe('R2-API-066 — monitor de quarentena', () => {
  it('após a liberação o cache do selo reflete a decisão ATUAL (allowed), não a antiga', async () => {
    linhas = [{ id: 'q1', message_id: 'm1', decision: 'pending', threat_name: 'Trojan.X' }];

    montar();
    await drenar();
    // 1º tick: o registro pendente entra no cache e o selo acusa pendência.
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // Em outro cliente, o admin libera a mídia: a decisão vira `allowed` e o
    // registro deixa de casar com o filtro `pending`/`deleted`.
    linhas = [{ id: 'q1', message_id: 'm1', decision: 'allowed', reviewed_at: '2026-10-05T12:00:00.000Z' }];

    await avancar(INTERVALO_MS);

    // O cliente que só recebe polling precisa ver a decisão NOVA.
    expect(quarantineStore.get('m1')?.decision).toBe('allowed');
  });

  it('uma falha TRANSITÓRIA no tick não desliga o monitor para o resto da sessão', async () => {
    linhas = [];
    roteiro = ['throw']; // o 1º tick falha (500/502 do relay, por exemplo)

    montar();
    await drenar();
    expect(chamadas.length).toBe(1);

    await avancar(INTERVALO_MS); // backoff: o monitor tenta de novo
    expect(chamadas.length).toBeGreaterThanOrEqual(2);
  });

  it('o caminho notConfigured (VPS ausente) continua PERMANENTE: não fica em retry', async () => {
    roteiro = ['notConfigured'];

    montar();
    await drenar();
    expect(chamadas.length).toBe(1);

    await avancar(INTERVALO_MS * 20);
    expect(chamadas.length).toBe(1);
  });

  it('expoem estado de atualização observável (ok após sucesso, error na falha transitória)', async () => {
    linhas = [{ id: 'q1', message_id: 'm1', decision: 'pending' }];

    montar();
    await drenar();
    expect(quarantineMonitorStatus.getSnapshot().status).toBe('ok');

    roteiro = ['throw'];
    await avancar(INTERVALO_MS);
    expect(quarantineMonitorStatus.getSnapshot().status).toBe('error');
  });
});

/**
 * t_6300082e — a janela de 500 registros é só dos estados ATIVOS
 * (`pending`/`deleted`); liberações (`allowed`/`whitelisted`) vêm numa consulta
 * à parte, restrita aos message_id já cacheados, para não expulsar um ativo
 * antigo da hidratação.
 */
describe('janela separada para liberações (t_6300082e)', () => {
  /** N liberações `allowed` RECENTES (created_at a partir de 2026-10-02). */
  function liberacoes(n: number): QuarantineRecord[] {
    const base = Date.parse('2026-10-02T00:00:00.000Z');
    return Array.from({ length: n }, (_, i) => ({
      id: `rel-${i}`,
      message_id: `m-rel-${i}`,
      decision: 'allowed',
      created_at: new Date(base + i * 1000).toISOString(),
      reviewed_at: '2026-10-02T00:00:00.000Z',
    }));
  }

  /** N pendências NOVAS (created_at a partir de 2026-10-03). */
  function pendentesNovos(n: number): QuarantineRecord[] {
    const base = Date.parse('2026-10-03T00:00:00.000Z');
    return Array.from({ length: n }, (_, i) => ({
      id: `pend-${i}`,
      message_id: `m-pend-${i}`,
      decision: 'pending',
      threat_name: 'Eicar-Test',
      created_at: new Date(base + i * 1000).toISOString(),
    }));
  }

  it('pending antigo liberado FORA da janela de 500 vira allowed pela consulta separada', async () => {
    linhas = [{ id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' }];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // O admin libera m1 e mais 600 mídias: a linha de m1 — com created_at
    // ANTIGO — ficaria fora de uma janela única de 500 que misturasse as
    // decisões, e o cache conservaria o `pending` para sempre.
    linhas = [
      { id: 'q1', message_id: 'm1', decision: 'allowed', created_at: '2026-09-01T00:00:00.000Z', reviewed_at: '2026-10-02T00:00:00.000Z' },
      ...liberacoes(600),
    ];

    await avancar(INTERVALO_MS);

    expect(quarantineStore.get('m1')?.decision).toBe('allowed');

    // A consulta de liberações existe e filtra SÓ pelos message_id cacheados.
    const chamadaLiberacoes = chamadas.find((c) => {
      const fs = (c.filters as Array<{ column: string; operator: string }>) ?? [];
      return fs.some((f) => f.column === 'message_id' && f.operator === 'in');
    });
    expect(chamadaLiberacoes).toBeDefined();
    expect(chamadaLiberacoes?.filters).toContainEqual({
      column: 'decision',
      operator: 'in',
      value: ['allowed', 'whitelisted'],
    });
    expect(chamadaLiberacoes?.filters).toContainEqual({
      column: 'message_id',
      operator: 'in',
      value: ['m1'],
    });
  });

  it('pending antigo PERMANECE no cache com mais de 500 liberações recentes na origem', async () => {
    // Cache VAZIO no mount: a única chance de hidratar o pending antigo é a
    // janela de ativos. Numa janela única de 500 ordenada por created_at desc,
    // as 600 liberações recentes ocupariam todas as posições e o pending que
    // continua ativo na origem nunca apareceria — o selo do MessageBubble
    // sumiria para uma mídia ainda em quarentena.
    linhas = [
      ...liberacoes(600),
      { id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' },
    ];

    montar();
    await drenar();

    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // A janela principal é só dos ativos: ela não pede allowed/whitelisted.
    expect(chamadas[0]?.limit).toBe(500);
    expect(chamadas[0]?.filters).toContainEqual({
      column: 'decision',
      operator: 'in',
      value: ['pending', 'deleted'],
    });
  });

  it('janela de ativos completa: registro apagado na origem some do cache mesmo com 600 liberações', async () => {
    linhas = [{ id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' }];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // m1 é REMOVIDO na origem; a tabela só tem liberações recentes. A janela
    // de ativos vem vazia e completa (count = 0), então a ausência é real.
    linhas = liberacoes(600);

    await avancar(INTERVALO_MS);

    expect(quarantineStore.get('m1')).toBeUndefined();
  });

  it('janela de ativos truncada: ausência não remove do cache, mas liberação conhecida continua valendo', async () => {
    linhas = [
      { id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' },
      { id: 'q2', message_id: 'm2', decision: 'pending', created_at: '2026-09-01T01:00:00.000Z' },
    ];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    expect(quarantineStore.get('m2')?.decision).toBe('pending');

    // 500 pendências novas truncam a janela de ativos: m1 (pendente antigo)
    // fica fora dela mas CONTINUA pendente na origem; m2 foi liberado.
    linhas = [
      ...pendentesNovos(500),
      { id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' },
      { id: 'q2', message_id: 'm2', decision: 'allowed', created_at: '2026-09-01T01:00:00.000Z', reviewed_at: '2026-10-03T00:00:00.000Z' },
    ];

    await avancar(INTERVALO_MS);

    // count (501) > linhas (500): a ausência de m1 é ambígua — nada é removido.
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    // A liberação de m2 chega pela consulta separada mesmo com a janela cheia.
    expect(quarantineStore.get('m2')?.decision).toBe('allowed');
  });

  it('toast administrativo dispara só para pending novo — nunca para deleted/allowed/whitelisted', async () => {
    h.fetchUserRoles.mockResolvedValue(['admin']);
    linhas = [
      { id: 'r1', message_id: 'mx1', decision: 'pending', created_at: '2026-10-04T00:00:00.000Z' },
      { id: 'r2', message_id: 'mx2', decision: 'pending', created_at: '2026-10-04T01:00:00.000Z' },
    ];

    montar();
    await drenar();
    // 1º tick hidrata o cache e NÃO dispara toast: nada é "novo" ainda.
    expect(quarantineStore.get('mx1')?.decision).toBe('pending');
    expect(quarantineStore.get('mx2')?.decision).toBe('pending');
    expect(h.toast).not.toHaveBeenCalled();

    // Agora chega um `pending` novo, um `deleted` novo, e as duas pendências
    // cacheadas são liberadas (`allowed`/`whitelisted`). As liberações são
    // observadas pela consulta à parte, porque os message_id já estão no cache.
    linhas = [
      { id: 'r1', message_id: 'mx1', decision: 'allowed', created_at: '2026-10-04T00:00:00.000Z', reviewed_at: '2026-10-05T00:00:00.000Z' },
      { id: 'r2', message_id: 'mx2', decision: 'whitelisted', created_at: '2026-10-04T01:00:00.000Z', reviewed_at: '2026-10-05T00:00:00.000Z' },
      { id: 'qp', message_id: 'mp', decision: 'pending', threat_name: 'Eicar-Test', created_at: '2026-10-05T00:00:00.000Z' },
      { id: 'qd', message_id: 'md', decision: 'deleted', created_at: '2026-10-05T01:00:00.000Z' },
    ];

    await avancar(INTERVALO_MS);

    // Só o `pending` novo virou toast — o `deleted` novo e as duas liberações, não.
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0]).toMatchObject({
      title: expect.stringContaining('1 nova(s)'),
      variant: 'destructive',
    });

    // As liberações chegaram por VALOR (consulta à parte), não por ausência.
    const chamadaLiberacoes = chamadas.find((c) => {
      const fs = (c.filters as Array<{ column: string; operator: string }>) ?? [];
      return fs.some((f) => f.column === 'message_id' && f.operator === 'in');
    });
    const filtroIds = (
      chamadaLiberacoes?.filters as Array<{ column: string; operator: string; value?: unknown }> | undefined
    )?.find((f) => f.column === 'message_id' && f.operator === 'in');
    // A ordem dos ids vem do cache (o tick anterior grava por created_at desc),
    // então comparo como conjunto — o que importa é pedir só os ids cacheados.
    expect(new Set(filtroIds?.value as string[])).toEqual(new Set(['mx1', 'mx2']));
    expect(quarantineStore.get('mx1')?.decision).toBe('allowed');
    expect(quarantineStore.get('mx2')?.decision).toBe('whitelisted');
  });
});

/**
 * t_e062f638 — a consulta de liberações NÃO pode parar na 1ª página.
 *
 * Defeito medido: a consulta à parte usava um único `limit: 500` com ordem
 * CRESCENTE. Com mais de 500 linhas de liberação para ids já cacheados, ela
 * devolvia só as 500 MAIS ANTIGAS — a versão mais recente de um id e as
 * liberações de outros ids ficavam de fora e a decisão antiga permanecia no
 * cache para sempre. A correção pagina a consulta até esgotar o resultado e
 * reconcilia, por `message_id`, a linha efetivamente mais recente.
 */
describe('paginação das liberações (t_e062f638)', () => {
  it('cobre todos os ids cacheados e faz a versão mais recente vencer com >500 liberações', async () => {
    // 1º tick: a janela de ATIVOS hidrata m1, m2 e m3 (todos `pending`).
    linhas = [
      { id: 'q1', message_id: 'm1', decision: 'pending', created_at: '2026-09-01T00:00:00.000Z' },
      { id: 'q2', message_id: 'm2', decision: 'pending', created_at: '2026-09-01T00:00:01.000Z' },
      { id: 'q3', message_id: 'm3', decision: 'pending', created_at: '2026-09-01T00:00:02.000Z' },
    ];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    expect(quarantineStore.get('m2')?.decision).toBe('pending');
    expect(quarantineStore.get('m3')?.decision).toBe('pending');

    chamadas = [];

    // 2º tick: m1 acumula 600 versões de liberação; a ÚLTIMA (created_at e
    // reviewed_at maiores) é `whitelisted` e todas as anteriores são `allowed`.
    // m2 ganhou UMA liberação, mais recente que todas as de m1 — ou seja, além
    // da 500ª linha. m3 continua pendente na origem.
    const base = Date.parse('2026-09-05T00:00:00.000Z');
    const versoesDeM1: QuarantineRecord[] = Array.from({ length: 600 }, (_, i) => {
      const ts = new Date(base + i * 1000).toISOString();
      return {
        id: `v-${i}`,
        message_id: 'm1',
        decision: i === 599 ? 'whitelisted' : 'allowed',
        created_at: ts,
        reviewed_at: ts,
      };
    });
    linhas = [
      ...versoesDeM1,
      {
        id: 'rel-m2',
        message_id: 'm2',
        decision: 'allowed',
        created_at: '2026-09-06T00:00:00.000Z',
        reviewed_at: '2026-09-06T00:00:00.000Z',
      },
      { id: 'q3', message_id: 'm3', decision: 'pending', created_at: '2026-09-01T00:00:02.000Z' },
    ];

    await avancar(INTERVALO_MS);

    // m1: a versão MAIS RECENTE (que cai fora de uma única página de 500) vence.
    expect(quarantineStore.get('m1')?.decision).toBe('whitelisted');
    // m2: liberado numa linha além da 500ª — sem paginação o cache nunca sairia de `pending`.
    expect(quarantineStore.get('m2')?.decision).toBe('allowed');
    // m3: continua ativo na origem e no cache.
    expect(quarantineStore.get('m3')?.decision).toBe('pending');

    // Prova da paginação: mais de uma chamada de liberação, cobrindo a 2ª página.
    const liberacoesChamadas = chamadasDeLiberacoes();
    expect(liberacoesChamadas.length).toBeGreaterThan(1);
    expect(liberacoesChamadas.map((c) => c.offset ?? 0)).toContain(500);
  });
});
