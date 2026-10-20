/**
 * R2-API-066 (backlog 238, P2) — "Monitor de quarentena conserva decisão antiga
 * após liberação e para em erro transitório".
 *
 * Os dois defeitos, medidos no código:
 *  1. o poll do monitor consulta SÓ `pending`/`deleted` e hidrata o cache com
 *     `upsertMany`, que nunca remove nem atualiza o registro que deixou de
 *     voltar. Quando um admin libera a mídia (decisão vira `allowed`/
 *     `whitelisted`), o registro sai do filtro e o cache — que alimenta o selo
 *     do MessageBubble — conserva a decisão antiga para sempre;
 *  2. qualquer exceção no tick liga `disabledRef` e mata o monitor pelo resto
 *     da sessão, mesmo sendo falha transitória (500/502 do relay, rede).
 *
 * O teste monta o PROVIDER real contra um proxy externo falso que aplica
 * filtros/ordem/limite como o servidor aplicaria. Sem rede: `@/lib/externalProxy`
 * é dublê; o store testado é o real.
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
vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy: vi.fn() }));

import { queryExternalProxy } from '@/lib/externalProxy';
import { quarantineStore } from '@/lib/quarantineStore';
import { QuarantineMonitorProvider } from '@/providers/QuarantineMonitorProvider';

const INTERVALO_MS = 30_000;

type Resposta = { data: QuarantineRecord[]; count?: number } | 'throw' | 'notConfigured';
type Filtro = { column: string; operator: string; value?: unknown };
type Chamada = Record<string, unknown>;

/** "Origem" externa falsa: o retrato autoritativo que o proxy devolveria. */
let linhas: QuarantineRecord[] = [];
let roteiro: Resposta[] = [];
let chamadas: Chamada[] = [];

function filtrosDe(c: Chamada): Filtro[] {
  return (c.filters as Filtro[] | undefined) ?? [];
}

