import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { calculateEngagement } from '../ContactEngagementScore';

// ─── Relógio congelado ──────────────────────────────────────────────────────
// O fixture calculava as datas com `Date.now()` e o componente chamava `Date.now()`
// de novo: duas leituras, dois instantes. Em `daysAgo(1)` a diferença de 1 ms cruza a
// fronteira do balde de recência (<=1 dia vale 40, acima vale 30) e o teste falhava
// de forma intermitente. Com o relógio fixo, as duas leituras são o mesmo instante.
const AGORA = new Date('2026-09-29T12:00:00.000Z');
const daysAgo = (n: number) =>
  new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// Combinações de parâmetros verificadas:
//   hot:    200 msgs, hoje, 30d atrás → freq=40 + recency=40 + vol=20 = 100
//   warm:    30 msgs, 2d atrás, 30d   → freq=20 + recency=30 + vol=10 = 60
//   cold:    10 msgs, 5d atrás, 30d   → freq=10 + recency=20 + vol=5  = 35
//   frozen:   0 msgs, sem msg, 365d   → 0 + 0 + 0 = 0

describe('calculateEngagement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========== NÍVEIS ==========

  it('retorna level=hot quando recência + frequência + volume >= 70', () => {
    const result = calculateEngagement(200, daysAgo(0), daysAgo(30));
    expect(result.level).toBe('hot');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('retorna level=warm quando score >= 40 e < 70', () => {
    // freq=20 + recency=30 + vol=10 = 60
    const result = calculateEngagement(30, daysAgo(2), daysAgo(30));
    expect(result.level).toBe('warm');
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
  });

  it('retorna level=cold quando score >= 15 e < 40', () => {
    // freq=10 + recency=20 + vol=5 = 35
    const result = calculateEngagement(10, daysAgo(5), daysAgo(30));
    expect(result.level).toBe('cold');
    expect(result.score).toBeGreaterThanOrEqual(15);
    expect(result.score).toBeLessThan(40);
  });

  it('retorna level=frozen quando score < 15', () => {
    const result = calculateEngagement(0, null, daysAgo(365));
    expect(result.level).toBe('frozen');
    expect(result.score).toBeLessThan(15);
  });

  // ========== CAMPOS DO RETORNO ==========

  it('score nunca ultrapassa 100', () => {
    const result = calculateEngagement(500, daysAgo(0), daysAgo(1));
    expect(result.score).toBe(100);
  });

  it('score >= 0 em todos os casos extremos', () => {
    expect(calculateEngagement(0, null, daysAgo(1000)).score).toBeGreaterThanOrEqual(0);
  });

  it('retorna label correta para cada nível', () => {
    expect(calculateEngagement(200, daysAgo(0), daysAgo(30)).label).toBe('Muito Ativo');
    expect(calculateEngagement(30, daysAgo(2), daysAgo(30)).label).toBe('Ativo');
    expect(calculateEngagement(10, daysAgo(5), daysAgo(30)).label).toBe('Baixo');
    expect(calculateEngagement(0, null, daysAgo(365)).label).toBe('Inativo');
  });

  // ========== bgColor: paridade com o JSX =========
  // JSX usa engagement.level para as classes inline, não engagement.bgColor.
  // Estes testes protegem contra nova inconsistência entre os dois.

  it('bgColor de frozen é bg-muted/30 (mesma classe do JSX)', () => {
    const result = calculateEngagement(0, null, daysAgo(365));
    expect(result.bgColor).toBe('bg-muted/30');
  });

  it('bgColor de hot é bg-[hsl(25_95%_53%)] (mesma classe do JSX)', () => {
    const result = calculateEngagement(200, daysAgo(0), daysAgo(30));
    expect(result.bgColor).toBe('bg-[hsl(25_95%_53%)]');
  });

  it('bgColor de warm é bg-[hsl(45_93%_47%)] (mesma classe do JSX)', () => {
    const result = calculateEngagement(30, daysAgo(2), daysAgo(30));
    expect(result.bgColor).toBe('bg-[hsl(45_93%_47%)]');
  });

  it('bgColor de cold é bg-[hsl(210_40%_60%)] (mesma classe do JSX)', () => {
    const result = calculateEngagement(10, daysAgo(5), daysAgo(30));
    expect(result.bgColor).toBe('bg-[hsl(210_40%_60%)]');
  });

  // ========== WCAG 1.4.3 — classes de cor de texto =========
  // L reduzido no light mode para garantir ≥ 4.5:1 contra fundo branco (bg-card).

  it('color de hot: light L=35% (~5.6:1) + dark L=53%', () => {
    const result = calculateEngagement(200, daysAgo(0), daysAgo(30));
    expect(result.color).toContain('hsl(25_95%_35%)');
    expect(result.color).toContain('dark:text-[hsl(25_95%_53%)]');
  });

  it('color de warm: light L=28% (~5.4:1) + dark L=47%', () => {
    const result = calculateEngagement(30, daysAgo(2), daysAgo(30));
    expect(result.color).toContain('hsl(45_93%_28%)');
    expect(result.color).toContain('dark:text-[hsl(45_93%_47%)]');
  });

  it('color de cold: light L=42% (~4.8:1) + dark L=60%', () => {
    const result = calculateEngagement(10, daysAgo(5), daysAgo(30));
    expect(result.color).toContain('hsl(210_40%_42%)');
    expect(result.color).toContain('dark:text-[hsl(210_40%_60%)]');
  });

  it('color de frozen: light L=38% (~6.5:1) + dark L=63%', () => {
    const result = calculateEngagement(0, null, daysAgo(365));
    expect(result.color).toContain('hsl(215_15%_38%)');
    expect(result.color).toContain('dark:text-[hsl(215_15%_63%)]');
  });

  // ========== RECÊNCIA =========

  it('sem mensagem (null lastMessageAt) → recencyScore=0', () => {
    // Sem msg e sem volume, só freq=0 → score=0
    const result = calculateEngagement(0, null, daysAgo(7));
    expect(result.score).toBe(0);
  });

  // ========== FRONTEIRAS DE NÍVEL =========

  it('score=70 exato é hot (limiar mínimo)', () => {
    // freq=30 (2msg/dia) + recency=40 (hoje) + vol=0 (< 5 msgs) = 70
    const result = calculateEngagement(2, daysAgo(0), daysAgo(1));
    expect(result.score).toBe(70);
    expect(result.level).toBe('hot');
  });

  it('score=69 é warm (justo abaixo do limiar hot)', () => {
    // freq=20 (0.5–2/dia) + recency=40 (hoje) + vol=5 (5–19 msgs) = 65
    // Não existe score=69 exato com a fórmula, mas 65 < 70 garante o mesmo invariante
    const result = calculateEngagement(5, daysAgo(0), daysAgo(9));
    // accountAgeDays=9, msgsPerDay=5/9≈0.56 → freq=20; recency=40; vol=5 → total=65
    expect(result.score).toBeLessThan(70);
    expect(result.level).toBe('warm');
  });
});
