/**
 * Etapas 029, 030, 046 e 047 do plano de Tarefas (nível design) — a FAIXA de KPIs
 * (§3.1, linhas 41–45) e a BARRA de ferramentas (§Bloco C, linhas 291–292).
 *
 * O que já existia (e NÃO é reescrito aqui — só conferido no relato):
 *   · 029 textos/singular-plural/0-atenção-limite/compacto/"1,4 dias" e o clique que
 *     PUBLICA o recorte — `kpiStripTarefas.test.tsx`.
 *   · 030 os tokens de estado e o contraste dos chips — `movimentoEContraste.test.tsx`.
 *   · 046 busca, dropdowns, popover, chips, sincronia com a URL e toggle de concluídas
 *     — `barraFiltros.test.tsx`; a dica "Enter para criar" — `barraCapturaDisposicao.test.tsx`.
 *   · 047 o atalho `/` — `barraFiltros.test.tsx`; as teclas 1/2/3 — `TasksModule.atalhosDeModo.test.tsx`.
 *
 * O que ESTE arquivo fecha (as lacunas reais das quatro etapas):
 *   · 029 — o clique no KPI FILTRA a Lista de ponta a ponta (módulo + hook + URL), e
 *     clicar de novo remove o recorte. O `kpiStripTarefas` só prova o callback.
 *   · 030 — o contraste AA dos KPIs na tela REAL, nos dois temas, com o mesmo medidor
 *     WCAG do módulo (`movimentoEContraste`/`quadroLarguraFocoContraste`).
 *   · 047 — a ORDEM DE FOCO da barra (busca → Prioridade → Contato → Filtros).
 *
 * As medidas registradas (não são aprovação): o subtítulo `text-muted-foreground/80` e
 * os ícones decorativos dos tiles ficam ABAIXO do alvo no tema claro — o valor exato é
 * travado para a etapa 183 (auditoria do designer) reconferir. Os ícones são decorativos
 * (`aria-hidden`, o nome vem do texto ao lado), então a WCAG 1.4.11 (3:1) não se aplica a
 * eles; o subtítulo, sim, é texto e está registrado no Kanban.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';
import { TasksModule } from '@/components/tasks/TasksModule';
import { TasksKpiStrip } from '@/components/tasks/shared/TasksKpiStrip';
import type { KpiSnapshot } from '@/hooks/tasks/workItemAggregates';
import { TooltipProvider } from '@/components/ui/tooltip';

// ─── CSS do app lido do disco (tokens e o remap que a medição usa) ───
const lerCss = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const tokensCss = lerCss('../../../styles/tokens.css');
const utilitiesCss = lerCss('../../../styles/utilities.css');
const acessibilidadeCss = lerCss('../../../styles/accessibility.css');

/** Variáveis de um bloco (`:root {` / `.dark {`) — mesmo leitor do `movimentoEContraste`. */
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

const claro = variaveis(tokensCss, ':root {');
const escuro = { ...claro, ...variaveis(tokensCss, '.dark {') };
/** Os 4 temas do design system: claro, escuro e cada um com alto contraste. */
const TEMAS = {
  claro,
  escuro,
  'claro+alto contraste': { ...claro, ...variaveis(acessibilidadeCss, '.high-contrast {') },
  'escuro+alto contraste': { ...escuro, ...variaveis(acessibilidadeCss, '.dark.high-contrast {') },
};

// ─── Medidor WCAG (HSL → sRGB → luminância relativa), igual ao do módulo ───
type RGB = [number, number, number];
function parseHsl(s: string): { h: number; s: number; l: number; a: number } {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*([\d.]+))?/)!;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
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
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** Como o navegador pinta a cor (com o alfa do PRÓPRIO token) sobre uma base opaca. */
const pintar = (cor: RGB, alfa: number, base: RGB): RGB =>
  cor.map((v, i) => v * alfa + base[i] * (1 - alfa)) as RGB;
