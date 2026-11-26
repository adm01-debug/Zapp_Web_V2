import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import {
  describeInvestmentError,
  parseInvestmentInput,
  revenueFromServer,
} from '@/hooks/integrations/useTalkXCampaignRevenue';

/**
 * X041 — o relatório não mostrava quanto a campanha vendeu. Estes testes fixam
 * a tradução do jsonb de `talkx_campaign_revenue` (conferido em produção:
 * `{campaign_id, conversions, revenue, investment, roi, roi_percent}`) e o
 * parsing do investimento digitado.
 */
describe('revenueFromServer (X041)', () => {
  it('lê o payload real da RPC', () => {
    expect(revenueFromServer({
      campaign_id: '976b2c15-3302-4076-8b38-f3d899a1f7ad',
      conversions: 12,
      revenue: 4800.5,
      investment: 1000,
      roi: 3.8005,
      roi_percent: 380.05,
    })).toEqual({ conversions: 12, revenue: 4800.5, investment: 1000, roiPercent: 380.05 });
  });

  it('campanha sem investimento não inventa ROI (produção devolve null)', () => {
    expect(revenueFromServer({
      campaign_id: 'x', conversions: 0, revenue: 0, investment: null, roi: null, roi_percent: null,
    })).toEqual({ conversions: 0, revenue: 0, investment: null, roiPercent: null });
  });

  it('investimento zerado mantém ROI indefinido em vez de 0%', () => {
    const out = revenueFromServer({ conversions: 3, revenue: 900, investment: 0, roi_percent: 0 });
    expect(out.investment).toBe(0);
    expect(out.roiPercent).toBeNull();
  });

  it('numeric como string ("0.00") vira número', () => {
    const out = revenueFromServer({ conversions: '7', revenue: '0.00', investment: '250.00', roi_percent: '-100.00' });
    expect(out).toEqual({ conversions: 7, revenue: 0, investment: 250, roiPercent: -100 });
  });

  it('payload vazio ou inválido não vira NaN na tela', () => {
    expect(revenueFromServer(null)).toEqual({ conversions: 0, revenue: 0, investment: null, roiPercent: null });
    expect(revenueFromServer({ conversions: 'abc', revenue: undefined }))
      .toEqual({ conversions: 0, revenue: 0, investment: null, roiPercent: null });
  });
});

describe('parseInvestmentInput (X041)', () => {
  it('aceita os formatos que o usuário digita', () => {
    expect(parseInvestmentInput('1500')).toBe(1500);
    expect(parseInvestmentInput('1.500')).toBe(1500);
    expect(parseInvestmentInput('1.500,50')).toBe(1500.5);
    expect(parseInvestmentInput('1500,50')).toBe(1500.5);
    expect(parseInvestmentInput('R$ 2.000,00')).toBe(2000);
    expect(parseInvestmentInput('  0  ')).toBe(0);
    expect(parseInvestmentInput('0,99')).toBe(0.99);
  });

  it('recusa o que não é dinheiro', () => {
    expect(parseInvestmentInput('')).toBeNull();
    expect(parseInvestmentInput('abc')).toBeNull();
    expect(parseInvestmentInput('-10')).toBeNull();
    expect(parseInvestmentInput('10,999')).toBeNull();
    expect(parseInvestmentInput('1.500,50,00')).toBeNull();
  });
});

describe('describeInvestmentError (X041)', () => {
  it('traduz os códigos que o servidor levanta', () => {
    expect(describeInvestmentError('talkx_investment_not_authorized'))
      .toContain('administradores e supervisores');
    expect(describeInvestmentError('talkx_investment_negative')).toContain('negativo');
    expect(describeInvestmentError('talkx_investment_campaign_not_found')).toContain('não encontrada');
    expect(describeInvestmentError(null)).toBe('Não foi possível salvar o investimento.');
    expect(describeInvestmentError('boom')).toBe('Não foi possível salvar o investimento.');
  });
});
