import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateLevel, xpForNextLevel, levelProgress } from '../levelUtils';

/**
 * Nível de gamificação: a MESMA regra vive em dois lugares — `calculateLevel`
 * (cliente, src/hooks/gamification/levelUtils.ts) e `public.calculate_level`
 * (banco, migration 20260927500000). Se uma das duas mudar sozinha, a tela e o
 * banco discordam (XP mostrado != XP creditado) e ninguém percebe.
 *
 * Este arquivo prova:
 *  1. `calculateLevel` nas bordas 50/200/450 (onde o nível vira) e a
 *     `levelProgress` sempre entre 0 e 100;
 *  2. a PARIDADE com o SQL: a fórmula é lida do arquivo da migration (não é
 *     uma cópia digitada aqui) e comparada com o resultado do cliente; a mesma
 *     tabela de pares (xp→nível) que o teste de banco usa
 *     (supabase/tests/gamification_nivel_paridade_rls.sql) é conferida aqui,
 *     então mexer num lado sem o outro fica vermelho.
 */

const RAIZ = process.cwd();
const MIGRATION_NIVEL = join(
  RAIZ,
  'supabase/migrations/20260927500000_gamification_bigint_and_daily_ratelimit.sql',
);
const TESTE_SQL = join(RAIZ, 'supabase/tests/gamification_nivel_paridade_rls.sql');

/** Tabela canônica de paridade (xp → nível). O MESMO texto vai no teste SQL. */
const PARIDADE_CSV = '0:1,49:1,50:2,51:2,199:2,200:3,449:3,450:4,800:5,1250:6,5000:11';
const PARIDADE = PARIDADE_CSV.split(',').map((par) => {
  const [xp, nivel] = par.split(':').map(Number);
  return { xp, nivel };
});

describe('calculateLevel (bordas 50/200/450)', () => {
  it('xp 0 vira nível 1 (nunca nível 0)', () => {
    expect(calculateLevel(0)).toBe(1);
  });

  it('cada par da tabela de paridade devolve o nível esperado', () => {
    for (const { xp, nivel } of PARIDADE) {
      expect(calculateLevel(xp), `xp=${xp}`).toBe(nivel);
    }
  });

  it('o nível sobe exatamente na borda xpForNextLevel(n)', () => {
    // 50 → nível 2, 200 → nível 3, 450 → nível 4 (bordas do cartão)
    for (const [borda, nivel] of [
      [50, 2],
      [200, 3],
      [450, 4],
    ] as const) {
      expect(xpForNextLevel(nivel - 1), `xpForNextLevel(${nivel - 1})`).toBe(borda);
      expect(calculateLevel(borda - 1), `xp=${borda - 1}`).toBe(nivel - 1);
      expect(calculateLevel(borda), `xp=${borda}`).toBe(nivel);
    }
  });

  it('xpForNextLevel(n) é o piso quadrático n²·50', () => {
    expect(xpForNextLevel(1)).toBe(50);
    expect(xpForNextLevel(2)).toBe(200);
    expect(xpForNextLevel(3)).toBe(450);
    expect(xpForNextLevel(10)).toBe(5000);
  });
});

describe('levelProgress (0-100, sem estourar)', () => {
  it('zera no piso do nível atual e é sempre um número entre 0 e 100', () => {
    expect(levelProgress(50, 2)).toBe(0);
    expect(levelProgress(200, 3)).toBe(0);
    for (let xp = 0; xp <= 5000; xp += 7) {
      const nivel = calculateLevel(xp);
      const progresso = levelProgress(xp, nivel);
      expect(Number.isFinite(progresso), `xp=${xp}`).toBe(true);
      expect(progresso, `xp=${xp}`).toBeGreaterThanOrEqual(0);
      expect(progresso, `xp=${xp}`).toBeLessThanOrEqual(100);
    }
  });

  it('aproxima de 100 na véspera da próxima borda e nunca passa', () => {
    const antesDaBorda = xpForNextLevel(2) - 1; // 199 → ainda nível 2
    expect(calculateLevel(antesDaBorda)).toBe(2);
    expect(levelProgress(antesDaBorda, 2)).toBeGreaterThan(99);
    expect(levelProgress(antesDaBorda, 2)).toBeLessThanOrEqual(100);
    // XP absurdo não pode dar progresso maior que 100
    expect(levelProgress(1_000_000_000, calculateLevel(1_000_000_000))).toBeLessThanOrEqual(100);
  });
});

describe('paridade com o SQL (calculate_level)', () => {
  it('a fórmula do cliente é a mesma que a migration publica', () => {
    const sql = readFileSync(MIGRATION_NIVEL, 'utf8');
    // extrai a fórmula do corpo da função, não uma cópia digitada no teste
    const corpo = sql.match(
      /FUNCTION\s+public\.calculate_level[\s\S]*?AS\s*\$\$([\s\S]*?)\$\$/i,
    );
    expect(corpo, 'não achei o corpo de public.calculate_level na migration').not.toBeNull();
    const corpoFn = corpo![1];
    expect(corpoFn).toMatch(/SQRT\(/);
    expect(corpoFn).toMatch(/FLOOR\(/);
    expect(corpoFn).toMatch(/GREATEST\(1/);

    const divisor = corpoFn.match(
      /SQRT\(\s*GREATEST\(\s*0\s*,\s*xp_amount\s*\)\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*\)/,
    );
    expect(divisor, 'não achei o divisor de SQRT na fórmula do SQL').not.toBeNull();
    // o divisor do banco tem de ser o mesmo do cliente
    expect(Number(divisor![1])).toBe(50);
  });

  it('cliente e fórmula do SQL dão o mesmo nível para toda a faixa 0..2000', () => {
    const sql = readFileSync(MIGRATION_NIVEL, 'utf8');
    const corpo = sql.match(
      /FUNCTION\s+public\.calculate_level[\s\S]*?AS\s*\$\$([\s\S]*?)\$\$/i,
    )![1];
    const divisor = Number(
      corpo.match(
        /SQRT\(\s*GREATEST\(\s*0\s*,\s*xp_amount\s*\)\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*\)/,
      )![1],
    );
    // reproduz o SQL: GREATEST(1, FLOOR(SQRT(xp/divisor)) + 1)
    const nivelSql = (xp: number) => Math.max(1, Math.floor(Math.sqrt(xp / divisor)) + 1);
    for (let xp = 0; xp <= 2000; xp += 1) {
      expect(calculateLevel(xp), `xp=${xp}`).toBe(nivelSql(xp));
    }
  });

  it('a tabela de paridade do teste SQL é byte a byte a mesma daqui', () => {
    const sql = readFileSync(TESTE_SQL, 'utf8');
    expect(sql).toContain(`PARIDADE-NIVEL: ${PARIDADE_CSV}`);
    expect(sql).toContain('public.calculate_level');
    expect(sql).toContain('set local role authenticated');
  });
});
