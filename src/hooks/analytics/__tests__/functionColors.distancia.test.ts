/**
 * [refazer 1] Cores das funções de IA têm de se distinguir no gráfico.
 *
 * Recusa do revisor: `ai-enhance-message` usava `--chart-9` (matiz 230), a 9
 * graus do azul de `ai-suggest-reply` (`--chart-1`, 221) — na pizza e na
 * legenda as duas fatias pareciam a mesma cor. E `ai-conversation-summary`
 * (`--chart-3`, 160) ficava a 15 graus de `chatbot-l1` (`--chart-6`, 175).
 *
 * A prova resolve os tokens `hsl(var(--chart-N))` do `FUNCTION_COLORS` (código
 * real) contra os matizes declarados em `src/styles/tokens.css` (arquivo real,
 * nos dois temas) e mede a distância circular entre os pares criticados.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUNCTION_COLORS } from '../useAIUsageDashboard';

const TOKENS_CSS = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');

type Tema = 'claro' | 'escuro';

/** Trecho do tokens.css de cada tema: `:root` (claro) e `.dark` (escuro). */
function blocoDoTema(tema: Tema): string {
  const partes = TOKENS_CSS.split('.dark {');
  if (partes.length < 2) throw new Error('bloco .dark nao achado em tokens.css');
  return tema === 'claro' ? partes[0]! : partes.slice(1).join('.dark {');
}

/** Matiz do token `--chart-N` no tema dado. */
function matizDoToken(n: number, tema: Tema): number {
  const mapa = new Map<number, number>();
  for (const o of blocoDoTema(tema).match(/--chart-\d+:\s*[\d.]+/g) ?? []) {
    const m = o.match(/--chart-(\d+):\s*([\d.]+)/);
    if (m) mapa.set(Number(m[1]), Number(m[2]));
  }
  const h = mapa.get(n);
  if (h === undefined) throw new Error(`--chart-${n} nao achado em tokens.css (${tema})`);
  return h;
}

/** Matiz da cor declarada em FUNCTION_COLORS para a função, no tema dado. */
function matizDaFuncao(funcao: string, tema: Tema): number {
  const cor = FUNCTION_COLORS[funcao];
  const m = cor?.match(/var\(--chart-(\d+)\)/);
  if (!m) throw new Error(`${funcao} nao usa token --chart-*: ${cor}`);
  return matizDoToken(Number(m[1]), tema);
}

/** Distância circular entre dois matizes, em graus (0–180). */
function distancia(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('FUNCTION_COLORS — fatias vizinhas se distinguem', () => {
  it('toda função usa token --chart-* (nada de hex cru)', () => {
    for (const [funcao, cor] of Object.entries(FUNCTION_COLORS)) {
      expect(cor, `${funcao} voltou ao hex cru`).toMatch(/var\(--chart-\d+\)/);
    }
  });

  it.each(['claro', 'escuro'] as const)(
    'enhance (Reescrita) se afasta do azul de suggest (Sugestão) — %s',
    (tema) => {
      const d = distancia(matizDaFuncao('ai-enhance-message', tema), matizDaFuncao('ai-suggest-reply', tema));
      // Antes: chart-9 (230) x chart-1 (221) = 9 graus. Agora: chart-5 (340) x chart-1 (221) = 119.
      expect(d).toBeGreaterThanOrEqual(90);
    },
  );

  it.each(['claro', 'escuro'] as const)(
    'summary (Resumo) se distingue de chatbot-l1 — %s',
    (tema) => {
      const d = distancia(matizDaFuncao('ai-conversation-summary', tema), matizDaFuncao('chatbot-l1', tema));
      // Antes: chart-3 (160) x chart-6 (175) = 15 graus no claro, 20 no escuro.
      // Agora: chart-3 (160/155) x chart-10 (190) = 30 no claro, 35 no escuro.
      expect(d).toBeGreaterThanOrEqual(25);
    },
  );
});
