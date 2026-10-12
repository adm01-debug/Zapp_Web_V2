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
 * Três provas, no espírito das outras trancas de `src/components/__tests__`:
 *
 *  A) FONTE — nenhum literal de cor crua voltou aos arquivos do cartão (o
 *     `componentesDuplicados.test.ts` usa a mesma varredura de arquivo).
 *  B) MEDIDA — cada par (fg,bg) DERIVA das classes que o código aplica hoje
 *     (`badgeClass` do CONTACT_TYPE_CONFIG, branches do AvatarFallback,
 *     `hover:text/bg` do Inbox, aviso do GroupsView); o contraste WCAG é
 *     medido nos 4 temas (CLARO, ESCURO, ALTO-CONTRASTE,
 *     ALTO-CONTRASTE+ESCURO) com o mesmo medidor de
 *     `calls/__tests__/telefoniaContraste.test.tsx` (HSL → sRGB →
 *     luminância), compondo o fundo `/NN` sobre o `--card` REAL do tema.
 *     Critério: texto ≥ 4.5 (WCAG 1.4.3), ícone ≥ 3.0 (WCAG 1.4.11). Os
 *     números são CANDIDATOS medidos para tensionar contraste, não
 *     "aprovado seguro": onde não fecha AA, o cartão manda MEDIR e
 *     REGISTRAR, não repintar — o único resíduo é o hover Fixar no
 *     claro/alto-contraste (1.98 contra o fundo real com a tinta `/10`;
 *     2,14 contra o `--card` puro, o mesmo já publicado no laudo da
 *     Telefonia).
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
/** `'--fg | --bg'` ou `'--fg | --tinta/NN'` (tinta composta sobre o `--card` real). */
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

/**
 * O Tailwind v4 varre TODOS os arquivos (inclusive este teste) atras de
 * candidatos a classe: o literal colado de `text-` com `[hsl(var(` (mesmo
 * escapado dentro de regex) vira classe invalida e quebra o build
 * (`lightningcss: Unexpected token Delim('<')`). Por isso os padroes abaixo
 * sao montados por concatenacao em `new RegExp` — o fonte nunca contem o
 * trecho colado.
 */
const ARB_INI = 'text-' + '\\[hsl\\(var\\(';
const ARB_FIM = '\\)\\)\\]';

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
      expect(cfg.badgeClass).toMatch(new RegExp('(^| )' + ARB_INI + '--[a-z-]+' + ARB_FIM));
      expect(cfg.badgeClass).toMatch(new RegExp(' dark:' + ARB_INI + '--[a-z-]+' + ARB_FIM));
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

// ─── B) MEDIDA: pares (fg,bg) DERIVADOS das classes reais → contraste WCAG ───
const ehEscuro = (tema: string) => tema === 'escuro' || tema === 'alto-contraste+escuro';

/** Nomes de token publicados (sem `--`): só vale cor que o tokens.css publica. */
const PUBLICADOS = new Set(Object.values(TEMAS).flatMap((v) => Object.keys(v)));

function candidatosFgBg(classes: string, escuro: boolean): string[] {
  const toks = classes.split(/\s+/);
  return escuro
    ? [...toks.filter((t) => t.startsWith('dark:')), ...toks.filter((t) => !t.startsWith('dark:'))]
    : toks.filter((t) => !t.startsWith('dark:'));
}

/** Primeira cor de texto publicada na lista de classes. */
function fgDe(classes: string, escuro: boolean): string {
  for (const t of candidatosFgBg(classes, escuro)) {
    const c = t.replace(/^dark:/, '');
    const arb = c.match(new RegExp('^' + ARB_INI + '(--[a-z-]+)' + ARB_FIM + '$'));
    if (arb) return arb[1];
    const nomeada = c.match(/^text-([a-z0-9-]+)$/);
    if (nomeada && PUBLICADOS.has(nomeada[1])) return `--${nomeada[1]}`;
  }
  throw new Error(`sem cor de texto publicada em: ${classes}`);
}

/** Primeiro fundo `bg-NOME/NN` publicado na lista de classes. */
function bgDe(classes: string, escuro: boolean): string {
  for (const t of candidatosFgBg(classes, escuro)) {
    const c = t.replace(/^dark:/, '');
    const m = c.match(/^bg-([a-z0-9-]+)\/(\d+)$/);
    if (m && PUBLICADOS.has(m[1])) return `--${m[1]}/${m[2]}`;
  }
  throw new Error(`sem fundo bg-NOME/NN publicado em: ${classes}`);
}

/** `'--fg | --bg/NN'` pronto para o `medir`, saído das classes reais. */
const parDeClasses = (classes: string, escuro: boolean) => `${fgDe(classes, escuro)} | ${bgDe(classes, escuro)}`;

