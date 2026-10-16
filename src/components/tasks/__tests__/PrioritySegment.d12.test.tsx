/**
 * Etapa 170 (plano, linha 450; imagem 04, seção 3.4) — decisão D12 no controle
 * de prioridade do modal "Nova tarefa".
 *
 * A regra: `primary` (azul) é o sinal de SEGMENTO ESCOLHIDO; cada segmento NÃO
 * escolhido escreve o TEXTO na cor da própria prioridade — os MESMOS tokens do
 * `PriorityPill`/`PriorityChip` (âmbar na Média, vermelho na Alta/Urgente,
 * cinza na Baixa). Antes da correção os três não escolhidos ficavam neutros
 * (`text-muted-foreground`), então "prioridade" não era uma cor só no módulo.
 *
 * O teste prova duas coisas que o usuário vê: (a) quem está escolhido usa o par
 * `bg-primary`/`text-primary-foreground` e ninguém mais usa; (b) o par de texto
 * que cada não escolhido realmente pinta fecha contraste AA (≥4,5:1) sobre o
 * fundo do grupo (`bg-muted/30`) tanto no claro quanto no escuro — medido sobre
 * a FONTE DE VERDADE (`src/styles/tokens.css`), não sobre snapshot.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { Priority } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import { PrioritySegment } from '@/components/tasks/shared/new-task/PrioritySegment';

const ORDEM: Priority[] = ['low', 'medium', 'high', 'urgent'];

/** O par de TEXTO de cada prioridade — o MESMO do PriorityPill/PriorityChip. */
const COR_DA_PRIORIDADE: Record<Priority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-[hsl(var(--warning-text))]',
  high: 'text-[hsl(var(--destructive-text))]',
  urgent: 'text-[hsl(var(--destructive-text))]',
};

/** O token por trás de cada par — é ele que o medidor de contraste usa. */
const TOKEN_DA_PRIORIDADE: Record<Priority, string> = {
  low: 'muted-foreground',
  medium: 'warning-text',
  high: 'destructive-text',
  urgent: 'destructive-text',
};

// ─── HSL → sRGB → luminância relativa → contraste WCAG (mesmo medidor do
//     `movimentoEContraste.test.tsx` e do `settings/theme/__tests__`) ───
type RGB = [number, number, number];
function parseHsl(s: string): RGB {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function luminancia([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
/** Como o navegador pinta `cor` com alfa sobre `base`. */
const compor = (cor: string, alfa: number, base: string): RGB => {
  const [r, g, b] = hslToRgb(...parseHsl(cor));
  const [br, bg, bb] = hslToRgb(...parseHsl(base));
  return [r * alfa + br * (1 - alfa), g * alfa + bg * (1 - alfa), b * alfa + bb * (1 - alfa)];
};
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** Razão WCAG entre dois tokens HSL (alfa 1). */
const razao = (cor: string, base: string): number => razaoRgb(compor(cor, 1, base), compor(base, 1, base));
/** Razão entre o TEXTO e a tinta com alfa composta sobre o que está atrás (como o navegador pinta). */
const razaoNaTinta = (texto: string, tinta: string, alfa: number, atras: string): number =>
  razaoRgb(compor(texto, 1, atras), compor(tinta, alfa, atras));

/** Variáveis de um bloco (`:root {` / `.dark {`) — mesmo leitor do tokens-sync. */
function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1;
  let i = abre + 1;
  while (profundidade > 0 && i < css.length) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}') profundidade--;
    i++;
  }
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css.slice(abre + 1, i - 1)))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

const tokens = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const claro = variaveis(tokens, ':root {');
const escuro = { ...claro, ...variaveis(tokens, '.dark {') };

const MIN_TEXTO = 4.5;
/** O fundo sobre o qual o grupo pinta o texto: `bg-muted/30` sobre o card. */
const ALFA_DO_GRUPO = 0.3;

afterEach(() => cleanup());

const opcoes = () => screen.getAllByRole('radio') as HTMLButtonElement[];
const prioridadeDe = (o: HTMLButtonElement) => o.getAttribute('data-priority') as Priority;

