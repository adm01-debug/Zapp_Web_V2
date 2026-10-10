/**
 * cor crua → token (Inbox/CRM) — tranca da conversão.
 *
 * Os 5 pontos do cartão trocaram cor crua (hex, `hsl(N …)`, `rgba()` e escala do
 * Tailwind: `bg-blue-100`, `text-emerald-500`, …) por tokens do `tokens.css`:
 *
 *   1. `inbox/VirtualizedRealtimeList` — hover Resolver/Fixar/Adiar → success/warning/info
 *   2. `team-chat/TeamConversationList` — AvatarFallback direta/grupo/departamento
 *   3. `queues/CreateQueueDialog` (+ `EditQueueDialog`/`QueueCard`) — paleta da fila
 *   4. `contacts/contactTypeConfig` — os 6 tipos (color/gradient/dotBg/badgeClass)
 *   5. `groups/GroupsView` — aviso `text-warning` → `--warning-text`
 *
 * Duas provas, no espírito das outras trancas de `src/components/__tests__`:
 *
 *  A) FONTE — nenhum literal de cor crua voltou aos arquivos do cartão (o
 *     `componentesDuplicados.test.ts` usa a mesma varredura de arquivo).
 *  B) MEDIDA — as classes do badge/avatar/hover são ligadas ao TOKEN que o
 *     `tokens.css` publica e o contraste WCAG é medido nos 4 temas (CLARO,
 *     ESCURO, ALTO-CONTRASTE, ALTO-CONTRASTE+ESCURO) com o mesmo medidor de
 *     `calls/__tests__/telefoniaContraste.test.tsx` (HSL → sRGB → luminância).
 *     Onde não fecha AA, o cartão manda MEDIR e REGISTRAR, não repintar — o
 *     resíduo do hover `--warning | --card` no claro é o mesmo já publicado no
 *     laudo da Telefonia (2,14) e é o único registrado aqui.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup } from '@testing-library/react';

// A lista lê departamentos de um hook de I/O (não é do cartão): dublê.
vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [] }),
}));

import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import { QUEUE_COLORS } from '@/components/queues/queueColors';
import { TeamConversationList } from '@/components/team-chat/TeamConversationList';

afterEach(() => cleanup());

// ─── Medidor WCAG (HSL → sRGB → luminância relativa), igual ao da Telefonia ───
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
const luminancia = ([r, g, b]: RGB): number => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const ler = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const tokensCss = ler('../../styles/tokens.css');
const acessibilidadeCss = ler('../../styles/accessibility.css');

function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1, i = abre + 1;
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
const TEMAS: Record<string, Record<string, string>> = {
  claro,
  escuro,
  'alto-contraste': { ...claro, ...variaveis(acessibilidadeCss, '.high-contrast {') },
  'alto-contraste+escuro': { ...escuro, ...variaveis(acessibilidadeCss, '.dark.high-contrast {') },
};

const token = (vars: Record<string, string>, nome: string): string => {
  const chave = nome.replace(/^--/, '');
  if (!vars[chave]) throw new Error(`token --${chave} não existe no tema`);
  return vars[chave];
};
/** `'--fg | --bg'` ou `'--fg | --tinta/NN'` (tinta composta sobre o `--card`). */
function medir(vars: Record<string, string>, par: string): number {
  const [cor, fundo] = par.split('|').map((p) => p.trim());
  const frente = hslToRgb(...parseHsl(token(vars, cor)));
  const tinta = fundo.match(/^(--[a-z-]+)\/(\d+)$/);
  if (tinta) {
    const base = hslToRgb(...parseHsl(token(vars, '--card')));
    const t = hslToRgb(...parseHsl(token(vars, tinta[1])));
    const a = Number(tinta[2]) / 100;
    const composta = t.map((v, i) => v * a + base[i] * (1 - a)) as RGB;
    return razaoRgb(frente, composta);
  }
  return razaoRgb(frente, hslToRgb(...parseHsl(token(vars, fundo))));
}

const MIN_TEXTO = 4.5;
const MIN_ICONE = 3; // WCAG 1.4.11

// ─── A) FONTE: nenhum literal de cor crua voltou aos arquivos do cartão ───
const raiz = process.cwd();
const ARQUIVOS = [
  'src/components/inbox/VirtualizedRealtimeList.tsx',
  'src/components/team-chat/TeamConversationList.tsx',
  'src/components/queues/CreateQueueDialog.tsx',
  'src/components/queues/EditQueueDialog.tsx',
  'src/components/queues/QueueCard.tsx',
  'src/components/agents/AgentsView.tsx',
  'src/components/contacts/contactTypeConfig.tsx',
  'src/components/groups/GroupsView.tsx',
];
const conteudo = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

