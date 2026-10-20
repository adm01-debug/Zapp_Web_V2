/**
 * Item (2026-10-15): erro de leitura do monitoramento era ENGOLIDO.
 *
 * Antes: `fetchData` só olhava `res.data`; o `error` do PostgREST caía no vazio e a tela
 * continuava mostrando o estado anterior (0 conexões, uptime 100%) como se fosse medição —
 * e o `catch` só escrevia no log. Agora cada fonte expõe o erro com o motivo (sem permissão,
 * falha de rede) e o dado anterior é preservado em vez de ser zerado.
 *
 * O hook REAL roda com o cliente Supabase mockado, erro por fonte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface Resposta { data: unknown; error: unknown }

const respostas: Record<string, Resposta> = {};
let falhaDeRede = false;

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

// Builder thenable: aceita .select().gte().order().limit() e o `await` direto.
function query(result: Resposta) {
  const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
  for (const m of ['select', 'gte', 'lte', 'gt', 'lt', 'eq', 'in', 'is', 'order', 'limit']) {
    p[m] = vi.fn(() => p);
  }
  return p;
}

mockFrom.mockImplementation((table: string) => {
  if (falhaDeRede) throw new Error('Failed to fetch');
  return query(respostas[table] ?? { data: [], error: null });
});

import { useMonitoringData } from '@/components/monitoring/hooks/useMonitoringData';

const agora = new Date().toISOString();
const CONEXAO = [{ id: 'c1', instance_id: 'vendas', instance_name: 'vendas', status: 'connected', phone_number: '551100000000', updated_at: agora }];
const LOG = [{ id: 1, instance_id: 'vendas', instance_name: 'vendas', status: 'healthy', checked_at: agora, response_time_ms: 120 }];
const MSG = [{ sender: 'a', created_at: agora }];

beforeEach(() => {
  falhaDeRede = false;
  respostas.whatsapp_connections = { data: [], error: null };
  respostas.connection_health_logs = { data: [], error: null };
  respostas.messages = { data: [], error: null };
});

async function leituraOk() {
  respostas.whatsapp_connections = { data: CONEXAO, error: null };
  respostas.connection_health_logs = { data: LOG, error: null };
  respostas.messages = { data: MSG, error: null };
  const { result } = renderHook(() => useMonitoringData());
  await act(async () => { await result.current.fetchData('1h'); });
  return result;
}

describe('useMonitoringData — erro por fonte não vira tela vazia', () => {
  it('erro nas conexões: expõe o motivo e preserva as conexões anteriores', async () => {
    const result = await leituraOk();
    expect(result.current.connections).toHaveLength(1);
    expect(result.current.errors.connections).toBeNull();
    const atualizado = result.current.lastUpdatedAt;
    expect(atualizado).not.toBeNull();

    respostas.whatsapp_connections = { data: null, error: { message: 'permission denied for table whatsapp_connections' } };
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.errors.connections).toContain('conexões');
    expect(result.current.errors.connections).toContain('sem permissão');
    expect(result.current.connections).toHaveLength(1);
    expect(result.current.errors.logs).toBeNull();
    expect(result.current.errors.messages).toBeNull();
    // Meia leitura não conta como "atualizado agora".
    expect(result.current.lastUpdatedAt).toBe(atualizado);
  });

  it('erro nos logs: expõe o motivo e preserva o uptime medido antes', async () => {
    const result = await leituraOk();
    const uptimeAntes = result.current.uptime.percentage;
    expect(uptimeAntes).toBe(100);

    respostas.connection_health_logs = { data: null, error: { message: 'statement timeout' } };
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.errors.logs).toContain('logs de saúde');
    expect(result.current.errors.logs).toContain('tempo esgotado');
    expect(result.current.uptime.percentage).toBe(uptimeAntes);
    expect(result.current.uptime.totalChecks).toBe(1);
    expect(result.current.errors.connections).toBeNull();
  });

  it('erro nas mensagens: expõe o motivo e preserva as estatísticas anteriores', async () => {
    const result = await leituraOk();
    expect(result.current.messageStats.total).toBe(1);

    respostas.messages = { data: null, error: { message: 'permission denied for table messages' } };
    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.errors.messages).toContain('mensagens');
    expect(result.current.errors.messages).toContain('sem permissão');
    expect(result.current.messageStats.total).toBe(1);
    expect(result.current.errors.connections).toBeNull();
  });

  it('falha de rede (catch) também é relatada, nas três fontes', async () => {
    const result = await leituraOk();
    falhaDeRede = true;

    await act(async () => { await result.current.fetchData('1h'); });

    expect(result.current.errors.connections).toContain('falha de rede');
    expect(result.current.errors.logs).toContain('falha de rede');
    expect(result.current.errors.messages).toContain('falha de rede');
  });
});
