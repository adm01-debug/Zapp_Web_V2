/**
 * T78 (SL-238) — Auditoria de contraste WCAG da Telefonia nos 3 temas.
 *
 * O laudo vive em `docs/design/telefonia-baseline-2026-09-29/contraste.md`. Este
 * arquivo é a TRANCA do laudo:
 *
 *  1. CLASSES — os componentes REAIS do módulo (`src/components/calls/**`) são
 *     renderizados e o teste exige a classe de cor que cada um pinta. Se a tela
 *     trocar de token, falha aqui antes de o laudo mentir.
 *  2. RAZÕES — os pares publicados no laudo são medidos nos tokens do app (CLARO,
 *     ESCURO, ALTO-CONTRASTE e ALTO-CONTRASTE+ESCURO) com o mesmo medidor WCAG de
 *     `tasks/__tests__/movimentoEContraste.test.tsx` (HSL → sRGB → luminância
 *     relativa; alfa composto como o navegador pinta) e comparados com a medida
 *     publicada. Se um token mudar, o teste falha de propósito e o laudo tem de ser
 *     refeito antes de voltar a passar.
 *
 * Regra do plano (T76/T78): o módulo usa os tokens de PREENCHIMENTO como texto
 * (`text-warning`, `text-destructive`, …). Onde isso não fecha AA, o plano manda
 * MEDIR e REGISTRAR, não repintar — nenhum par abaixo é "consertado" aqui.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, cleanup } from '@testing-library/react';

// ─── dublês das portas de I/O do IncomingCallAlert (o alerta é global; os hooks não são do cartão) ───
const { estado } = vi.hoisted(() => ({
  estado: { incomingCall: null as null | Record<string, unknown> },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: unknown }) => <div {...rest}>{children as never}</div>,
  },
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  useReducedMotion: () => false,
}));
vi.mock('../CallDialog', () => ({ CallDialog: () => <div data-testid="call-dialog" /> }));
vi.mock('@/hooks/communication/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({ incomingCall: estado.incomingCall, dismissCall: vi.fn() }),
}));
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({ accept: vi.fn(), reject: vi.fn(), session: { status: 'idle' } }),
}));
vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true, reason: null },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false, reason: null },
    linhaWhatsApp: null,
    rotuloLinhaWhatsApp: '',
  }),
}));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: { soundEnabled: false, soundVolume: 70 }, isQuietHours: () => false }),
}));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));
vi.mock('@/hooks/calls/useTerminoRemoto', () => ({ useTerminoRemoto: vi.fn() }));
vi.mock('@/lib/calls/persistence', () => ({ upsertMyCall: vi.fn() }));
vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: vi.fn() }));

import { CallResultCell } from '../CallResultCell';
import { CallKpiCard } from '../CallKpiCard';
import { CallChannelBadge } from '../CallChannelBadge';
import { CallDirectionCell } from '../CallDirectionCell';
import { IncomingCallAlert } from '../IncomingCallAlert';
import { Badge } from '@/components/ui/badge';

afterEach(() => cleanup());

// ─── Medidor WCAG (HSL → sRGB → luminância relativa) ───
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

// ─── tokens do app lidos do disco (é deles que saem os pares medidos) ───
const ler = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const tokensCss = ler('../../../styles/tokens.css');
const acessibilidadeCss = ler('../../../styles/accessibility.css');

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
/** Os 3 temas do plano + o alto-contraste sobre a base escura. */
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
/** `'--fg | --bg'` (opaco) ou `'--fg | --tinta/15'` (tinta composta sobre o card). */
function medir(vars: Record<string, string>, par: string): number {
  const [cor, fundo] = par.split('|').map((p) => p.trim());
  const frente = hslToRgb(...parseHsl(token(vars, cor)));
  const tinta = fundo.match(/^(--[a-z-]+)\/(\d+)$/);
  if (tinta) {
    // Como o navegador pinta `bg-token/15`: a tinta em alfa sobre o card.
    const base = hslToRgb(...parseHsl(token(vars, '--card')));
    const t = hslToRgb(...parseHsl(token(vars, tinta[1])));
    const a = Number(tinta[2]) / 100;
    const composta = t.map((v, i) => v * a + base[i] * (1 - a)) as RGB;
    return razaoRgb(frente, composta);
  }
  return razaoRgb(frente, hslToRgb(...parseHsl(token(vars, fundo))));
}