/** Hovers do Inbox: cada par sai do `aria-label` + `hover:text/bg` da fonte. */
function hoversDaFonte(): { nome: string; par: string }[] {
  const hs = [...conteudo('src/components/inbox/VirtualizedRealtimeList.tsx')
    .matchAll(/aria-label="([^"]+)"[\s\S]{0,500}?hover:text-([a-z0-9-]+) hover:bg-([a-z0-9-]+)\/(\d+)/g)]
    .map((m) => ({ nome: m[1], par: `--${m[2]} | --${m[3]}/${m[4]}` }));
  for (const h of hs) {
    const [fg, bg] = h.par.split('|').map((p) => p.trim());
    for (const tk of [fg, bg.split('/')[0]])
      if (!PUBLICADOS.has(tk.replace(/^--/, ''))) throw new Error(`hover ${h.nome} usa token não publicado: ${tk}`);
  }
  return hs;
}

/** Avatares: as 3 branches do `AvatarFallback` na fonte (o B2 prova que chegam ao DOM). */
function avataresDaFonte(): { nome: string; classes: string }[] {
  const teamFonte = conteudo('src/components/team-chat/TeamConversationList.tsx');
  const mAvatar = teamFonte.match(/conv\.type === 'direct' \? '([^']+)' :\s*conv\.department_id \? '([^']+)' :\s*'([^']+)'/);
  if (!mAvatar) throw new Error('branches do AvatarFallback não encontradas no TeamConversationList');
  return [
    { nome: 'avatar direta', classes: mAvatar[1] },
    { nome: 'avatar departamento', classes: mAvatar[2] },
    { nome: 'avatar grupo', classes: mAvatar[3] },
  ];
}

/** Aviso do GroupsView: `bg-warning/NN` + texto por token, direto da fonte. */
function parAvisoDaFonte(): string {
  const groupsFonte = conteudo('src/components/groups/GroupsView.tsx');
  const mAviso = groupsFonte.match(new RegExp("bg-warning/(\\d+)[^\"']*?" + ARB_INI + '(--[a-z-]+)' + ARB_FIM));
  if (!mAviso) throw new Error('aviso do GroupsView sem bg-warning/NN + texto por token');
  return `${mAviso[2]} | --warning/${mAviso[1]}`;
}

describe('cor crua → token — contraste medido nas classes reais', () => {
  it('os 3 hovers do cartão derivam de token publicado', () => {
    expect(hoversDaFonte().map((h) => h.nome)).toEqual(
      expect.arrayContaining(['Resolver conversa', 'Fixar conversa', 'Adiar conversa']),
    );
  });

  it('badges: par da badgeClass fecha AA (texto ≥ 4.5) nos 4 temas', () => {
    for (const [tipo, cfg] of Object.entries(CONTACT_TYPE_CONFIG)) {
      for (const [tema, vars] of Object.entries(TEMAS)) {
        const par = parDeClasses(cfg.badgeClass, ehEscuro(tema));
        const r = medir(vars, par);
        expect(r, `badge ${tipo} (${par}) em ${tema}: ${r.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    }
  });

  it('avatares: par do AvatarFallback fecha AA (texto ≥ 4.5) nos 4 temas', () => {
    for (const av of avataresDaFonte()) {
      for (const [tema, vars] of Object.entries(TEMAS)) {
        const par = parDeClasses(av.classes, ehEscuro(tema));
        const r = medir(vars, par);
        expect(r, `${av.nome} (${par}) em ${tema}: ${r.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    }
  });

  it('hovers: par das classes hover fecha 3:1 (ícone); Fixar no claro é resíduo registrado', () => {
    const RESIDUO: Record<string, string[]> = { 'Fixar conversa': ['claro', 'alto-contraste'] };
    for (const h of hoversDaFonte()) {
      for (const [tema, vars] of Object.entries(TEMAS)) {
        const r = medir(vars, h.par);
        if ((RESIDUO[h.nome] ?? []).includes(tema)) {
          expect(r, `${h.nome} (${h.par}) em ${tema}: ${r.toFixed(2)} agora fecha — tire do RESIDUO`).toBeLessThan(MIN_ICONE);
        } else {
          expect(r, `${h.nome} (${h.par}) em ${tema}: ${r.toFixed(2)} < 3`).toBeGreaterThanOrEqual(MIN_ICONE);
        }
      }
    }
  });

  it('aviso de grupos: par das classes fecha AA (texto ≥ 4.5) nos 4 temas', () => {
    for (const [tema, vars] of Object.entries(TEMAS)) {
      const PAR_AVISO = parAvisoDaFonte();
      const r = medir(vars, PAR_AVISO);
      expect(r, `aviso (${PAR_AVISO}) em ${tema}: ${r.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  });

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
    expect(html).toContain('bg-violeta/15');
    expect(html).not.toMatch(/bg-(blue|purple|green)-100/);
  });
});
