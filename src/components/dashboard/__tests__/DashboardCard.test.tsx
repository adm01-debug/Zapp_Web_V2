import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { Target } from 'lucide-react';
import { DashboardCard, SectionHeader, VerTodasButton, StatusChip, Pill } from '../overview/DashboardCard';

describe('DashboardCard', () => {
  it('renderiza os filhos dentro do card', () => {
    render(<DashboardCard testid="my-card"><p>conteúdo</p></DashboardCard>);
    expect(screen.getByTestId('my-card')).toHaveTextContent('conteúdo');
  });
});

describe('SectionHeader', () => {
  it('renderiza título, subtítulo e tile no tamanho 44', () => {
    render(<SectionHeader icon={Target} title="Metas do Dia" subtitle="Progresso de hoje" tileSize={44} />);
    expect(screen.getByText('Metas do Dia')).toBeInTheDocument();
    expect(screen.getByText('Progresso de hoje')).toBeInTheDocument();
    expect(screen.getByTestId('section-tile')).toHaveClass('w-11');
  });

  it('tile no tamanho 34 usa classe menor', () => {
    render(<SectionHeader icon={Target} title="Inteligência Artificial" tileSize={34} />);
    expect(screen.getByTestId('section-tile')).toHaveClass('w-[34px]');
  });
});