const MIN_TEXTO = 4.5;
/** 3:1 é o mínimo de WCAG 1.4.11 para ícone/indicador de interface. */
const MIN_ICONE = 3;

type Entrada = {
  par: string;
  /** Superfície do módulo que pinta o par (referência do laudo). */
  onde: string;
  min: number;
  /** Medida publicada no laudo, por tema. */
  valores: Record<string, number>;
  /** Temas em que o par NÃO fecha o mínimo (os resíduos publicados no laudo). */
  residuo: string[];
};

/**
 * Os pares publicados no laudo. `valores` é a MEDIDA registrada: se algum token
 * mudar, a igualdade abaixo cai e o laudo precisa ser medido de novo.
 */
const LAUDO: Entrada[] = [
  { par: '--foreground | --card', onde: 'valor da KPI, títulos, células da tabela', min: MIN_TEXTO, residuo: [],
    valores: { claro: 16.99, escuro: 16.89, 'alto-contraste': 21.0, 'alto-contraste+escuro': 19.47 } },
  { par: '--muted-foreground | --card', onde: 'rótulos, datas, cabeçalho da tabela', min: MIN_TEXTO, residuo: [],
    valores: { claro: 6.1, escuro: 9.32, 'alto-contraste': 12.63, 'alto-contraste+escuro': 12.12 } },
  { par: '--primary | --card', onde: 'text-primary (ícones, resultado "em andamento")', min: MIN_TEXTO,
    residuo: ['escuro', 'alto-contraste+escuro'],
    valores: { claro: 5.2, escuro: 3.4, 'alto-contraste': 8.79, 'alto-contraste+escuro': 4.12 } },
  { par: '--destructive | --card', onde: 'text-destructive (perdida, falhou, erro, mudo)', min: MIN_TEXTO,
    residuo: ['claro'],
    valores: { claro: 3.78, escuro: 5.89, 'alto-contraste': 5.89, 'alto-contraste+escuro': 5.35 } },
  { par: '--warning | --card', onde: 'text-warning (resultado "não atendida"/"ocupado")', min: MIN_TEXTO,
    residuo: ['claro', 'alto-contraste'],
    valores: { claro: 2.14, escuro: 9.96, 'alto-contraste': 2.14, 'alto-contraste+escuro': 10.97 } },
  { par: '--success | --card', onde: 'text-success (resultado "concluída", ícone recebida)', min: MIN_TEXTO, residuo: [],
    valores: { claro: 5.66, escuro: 7.7, 'alto-contraste': 5.66, 'alto-contraste+escuro': 8.47 } },
  { par: '--info | --card', onde: 'text-info — ÍCONE da chamada recebida (1.4.11)', min: MIN_ICONE, residuo: [],
    valores: { claro: 3.47, escuro: 5.82, 'alto-contraste': 3.47, 'alto-contraste+escuro': 6.4 } },
  { par: '--primary-foreground | --primary', onde: 'selo/botão primário', min: MIN_TEXTO,
    residuo: ['alto-contraste+escuro'],
    valores: { claro: 5.2, escuro: 5.2, 'alto-contraste': 8.79, 'alto-contraste+escuro': 4.44 } },
  { par: '--secondary-foreground | --secondary', onde: 'CallChannelBadge e selo "Ocupado"', min: MIN_TEXTO,
    residuo: ['claro'],
    valores: { claro: 3.3, escuro: 14.92, 'alto-contraste': 12.63, 'alto-contraste+escuro': 13.08 } },
  { par: '--destructive-foreground | --destructive', onde: 'selo/botão destrutivo', min: MIN_TEXTO,
    residuo: ['claro', 'escuro'],
    valores: { claro: 3.78, escuro: 3.0, 'alto-contraste': 5.89, 'alto-contraste+escuro': 5.77 } },
  { par: '--primary-foreground | --success', onde: 'cabeçalho da chamada de voz (IncomingCallAlert)', min: MIN_TEXTO,
    residuo: ['escuro'],
    valores: { claro: 5.66, escuro: 2.3, 'alto-contraste': 5.66, 'alto-contraste+escuro': 9.14 } },
  { par: '--primary-foreground | --info', onde: 'cabeçalho da chamada de vídeo (IncomingCallAlert)', min: MIN_TEXTO,
    residuo: ['claro', 'escuro', 'alto-contraste'],
    valores: { claro: 3.47, escuro: 3.04, 'alto-contraste': 3.47, 'alto-contraste+escuro': 6.91 } },
  { par: '--primary | --primary/15', onde: 'avatar da barra de chamada ativa', min: MIN_TEXTO,
    residuo: ['claro', 'escuro', 'alto-contraste+escuro'],
    valores: { claro: 4.21, escuro: 2.99, 'alto-contraste': 6.51, 'alto-contraste+escuro': 3.65 } },
  { par: '--primary | --primary/10', onde: 'avatar do painel de chamada/contato', min: MIN_TEXTO,
    residuo: ['escuro', 'alto-contraste+escuro'],
    valores: { claro: 4.52, escuro: 3.14, 'alto-contraste': 7.22, 'alto-contraste+escuro': 3.83 } },
  { par: '--foreground | --muted/40', onde: 'chip do seletor de contato e anotações', min: MIN_TEXTO, residuo: [],
    valores: { claro: 15.77, escuro: 15.49, 'alto-contraste': 19.23, 'alto-contraste+escuro': 17.94 } },
];

