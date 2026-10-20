/**
 * TL-175D-a — contraste AA do contador do card "Contatos" (tela 08, tema claro).
 *
 * O DEFEITO: o contador do título do card "Contatos" do passo 1 do wizard era
 * `<Badge variant="secondary" className="text-3xs">`, ou seja `bg-secondary
 * text-secondary-foreground`. No tema CLARO `--secondary` é o azul de
 * PREENCHIMENTO (`215 70% 55%`) e `--secondary-foreground` é claro
 * (`210 40% 92%`) porque o par foi desenhado para superfície escura: o texto de
 * 10px mede 3,30:1, abaixo dos 4,5:1 que o WCAG AA exige nesse tamanho.
 *
 * COMO A PROVA É FEITA: o jsdom não calcula cor, então o teste NÃO lê o `.tsx`
 * nem compara string de classe. Ele MONTA o componente real, pega no DOM o
 * elemento que mostra o contador e resolve as classes que ELE aplica para os
 * valores de `src/styles/tokens.css` (e, nos temas de alto contraste, de
 * `src/styles/accessibility.css`) do tema em questão — a mesma conta de
 * luminância relativa do WCAG. Trocar a classe do componente muda o resultado;
 * os números saem das folhas de estilo (fonte de verdade), não do teste. Classe
 * que o resolvedor não conhece é ERRO, não passa em silêncio.
 *
 * A régua de navegador (`e2e/talkx-visual.spec.ts`, axe com a regra
 * `color-contrast`) é quem mede a cor renderizada; aqui o contrato preso é o
 * par classe × token que o componente aplica, nos quatro temas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TalkXContactSelector } from '../TalkXContactSelector';

// O distintivo de CRM 360 (pintado contato a contato) fica desligado: é outro
// elemento da mesma lista e não participa do contador do título. Sem ele a
// medida é do elemento sob teste, com o componente real montado.
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => false,
}));
vi.mock('@/hooks/crm/useExternalContact360Batch', () => ({
  useExternalContact360Batch: () => ({ lookup: () => undefined }),
}));

/* ------------------------------------------------------------------ */
/* Cores: a fonte de verdade são as folhas de estilo, lidas do disco   */
/* ------------------------------------------------------------------ */

const FOLHA_TOKENS = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
const FOLHA_CONTRASTE = readFileSync(resolve(__dirname, '../../../styles/accessibility.css'), 'utf8');

/** Variáveis de um bloco da folha, com chaves balanceadas. */
function varsDoBloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(seletor);
  if (inicio < 0) throw new Error(`bloco ${seletor} ausente`);
  const abre = css.indexOf('{', inicio);
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel += 1;
    else if (css[i] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) throw new Error(`bloco ${seletor} sem fechamento`);
  const vars: Record<string, string> = {};
  for (const m of css.slice(abre + 1, fim).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return vars;
}

/**
 * Os quatro temas do sistema: o claro e o escuro saem de `tokens.css`; o alto
 * contraste SOBREPÕE o tema base com o bloco de `accessibility.css` (classe
 * `.high-contrast` no `<html>`, `.dark.high-contrast` no escuro).
 */
const TEMAS = {
  claro: () => varsDoBloco(FOLHA_TOKENS, ':root {'),
  escuro: () => varsDoBloco(FOLHA_TOKENS, '.dark {'),
  'claro+alto contraste': () => ({
    ...varsDoBloco(FOLHA_TOKENS, ':root {'),
    ...varsDoBloco(FOLHA_CONTRASTE, '.high-contrast {'),
  }),
  'escuro+alto contraste': () => ({
    ...varsDoBloco(FOLHA_TOKENS, '.dark {'),
    ...varsDoBloco(FOLHA_CONTRASTE, '.dark.high-contrast {'),
  }),
} as const;
type Tema = keyof typeof TEMAS;

type Rgb = [number, number, number];

