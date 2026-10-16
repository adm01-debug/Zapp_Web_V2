/**
 * War Room — contrato dos RPCs `warroom_agent_today` / `warroom_queue_stats`.
 *
 * Os dois RPCs agregam no banco e NÃO recebem parâmetros; chamada com argumento
 * desconhecido tem de ser rejeitada (o PostgREST não encontra a assinatura e
 * responde 404 em vez de executar). Isso impede que o cliente "filtre" pelo RPC
 * e leia parcial como total.
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

const RPCS = ['warroom_agent_today', 'warroom_queue_stats'] as const;

describe('War Room — RPCs sem parâmetros rejeitam args desconhecidos', () => {
  it.each(RPCS)('%s rejeita parâmetro desconhecido', async (fn) => {
    if (!TEM_BANCO) return;
    const sb = createClient(URL as string, KEY as string);
    const { error } = await sb.rpc(fn, { ativo: true });
    // sem a correção (RPC aceitando o arg), error seria null e este teste falharia
    expect(error, `${fn} aceitou parâmetro desconhecido`).not.toBeNull();
    expect(error?.message ?? '').toContain(fn);
  });

  it.each(RPCS)('%s responde sem parâmetros', async (fn) => {
    if (!TEM_BANCO) return;
    const sb = createClient(URL as string, KEY as string);
    const { data, error } = await sb.rpc(fn);
    expect(error, `${fn} sem parâmetros deveria responder`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
