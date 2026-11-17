/**
 * Defeito: `countAudience` aceitava qualquer resposta da RPC de audiência e
 * tratava o que não entendia como público ZERO (`Number(undefined ?? 0)`).
 * Esse zero ia para a tela e era salvo no segmento, sem o operador ter como
 * saber se o público é realmente vazio ou se a consulta falhou.
 * Agora a resposta é validada e falha fechada; zero só vale quando o servidor
 * de fato respondeu zero elegíveis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(async () => state.result) },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: vi.fn() }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { countAudience } from '@/hooks/integrations/useTalkXSegments';

beforeEach(() => {
  state.result = { data: null, error: null };
});

describe('countAudience valida a resposta da RPC em vez de assumir público zero', () => {
  it('resposta nula não vira 0', async () => {
    state.result = { data: null, error: null };
    await expect(countAudience(null)).rejects.toThrow('Resposta inválida da consulta de audiência.');
  });

  it('resposta em array não vira 0', async () => {
    state.result = { data: [], error: null };
    await expect(countAudience(null)).rejects.toThrow('Resposta inválida da consulta de audiência.');
  });

  it('resposta sem `eligible` não vira 0', async () => {
    state.result = { data: { mode: 'count' }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Contagem inválida (eligible) na resposta da audiência.');
  });

  it('`eligible` não numérico não vira 0', async () => {
    state.result = { data: { mode: 'count', eligible: 'muitos' }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Contagem inválida (eligible) na resposta da audiência.');
  });

  it('`eligible` negativo ou fracionário não passa', async () => {
    state.result = { data: { mode: 'count', eligible: -1 }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Contagem inválida (eligible) na resposta da audiência.');
    state.result = { data: { mode: 'count', eligible: 1.5 }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Contagem inválida (eligible) na resposta da audiência.');
  });

  // Os quatro valores abaixo são o ponto cego de uma validação feita com
  // `Number(...)`: `Number(null)`, `Number('')`, `Number(false)` e `Number([])`
  // são todos 0 e passam por `Number.isInteger`, então um `eligible` nulo — o
  // caso provável quando o jsonb vem sem a contagem — voltaria a virar público
  // zero em silêncio. A guarda exige `typeof === 'number'` antes do inteiro.
  it.each([
    ['nulo', null],
    ['string vazia', ''],
    ['booleano', false],
    ['array vazio', []],
  ])('`eligible` %s não vira 0', async (_nome, valor) => {
    state.result = { data: { mode: 'count', eligible: valor }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Contagem inválida (eligible) na resposta da audiência.');
  });

  it('modo diferente de count é recusado (a resposta não é a contagem pedida)', async () => {
    state.result = { data: { mode: 'page', rows: [], eligible: 0 }, error: null };
    await expect(countAudience(null)).rejects.toThrow('Modo inválido na resposta da consulta de audiência.');
  });

  it('público realmente vazio continua devolvendo 0', async () => {
    state.result = { data: { mode: 'count', eligible: 0 }, error: null };
    await expect(countAudience(null)).resolves.toBe(0);
  });

  it('contagem válida continua passando (sem `mode` na resposta)', async () => {
    state.result = { data: { eligible: 42 }, error: null };
    await expect(countAudience(null)).resolves.toBe(42);
  });
});