const rgb = (vars: Record<string, string>, token: string): RGB => {
  if (!vars[token.replace(/^--/, '')]) throw new Error(`token ${token} não existe no tema`);
  const t = parseHsl(vars[token.replace(/^--/, '')]);
  return hslToRgb(t.h, t.s, t.l);
};
/** Token sobre outro token (os dois com o alfa do próprio token). */
const razaoToken = (vars: Record<string, string>, frente: string, fundo: string): number => {
  const f = parseHsl(vars[frente.replace(/^--/, '')]);
  const b = parseHsl(vars[fundo.replace(/^--/, '')]);
  const fundoRgb = pintar(hslToRgb(b.h, b.s, b.l), b.a, hslToRgb(b.h, b.s, b.l));
  return razaoRgb(pintar(hslToRgb(f.h, f.s, f.l), f.a, fundoRgb), fundoRgb);
};
/** Texto com alfa `/N` composto sobre o card (o pacote do Tailwind). */
const razaoAlfaSobreCard = (vars: Record<string, string>, token: string, n: number): number => {
  const t = parseHsl(vars[token.replace(/^--/, '')]);
  const card = rgb(vars, '--card');
  return razaoRgb(pintar(hslToRgb(t.h, t.s, t.l), n, card), card);
};
/** Ícone do tile (`--kpi-tile-*-fg`) sobre a própria tinta translúcida composta no card. */
const razaoIconeTile = (vars: Record<string, string>, cor: 'blue' | 'green' | 'yellow' | 'purple'): number => {
  const tinta = parseHsl(vars[`kpi-tile-${cor}`]);
  const fg = rgb(vars, `--kpi-tile-${cor}-fg`);
  const card = rgb(vars, '--card');
  const fundo = pintar(hslToRgb(tinta.h, tinta.s, tinta.l), tinta.a, card);
  return razaoRgb(fg, fundo);
};

// ─── Harness ───
const CHEIO: KpiSnapshot = {
  overdue: 2,
  dueToday: 4,
  doingCount: 3,
  done7d: 5,
  avgCycleTimeDays: 9,
  avgLeadTimeDays: 1.4,
};

function renderKpis() {
  return render(
    // O remap de `text-destructive` do módulo vale por este seletor — a faixa vive dentro dele.
    <div data-testid="tasks-module">
      <TasksKpiStrip kpis={CHEIO} />
    </div>,
  );
}

const cardDe = (label: string): HTMLElement =>
  within(screen.getByTestId('tasks-kpi-strip')).getByText(label).closest<HTMLElement>('[data-testid="kpi-card"]')!;
const classeDe = (label: string, testid: string): string =>
  cardDe(label).querySelector(`[data-testid="${testid}"]`)!.getAttribute('class') ?? '';
/** O `<p>` do rótulo é o primeiro filho textual do bloco `min-w-0` (o valor vem depois). */
const rotuloDe = (label: string): HTMLElement =>
  cardDe(label).querySelector('[data-testid="kpi-value"]')!.previousElementSibling as HTMLElement;

function renderModule() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

// Padrão de dia inteiro para o prazo de HOJE (23:59 locais) e o de ONTEM.
const ontem = new Date(Date.now() - 86_400_000).toISOString();
const MODE_STORAGE_KEY = 'tasks-mode';

