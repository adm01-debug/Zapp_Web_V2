/**
 * FASE H — etapas 79 e 80: movimento reduzido e contraste AA dos estados.
 *
 * Dois tipos de tranca, os dois medidos sobre a FONTE DE VERDADE (nada de snapshot de
 * componente, que não prova cor nem movimento):
 *
 *  - 79 — `utilities.css` é lido do disco (mesmo padrão de
 *    `settings/theme/__tests__/tokens-sync.test.ts`) porque o `@hello-pangea/dnd` escreve
 *    a transição do arrasto INLINE no elemento arrastável: o DoD do E.2 (`transitionDuration
 *    = 0s`) só se prova no CSS. O `useReducedMotion` do módulo é conferido no arquivo
 *    (o render do módulo inteiro é caro e é o E.2, em navegador real, que mede o efeito).
 *  - 80 — os 4 chips de prioridade e os dois estados do `DueChip` são renderizados e o
 *    par REAL que eles compõem (texto sobre o card e texto sobre a própria tinta /15) é
 *    medido com o mesmo medidor WCAG do ajuste AA de skin (`contrasteAA`): ≥4,5:1 para
 *    texto; o ícone do chip herda `currentColor`, então fecha os 3:1 junto.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup } from '@testing-library/react';
import { PriorityChip } from '@/components/tasks/shared/PriorityChip';
import { DueChip } from '@/components/tasks/shared/DueChip';
import { razao, razaoRgb, compor } from '@/components/settings/theme/contrasteAA';

const ler = (...partes: string[]) => fs.readFileSync(path.resolve(__dirname, ...partes), 'utf8');
const utilities = ler('../../../styles/utilities.css');
const tokens = ler('../../../styles/tokens.css');
const modulo = ler('../TasksModule.tsx');

/** Todo o corpo dos blocos `@media (<alvo>)` do arquivo (chaves contadas). */
function blocosDeMedia(css: string, alvo: string): string {
  let corpo = '';
  let de = 0;
  while ((de = css.indexOf('@media', de)) !== -1) {
    const abre = css.indexOf('{', de);
    if (abre === -1) break;
    let profundidade = 1;
    let i = abre + 1;
    while (profundidade > 0 && i < css.length) {
      if (css[i] === '{') profundidade++;
      else if (css[i] === '}') profundidade--;
      i++;
    }
    if (css.slice(de, abre).includes(alvo)) corpo += css.slice(abre + 1, i - 1);
    de = i;
  }
  return corpo;
}

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

const claro = variaveis(tokens, ':root {');
const escuro = { ...claro, ...variaveis(tokens, '.dark {') };

/** O texto como amostra RGB: o compositor com alfa 1 devolve a cor pura. */
const amostra = (cor: string, base: string) => compor(cor, 1, base);
/** Razão entre o texto e a tinta com alfa composta sobre o card (como o navegador pinta). */
const razaoNaTinta = (texto: string, tinta: string, alfa: number, card: string) =>
  razaoRgb(amostra(texto, card), compor(tinta, alfa, card));

const MIN_TEXTO = 4.5;