/** Recorte do cartão: o que foi trocado por token. */
const PROIBIDOS: Record<string, string[]> = {
  'src/components/inbox/VirtualizedRealtimeList.tsx': ['emerald-500', 'amber-500', 'sky-500'],
  'src/components/team-chat/TeamConversationList.tsx': [
    'bg-blue-100', 'text-blue-700', 'bg-purple-100', 'text-purple-700', 'bg-green-100', 'text-green-700',
  ],
  'src/components/queues/CreateQueueDialog.tsx': ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
  'src/components/queues/EditQueueDialog.tsx': ['#3B82F6', '#EC4899'],
  'src/components/groups/GroupsView.tsx': ['text-sm text-warning"'],
  'src/components/contacts/contactTypeConfig.tsx': [
    'hsl(217', 'hsl(270', 'hsl(25', 'hsl(142', 'hsl(38', 'hsl(0 72', 'rgba(',
  ],
};

describe('cor crua → token — nenhum literal cru volta (Inbox/CRM)', () => {
  for (const [arquivo, marcas] of Object.entries(PROIBIDOS)) {
    it(`${arquivo} não reintroduz cor crua`, () => {
      const texto = conteudo(arquivo);
      const achados = marcas.filter((m) => texto.includes(m));
      expect(achados, `cor crua ${JSON.stringify(achados)} em ${arquivo}`).toEqual([]);
    });
  }

  it('a paleta da fila só tem tokens (nada de hex)', () => {
    expect(QUEUE_COLORS).toHaveLength(8);
    for (const c of QUEUE_COLORS) expect(c).toMatch(/^hsl\(var\(--[a-z-]+\)\)$/);
  });

  it('os 6 tipos de contato usam token em color/dotBg/badgeClass', () => {
    for (const cfg of Object.values(CONTACT_TYPE_CONFIG)) {
      expect(cfg.color).toMatch(/^hsl\(var\(--[a-z-]+\)\)$/);
      expect(cfg.dotBg).toMatch(/^bg-[a-z-]+$/);
      expect(cfg.badgeClass).toMatch(/(^| )text-\[hsl\(var\(--[a-z-]+\)\)\]/);
      expect(cfg.badgeClass).toMatch(/ dark:text-\[hsl\(var\(--[a-z-]+\)\)\]/);
      expect(cfg.badgeClass).not.toMatch(/\[hsl\(\d|rgba\(/);
      expect(cfg.gradient).not.toMatch(/hsl\(\d/);
    }
  });

  it('o resolver do Inbox pinta hover só com token', () => {
    const texto = conteudo('src/components/inbox/VirtualizedRealtimeList.tsx');
    expect(texto).toContain('hover:text-success hover:bg-success/10');
    expect(texto).toContain('hover:text-warning hover:bg-warning/10');
    expect(texto).toContain('hover:text-info hover:bg-info/10');
  });
});

// ─── B) MEDIDA: classe do componente → token → contraste WCAG ───
type Caso = {
  nome: string;
  /** fg/bg efetivos por tema (o `dark:` muda a cor). */
  par: Record<string, string>;
  min: number;
  /** temas em que o par não fecha o mínimo (resíduo registrado, não repintado). */
  residuo: string[];
  valores: Record<string, number>;
};

/** Os pares saem das classes que os componentes realmente aplicam (abaixo). */
const CASOS: Caso[] = [
  { nome: 'tipo cliente (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--primary-text | --primary/15', escuro: '--primary-text | --primary/15', 'alto-contraste': '--primary-text | --primary/15', 'alto-contraste+escuro': '--primary-text | --primary/15' },
    valores: { claro: 7.58, escuro: 7.66, 'alto-contraste': 6.94, 'alto-contraste+escuro': 8.49 } },
  { nome: 'tipo fornecedor (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--dash-tile-violet | --dash-violet/15', escuro: '--dash-violet | --dash-violet/10', 'alto-contraste': '--dash-tile-violet | --dash-violet/15', 'alto-contraste+escuro': '--dash-violet | --dash-violet/10' },
    valores: { claro: 9, escuro: 4.66, 'alto-contraste': 9, 'alto-contraste+escuro': 5.23 } },
  { nome: 'tipo transportadora (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--dash-tile-amber | --dash-amber/15', escuro: '--dash-amber | --dash-amber/15', 'alto-contraste': '--dash-tile-amber | --dash-amber/15', 'alto-contraste+escuro': '--dash-amber | --dash-amber/15' },
    valores: { claro: 6.65, escuro: 7.32, 'alto-contraste': 6.65, 'alto-contraste+escuro': 8.37 } },
  { nome: 'tipo colaborador (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--success | --success/15', escuro: '--success | --success/15', 'alto-contraste': '--success | --success/15', 'alto-contraste+escuro': '--success | --success/15' },
    valores: { claro: 4.58, escuro: 5.99, 'alto-contraste': 4.58, 'alto-contraste+escuro': 6.81 } },
  { nome: 'tipo prestador (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--warning-text | --warning/15', escuro: '--warning-text | --warning/15', 'alto-contraste': '--warning-text | --warning/15', 'alto-contraste+escuro': '--warning-text | --warning/15' },
    valores: { claro: 4.82, escuro: 7.29, 'alto-contraste': 4.82, 'alto-contraste+escuro': 8.35 } },
  { nome: 'tipo parceiro (badge)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--destructive-text | --destructive/15', escuro: '--destructive-text | --destructive/15', 'alto-contraste': '--destructive-text | --destructive/15', 'alto-contraste+escuro': '--destructive-text | --destructive/15' },
    valores: { claro: 5.63, escuro: 4.93, 'alto-contraste': 5.18, 'alto-contraste+escuro': 5.8 } },
  { nome: 'avatar departamento', min: MIN_TEXTO, residuo: [],
    par: { claro: '--dash-tile-violet | --dash-violet/15', escuro: '--dash-violet | --dash-violet/10', 'alto-contraste': '--dash-tile-violet | --dash-violet/15', 'alto-contraste+escuro': '--dash-violet | --dash-violet/10' },
    valores: { claro: 9, escuro: 4.66, 'alto-contraste': 9, 'alto-contraste+escuro': 5.23 } },
  { nome: 'hover Resolver (ícone)', min: MIN_ICONE, residuo: [],
    par: { claro: '--success | --card', escuro: '--success | --card', 'alto-contraste': '--success | --card', 'alto-contraste+escuro': '--success | --card' },
    valores: { claro: 5.66, escuro: 7.7, 'alto-contraste': 5.66, 'alto-contraste+escuro': 8.47 } },
  { nome: 'hover Fixar (ícone)', min: MIN_ICONE, residuo: ['claro', 'alto-contraste'],
    par: { claro: '--warning | --card', escuro: '--warning | --card', 'alto-contraste': '--warning | --card', 'alto-contraste+escuro': '--warning | --card' },
    valores: { claro: 2.14, escuro: 9.96, 'alto-contraste': 2.14, 'alto-contraste+escuro': 10.97 } },
  { nome: 'hover Adiar (ícone)', min: MIN_ICONE, residuo: [],
    par: { claro: '--info | --card', escuro: '--info | --card', 'alto-contraste': '--info | --card', 'alto-contraste+escuro': '--info | --card' },
    valores: { claro: 3.47, escuro: 5.82, 'alto-contraste': 3.47, 'alto-contraste+escuro': 6.4 } },
  { nome: 'aviso de grupos (texto)', min: MIN_TEXTO, residuo: [],
    par: { claro: '--warning-text | --warning/10', escuro: '--warning-text | --warning/10', 'alto-contraste': '--warning-text | --warning/10', 'alto-contraste+escuro': '--warning-text | --warning/10' },
    valores: { claro: 5.01, escuro: 8.2, 'alto-contraste': 5.01, 'alto-contraste+escuro': 9.33 } },
];