/** `H S% L%` (a forma dos tokens da folha) → RGB 0..1. */
function hslDoToken(valor: string, nome: string): Rgb {
  const m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(valor);
  if (!m) throw new Error(`--${nome}: "${valor}" não é a trinca HSL esperada`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [canal(h + 1 / 3), canal(h), canal(h - 1 / 3)];
}

function luminancia([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x: (L do mais claro + 0,05) / (L do mais escuro + 0,05). */
function razaoDeContraste(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Classes de TAMANHO de texto do projeto: não são cor (o `text-3xs` do contador é uma delas). */
const TAMANHOS = new Set([
  '3xs', '2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl',
  'kpi-value', 'page-title',
]);

/** Classe com alfa (`bg-x/15`) composta sobre o fundo do cartão — como o navegador faz. */
function sobreOFundo(cor: Rgb, alfa: number, tokens: Record<string, string>, tema: Tema): Rgb {
  const base = tokens.card;
  if (!base) throw new Error(`--card ausente no tema ${tema}`);
  const fundo = hslDoToken(base, 'card');
  return cor.map((c, i) => c * alfa + fundo[i] * (1 - alfa)) as Rgb;
}

/**
 * Resolve a ÚLTIMA classe `bg-*`/`text-*` que aponta um token REAL do tema — a
 * mesma semântica do `tailwind-merge` que o `Badge` usa (`cn`): a última vence.
 * Classe de tamanho, variante (`hover:`) ou token que a folha não define é
 * ignorada; NENHUMA classe resolvida é erro, para o teste não passar por omissão.
 */
function corDaClasse(
  classes: string[],
  prefixo: 'bg' | 'text',
  tokens: Record<string, string>,
  tema: Tema,
): Rgb {
  let cor: Rgb | undefined;
  for (const classe of classes) {
    const m = new RegExp(`^${prefixo}-([a-z0-9-]+)(?:/(\\d+))?$`).exec(classe);
    if (!m) continue;
    const nome = m[1];
    if (prefixo === 'text' && (TAMANHOS.has(nome) || nome.startsWith('fluid-'))) continue;
    const valor = tokens[nome];
    if (valor === undefined) continue;
    const solida = hslDoToken(valor, nome);
    cor = m[2] === undefined ? solida : sobreOFundo(solida, Number(m[2]) / 100, tokens, tema);
  }
  if (!cor) {
    throw new Error(
      `o contador não aplica nenhuma classe ${prefixo}-* de um token do tema ${tema} (classes: ${classes.join(' ')})`,
    );
  }
  return cor;
}

/* ------------------------------------------------------------------ */
/* O componente real, na mesma montagem da tela 08                     */
/* ------------------------------------------------------------------ */

const CONTATOS = [
  { id: 'c1', name: 'Ana Prado', nickname: null, phone: '5511900000001', company: 'Acme Brindes', avatar_url: null },
  { id: 'c2', name: 'Bruno Lima', nickname: null, phone: '5511900000002', company: 'Acme Brindes', avatar_url: null },
  { id: 'c3', name: 'Carla Dias', nickname: null, phone: '5511900000003', company: null, avatar_url: null },
];

const nada = () => {};

/** Monta o componente REAL e devolve o elemento do contador do título do card. */
function contadorDoCardContatos(): HTMLElement {
  render(
    <TalkXContactSelector
      contacts={CONTATOS}
      filteredContacts={CONTATOS}
      selectedContacts={['c1', 'c2']}
      contactSearch=""
      setContactSearch={nada}
      companyFilter="all"
      setCompanyFilter={nada}
      companies={['Acme Brindes']}
      toggleContact={nada}
      selectAll={nada}
      clearFilters={nada}
    />,
  );

  const titulo = screen.getByRole('heading', { name: /Contatos/ });
  const contador = screen.getByText('2/3');
  expect(titulo).toContainElement(contador);
  return contador;
}

describe('TL-175D-a — contador do card "Contatos" (tela 08)', () => {
  it.each(Object.keys(TEMAS) as Tema[])(
    'o contador fecha AA (4,5:1) no tema %s',
    (tema) => {
      const tokens = TEMAS[tema]();
      const classes = contadorDoCardContatos().className.split(/\s+/);

      const fundo = corDaClasse(classes, 'bg', tokens, tema);
      const texto = corDaClasse(classes, 'text', tokens, tema);
      const razao = razaoDeContraste(texto, fundo);

      expect(
        razao,
        `contador "Contatos" no tema ${tema} — classes aplicadas: ${classes.join(' ')}`,
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