describe('D12 (etapa 170) — só o segmento escolhido usa primary', () => {
  it('marca a escolhida com o par primary e escreve as demais na cor da própria prioridade', () => {
    for (const escolhida of ORDEM) {
      const { unmount } = render(<PrioritySegment value={escolhida} onChange={() => {}} />);

      const grupo = screen.getByRole('radiogroup', { name: 'Prioridade' });
      expect(grupo).toBeInTheDocument();
      expect(opcoes().map((o) => o.textContent)).toEqual(ORDEM.map((p) => PRIORITY_LABELS[p]));

      for (const opcao of opcoes()) {
        const p = prioridadeDe(opcao);
        const e = p === escolhida;

        expect(opcao.getAttribute('aria-checked')).toBe(String(e));
        // Tabindex móvel: um só tab stop, como um radio group nativo.
        expect(opcao.tabIndex).toBe(e ? 0 : -1);
        // Foco visível do sistema em todas as opções (navegação por setas).
        expect(opcao.className).toContain('focus-visible:ring-2');

        if (e) {
          expect(opcao.className).toContain('bg-primary');
          expect(opcao.className).toContain('text-primary-foreground');
          // A escolhida é azul, não a cor da prioridade: "escolhido" e
          // "prioridade" não podem ser a mesma cor (D12, plano linha 450).
          expect(opcao.className).not.toContain('--warning-text');
          expect(opcao.className).not.toContain('--destructive-text');
        } else {
          // O azul do `primary` é SÓ da opção escolhida (D12)...
          expect(opcao.className).not.toContain('bg-primary');
          expect(opcao.className).not.toContain('text-primary-foreground');
          // ...e as demais usam a COR DA PRÓPRIA PRIORIDADE: âmbar na Média,
          // vermelho na Alta/Urgente, cinza na Baixa.
          expect(opcao.className).toContain(COR_DA_PRIORIDADE[p]);
        }
      }

      unmount();
    }
  });

  it('as setas andam entre as opções e trocam a escolha (com volta no fim)', () => {
    const escolhas: Priority[] = [];
    render(<PrioritySegment value="urgent" onChange={(p) => escolhas.push(p)} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: PRIORITY_LABELS.urgent }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radio', { name: PRIORITY_LABELS.urgent }), { key: 'ArrowLeft' });

    expect(escolhas).toEqual(['low', 'high']);
  });

  it('clicar num segmento devolve a prioridade dele', () => {
    const escolhas: Priority[] = [];
    render(<PrioritySegment value="low" onChange={(p) => escolhas.push(p)} />);

    fireEvent.click(screen.getByRole('radio', { name: PRIORITY_LABELS.high }));

    expect(escolhas).toEqual(['high']);
  });
});

describe('D12 (etapa 170) — contraste AA do controle nos dois modos', () => {
  for (const [modo, vars] of [['claro', claro], ['escuro', escuro]] as const) {
    it(`${modo}: a escolhida fecha AA (primary-foreground sobre primary)`, () => {
      expect(vars['primary']).toBeTruthy();
      expect(vars['primary-foreground']).toBeTruthy();
      expect(razao(vars['primary-foreground'], vars.primary)).toBeGreaterThanOrEqual(MIN_TEXTO);
    });

    it(`${modo}: cada segmento não escolhido fecha AA sobre o fundo do grupo`, () => {
      // O fundo do grupo é `bg-muted/30` sobre o card — como o navegador pinta.
      for (const p of ORDEM) {
        const token = TOKEN_DA_PRIORIDADE[p];
        expect(vars[token], `${modo}: --${token}`).toBeTruthy();
        expect(
          razaoNaTinta(vars[token], vars.muted, ALFA_DO_GRUPO, vars.card),
          `${modo}: texto de "${PRIORITY_LABELS[p]}" (--${token}) sobre bg-muted/30`,
        ).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    });

    it(`${modo}: a classe que o componente escreve nomeia exatamente os tokens medidos`, () => {
      const { unmount } = render(<PrioritySegment value="low" onChange={() => {}} />);
      for (const opcao of opcoes()) {
        const p = prioridadeDe(opcao);
        if (p === 'low') {
          expect(opcao.className).toContain('bg-primary');
          continue;
        }
        // O mesmo token que o medidor de contraste consulta em `tokens.css`.
        expect(opcao.className).toContain(`--${TOKEN_DA_PRIORIDADE[p]}`);
      }
      unmount();
    });
  }
});