describe('VerTodasButton', () => {
  it('chama onClick ao clicar', () => {
    const onClick = vi.fn();
    render(<VerTodasButton onClick={onClick} />);
    fireEvent.click(screen.getByTestId('ver-todas'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('StatusChip', () => {
  it('tone success renderiza com classe de sucesso', () => {
    render(<StatusChip label="Ao vivo" tone="success" pulse />);
    expect(screen.getByText('Ao vivo').closest('span')).toHaveClass('text-success');
  });

  it('tone muted renderiza sem classe de sucesso', () => {
    render(<StatusChip label="Offline" tone="muted" />);
    expect(screen.getByText('Offline').closest('span')).toHaveClass('text-muted-foreground');
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * TL-175C — contraste AA (claro e escuro) da pílula de status e do "Ver todas".
 *
 * O jsdom não pinta cor, então a prova junta duas trancas medidas sobre a FONTE
 * DE VERDADE:
 *  1. o par de classes que o componente REALMENTE aplica, lido do DOM (não do
 *     fonte) — classe não mapeada quebra o teste em vez de passar em silêncio;
 *  2. a razão WCAG calculada com os valores reais de `src/styles/tokens.css`
 *     (mesmo medidor de `tasks/__tests__/movimentoEContraste.test.tsx`).
 * O tema é o sinal real do app: a classe `dark` no `<html>`.
 * ────────────────────────────────────────────────────────────────────────── */
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
/** Razão entre o texto e a tinta com alfa composta sobre o card (como o navegador pinta). */
const razaoNaTinta = (texto: string, tinta: string, alfa: number, card: string): number =>
  razaoRgb(compor(texto, 1, card), compor(tinta, alfa, card));

/** Variáveis de um bloco (`:root {` / `.dark {`) — mesmo leitor do tokens-sync. */
function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
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
const tokensCss = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const claro = variaveis(tokensCss, ':root {');
const escuro = { ...claro, ...variaveis(tokensCss, '.dark {') };
const MIN_TEXTO = 4.5;

/** Classe de cor do Tailwind → variável de token (o que `tailwind.config.ts` mapeia). */
const TOKEN_DA_CLASSE: Record<string, string> = {
  success: 'success',
  'muted-foreground': 'muted-foreground',
  'foreground-secondary': 'foreground-secondary',
  'primary-glow': 'primary-glow',
  primary: 'primary',
  muted: 'muted',
  destructive: 'destructive',
  'dash-green': 'dash-green',
  'dash-red': 'dash-red',
  'dash-amber': 'dash-amber',
  'dash-violet': 'dash-violet',
  'dash-tile-violet': 'dash-tile-violet',
};
const TAMANHOS_DE_TEXTO = new Set([
  '2xs', '3xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl',
  'kpi-value', 'page-title',
]);

/** O par texto/fundo que as classes do elemento REALMENTE aplicam no tema. */
function parAplicado(el: Element, tema: 'claro' | 'escuro'): { texto: string; tinta: string; alfa: number } {
  let texto: string | undefined;
  let tinta: string | undefined;
  let alfa = 1;
  for (const bruta of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
    const partes = bruta.split(':');
    const prefixos = partes.slice(0, -1);
    const classe = partes[partes.length - 1];
    if (prefixos.includes('hover')) continue;
    if (prefixos.includes('dark') && tema !== 'escuro') continue;
    const varTexto = classe.match(/^text-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/);
    if (varTexto) { texto = varTexto[1]; continue; }
    const nomeTexto = classe.match(/^text-([a-z0-9-]+)$/);
    if (nomeTexto && !TAMANHOS_DE_TEXTO.has(nomeTexto[1])) {
      const token = TOKEN_DA_CLASSE[nomeTexto[1]];
      if (!token) throw new Error(`texto sem token mapeado (a cor mudou sem o teste saber): ${classe}`);
      texto = token; continue;
    }
    const nomeTinta = classe.match(/^bg-([a-z0-9-]+)(?:\/(\d+))?$/);
    if (nomeTinta) {
      const token = TOKEN_DA_CLASSE[nomeTinta[1]];
      if (!token) throw new Error(`fundo sem token mapeado (a cor mudou sem o teste saber): ${classe}`);
      tinta = token;
      alfa = nomeTinta[2] ? Number(nomeTinta[2]) / 100 : 1;
    }
  }
  if (!texto || !tinta) throw new Error(`o elemento não declara par texto/fundo: ${el.getAttribute('class')}`);
  return { texto, tinta, alfa };
}

/** CAMPAIGN_STATUS usa estes tons: a pílula de status cobre os seis. */
const TONS = [
  { tom: 'info', rotulo: 'Em andamento', claro: 'primary-text', escuro: 'primary-text' },
  { tom: 'success', rotulo: 'Concluída', claro: 'success', escuro: 'success' },
  { tom: 'danger', rotulo: 'Cancelada', claro: 'destructive-text', escuro: 'destructive-text' },
  { tom: 'warning', rotulo: 'Pausada', claro: 'warning-text', escuro: 'warning-text' },
  { tom: 'violet', rotulo: 'Agendada', claro: 'dash-tile-violet', escuro: 'dash-violet' },
  { tom: 'muted', rotulo: 'Rascunho', claro: 'muted-foreground', escuro: 'muted-foreground' },
] as const;

describe('TL-175C — contraste AA da pílula de status e do "Ver todas"', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
  });

  for (const tema of ['claro', 'escuro'] as const) {
    it(`${tema}: cada tom do Pill fecha ≥4,5:1 sobre o card`, () => {
      if (tema === 'escuro') document.documentElement.classList.add('dark');
      const vars = tema === 'escuro' ? escuro : claro;

      const { container } = render(
        <DashboardCard>
          {TONS.map((t) => (
            <Pill key={t.tom} label={t.rotulo} tone={t.tom} dot />
          ))}
        </DashboardCard>,
      );

      for (const caso of TONS) {
        const el = within(container).getByText(caso.rotulo);
        const par = parAplicado(el, tema);
        expect(
          razaoNaTinta(vars[par.texto], vars[par.tinta], par.alfa, vars.card),
          `${caso.rotulo}: ${par.texto} sobre ${par.tinta}/${par.alfa} no card (${tema})`,
        ).toBeGreaterThanOrEqual(MIN_TEXTO);
        expect(par.texto, `${caso.rotulo}: par de TEXTO do tom ${caso.tom} no ${tema}`).toBe(caso[tema]);
      }
    });

    it(`${tema}: "Ver todas" fecha ≥4,5:1 sobre o card`, () => {
      if (tema === 'escuro') document.documentElement.classList.add('dark');
      const vars = tema === 'escuro' ? escuro : claro;

      const { container } = render(
        <DashboardCard>
          <VerTodasButton />
        </DashboardCard>,
      );

      const el = within(container).getByTestId('ver-todas');
      const par = parAplicado(el, tema);
      expect(
        razaoNaTinta(vars[par.texto], vars[par.tinta], par.alfa, vars.card),
        `Ver todas: ${par.texto} sobre ${par.tinta}/${par.alfa} no card (${tema})`,
      ).toBeGreaterThanOrEqual(MIN_TEXTO);
    });
  }
});