describe('T78 — o laudo é a medida dos tokens reais (CLARO/ESCURO/ALTO-CONTRASTE)', () => {
  for (const entrada of LAUDO) {
    it(`${entrada.par} — ${entrada.onde}`, () => {
      const medido: Record<string, number> = {};
      for (const [tema, vars] of Object.entries(TEMAS)) {
        medido[tema] = Number(medir(vars, entrada.par).toFixed(2));
      }
      expect(medido, `${entrada.par}: medida divergiu do laudo — refaça o laudo antes de seguir`).toEqual(
        entrada.valores,
      );
    });
  }

  it('o laudo registra resíduo ONDE e SÓ ONDE a medida não fecha o mínimo', () => {
    for (const entrada of LAUDO) {
      // Deriva os temas que falham a partir da PRÓPRIA medida publicada…
      const falhas = Object.entries(entrada.valores)
        .filter(([, v]) => v < entrada.min)
        .map(([tema]) => tema)
        .sort();
      // …e exige que seja exatamente o que o laudo publica como resíduo.
      expect(falhas, `${entrada.par}: resíduo do laudo não bate com a medida`).toEqual([...entrada.residuo].sort());
    }
  });

  it('todos os pares são medidos nos 4 temas medidos pelo laudo', () => {
    expect(Object.keys(TEMAS)).toEqual(['claro', 'escuro', 'alto-contraste', 'alto-contraste+escuro']);
    for (const entrada of LAUDO) {
      expect(Object.keys(entrada.valores).sort(), `${entrada.par}`).toEqual(Object.keys(TEMAS).sort());
    }
  });
});

// ─── CLASSES: os componentes reais pintam os pares que o laudo mede ───
const CLASSE_TEXTO: Record<string, string> = {
  'text-foreground': 'foreground',
  'text-muted-foreground': 'muted-foreground',
  'text-primary': 'primary',
  'text-primary-foreground': 'primary-foreground',
  'text-secondary-foreground': 'secondary-foreground',
  'text-destructive': 'destructive',
  'text-destructive-foreground': 'destructive-foreground',
  'text-warning': 'warning',
  'text-success': 'success',
  'text-info': 'info',
};
const declarada = (className: string, mapa: Record<string, string>): string | undefined => {
  for (const classe of Object.keys(mapa)) {
    if (new RegExp(`(^|\\s)${classe.replace(/[/.]/g, '\\$&')}(\\s|$)`).test(className)) return mapa[classe];
  }
  return undefined;
};

