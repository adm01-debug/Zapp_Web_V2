/**
 * Simulação massiva de cenários — invariantes dos módulos puros.
 *
 * Gera centenas de entradas determinísticas (PRNG com seed fixa) e verifica
 * propriedades que NUNCA podem quebrar, independentemente do input:
 * limites numéricos, monotonicidade, ausência de exceções e segurança XSS.
 */
import { describe, it, expect } from 'vitest';
import { subDays, addDays, formatISO } from 'date-fns';
import { computeChurnRisk, getRiskLevel, type ChurnContact } from '@/components/ai/churnRisk';
import { rateThreshold, rateNetwork, computeOverallScore, type MetricStatus } from '@/components/performance/metricThresholds';
import { classifyTag, derivePriority, groupTagsIntoTickets, CATEGORIES, PRIORITY_MAP } from '@/components/ai/ticketClassification';
import { formatWhatsAppText } from '@/components/inbox/chat/MarkdownPreview';
import { cn } from '@/lib/utils';

// PRNG determinístico (mulberry32) — reprodutível em CI
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date('2026-06-10T12:00:00Z');
const SENTIMENTS = ['positive', 'negative', 'neutral', null, 'unknown', ''];

describe('Simulação: computeChurnRisk (500 contatos aleatórios)', () => {
  const rng = makeRng(42);

  const contacts: ChurnContact[] = Array.from({ length: 500 }, (_, i) => {
    const updatedDaysAgo = Math.floor(rng() * 400) - 5; // inclui datas futuras (clock skew)
    const createdDaysAgo = Math.floor(rng() * 800);
    return {
      id: `c${i}`,
      name: `Contato ${i}`,
      phone: `+55119${String(i).padStart(8, '0')}`,
      ai_sentiment: SENTIMENTS[Math.floor(rng() * SENTIMENTS.length)],
      updated_at: formatISO(updatedDaysAgo >= 0 ? subDays(NOW, updatedDaysAgo) : addDays(NOW, -updatedDaysAgo)),
      created_at: formatISO(subDays(NOW, createdDaysAgo)),
    };
  });

  it('score sempre dentro de [0, 100]', () => {
    for (const c of contacts) {
      const r = computeChurnRisk(c, NOW);
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('riskLevel sempre coerente com o score', () => {
    for (const c of contacts) {
      const r = computeChurnRisk(c, NOW);
      expect(r.riskLevel).toBe(getRiskLevel(r.riskScore));
    }
  });

  it('reasons nunca vazio e payload sempre completo', () => {
    for (const c of contacts) {
      const r = computeChurnRisk(c, NOW);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.contactId).toBe(c.id);
      expect(r.sentiment).toBe(c.ai_sentiment);
      expect(Number.isFinite(r.daysSinceLastMessage)).toBe(true);
    }
  });

  it('dias nunca negativos, mesmo com timestamps futuros (clock skew)', () => {
    for (const c of contacts) {
      expect(computeChurnRisk(c, NOW).daysSinceLastMessage).toBeGreaterThanOrEqual(0);
    }
    const future = computeChurnRisk(
      { ...contacts[0], updated_at: formatISO(addDays(NOW, 30)), created_at: formatISO(addDays(NOW, 10)) },
      NOW
    );
    expect(future.daysSinceLastMessage).toBe(0);
    expect(future.riskScore).toBeGreaterThanOrEqual(0);
  });

  it('sentimento negativo nunca reduz o score em condições idênticas', () => {
    for (let i = 0; i < 100; i++) {
      const base = contacts[i];
      const neg = computeChurnRisk({ ...base, ai_sentiment: 'negative' }, NOW);
      const pos = computeChurnRisk({ ...base, ai_sentiment: 'positive' }, NOW);
      expect(neg.riskScore).toBeGreaterThanOrEqual(pos.riskScore);
    }
  });
});

describe('Simulação: getRiskLevel (varredura exaustiva 0..100)', () => {
  it('classifica todos os inteiros no bucket correto e de forma monotônica', () => {
    const order = { low: 0, medium: 1, high: 2, critical: 3 } as const;
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const level = getRiskLevel(s);
      if (s < 30) expect(level).toBe('low');
      else if (s < 60) expect(level).toBe('medium');
      else if (s < 80) expect(level).toBe('high');
      else expect(level).toBe('critical');
      expect(order[level]).toBeGreaterThanOrEqual(prev);
      prev = order[level];
    }
  });
});

describe('Simulação: rateThreshold (1.000 triplas aleatórias)', () => {
  const rng = makeRng(7);

  it('retorna sempre um status válido e é monotônico no valor', () => {
    for (let i = 0; i < 1000; i++) {
      const good = Math.floor(rng() * 1000);
      const warn = good + 1 + Math.floor(rng() * 1000);
      const v1 = Math.floor(rng() * 3000);
      const v2 = v1 + Math.floor(rng() * 500);
      const s1 = rateThreshold(v1, good, warn);
      const s2 = rateThreshold(v2, good, warn);
      const rank = { good: 0, warning: 1, critical: 2 } as const;
      expect(['good', 'warning', 'critical']).toContain(s1);
      // valor maior nunca melhora o status
      expect(rank[s2]).toBeGreaterThanOrEqual(rank[s1]);
    }
  });

  it('fronteiras exatas caem no bucket pior', () => {
    expect(rateThreshold(100, 100, 200)).toBe('warning');
    expect(rateThreshold(200, 100, 200)).toBe('critical');
    expect(rateThreshold(99.999, 100, 200)).toBe('good');
  });

  it('rateNetwork cobre todos os effectiveTypes conhecidos e desconhecidos', () => {
    for (const t of ['4g', '3g', '2g', 'slow-2g', '5g', '', 'wifi', 'unknown']) {
      expect(['good', 'warning', 'critical']).toContain(rateNetwork(t));
    }
  });
});

describe('Simulação: computeOverallScore (300 listas aleatórias)', () => {
  const rng = makeRng(99);
  const STATUSES: MetricStatus[] = ['good', 'warning', 'critical'];

  it('sempre em [0,100]; 100 sse todos good; 0 sse nenhum good', () => {
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(rng() * 12); // inclui lista vazia
      const metrics = Array.from({ length: n }, () => ({ status: STATUSES[Math.floor(rng() * 3)] }));
      const score = computeOverallScore(metrics);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      const goods = metrics.filter(m => m.status === 'good').length;
      if (n > 0 && goods === n) expect(score).toBe(100);
      if (goods === 0) expect(score).toBe(0);
    }
  });
});

