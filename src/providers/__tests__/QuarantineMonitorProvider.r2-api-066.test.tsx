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
  return { data: rows.slice(0, limite), count };
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

/** Drena microtasks (detectAdmin + tick) SEM avançar o relógio falso. */
async function drenar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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
