import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { WhatsAppBubble, PhoneFrame } from '../kit/preview';
import { StateShell } from '../kit/states';
import { ChannelCell } from '../kit/cells';
import { AlertCard } from '../kit/primitives';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/**
 * t_901ba1fe — contraste do TEMA CLARO no Talk X (régua TL-175D / t_aeb3074d).
 *
 * O caminho da prova é fechado: o teste RENDERIZA o componente real, lê a classe de cor que ele
 * aplicou no DOM, resolve o token no `tokens.css` lido do disco e MEDE a razão WCAG sobre a
 * superfície em que o elemento aparece. O valor esperado vem do componente, nunca de um literal
 * escrito aqui: desfazer a correção (voltar à tinta de preenchimento) reprova pela razão medida.
 *
 * O que jsdom NÃO prova: pixel e a varredura axe no Chromium real — essa é a régua
 * `e2e/talkx-visual.spec.ts` (TL-175D), e é a prova do cartão. Aqui fica o contrato destes
 * componentes, que roda no CI de unidade.
 */

const css = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');

/** Bloco `:root {`/`.dark {` de tokens.css → mapa `--variavel: valor`. */
function bloco(header: string): Record<string, string> {
  const idx = css.indexOf(header);
  expect(idx, `bloco ${header} ausente em tokens.css`).toBeGreaterThan(-1);
  const ini = css.indexOf('{', idx);
  let depth = 1;
  let i = ini + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
    i += 1;
  }
  const corpo = css.slice(ini + 1, i - 1);
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

const claro = bloco(':root {');
const escuro = bloco('.dark {');
type Tema = 'claro' | 'escuro';

type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const X = C * (1 - Math.abs((hp % 2) - 1));
  const m = l - C / 2;
  const p: RGB =
    hp < 1 ? [C, X, 0] : hp < 2 ? [X, C, 0] : hp < 3 ? [0, C, X]
      : hp < 4 ? [0, X, C] : hp < 5 ? [X, 0, C] : [C, 0, X];
  return [p[0] + m, p[1] + m, p[2] + m];
}

function luminancia(c: RGB): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function razao(a: RGB, b: RGB): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [alto, baixo] = la >= lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (baixo + 0.05);
}

/** Tinta por cima de outra — a mesma conta do `hsl(var(--x) / alfa)` sobre o card. */
function porCima(tinta: RGB, alfa: number, fundo: RGB): RGB {
  return [0, 1, 2].map((i) => tinta[i] * alfa + fundo[i] * (1 - alfa)) as RGB;
}

/** Trinca `H S% L%` de um token no tema pedido (cai no outro bloco quando ausente). */
function tinta(variavel: string, tema: Tema): RGB {
  const bruto = tema === 'claro' ? claro[variavel] : escuro[variavel] ?? claro[variavel];
  expect(bruto, `--${variavel} sem valor em tokens.css (tema ${tema})`).toBeTruthy();
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(bruto);
  expect(m, `--${variavel} não é trinca "H S% L%": "${bruto}"`).toBeTruthy();
  return hsl(Number(m![1]), Number(m![2]) / 100, Number(m![3]) / 100);
}

/**
 * Cor de TEXTO que a classe do elemento realmente aplica: `text-<token>` ou
 * `text-[hsl(var(--token))]`. Ignora utilitários de tamanho (`text-xs`, `text-[9px]`).
 */
function corDoTexto(el: Element, tema: Tema): { rotulo: string; rgb: RGB } {
  for (const classe of Array.from(el.classList)) {
    const arbitraria = /^text-\[hsl\(var\(--([a-z0-9-]+)\)\)\]$/.exec(classe);
    if (arbitraria) return { rotulo: `--${arbitraria[1]}`, rgb: tinta(arbitraria[1], tema) };
    const nome = /^text-([a-z][a-z0-9-]*)$/.exec(classe);
    if (nome && nome[1] === 'white') return { rotulo: 'branco', rgb: [1, 1, 1] };
    if (nome && (tema === 'claro' ? claro[nome[1]] : escuro[nome[1]] ?? claro[nome[1]]) !== undefined) {
      return { rotulo: `--${nome[1]}`, rgb: tinta(nome[1], tema) };
    }
  }
  throw new Error(`nenhuma classe de cor de texto reconhecida em "${el.className}"`);
}

type Caso = {
  nome: string;
  /** Tinta de PREENCHIMENTO que estava aplicada antes (prova por mutação, no claro). */
  antes: string;
  montar: () => React.ReactElement;
  alvo: (raiz: HTMLElement) => Element | null;
  fundo: (tema: Tema) => RGB;
  /** Superfície em que o texto aparece, para o nome do caso. */
  superficie: string;
};

const CASOS: Caso[] = [
  {
    nome: 'AlertCard (danger)',
    antes: 'destructive',
    montar: () => <AlertCard tone="danger">Falha ao enviar a campanha</AlertCard>,
    alvo: (raiz) => raiz.querySelector('div'),
    fundo: (t) => porCima(tinta('destructive', t), 0.08, tinta('card', t)),
    superficie: 'bg-destructive/8 sobre o card',
  },
  {
    nome: 'StateShell (danger)',
    antes: 'dash-red',
    montar: () => <StateShell icon={AlertTriangle} tone="danger" title="Não foi possível carregar" />,
    alvo: (raiz) => raiz.querySelector('[class*="border-dash-red/50"]'),
    fundo: (t) => tinta('card', t),
    superficie: 'card',
  },
  {
    nome: 'StateShell (warning)',
    antes: 'dash-amber',
    montar: () => <StateShell icon={Info} tone="warning" title="Nenhum segmento ainda" />,
    alvo: (raiz) => raiz.querySelector('[class*="border-dash-amber/50"]'),
    fundo: (t) => tinta('card', t),
    superficie: 'card',
  },
  {
    nome: 'StateShell (success)',
    antes: 'dash-green',
    montar: () => <StateShell icon={CheckCircle2} tone="success" title="Tudo entregue" />,
    alvo: (raiz) => raiz.querySelector('[class*="border-dash-green/50"]'),
    fundo: (t) => tinta('card', t),
    superficie: 'card',
  },
  {
    nome: 'ChannelCell',
    antes: 'whatsapp',
    montar: () => <ChannelCell />,
    alvo: (raiz) => raiz.querySelector('span[title="WhatsApp"]'),
    fundo: (t) => tinta('card', t),
    superficie: 'card',
  },
];

