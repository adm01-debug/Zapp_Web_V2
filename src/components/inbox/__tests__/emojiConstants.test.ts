import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  NATIVE_EMOJI_CATEGORIES,
} from '../emojiConstants';

// ── CATEGORY_LABELS ───────────────────────────────────────────────────────────

describe('CATEGORY_LABELS — estrutura', () => {
  it('é um objeto não nulo', () => {
    expect(typeof CATEGORY_LABELS).toBe('object');
    expect(CATEGORY_LABELS).not.toBeNull();
  });

  it('tem exatamente 25 categorias', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(25);
  });

  it('toda categoria tem emoji e rótulo não vazios', () => {
    Object.values(CATEGORY_LABELS).forEach((v) => {
      expect(typeof v.emoji).toBe('string');
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(typeof v.label).toBe('string');
      expect(v.label.length).toBeGreaterThan(0);
    });
  });

  it('nenhum rótulo se repete', () => {
    const labels = Object.values(CATEGORY_LABELS).map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('CATEGORY_LABELS — entradas conhecidas', () => {
  it.each([
    ['sorriso', '😊', 'Sorriso'],
    ['riso', '😂', 'Riso'],
    ['amor', '❤️', 'Amor'],
    ['festa', '🎉', 'Festa'],
    ['tech', '🤖', 'Tech'],
    ['outros', '📦', 'Outros'],
    ['meme', '🔥', 'Meme'],
  ])('"%s" é { emoji: "%s", label: "%s" }', (key, emoji, label) => {
    expect(CATEGORY_LABELS[key]).toEqual({ emoji, label });
  });
});

// ── ALL_CATEGORIES ────────────────────────────────────────────────────────────

describe('ALL_CATEGORIES', () => {
  it('é um array com as mesmas chaves de CATEGORY_LABELS', () => {
    expect(Array.isArray(ALL_CATEGORIES)).toBe(true);
    expect(ALL_CATEGORIES).toEqual(Object.keys(CATEGORY_LABELS));
    expect(ALL_CATEGORIES).toHaveLength(25);
  });

  it('todas as entradas são strings', () => {
    ALL_CATEGORIES.forEach((k) => expect(typeof k).toBe('string'));
  });

  it('contém sorriso, tech e outros', () => {
    expect(ALL_CATEGORIES).toContain('sorriso');
    expect(ALL_CATEGORIES).toContain('tech');
    expect(ALL_CATEGORIES).toContain('outros');
  });
});

// ── NATIVE_EMOJI_CATEGORIES ───────────────────────────────────────────────────

describe('NATIVE_EMOJI_CATEGORIES — estrutura', () => {
  it('é um array de 11 categorias com ids únicos', () => {
    expect(Array.isArray(NATIVE_EMOJI_CATEGORIES)).toBe(true);
    const ids = NATIVE_EMOJI_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual([
      'smileys', 'gestures', 'people', 'hearts', 'animals', 'food',
      'activities', 'travel', 'objects', 'symbols', 'flags',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda categoria tem id, ícone e rótulo não vazios', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.icon).toBe('string');
      expect(c.icon.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
    });
  });

  it('toda categoria tem emojis e nenhum é string vazia', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(Array.isArray(c.emojis)).toBe(true);
      expect(c.emojis.length).toBeGreaterThan(0);
      c.emojis.forEach((e) => {
        expect(typeof e).toBe('string');
        expect(e.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('NATIVE_EMOJI_CATEGORIES — categorias conhecidas', () => {
  const porId = (id: string) => NATIVE_EMOJI_CATEGORIES.find((c) => c.id === id)!;

  it('"smileys" é Carinhas 😀 com pelo menos 20 emojis', () => {
    const c = porId('smileys');
    expect(c.icon).toBe('😀');
    expect(c.label).toBe('Carinhas');
    expect(c.emojis.length).toBeGreaterThanOrEqual(20);
  });

  it('"gestures" é Mãos e Gestos 👋', () => {
    const c = porId('gestures');
    expect(c.icon).toBe('👋');
    expect(c.label).toBe('Mãos e Gestos');
  });

  it('"hearts" é Corações e Amor ❤️ e contém ❤️', () => {
    const c = porId('hearts');
    expect(c.icon).toBe('❤️');
    expect(c.label).toBe('Corações e Amor');
    expect(c.emojis).toContain('❤️');
  });

  it('"animals" é Animais ⚠ nome distinto e tem pelo menos 50 emojis', () => {
    const c = porId('animals');
    expect(c.label).toBe('Animais');
    expect(c.emojis.length).toBeGreaterThanOrEqual(50);
  });

  it('"food" é Comida e Bebida 🍔', () => {
    const c = porId('food');
    expect(c.icon).toBe('🍔');
    expect(c.label).toBe('Comida e Bebida');
  });

  it('"flags" contém as bandeiras do Brasil e dos EUA', () => {
    const c = porId('flags');
    expect(c.emojis).toContain('🇧🇷');
    expect(c.emojis).toContain('🇺🇸');
  });

  it('"smileys" contém 😀, 😭 e 🤖', () => {
    const c = porId('smileys');
    expect(c.emojis).toContain('😀');
    expect(c.emojis).toContain('😭');
    expect(c.emojis).toContain('🤖');
  });
});
