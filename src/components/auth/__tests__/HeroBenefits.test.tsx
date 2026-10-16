import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeroBenefits } from '../HeroBenefits';

/**
 * Prova do cartão: o painel esquerdo do /auth tem de mostrar os mesmos textos
 * do Zapp V3 — o título em duas linhas, os 6 benefícios com descrição e o
 * testemunho com o autor. O teste renderiza o componente REAL (sem mock de
 * conteúdo) para que trocar um texto volte a ficar vermelho.
 */
const TITULO = 'Tudo que você precisa para';
const SUBTITULO = 'atender com excelência';

const BENEFICIOS = [
  ['Inbox Unificado', 'Todas conversas em um só lugar'],
  ['IA Integrada', 'Respostas automáticas inteligentes'],
  ['Analytics Avançado', 'Métricas em tempo real'],
  ['Multi-agentes', 'Colaboração de equipe eficiente'],
  ['SLA Tracking', 'Monitore tempos de resposta'],
  ['Segurança Total', 'Dados criptografados'],
] as const;

describe('HeroBenefits (painel esquerdo do /auth)', () => {
  it('mostra o título do V3 nas duas linhas', () => {
    render(<HeroBenefits />);
    expect(screen.getByRole('heading', { name: TITULO })).toBeInTheDocument();
    expect(screen.getByText(SUBTITULO)).toBeInTheDocument();
  });

  it('mostra os 6 benefícios, cada um com sua descrição', () => {
    render(<HeroBenefits />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(BENEFICIOS.length);

    for (const [titulo, descricao] of BENEFICIOS) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
      expect(screen.getByText(descricao)).toBeInTheDocument();
    }
  });

  it('mostra o testemunho com o autor', () => {
    render(<HeroBenefits />);
    expect(screen.getByText(/não é um ato, mas um\s+hábito/i)).toBeInTheDocument();
    expect(screen.getByText('Aristóteles')).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<HeroBenefits />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ─── Gradiente do subtítulo: contraste >= 3:1 nos dois temas ────────────────
// ANTES: `from-primary to-secondary`. No escuro `--secondary` é `240 5% 16%`
// (quase preto): o fim de "excelência" media 1,30:1 contra `--background`
// (conta sobre tokens.css) e 1,00:1 no pior pixel do fundo REAL (mapa + véu,
// 1280px, Chromium) — reprovado.
// DEPOIS: o gradiente termina em `--primary-text` e, no escuro, começa em
// `--primary-700` pela classe `from-tonal-700` (a escala `tonal` do
// tailwind.config.ts aponta para `--primary-*`; `from-primary-700` NÃO existe
// e vira classe morta, sem CSS — foi a 1ª tentativa). O `dark:to-...` repete o
// fim de propósito: a regra `dark:from-*` sobrescreve `--tw-gradient-to` e o
// fim ficaria TRANSPARENTE (texto sumindo) se o escuro não declarasse o `to-`.
// MEDIDO (Chromium, texto escondido, fundo real mapa + véu): pior caso 3,39:1
// (1280/escuro); claro 3,83:1 a 3,98:1. Contra `--background`: claro 4,83:1 e
// 8,75:1; escuro 7,50:1 e 9,50:1. Tabela completa no relato do cartão.
// Aqui a guarda é sobre os tokens contra `--background`; a medição do fundo
// real é a do relato.

type Rgb = [number, number, number];

/** Luminância relativa (WCAG 2.1, sRGB). */
function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste WCAG entre duas cores. */
function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

/** HSL no formato dos tokens (`--x: 221 83% 53%`) → RGB. */
function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

const TOKENS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Valor de um token dentro do bloco `seletor` (`:root` ou `.dark`). */
function token(css: string, seletor: string, nome: string): Rgb {
  const inicio = css.indexOf(`${seletor} {`);
  const fim = css.indexOf('\n}', inicio);
  const bloco = css.slice(inicio, fim);
  const m = bloco.match(new RegExp(`--${nome}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`));
  if (!m) throw new Error(`token --${nome} não achado em ${seletor}`);
  return hslParaRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

describe('HeroBenefits — gradiente do subtítulo', () => {
  it('usa o par de tokens que muda com o tema, e não o --secondary', () => {
    for (const tema of ['claro', 'escuro'] as const) {
      document.documentElement.classList.toggle('dark', tema === 'escuro');
      const { unmount } = render(<HeroBenefits />);
      const sub = screen.getByText(SUBTITULO);
      expect(sub.className, tema).toContain('from-primary');
      expect(sub.className, tema).toContain('dark:from-tonal-700');
      expect(sub.className, tema).toContain('dark:to-[hsl(var(--primary-text))]');
      expect(sub.className, tema).toContain('to-[hsl(var(--primary-text))]');
      expect(sub.className, tema).not.toContain('to-secondary');
      unmount();
    }
    document.documentElement.classList.remove('dark');
  });

  it('a classe dark:from-tonal-700 é uma classe viva (existe no tema)', () => {
    // Classe escrita à mão que o Tailwind não gera não vira CSS e o defeito
    // volta silenciosamente. Aqui a corrente é conferida elo por elo:
    // `from-tonal-700` -> escala `tonal` do tailwind.config.ts -> `--primary-700`
    // -> token definido em tokens.css.
    const tailwind = readFileSync(resolve(process.cwd(), 'tailwind.config.ts'), 'utf8');
    const tonal = tailwind.slice(
      tailwind.indexOf('tonal: {'),
      tailwind.indexOf('neutral: {', tailwind.indexOf('tonal: {')),
    );
    expect(tonal, 'escala tonal no tailwind.config.ts').toMatch(/700:\s*"hsl\(var\(--primary-700\)\)"/);
    expect(TOKENS, '--primary-700 definido em tokens.css').toMatch(/--primary-700:/);
  });

  it('o contraste das duas pontas do gradiente fica >= 3:1 nos dois temas', () => {
    // Lê do COMPONENTE qual token cada ponta e cada tema usam — assim voltar o
    // `to-secondary` (quase preto no escuro) ou tirar o `dark:from-tonal-700`
    // (início escuro sobre o mapa claro) volta a ficar vermelho aqui.
    const { unmount } = render(<HeroBenefits />);
    const classe = screen.getByText(SUBTITULO).className;
    unmount();

    const fim = classe.match(/to-\[hsl\(var\(--([a-z-]+)\)\)\]/);
    expect(fim, 'ponta final do gradiente no className').toBeTruthy();
    const nomeFim = fim![1];

    const inicioEscuro = classe.match(/dark:from-([a-z0-9-]+)/);
    expect(inicioEscuro?.[1], 'ponta inicial do tema escuro (dark:from-*)').toBe('tonal-700');
    expect(classe).toContain('from-primary');

    // `tonal-700` (classe) = `--primary-700` (token).
    const inicioPorTema = { claro: 'primary', escuro: 'primary-700' } as const;

    for (const [tema, seletor] of [['claro', ':root'], ['escuro', '.dark']] as const) {
      const fundo = token(TOKENS, seletor, 'background');
      const de = token(TOKENS, seletor, inicioPorTema[tema]);
      const para = token(TOKENS, seletor, nomeFim);
      expect(razao(de, fundo), `${tema}: --${inicioPorTema[tema]}`).toBeGreaterThanOrEqual(3);
      expect(razao(para, fundo), `${tema}: --${nomeFim}`).toBeGreaterThanOrEqual(3);
    }
  });
});