/** Aplica filtros/ordenação/janela exatamente como o proxy real faria. */
function responder(params: Chamada): { data: QuarantineRecord[]; count: number } {
  let rows = linhas.slice();
  for (const f of filtrosDe(params)) {
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
  const limite = typeof params.limit === 'number' ? params.limit : 50;
  const deslocamento = typeof params.offset === 'number' ? params.offset : 0;
  return { data: rows.slice(deslocamento, deslocamento + limite), count };
}

/** Chamadas que pedem as LIBERAÇÕES (filtram `message_id in (...)` do cache). */
function chamadasDeLiberacoes(): Chamada[] {
  return chamadas.filter((c) => filtrosDe(c).some((f) => f.column === 'message_id'));
}

function idsPedidos(chamada: Chamada): string[] {
  const filtro = filtrosDe(chamada).find((f) => f.column === 'message_id' && f.operator === 'in');
  return Array.isArray(filtro?.value) ? (filtro.value as string[]) : [];
}

const mockProxy = vi.mocked(queryExternalProxy);

beforeEach(() => {
  vi.useFakeTimers();
  quarantineStore.clear();
  linhas = [];
  roteiro = [];
  chamadas = [];
  h.toast.mockClear();
  h.fetchUserRoles.mockResolvedValue([]);
  mockProxy.mockReset();
  mockProxy.mockImplementation(async (params: unknown) => {
    const p = params as Chamada;
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

/** Drena o tick inteiro (detectAdmin + consultas paginadas) sem andar o relógio. */
async function drenar() {
  await act(async () => {
    for (let i = 0; i < 60; i += 1) await Promise.resolve();
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

function pendente(id: string, messageId: string, createdAt: string): QuarantineRecord {
  return { id, message_id: messageId, decision: 'pending', created_at: createdAt };
}

function liberado(
  id: string,
  messageId: string,
  decision: 'allowed' | 'whitelisted',
  createdAt: string,
  reviewedAt: string,
): QuarantineRecord {
  return {
    id,
    message_id: messageId,
    decision,
    created_at: createdAt,
    reviewed_at: reviewedAt,
  };
}

describe('R2-API-066 — monitor de quarentena', () => {
  it('1. após a liberação o cache do selo reflete a decisão ATUAL (allowed), não a antiga', async () => {
    linhas = [pendente('q1', 'm1', '2026-09-01T00:00:00.000Z')];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // Em outro cliente, o admin libera a mídia: a linha deixa de casar com o
    // filtro da janela de ativos (`pending`/`deleted`).
    linhas = [liberado('q1', 'm1', 'allowed', '2026-09-01T00:00:00.000Z', '2026-10-05T12:00:00.000Z')];

    await avancar(INTERVALO_MS);

    // Quem só recebe polling precisa ver a decisão NOVA, por valor.
    expect(quarantineStore.get('m1')?.decision).toBe('allowed');
  });

  it('2. falha TRANSITÓRIA no tick não desliga o monitor pelo resto da sessão', async () => {
    roteiro = ['throw'];

    montar();
    await drenar();
    expect(chamadas.length).toBe(1);

    await avancar(INTERVALO_MS);
    expect(chamadas.length).toBeGreaterThanOrEqual(2);

    // Segue vivo depois da retomada, com o intervalo normal.
    await avancar(INTERVALO_MS);
    expect(chamadas.length).toBeGreaterThanOrEqual(3);
  });

  it('3. notConfigured (VPS ausente) continua PERMANENTE: não entra em retry', async () => {
    roteiro = ['notConfigured'];

    montar();
    await drenar();
    expect(chamadas.length).toBe(1);

    await avancar(INTERVALO_MS * 20);
    expect(chamadas.length).toBe(1);
  });

  it('4. janela de ativos COMPLETA: registro apagado na origem sai do cache', async () => {
    linhas = [pendente('q1', 'm1', '2026-09-01T00:00:00.000Z')];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')).toBeDefined();

    linhas = [];

    await avancar(INTERVALO_MS);
    expect(quarantineStore.get('m1')).toBeUndefined();
  });

  it('5. janela de ativos TRUNCADA: ausência é ambígua e não remove do cache', async () => {
    linhas = [
      pendente('q1', 'm1', '2026-09-01T00:00:00.000Z'),
      pendente('q2', 'm2', '2026-09-01T01:00:00.000Z'),
    ];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // 500 pendências novas empurram o pendente antigo para fora da janela de
    // 500, mas ele continua ativo na origem. m2 foi liberado.
    const recentes = Array.from({ length: 500 }, (_, i) =>
      pendente(`novo-${i}`, `m-novo-${i}`, new Date(Date.parse('2026-10-03T00:00:00.000Z') + i * 1000).toISOString()),
    );
    linhas = [
      ...recentes,
      pendente('q1', 'm1', '2026-09-01T00:00:00.000Z'),
      liberado('q2', 'm2', 'whitelisted', '2026-09-01T01:00:00.000Z', '2026-10-03T00:00:00.000Z'),
    ];

    await avancar(INTERVALO_MS);

    // count (501) > linhas devolvidas (500): nada é removido só por ausência.
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    // E a liberação chega mesmo com a janela cheia.
    expect(quarantineStore.get('m2')?.decision).toBe('whitelisted');
  });

  it('6. liberação ANTIGA na origem não sobrescreve pending NOVO do mesmo message_id (re-quarentena)', async () => {
    linhas = [pendente('q1', 'm1', '2026-09-01T00:00:00.000Z')];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');

    // A mídia foi liberada em setembro e voltou à quarentena em outubro: a
    // mesma message_id tem as duas linhas, e a mais recente é a pendência.
    linhas = [
      liberado('rel-antiga', 'm1', 'allowed', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
      pendente('q-nova', 'm1', '2026-10-05T00:00:00.000Z'),
    ];

    await avancar(INTERVALO_MS);

    // Quem manda é a versão mais recente da decisão, não a ordem de chegada.
    expect(quarantineStore.get('m1')?.id).toBe('q-nova');
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
  });

  it('7. liberações com mais de 500 linhas: a versão mais recente de cada id vence', async () => {
    linhas = [
      pendente('q1', 'm1', '2026-09-01T00:00:00.000Z'),
      pendente('q2', 'm2', '2026-09-01T00:00:01.000Z'),
      pendente('q3', 'm3', '2026-09-01T00:00:02.000Z'),
    ];

    montar();
    await drenar();
    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    expect(quarantineStore.get('m2')?.decision).toBe('pending');
    expect(quarantineStore.get('m3')?.decision).toBe('pending');

    chamadas = [];

    // m1 acumula 600 versões de liberação (a última é `whitelisted`) e exige
    // paginação para que a versão efetivamente mais recente seja vista; m2 tem
    // uma liberação própria e m3 continua pendente na origem.
    const base = Date.parse('2026-09-05T00:00:00.000Z');
    const versoesDeM1: QuarantineRecord[] = Array.from({ length: 600 }, (_, i) => {
      const ts = new Date(base + i * 1000).toISOString();
      return liberado(`v-${i}`, 'm1', i === 599 ? 'whitelisted' : 'allowed', ts, ts);
    });
    linhas = [
      ...versoesDeM1,
      liberado('rel-m2', 'm2', 'allowed', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z'),
      pendente('q3', 'm3', '2026-09-01T00:00:02.000Z'),
    ];

    await avancar(INTERVALO_MS);

    expect(quarantineStore.get('m1')?.decision).toBe('whitelisted');
    expect(quarantineStore.get('m2')?.decision).toBe('allowed');
    expect(quarantineStore.get('m3')?.decision).toBe('pending');

    // Prova a paginação: mais de uma página, cobrindo offsets além da 1ª.
    const liberacoes = chamadasDeLiberacoes();
    expect(liberacoes.length).toBeGreaterThan(1);
    expect(liberacoes.some((c) => Number(c.offset ?? 0) >= 500)).toBe(true);
    const ordensLiberacoes = liberacoes.map(
      (c) => c.order as { column?: string; ascending?: boolean } | undefined,
    );
    expect(ordensLiberacoes.every((order) => order?.column === 'id' && order?.ascending === true)).toBe(true);
  });

  it('8. cache maior que um lote: a consulta de liberações é dividida em lotes e cobre TODOS os ids', async () => {
    // 150 mídias ativas: a lista de ids cacheados não vai inteira num único
    // pedido (URL do PostgREST tem limite), então precisa ser fatiada.
    linhas = Array.from({ length: 150 }, (_, i) => pendente(`q-${i}`, `m-${i}`, '2026-09-01T00:00:00.000Z'));

    montar();
    await drenar();
    expect(quarantineStore.get('m-0')?.decision).toBe('pending');
    expect(quarantineStore.get('m-149')?.decision).toBe('pending');

    chamadas = [];

    const ids = Array.from({ length: 150 }, (_, i) => `m-${i}`);
    linhas = ids.map((messageId, i) =>
      liberado(`rel-${i}`, messageId, 'allowed', '2026-09-01T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
    );

    await avancar(INTERVALO_MS);

    const liberacoes = chamadasDeLiberacoes();
    expect(liberacoes.length).toBeGreaterThan(1);
    for (const chamada of liberacoes) {
      expect(idsPedidos(chamada).length).toBeLessThanOrEqual(100);
    }
    const idsPedidosNaConsulta = new Set(liberacoes.flatMap(idsPedidos));
    expect(idsPedidosNaConsulta).toEqual(new Set(ids));

    // Todas as 150 decisões antigas foram substituídas pela liberação.
    expect(ids.every((id) => quarantineStore.get(id)?.decision === 'allowed')).toBe(true);
  });

  it('9. toast administrativo dispara só para pending NOVO — nunca para deleted/allowed/whitelisted', async () => {
    h.fetchUserRoles.mockResolvedValue(['admin']);
    linhas = [
      pendente('r1', 'mx1', '2026-10-04T00:00:00.000Z'),
      pendente('r2', 'mx2', '2026-10-04T01:00:00.000Z'),
    ];

    montar();
    await drenar();
    // 1º tick hidrata o cache e não anuncia nada: ainda não há "novo".
    expect(quarantineStore.get('mx1')?.decision).toBe('pending');
    expect(h.toast).not.toHaveBeenCalled();

    linhas = [
      liberado('r1', 'mx1', 'allowed', '2026-10-04T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
      liberado('r2', 'mx2', 'whitelisted', '2026-10-04T01:00:00.000Z', '2026-10-05T00:00:00.000Z'),
      { id: 'qp', message_id: 'mp', decision: 'pending', threat_name: 'Eicar-Test', created_at: '2026-10-05T00:00:00.000Z' },
      { id: 'qd', message_id: 'md', decision: 'deleted', created_at: '2026-10-05T01:00:00.000Z' },
    ];

    await avancar(INTERVALO_MS);

    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0]).toMatchObject({
      title: expect.stringContaining('1 nova(s)'),
      variant: 'destructive',
    });

    // As liberações foram observadas por VALOR (consulta à parte dos ids
    // cacheados), não inferidas por ausência na janela de ativos.
    const liberacoes = chamadasDeLiberacoes();
    expect(liberacoes.length).toBeGreaterThan(0);
    expect(liberacoes[0].filters).toContainEqual({
      column: 'decision',
      operator: 'in',
      value: ['allowed', 'whitelisted'],
    });
    expect(new Set(idsPedidos(liberacoes[0]))).toEqual(new Set(['mx1', 'mx2']));
    expect(quarantineStore.get('mx1')?.decision).toBe('allowed');
    expect(quarantineStore.get('mx2')?.decision).toBe('whitelisted');
  });

  it('10. a janela de ativos continua sendo só pending/deleted: liberação não expulsa ativo antigo', async () => {
    // 600 liberações RECENTES não podem ocupar a janela de 500 dos ativos: o
    // pendente antigo (única fonte de hidratação do selo) precisa entrar.
    const base = Date.parse('2026-10-02T00:00:00.000Z');
    const recentes: QuarantineRecord[] = Array.from({ length: 600 }, (_, i) =>
      liberado(
        `rel-${i}`,
        `m-rel-${i}`,
        'allowed',
        new Date(base + i * 1000).toISOString(),
        '2026-10-02T00:00:00.000Z',
      ),
    );
    linhas = [...recentes, pendente('q1', 'm1', '2026-09-01T00:00:00.000Z')];

    montar();
    await drenar();

    expect(quarantineStore.get('m1')?.decision).toBe('pending');
    expect(chamadas[0]?.limit).toBe(500);
    expect(chamadas[0]?.filters).toContainEqual({
      column: 'decision',
      operator: 'in',
      value: ['pending', 'deleted'],
    });
  });
});