describe('Simulação: classificação de tickets (fuzz de 600 strings)', () => {
  const rng = makeRng(1234);
  const FRAGMENTS = ['suporte', 'bug', 'erro', 'venda', 'preço', 'compra', 'pag', 'boleto', 'fatura',
    'reclam', 'insatisf', 'agend', 'horário', 'urgent', '🔥', 'ção', 'ÁÉÍÓÚ', '<b>', '"; DROP TABLE--',
    '\\u0000', '   ', 'a'.repeat(200), ''];

  function randomTag() {
    const parts = Math.floor(rng() * 4);
    let s = '';
    for (let i = 0; i <= parts; i++) s += FRAGMENTS[Math.floor(rng() * FRAGMENTS.length)] + ' ';
    return rng() > 0.5 ? s.toUpperCase() : s;
  }

  it('classifyTag nunca lança e sempre retorna categoria conhecida', () => {
    const names = new Set(CATEGORIES.map(c => c.name));
    for (let i = 0; i < 600; i++) {
      const cat = classifyTag(randomTag());
      expect(names.has(cat)).toBe(true);
    }
  });

  it('derivePriority nunca lança e retorna prioridade mapeada para qualquer confiança', () => {
    for (let i = 0; i < 600; i++) {
      const conf = rng() * 2 - 0.5; // inclui negativos e > 1
      const p = derivePriority(randomTag(), conf);
      expect(Object.keys(PRIORITY_MAP)).toContain(p);
    }
  });

  it('groupTagsIntoTickets ignora linhas malformadas sem lançar', () => {
    const tickets = groupTagsIntoTickets([
      { contact_id: null, tag_name: 'suporte' },
      { contact_id: 'c1', tag_name: null },
      { contact_id: 'c1' },
      { tag_name: 'venda' },
      {},
      { contact_id: '', tag_name: 'x' },
      { contact_id: 'ok', tag_name: 'suporte técnico', confidence: 'alta', contacts: 42 },
    ]);
    expect(tickets.length).toBe(1);
    expect(tickets[0].contactId).toBe('ok');
    expect(tickets[0].confidence).toBeCloseTo(70); // confidence não-numérica → default
  });

  it('groupTagsIntoTickets: nº de tickets = contatos únicos; confiança exibida em [0,100]', () => {
    for (let i = 0; i < 100; i++) {
      const n = Math.floor(rng() * 30);
      const tags = Array.from({ length: n }, (_, j) => ({
        contact_id: `c${Math.floor(rng() * 8)}`,
        tag_name: randomTag(),
        confidence: rng() > 0.2 ? rng() : null,
        contacts: rng() > 0.1 ? { name: `N${j}` } : null,
      }));
      const tickets = groupTagsIntoTickets(tags);
      expect(tickets.length).toBe(new Set(tags.map(t => t.contact_id)).size);
      for (const t of tickets) {
        expect(t.confidence).toBeGreaterThanOrEqual(0);
        expect(t.confidence).toBeLessThanOrEqual(100);
        expect(t.contactName.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Simulação: formatWhatsAppText — segurança XSS (300+ payloads)', () => {
  const rng = makeRng(666);
  const XSS_CLASSICS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    'javascript:alert(1)',
    '"><iframe src=evil>',
    "'-alert(1)-'",
    '<a href="javascript:void(0)">x</a>',
    '<div style="background:url(javascript:alert(1))">',
    '&lt;script&gt;ja-escapado&lt;/script&gt;',
    '*bold* <b>html</b> _it_ ~strike~ ```code```',
  ];
  const PIECES = ['<', '>', '"', "'", '&', 'script', 'img', 'onerror=', 'onload=', '*b*', '_i_', '~s~',
    '```c```', 'normal', '😀', '\n', 'á é'];

  function randomPayload() {
    let s = '';
    const n = 1 + Math.floor(rng() * 12);
    for (let i = 0; i < n; i++) s += PIECES[Math.floor(rng() * PIECES.length)];
    return s;
  }

  const payloads = [...XSS_CLASSICS, ...Array.from({ length: 300 }, randomPayload)];

  it('nenhuma tag HTML do input sobrevive sem escape', () => {
    for (const p of payloads) {
      const out = formatWhatsAppText(p);
      // Únicas tags reais permitidas são as geradas pelo formatador;
      // o conteúdo escapado (&lt;img ... onerror=...&gt;) é texto inerte
      const stripped = out
        .replace(/<\/?(strong|em|del|br|code)(\s[^>]*)?\/?>/g, '')
        .replace(/<code class="[^"]*">/g, '');
      expect(stripped).not.toMatch(/<[a-zA-Z!/]/);
      expect(out).not.toContain('<script');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('<svg');
    }
  });

  it('formatação WhatsApp continua funcionando após o escape', () => {
    expect(formatWhatsAppText('*negrito*')).toContain('<strong>negrito</strong>');
    expect(formatWhatsAppText('_itálico_')).toContain('<em>itálico</em>');
    expect(formatWhatsAppText('~riscado~')).toContain('<del');
    expect(formatWhatsAppText('a\nb')).toContain('<br />');
  });
});

describe('Simulação: utilidades de classes (fuzz)', () => {
  const rng = makeRng(2026);

  it('cn aceita qualquer combinação sem lançar (200 casos)', () => {
    const inputs: unknown[] = ['a', '', null, undefined, 0, false, 'x', ['y', null], { z: true, w: false }];
    for (let i = 0; i < 200; i++) {
      const pick = Array.from({ length: Math.floor(rng() * 5) }, () => inputs[Math.floor(rng() * inputs.length)]);
      expect(() => cn(...(pick as Parameters<typeof cn>))).not.toThrow();
    }
  });
});