describe('Etapa 79 — movimento reduzido', () => {
  const movimento = blocosDeMedia(utilities, 'prefers-reduced-motion: reduce');
  /** O bloco com espaços colapsados: a régua fica no SELETOR + declaração, não no layout. */
  const movimentoCompacto = movimento.replace(/\s+/g, ' ');

  it('zera a transição do card arrastável (o dnd escreve a transição inline)', () => {
    // `none` + `!important` é o que vence o estilo inline da lib (0s medidos pelo E.2).
    expect(movimentoCompacto).toMatch(
      /\[data-rbd-draggable-id\],[^{]*\{ transition: none !important; \}/,
    );
  });

  it('zera a transição do card de tarefa e do módulo (o DoD pede 0s em todas as telas)', () => {
    expect(movimentoCompacto).toMatch(
      /\[data-testid="work-item-card"\],[^{]*\{ transition: none !important; \}/,
    );
    expect(movimentoCompacto).toMatch(
      /\[data-testid="tasks-module"\],[^{]*\{ transition: none !important; \}/,
    );
  });

  it('o módulo consulta prefers-reduced-motion e usa a duração 0 na troca de modo', () => {
    expect(modulo).toMatch(/import \{[^}]*useReducedMotion[^}]*\} from 'framer-motion'/);
    expect(modulo).toContain('useReducedMotion()');
    expect(modulo).toMatch(/transition=\{\{ duration: reduceMotion \? 0 :/);
  });
});

describe('Etapa 80 — contraste AA dos estados (E.3)', () => {
  afterEach(() => cleanup());
  it('os tokens de TEXTO dos estados existem nos dois modos (o preenchimento não muda)', () => {
    for (const [nome, vars] of [['claro', claro], ['escuro', escuro]] as const) {
      expect(vars['warning-text'], `${nome}: --warning-text`).toBeTruthy();
      expect(vars['destructive-text'], `${nome}: --destructive-text`).toBeTruthy();
    }
    // A cor de PREENCHIMENTO segue a mesma: é ela que o E.3 mede (ΔE).
    expect(claro.warning).toBe('38 92% 50%');
    expect(claro.destructive).toBe('0 75% 40%');
  });

  for (const [nome, vars] of [['claro', claro], ['escuro', escuro]] as const) {
    it(`${nome}: texto dos estados ≥ 4,5:1 sobre o card E sobre a própria tinta /15`, () => {
      const card = vars.card;
      const pares: Array<[string, string, string]> = [
        ['--warning-text', vars['warning-text'], vars.warning],
        ['--destructive-text', vars['destructive-text'], vars.destructive],
      ];
      for (const [token, texto, preenchimento] of pares) {
        expect(razao(texto, card), `${token} sobre o card`).toBeGreaterThanOrEqual(MIN_TEXTO);
        expect(
          razaoNaTinta(texto, preenchimento, 0.15, card),
          `${token} sobre bg-*/15`,
        ).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    });
  }

  it('o texto dos chips de prioridade usa o par de TEXTO (não a cor de preenchimento)', () => {
    const { container: high } = render(<PriorityChip priority="high" />);
    expect(high.firstElementChild?.className).toContain('text-[hsl(var(--warning-text))]');
    expect(high.firstElementChild?.className).not.toMatch(/(^|\s)text-warning(\s|$)/);

    const { container: urgent } = render(<PriorityChip priority="urgent" />);
    expect(urgent.firstElementChild?.className).toContain('text-[hsl(var(--destructive-text))]');
    expect(urgent.firstElementChild?.className).not.toMatch(/(^|\s)text-destructive(\s|$)/);
  });

  it('DueChip: atrasado e "Hoje" usam o par de TEXTO do estado', () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    const { container: atrasado } = render(<DueChip dueDate={ontem} />);
    expect(atrasado.firstElementChild?.className).toContain('text-[hsl(var(--destructive-text))]');

    const { container: hoje } = render(<DueChip dueDate={new Date().toISOString()} />);
    expect(hoje.firstElementChild?.className).toContain('text-[hsl(var(--warning-text))]');
  });

  it('o módulo de Tarefas troca o texto de estado pelo par AA e o texto de apoio pelo tom cheio', () => {
    const css = utilities.replace(/\s+/g, ' ');
    expect(css).toMatch(/\[data-testid="tasks-module"\] \.text-destructive \{ color: hsl\(var\(--destructive-text\)\); \}/);
    expect(css).toMatch(/\[data-testid="tasks-module"\] \.text-warning, \[data-testid="tasks-module"\] \.text-warning\\\/80 \{ color: hsl\(var\(--warning-text\)\); \}/);
    // Política da coluna vazia / "Coluna vazia" / atalho N: /70 e /60 caíam a 3,0:1 e 2,5:1.
    expect(css).toMatch(/\[data-testid="tasks-module"\] :is\(\.text-muted-foreground\\\/70, \.text-muted-foreground\\\/60\) \{ color: hsl\(var\(--muted-foreground\)\); \}/);
    expect(razao(claro['muted-foreground'], claro.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
    expect(razao(escuro['muted-foreground'], escuro.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
  });

  it('os chips do QuickAdd (`.chip-active`) escrevem na primária do modo, que fecha AA', () => {
    expect(utilities.replace(/\s+/g, ' ')).toMatch(/\.chip-active\.chip-active \{ color: hsl\(var\(--primary\)\); \}/);
    // Antes: `--primary-glow` no texto — 4,40:1 no claro e 4,02:1 no escuro.
    expect(razao(claro.primary, claro.popover)).toBeGreaterThanOrEqual(MIN_TEXTO);
    expect(razao(escuro.primary, escuro.popover)).toBeGreaterThanOrEqual(MIN_TEXTO);
    expect(razao(claro['primary-glow'], claro.popover)).toBeLessThan(MIN_TEXTO);
  });
});
