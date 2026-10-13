import { describe, it, expect } from 'vitest';
import { engagementScore, engagementLevel } from '../engagementScore';
import type { ContactStats } from '@/hooks/crm/useContactStats';

const base: ContactStats = {
  totalMessages: 0,
  avgResponseTimeMinutes: 0,
  totalConversations: 0,
  messagesChangePercent: null,
  conversationsChangePercent: null,
  csatAverage: null,
  csatCount: 0,
};

describe('engagementScore', () => {
  it('devolve null sem estatísticas (nenhum número inventado)', () => {
    expect(engagementScore(null)).toBeNull();
    expect(engagementScore(undefined)).toBeNull();
  });

  it('devolve null quando não há mensagem nem conversa', () => {
    expect(engagementScore({ ...base })).toBeNull();
  });

  it('soma volume + conversas + velocidade + CSAT (dados reais)', () => {
    // 100 msgs → 20; 4 conversas → 10; 10 min → 20; CSAT 5 → 15 = 65
    expect(
      engagementScore({ ...base, totalMessages: 100, totalConversations: 4, avgResponseTimeMinutes: 10, csatAverage: 5, csatCount: 3 }),
    ).toBe(65);
  });

  it('limita a 100 no teto', () => {
    expect(
      engagementScore({ ...base, totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes: 15, csatAverage: 5, csatCount: 1 }),
    ).toBe(100);
    // Acima do teto de cada componente não passa de 100
    expect(
      engagementScore({ ...base, totalMessages: 9999, totalConversations: 999, avgResponseTimeMinutes: 1, csatAverage: 5, csatCount: 50 }),
    ).toBe(100);
  });

  it('velocidade de resposta usa as faixas documentadas (fixos: 200 msgs + 10 conversas = 65)', () => {
    const withResp = (avgResponseTimeMinutes: number) =>
      engagementScore({ ...base, totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes });
    expect(withResp(15)).toBe(85); // 40 + 25 + 20
    expect(withResp(16)).toBe(80); // 15
    expect(withResp(60)).toBe(80);
    expect(withResp(61)).toBe(75); // 10
    expect(withResp(240)).toBe(75);
    expect(withResp(241)).toBe(70); // 5
    expect(withResp(1440)).toBe(70);
    expect(withResp(1441)).toBe(65); // 0
    expect(withResp(0)).toBe(65); // 0 = sem resposta medida, não penaliza além disso
  });

  it('CSAT só conta quando há avaliações e é limitado a 5', () => {
    // csatCount 0 → nenhum ponto, mesmo com média preenchida
    expect(
      engagementScore({ ...base, totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes: 15, csatAverage: 5, csatCount: 0 }),
    ).toBe(85);
    // média 6 (fora da escala) vale como 5 → +15
    expect(
      engagementScore({ ...base, totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes: 15, csatAverage: 6, csatCount: 2 }),
    ).toBe(100);
    // média 4 com 2 avaliações → +12
    expect(
      engagementScore({ ...base, totalMessages: 100, totalConversations: 4, avgResponseTimeMinutes: 10, csatAverage: 4, csatCount: 2 }),
    ).toBe(62);
  });

  it('com pouco histórico ainda devolve número real (nunca null)', () => {
    expect(engagementScore({ ...base, totalMessages: 1 })).toBe(0);
    expect(engagementScore({ ...base, totalConversations: 1 })).toBe(3); // 2.5 → round 3
  });
});

describe('engagementLevel', () => {
  it('classifica as faixas', () => {
    expect(engagementLevel(100)).toBe('Alto');
    expect(engagementLevel(80)).toBe('Alto');
    expect(engagementLevel(79)).toBe('Médio');
    expect(engagementLevel(50)).toBe('Médio');
    expect(engagementLevel(49)).toBe('Baixo');
    expect(engagementLevel(0)).toBe('Baixo');
  });
});