describe('T78 — os componentes reais pintam os pares do laudo', () => {
  it('CallResultCell: o texto usa o token de PREENCHIMENTO do tom (é o resíduo do laudo)', () => {
    const porTom: Array<[string, string]> = [
      ['completed', 'text-success'],
      ['missed', 'text-destructive'],
      ['no_answer', 'text-warning'],
      ['busy', 'text-warning'],
      ['failed', 'text-destructive'],
      ['cancelled', 'text-muted-foreground'],
      ['in_progress', 'text-primary'],
    ];
    for (const [result, classe] of porTom) {
      cleanup();
      const { container } = render(<CallResultCell result={result as never} />);
      const celula = container.firstElementChild as HTMLElement;
      expect(celula.className, `${result}`).toContain(classe);
      expect(declarada(celula.className, CLASSE_TEXTO), `${result}`).toBe(classe.replace('text-', ''));
    }
  });

  it('CallKpiCard: rótulo em muted-foreground e valor em foreground sobre bg-card', () => {
    const { container } = render(<CallKpiCard rotulo="Total" valor="12" />);
    const card = container.querySelector<HTMLElement>('[data-testid="tel-kpi-card"]')!;
    expect(card.className).toContain('bg-card');
    expect(card.querySelector<HTMLElement>('span')!.className).toContain('text-muted-foreground');
    expect(card.querySelector<HTMLElement>('[data-testid="tel-kpi-value"]')!.className).toContain('text-foreground');
  });

  it('CallChannelBadge: bg-secondary com text-secondary-foreground', () => {
    const { container } = render(<CallChannelBadge channel="voip" />);
    const selo = container.firstElementChild as HTMLElement;
    expect(selo.className).toContain('bg-secondary');
    expect(declarada(selo.className, CLASSE_TEXTO)).toBe('secondary-foreground');
  });

  it('CallDirectionCell: o ícone usa text-info (recebida) e text-primary (realizada)', () => {
    const { container: recebida } = render(<CallDirectionCell direction="inbound" />);
    expect(recebida.querySelector('svg')!.getAttribute('class')).toContain('text-info');
    cleanup();
    const { container: realizada } = render(<CallDirectionCell direction="outbound" />);
    expect(realizada.querySelector('svg')!.getAttribute('class')).toContain('text-primary');
  });

  it('selos do histórico (TelefoniaView.getStatusBadge): default / secondary / destructive', () => {
    const casos: Array<[string, string, string]> = [
      ['default', '--primary-foreground', 'primary'],
      ['secondary', '--secondary-foreground', 'secondary'],
      ['destructive', '--destructive-foreground', 'destructive'],
    ];
    for (const [variant, cor, fundo] of casos) {
      cleanup();
      const { container } = render(<Badge variant={variant as never}>Concluída</Badge>);
      const selo = container.firstElementChild as HTMLElement;
      expect(selo.className, `variant ${variant}`).toContain(`bg-${fundo}`);
      expect(declarada(selo.className, CLASSE_TEXTO), `variant ${variant}`).toBe(cor.replace('--', ''));
    }
  });

  it('IncomingCallAlert: voz pinta bg-success e vídeo pinta bg-info, ambos com text-primary-foreground', () => {
    const chamada = {
      id: 'notif-1', callId: 'call-1', contact_id: 'c1', contact_name: 'Cliente',
      contact_phone: '+55 11 90000-0000', is_video: false, whatsapp_connection_id: 'w1',
      started_at: '2026-10-08T00:00:00Z',
    };
    estado.incomingCall = { ...chamada, is_video: false };
    const { container: voz } = render(<IncomingCallAlert />);
    const cabecalhoVoz = voz.querySelector<HTMLElement>('.bg-success')!;
    expect(cabecalhoVoz).toBeTruthy();
    expect(cabecalhoVoz.className).toContain('text-primary-foreground');

    cleanup();
    estado.incomingCall = { ...chamada, is_video: true };
    const { container: video } = render(<IncomingCallAlert />);
    const cabecalhoVideo = video.querySelector<HTMLElement>('.bg-info')!;
    expect(cabecalhoVideo).toBeTruthy();
    expect(cabecalhoVideo.className).toContain('text-primary-foreground');
  });
});