describe('Etapa 029 — o clique no KPI filtra a Lista de ponta a ponta (módulo + URL)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    localStorage.setItem(MODE_STORAGE_KEY, 'list');
    window.history.replaceState(null, '', '/');
    setSelectResult({
      data: [
        makeTaskRow({ id: 'atrasada', title: 'Vencida ontem', status: 'todo', due_date: ontem }),
        makeTaskRow({ id: 'futura', title: 'Sem prazo', status: 'todo', due_date: null }),
      ],
      error: null,
    });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('clicar em "Atrasadas" recorta a Lista e escreve o recorte na URL; clicar de novo remove', async () => {
    renderModule();
    await screen.findByText('Vencida ontem');
    expect(screen.getAllByText('Sem prazo').length).toBeGreaterThan(0);

    const acao = within(cardDe('Atrasadas')).getByTestId('kpi-acao');
    expect(acao.getAttribute('aria-pressed')).toBe('false');

    acao.click();

    // O recorte saiu do módulo, passou pelo hook e chegou à URL — é o mesmo parâmetro
    // que o chip da barra lê e que "Limpar filtros" apaga.
    await screen.findByTestId('filter-chip-remove-due');
    expect(window.location.search).toContain('due=overdue');
    expect(within(cardDe('Atrasadas')).getByTestId('kpi-acao').getAttribute('aria-pressed')).toBe('true');
    // A lista obedeceu: só a atrasada continua.
    expect(screen.queryAllByText('Sem prazo')).toHaveLength(0);

    // Clicar de novo é o "remover" que o rótulo do próprio KPI anuncia.
    within(cardDe('Atrasadas')).getByTestId('kpi-acao').click();
    await waitFor(() => expect(screen.queryAllByText('Sem prazo').length).toBeGreaterThan(0));
    expect(window.location.search).not.toContain('due=');
    expect(screen.queryByTestId('filter-chip-remove-due')).toBeNull();
  });
});

