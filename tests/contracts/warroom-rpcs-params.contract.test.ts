/**
 * War Room — contrato de parâmetros dos RPCs `warroom_agent_today` / `warroom_queue_stats`.
 *
 * Verdade exata (igual ao `types.ts` e à migration das RPCs):
 * - `warroom_queue_stats()` não recebe nada;
 * - `warroom_agent_today(p_date?)` recebe SÓ a data opcional (o hook nunca passa nada e usa o default = hoje).
 * Qualquer outro argumento não resolve função (o PostgREST responde 404 em vez de executar).
 * Isso impede que o cliente "filtre" pelo RPC e leia parcial como total.
 *
 * Roda contra o banco LOCAL da tarefa: exporte antes (valores de `zapp-db-local env`)
 *   SUPABASE_URL=<API_URL do conjunto> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY do conjunto>
 * Sem essas variáveis, os casos passam sem afirmar (não há banco local fora da tarefa).
 *
 * Rodar: bunx vitest run --config vitest.contracts.config.ts tests/contracts/warroom-rpcs-params.contract.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEM_BANCO = Boolean(URL && KEY);

describe('War Room — RPCs rejeitam args desconhecidos', () => {
  it.each(['warroom_agent_today', 'warroom_queue_stats'])('%s rejeita parâmetro desconhecido', async (fn) => {
    if (!TEM_BANCO) return;
    const sb = createClient(URL!, KEY!);
    const { error } = await sb.rpc(fn, { ativo: true } as never);
    expect(error, `${fn} deveria rejeitar parâmetro desconhecido`).not.toBeNull();
    expect(error?.message ?? '').toContain(fn);
  });

  it.each(['warroom_agent_today', 'warroom_queue_stats'])('%s responde sem parâmetros', async (fn) => {
    if (!TEM_BANCO) return;
    const sb = createClient(URL!, KEY!);
    const { data, error } = await sb.rpc(fn);
    expect(error, `${fn} deveria responder sem parâmetros`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('warroom_agent_today aceita SÓ p_date (o opcional do contrato)', async () => {
    if (!TEM_BANCO) return;
    const sb = createClient(URL!, KEY!);
    const { data, error } = await sb.rpc('warroom_agent_today', { p_date: '2026-10-16' });
    expect(error, 'p_date é o único parâmetro do contrato').toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