describe('t_901ba1fe — componentes do Talk X: o TEXTO usa o par do sistema, não a tinta de preenchimento', () => {
  afterEach(cleanup);

  it.each(CASOS)('$nome fecha AA no claro e no escuro, sobre $superficie', (caso) => {
    for (const tema of ['claro', 'escuro'] as const) {
      const { container } = render(caso.montar());
      const el = caso.alvo(container);
      expect(el, `${caso.nome}: o elemento do texto não renderizou`).toBeTruthy();

      const cor = corDoTexto(el!, tema);
      const fundo = caso.fundo(tema);
      const r = razao(cor.rgb, fundo);
      expect(r, `${caso.nome} (${tema}): ${cor.rotulo} sobre ${caso.superficie} = ${r.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(4.5);

      // MUTAÇÃO (só no claro, onde o defeito vivia): a tinta de PREENCHIMENTO que estava lá
      // não fecha AA nesse mesmo fundo — foi o que o axe reprovou nas telas do Talk X.
      if (tema === 'claro') {
        const antigo = razao(tinta(caso.antes, 'claro'), fundo);
        expect(antigo, `${caso.nome} (claro): --${caso.antes} sobre ${caso.superficie} = ${antigo.toFixed(2)}:1`)
          .toBeLessThan(4.5);
      }
      cleanup();
    }
  });
});

describe('t_901ba1fe — borbulha de preview do Talk X (fundo fixo) não segue o tema', () => {
  afterEach(cleanup);

  const FUNDO_BORBULHA = 'bg-[hsl(150_45%_16%)]';
  const BORBULHA = /bg-\[hsl\((\d+)_(\d+)%_(\d+)%\)\]/;

  it('pinta o texto com tinta clara fixa — o `text-foreground` do claro media 1,37:1', () => {
    const { container } = render(<WhatsAppBubble text="Olá {{nome}}, novidade para você!" time="08:03" />);
    const bolha = Array.from(container.querySelectorAll('div')).find((d) => d.classList.contains(FUNDO_BORBULHA));
    expect(bolha, 'borbulha com fundo fixo `hsl(150 45% 16%)` não renderizou').toBeTruthy();

    const m = BORBULHA.exec(bolha!.className)!;
    const fundo = hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);

    const cor = corDoTexto(bolha!, 'claro');
    const r = razao(cor.rgb, fundo);
    expect(r, `${cor.rotulo} sobre a borbulha = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

    // MUTAÇÃO: com o token de tema que estava lá, a MESMA borbulha media 1,37:1 no claro
    // (`--foreground` = texto escuro sobre fundo escuro) — nó reprovado pelo axe na tela 10.
    const antigo = razao(tinta('foreground', 'claro'), fundo);
    expect(antigo, `--foreground do claro sobre a borbulha = ${antigo.toFixed(2)}:1`).toBeLessThan(4.5);
  });

  it('o "online" do cabeçalho usa o par verde do sistema, não a tinta da marca', () => {
    const { container } = render(<WhatsAppBubble text="Olá!" time="08:03" />);
    const online = Array.from(container.querySelectorAll('p')).find((p) => p.textContent === 'online');
    expect(online, '"online" não renderizou').toBeTruthy();

    const cor = corDoTexto(online!, 'claro');
    const r = razao(cor.rgb, tinta('card', 'claro'));
    expect(r, `${cor.rotulo} sobre --card no claro = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

    // MUTAÇÃO: `text-whatsapp` (a tinta da marca) media 2,32:1 nesse mesmo cabeçalho.
    const antigo = razao(tinta('whatsapp', 'claro'), tinta('card', 'claro'));
    expect(antigo, `--whatsapp sobre --card no claro = ${antigo.toFixed(2)}:1`).toBeLessThan(4.5);
  });

  it('PhoneFrame: text-white sobre hsl(150 45% 16%) fecha AA no claro', () => {
    const { container } = render(<PhoneFrame text="Mensagem de teste" />);
    const bolha = Array.from(container.querySelectorAll('div')).find((d) => d.classList.contains('bg-[hsl(150_45%_16%)]'));
    expect(bolha, 'borbulha do PhoneFrame com fundo fixo `hsl(150 45% 16%)` não renderizou').toBeTruthy();

    const m = BORBULHA.exec(bolha!.className)!;
    const fundo = hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);

    const cor = corDoTexto(bolha!, 'claro');
    const r = razao(cor.rgb, fundo);
    expect(r, `${cor.rotulo} sobre a borbulha do PhoneFrame = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

    // MUTAÇÃO: com o token de tema que estava lá (`--foreground`), a MESMA borbulha media 1,37:1 no claro
    // (`--foreground` = texto escuro sobre fundo escuro) — nó reprovado pelo axe na tela 10.
    const antigo = razao(tinta('foreground', 'claro'), fundo);
    expect(antigo, `--foreground do claro sobre a borbulha do PhoneFrame = ${antigo.toFixed(2)}:1`).toBeLessThan(4.5);
  });
});