describe('cor crua → token — contraste WCAG medido nos tokens reais', () => {
  for (const caso of CASOS) {
    it(`${caso.nome}`, () => {
      const medido: Record<string, number> = {};
      for (const [tema, vars] of Object.entries(TEMAS)) medido[tema] = Number(medir(vars, caso.par[tema]).toFixed(2));
      // A medida é a do laudo: se um token mudar, cai aqui e o laudo tem de ser refeito.
      expect(medido).toEqual(caso.valores);
      for (const [tema, razao] of Object.entries(medido)) {
        if (caso.residuo.includes(tema)) continue;
        expect(razao, `${caso.nome} em ${tema} abaixo de ${caso.min}`).toBeGreaterThanOrEqual(caso.min);
      }
    });
  }

  it('o badge de todo tipo declara um token de texto que existe nos 4 temas', () => {
    for (const cfg of Object.values(CONTACT_TYPE_CONFIG)) {
      const tokens = [...cfg.badgeClass.matchAll(/\[hsl\(var\((--[a-z-]+)\)\)\]/g)].map((m) => m[1]);
      expect(tokens.length).toBeGreaterThanOrEqual(2); // claro + dark
      for (const t of tokens)
        for (const [nome, vars] of Object.entries(TEMAS))
          expect(token(vars, t), `${t} ausente no tema ${nome}`).toBeTruthy();
    }
  });
});

// ─── B2) o componente de verdade aplica as classes (não só a config) ───
describe('TeamConversationList — o avatar pinta por token', () => {
  const conversas = [
    { id: 'c1', type: 'direct', name: 'Ana', department_id: null },
    { id: 'c2', type: 'group', name: 'Depto', department_id: 'd1' },
    { id: 'c3', type: 'group', name: 'Grupo', department_id: null },
  ] as unknown as Parameters<typeof TeamConversationList>[0]['conversations'];

  it('direta/grupo/departamento usam token; nenhum cinza-azul-verde da escala Tailwind', () => {
    const { container } = render(
      <TeamConversationList conversations={conversas} selectedId={null} onSelect={() => {}} />,
    );
    const html = container.innerHTML;
    expect(html).toContain('bg-primary/15');
    expect(html).toContain('bg-success/15');
    expect(html).toContain('bg-dash-violet/15');
    expect(html).not.toMatch(/bg-(blue|purple|green)-100/);
  });
});
