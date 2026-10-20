/**
 * E48 — o teto mensal do Searchbox tem de vir de CONFIGURAÇÃO, não de uma constante cravada no
 * código (`MONTHLY_SESSION_LIMIT = 450` em `mapboxCostGuard.ts`).
 *
 * Por que importa: o teto existe para não estourar as 500 sessões grátis/mês da Mapbox (acima
 * disso, US$3/1000). Cravado no código, mudar o teto — para baixo, quando o plano muda, ou para
 * cima, quando o time decide pagar — exige alterar e reimplantar o app. Configurável, é uma
 * variável de ambiente.
 *
 * Regra de segurança do ajuste: valor inválido cai no PADRÃO (450), nunca em "sem teto". Uma
 * variável escrita errado não pode desligar a guarda em silêncio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), logAudit: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));
vi.mock('@/lib/audit', () => ({ logAudit: h.logAudit }));

import {
  isSearchBudgetOk,
  resetSearchBudgetGuardForTests,
  forceSearchBudgetRefreshForTests,
} from '@/lib/mapboxCostGuard';

describe('E48 — teto mensal vindo da configuração', () => {
  beforeEach(() => {
    resetSearchBudgetGuardForTests();
    h.rpc.mockReset();
    h.logAudit.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('com o teto configurado em 2, o mês com 2 sessões já está estourado', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '2');
    h.rpc.mockResolvedValue({ data: 2, error: null });

    await forceSearchBudgetRefreshForTests();

    // Hoje isto é `true`, porque a comparação é contra o 450 cravado — é o vermelho desta etapa.
    expect(isSearchBudgetOk()).toBe(false);
  });

  it('configuração inválida cai no padrão 450 — nunca em "sem teto"', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', 'abc');
    h.rpc.mockResolvedValue({ data: 450, error: null });

    await forceSearchBudgetRefreshForTests();

    // 450 não é < 450: se o fallback fosse Infinity/NaN, aqui diria "liberado" e a guarda
    // estaria desligada por causa de uma variável mal escrita.
    expect(isSearchBudgetOk()).toBe(false);
  });

  it('configuração válida e folgada mantém o autocomplete liberado', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '1000');
    h.rpc.mockResolvedValue({ data: 450, error: null });

    await forceSearchBudgetRefreshForTests();

    expect(isSearchBudgetOk()).toBe(true);
  });

  it('a configuração é lida a cada checagem — mudar o teto não exige recarregar o app', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '1000');
    h.rpc.mockResolvedValue({ data: 500, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(isSearchBudgetOk()).toBe(true);

    // O time baixa o teto para 400 (mesmo mês, 500 sessões já contadas) e a próxima checagem
    // precisa respeitar o valor novo, sem reload de página.
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '400');
    await forceSearchBudgetRefreshForTests();
    expect(isSearchBudgetOk()).toBe(false);
  });
});