describe('Etapa 030 — contraste AA dos KPIs (4 temas, a tela real)', () => {
  afterEach(() => cleanup());

  const MIN_TEXTO = 4.5;

  it('o valor usa o texto cheio do tema e o rótulo, o apoio — os dois fecham AA sobre o card', () => {
    renderKpis();
    // O teste mede o que o card REALMENTE pintou (a classe), não um token solto.
    expect(classeDe('Atrasadas', 'kpi-value')).toMatch(/(^|\s)text-foreground(\s|$)/);
    expect(rotuloDe('Atrasadas').getAttribute('class')).toMatch(/(^|\s)text-muted-foreground(\s|$)/);

    for (const [tema, vars] of Object.entries(TEMAS)) {
      expect(razaoToken(vars, '--foreground', '--card'), `valor — ${tema}`).toBeGreaterThanOrEqual(MIN_TEXTO);
      expect(razaoToken(vars, '--muted-foreground', '--card'), `rótulo — ${tema}`).toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  });

  it('o subtítulo de atenção usa o par de TEXTO do estado (não a cor de preenchimento) e fecha AA nos 4 temas', () => {
    renderKpis();
    // Atrasadas > 0 e Fazendo no limite pedem atenção: subtítulo destrutivo.
    expect(classeDe('Atrasadas', 'kpi-subtitle')).toMatch(/(^|\s)text-destructive(\s|$)/);
    expect(classeDe('Fazendo', 'kpi-subtitle')).toMatch(/(^|\s)text-destructive(\s|$)/);
    // E o remap do módulo é quem troca o preenchimento pelo par de TEXTO.
    expect(utilitiesCss.replace(/\s+/g, ' ')).toMatch(/\[data-testid="tasks-module"\] \.text-destructive \{ color: hsl\(var\(--destructive-text\)\); \}/);

    for (const [tema, vars] of Object.entries(TEMAS)) {
      expect(razaoToken(vars, '--destructive-text', '--card'), `subtítulo destrutivo sobre o card — ${tema}`)
        .toBeGreaterThanOrEqual(MIN_TEXTO);
      // a tinta /15 do tile fica ATRÁS do texto de atenção (ícone e borda), então a medida
      // que vale é o texto sobre a tinta composta.
      const tinta = parseHsl(vars.destructive);
      const card = rgb(vars, '--card');
      const fundoTinta = pintar(hslToRgb(tinta.h, tinta.s, tinta.l), 0.15, card);
      expect(razaoRgb(rgb(vars, '--destructive-text'), fundoTinta), `subtítulo destrutivo sobre bg-destructive/15 — ${tema}`)
        .toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  });

  it('o ícone dos tiles é decorativo (o nome vem do texto ao lado): nenhum ícone carrega a leitura', () => {
    renderKpis();
    // Sem `aria-hidden` o ícone viraria gráfico "necessário para entender" (WCAG 1.4.11,
    // 3:1) — e é aí que o tema claro não fecha. O contrato é: o ícone é ornamento.
    const tiles = screen.getAllByTestId('kpi-tile');
    expect(tiles).toHaveLength(5);
    for (const tile of tiles) {
      const svg = tile.querySelector('svg');
      expect(svg, 'todo tile tem ícone ou anel').toBeTruthy();
      expect(svg!.getAttribute('aria-hidden'), 'o ícone/anel do tile é decorativo').toBe('true');
    }
    // O anel de progresso do "Fazendo" também é ornamento — o número "3/3" é quem informa.
    expect(cardDe('Fazendo').querySelector('[data-testid="kpi-ring"]')!.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * MEDIDA REGISTRADA (não é aprovação). Dois pares ficam abaixo do alvo no tema CLARO:
   *   · o subtítulo de apoio `text-muted-foreground/80` (3,88:1 — normal, 10px); o remap do
   *     módulo cobre /70 e /60, mas não o /80 que o KPI usa;
   *   · os ícones decorativos dos tiles (2,11 / 1,51 / 1,62) — fora da WCAG 1.4.11 por serem
   *     ornamento, mas ainda assim registro para a etapa 183 (auditoria do designer).
   * Se o token mudar, a tabela falha de propósito: a medida precisa ser refeita.
   */
  it('registra a medida do subtítulo /80 e dos ícones dos tiles no claro e no escuro', () => {
    const subtitulo = {
      claro: Number(razaoAlfaSobreCard(claro, '--muted-foreground', 0.8).toFixed(2)),
      escuro: Number(razaoAlfaSobreCard(escuro, '--muted-foreground', 0.8).toFixed(2)),
    };
    expect(subtitulo).toEqual({ claro: 3.88, escuro: 6.39 });
    expect(subtitulo.claro, 'o subtítulo de apoio no claro é texto e fica abaixo do AA').toBeLessThan(MIN_TEXTO);

    const icones = {
      claro: {
        blue: Number(razaoIconeTile(claro, 'blue').toFixed(2)),
        green: Number(razaoIconeTile(claro, 'green').toFixed(2)),
        yellow: Number(razaoIconeTile(claro, 'yellow').toFixed(2)),
      },
      escuro: {
        blue: Number(razaoIconeTile(escuro, 'blue').toFixed(2)),
        green: Number(razaoIconeTile(escuro, 'green').toFixed(2)),
        yellow: Number(razaoIconeTile(escuro, 'yellow').toFixed(2)),
      },
    };
    expect(icones).toEqual({
      claro: { blue: 2.11, green: 1.51, yellow: 1.62 },
      escuro: { blue: 6.28, green: 8.48, yellow: 7.86 },
    });
  });
});

describe('Etapa 047 — a ordem de foco da barra é a ordem de leitura da imagem 01', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    localStorage.setItem(MODE_STORAGE_KEY, 'list');
    window.history.replaceState(null, '', '/');
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente' })], error: null });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('no teclado, a barra vai de busca → Prioridade → Contato → Filtros, sem controle fora da ordem', async () => {
    renderModule();
    await screen.findByTestId('tasks-filter-bar');

    const barra = screen.getByTestId('tasks-filter-bar');
    const focaveis = Array.from(
      barra.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]'),
    ).filter((el) => el.getAttribute('tabindex') !== '-1' && !el.hasAttribute('disabled'));

    const identificacao = focaveis.map((el) =>
      el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.tagName,
    );

    // A busca abre a barra (é ela que o `/` foca); depois vêm os dois dropdowns e o
    // botão que abre o popover "Filtros" — a mesma esquerda→direita da imagem 01.
    expect(identificacao.slice(0, 4)).toEqual([
      'Buscar tarefa',
      'Prioridade',
      'Contato',
      'Filtros',
    ]);
    expect(focaveis[0]).toBe(screen.getByRole('searchbox', { name: 'Buscar tarefa' }));
  });
});
