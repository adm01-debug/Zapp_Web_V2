/**
 * Y18-2 (SHELL-03 e parte do SHELL-09) — menu do celular (`MobileDrawerMenu`).
 *
 * Dois defeitos medidos pela auditoria Y18 (2026-10-07, 390×844):
 *  - SHELL-03: o botão "Sair" do rodapé só tem o ícone (`LogOut`) — sem texto e sem
 *    `aria-label`; o axe acusa `button-name` [critical] nos 3 combos de 390.
 *  - SHELL-09: as iniciais do avatar (`text-primary` sobre `bg-primary/15`) fecham
 *    4,2:1 e os títulos de seção (`text-muted-foreground/70`) fecham 3,15:1 — os dois
 *    abaixo da régua AA (4,5:1) para texto de 11 px.
 *
 * Como o contraste é provado: o teste renderiza o `MobileDrawerMenu` REAL, lê a classe
 * que cada texto REALMENTE recebeu, resolve os tokens de `src/styles/tokens.css` +
 * `src/styles/accessibility.css` nos 4 estados de tema, compõe o alfa em sRGB e mede a
 * razão WCAG. Nada de literal pinado: se a classe do componente mudar, o número muda
 * com ela. Mesmo medidor de `tasks/__tests__/movimentoEContraste.test.tsx`.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ roles: ['admin'], permissions: [], isLoading: false }),
}));

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}));

import { MobileDrawerMenu } from '../MobileDrawerMenu';

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ─────

type Rgb = [number, number, number];

function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

/** Como o navegador pinta `topo` com alfa sobre `fundo` (sRGB, canal a canal). */
function compor(fundo: Rgb, topo: Rgb, alfa: number): Rgb {
  return [0, 1, 2].map((i) => fundo[i] * (1 - alfa) + topo[i] * alfa) as Rgb;
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

/** Tokens de UM bloco por cabeçalho em INÍCIO DE LINHA (senão `.high-contrast` casaria com `.dark.high-contrast`). */
function tokensDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `\n${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, Rgb> = {};
        for (const t of Array.from(
          limpo
            .slice(abre + 1, j)
            .matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
        )) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento`);
}

const TOKENS = readFileSync('src/styles/tokens.css', 'utf8');
const A11Y = readFileSync('src/styles/accessibility.css', 'utf8');

const CLARO = tokensDoBloco(TOKENS, ':root');
const ESCURO = { ...CLARO, ...tokensDoBloco(TOKENS, '.dark') };
const HC_CLARO = { ...CLARO, ...tokensDoBloco(A11Y, '.high-contrast') };
const HC_ESCURO = {
  ...ESCURO,
  ...tokensDoBloco(A11Y, '.high-contrast'),
  ...tokensDoBloco(A11Y, '.dark.high-contrast'),
};

const ESTADOS = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['alto contraste', HC_CLARO],
  ['alto contraste escuro', HC_ESCURO],
] as const;

const LIMIAR_TEXTO = 4.5;

// ─── Leitura das classes REAIS aplicadas pelo componente renderizado ────────

const classes = (el: Element) => (el as HTMLElement).className ?? '';

/** Texto: `text-[hsl(var(--primary-text))]` ou `text-muted-foreground/70` → token + alfa. */
function textoDe(el: Element): { token: string; alfa: number } {
  const c = classes(el);
  const viaVar = c.match(/text-\[hsl\(var\(--([\w-]+)\)\)\]/);
  if (viaVar) return { token: viaVar[1], alfa: 1 };
  const m = c.match(/(?:^|\s)text-([a-z][a-z-]+)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe text-* em: ${c}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Tinta própria do elemento: `bg-primary/15` → token + alfa. */
function fundoProprio(el: Element): { token: string; alfa: number } {
  const m = classes(el).match(/(?:^|\s)bg-([a-z][a-z-]+)(?:\/(\d+))?(?:\s|$)/);
  if (!m) throw new Error(`sem classe bg-* em: ${classes(el)}`);
  return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
}

/** Superfície em que o elemento está pintado (o `bg-*` do ancestral mais próximo). */
function superficie(el: Element): { token: string; alfa: number } {
  let atual: Element | null = el.parentElement;
  while (atual) {
    const m = classes(atual).match(/(?:^|\s)bg-(card|background|popover|primary|muted)(?:\/(\d+))?(?:\s|$)/);
    if (m) return { token: m[1], alfa: m[2] ? Number(m[2]) / 100 : 1 };
    atual = atual.parentElement;
  }
  throw new Error('superfície (bg-card/bg-background/…) não encontrada');
}

const abrirMenu = () =>
  render(
    <MobileDrawerMenu
      isOpen
      onClose={vi.fn()}
      currentView="inbox"
      onViewChange={vi.fn()}
      agentName="Visual E2E"
      agentStatus="online"
      onLogout={vi.fn()}
    />,
  );

describe('SHELL-03 — o botão "Sair" do rodapé do menu do celular tem nome acessível', () => {
  it('é alcançável pelo nome "Sair da conta"', () => {
    abrirMenu();
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeInTheDocument();
  });

  it('o axe não acusa `button-name` no painel aberto', async () => {
    render(
      <MobileDrawerMenu
        isOpen
        onClose={vi.fn()}
        currentView="inbox"
        onViewChange={vi.fn()}
        agentName="Visual E2E"
        onLogout={vi.fn()}
      />,
    );
    // jsdom não tem layout: contraste fica fora (medido em sRGB logo abaixo).
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'button-name')).toEqual([]);
  });
});

describe('SHELL-09 — contraste AA dos textos do menu do celular', () => {
  it('as iniciais do avatar usam o par de TEXTO da primária (não a cor de preenchimento)', () => {
    abrirMenu();
    const iniciais = screen.getByText('VE');
    expect(textoDe(iniciais).token).toBe('primary-text');
    expect(classes(iniciais)).toContain('bg-primary/15');
  });

  it('os títulos de seção usam o tom cheio do `muted-foreground` (sem alfa)', () => {
    abrirMenu();
    // 'Principal' é a primeira seção do menu para qualquer papel (Chat/Teams/Email/
    // Contatos/Catálogo/Telefonia não são gated por permissão).
    const titulo = screen.getByText('Principal');
    expect(textoDe(titulo)).toEqual({ token: 'muted-foreground', alfa: 1 });
  });

  for (const [nome, tokens] of ESTADOS) {
    it(`${nome}: iniciais do avatar e títulos de seção fecham 4,5:1`, () => {
      const { unmount } = abrirMenu();

      const iniciais = screen.getByText('VE');
      const textoAvatar = textoDe(iniciais);
      const tinta = fundoProprio(iniciais);
      const base = superficie(iniciais);
      const fundoAvatar = compor(tokens[base.token], tokens[tinta.token], tinta.alfa);
      expect(
        razao(compor(fundoAvatar, tokens[textoAvatar.token], textoAvatar.alfa), fundoAvatar),
        `${textoAvatar.token} sobre bg-${tinta.token}/${tinta.alfa * 100} (base ${base.token})`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);

      const titulo = screen.getByText('Principal');
      const textoTitulo = textoDe(titulo);
      const fundoTitulo = superficie(titulo);
      const corTitulo = compor(tokens[fundoTitulo.token], tokens[textoTitulo.token], textoTitulo.alfa);
      expect(
        razao(corTitulo, tokens[fundoTitulo.token]),
        `${textoTitulo.token}/${textoTitulo.alfa * 100} sobre ${fundoTitulo.token}`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);

      unmount();
    });
  }
});
