/**
 * Contrato da superfície MOBILE — área segura (`safe-area-*`) e rolagem sem barra
 * (`scrollbar-none`) — cartão t_edd11f2d.
 *
 * A V2 declara `viewport-fit=cover` no `index.html` (o app ocupa a tela inteira no
 * iPhone) e usa `safe-area-top`/`safe-area-bottom` em 15 pontos do `src/` (cabeçalho
 * `MobileHeader`, barra `MobileNavigation`/`FloatingActionButtons`, folhas
 * `BottomSheet`/`MobileDrawerMenu`, painéis e os campos de envio do chat/team-chat) e
 * `scrollbar-none` em 8 — mas NENHUMA regra existia, então o conteúdo ia por baixo do
 * notch e do indicador de home. Referência: V3 `src/index.css:82-96`.
 *
 * Duas provas, no mesmo espírito de `densityTextSizeCascade.test.ts`:
 *  1) CASCATA: o CSS entra como folha REAL no jsdom e quem responde é o motor de CSS,
 *     não um regex — a regra existe, casa com o elemento e pede `env(..., 0)`.
 *  2) CONTRATO: toda classe `safe-area-*`/`scrollbar-none` usada em `src/` (fora de
 *     testes) tem uma regra que casa.
 *
 * Prova VERMELHO → VERDE (o arquivo base sai do git, sem stash — o .git é compartilhado
 * entre os worktrees):
 *   git show HEAD:src/styles/utilities.css > .tmp/base-utilities.css
 *   ZAPP_CSS_UNDER_TEST=.tmp/base-utilities.css npx vitest run src/styles/__tests__/mobileAreaSeguraRolagem.test.ts
 * O teste FALHA contra o base (nenhuma das classes está definida) e passa com a correção.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Caminho do CSS sob prova (a env existe só para a prova vermelha acima). */
const CSS_PATH = process.env.ZAPP_CSS_UNDER_TEST ?? 'src/styles/utilities.css';

const css = readFileSync(CSS_PATH, 'utf8');

/** CSS dos arquivos de estilo do app — o que define as classes de verdade. */
const CSS_DE_ESTILO = [
  'src/index.css',
  'src/styles/tokens.css',
  'src/styles/base.css',
  CSS_PATH, // na prova vermelha aponta para o arquivo base do git
  'src/styles/components.css',
  'src/styles/animations.css',
  'src/styles/sidebar.css',
  'src/styles/accessibility.css',
  'src/styles/diversity-overrides.css',
]
  .map((arquivo) => readFileSync(arquivo, 'utf8'))
  .join('\n');

const FAMILIA = /^(safe-area-[a-z-]+|scrollbar-none)$/;

/** Trecho do @media informado, com chaves balanceadas (para achar as regras de celular). */
function blocoMedia(fonte: string, condicao: string): string {
  let pos = fonte.indexOf(condicao);
  while (pos !== -1) {
    const abre = fonte.indexOf('{', pos);
    if (abre === -1) return '';
    let nivel = 0;
    for (let i = abre; i < fonte.length; i += 1) {
      if (fonte[i] === '{') nivel += 1;
      else if (fonte[i] === '}') {
        nivel -= 1;
        if (nivel === 0) return fonte.slice(abre + 1, i);
      }
    }
    pos = fonte.indexOf(condicao, pos + 1);
  }
  return '';
}

function montarFolha(): CSSStyleSheet {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const folha = document.createElement('style');
  folha.textContent = css;
  document.head.appendChild(folha);
  return document.styleSheets[0] as CSSStyleSheet;
}

/** Todas as regras de estilo da folha, inclusive as de dentro de @media. */
function regras(folha: CSSStyleSheet): CSSStyleRule[] {
  const saida: CSSStyleRule[] = [];
  const visitar = (lista: CSSRuleList) => {
    for (const regra of Array.from(lista)) {
      if (regra.type === CSSRule.STYLE_RULE) saida.push(regra as CSSStyleRule);
      else if ('cssRules' in regra) visitar((regra as CSSMediaRule).cssRules);
    }
  };
  visitar(folha.cssRules);
  return saida;
}

/** Tokens de classe do src/ (fora de testes) que pertencem à família sob contrato. */
function classesUsadasNoSrc(): string[] {
  const arquivos = (readdirSync('src', { recursive: true }) as string[])
    .map((relativo) => `src/${relativo}`)
    .filter((caminho) => /\.(ts|tsx)$/.test(caminho))
    .filter((caminho) => !/(\.test|\.spec)\.tsx?$/.test(caminho) && !caminho.includes('__tests__'));

  const usadas = new Set<string>();
  for (const caminho of arquivos) {
    const fonte = readFileSync(caminho, 'utf8');
    for (const literal of fonte.match(/["'`][^"'`]*["'`]/g) ?? []) {
      for (const token of literal.slice(1, -1).split(/\s+/)) {
        if (FAMILIA.test(token)) usadas.add(token);
      }
    }
  }
  return Array.from(usadas).sort();
}

/** A classe tem uma regra que casa (a classe, opcionalmente repetida, seguida de `{`). */
function temRegra(token: string): boolean {
  return new RegExp(`\\.${token}(?:\\.${token})?\\s*\\{`).test(CSS_DE_ESTILO);
}

/** Bloco de declarações da regra (o jsdom descarta `env(...)`, então o valor sai do texto). */
function declaracoesDoBloco(fonte: string, seletor: string): string {
  const achado = new RegExp(`\\.${seletor}(?:\\.${seletor})?\\s*\\{([^}]*)\\}`).exec(fonte);
  return achado?.[1] ?? '';
}

describe('superfície mobile — área segura e rolagem', () => {
  let folha: CSSStyleSheet;

  beforeEach(() => {
    folha = montarFolha();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('.safe-area-top casa e pede o inset do topo, com 0 como fallback', () => {
    const regra = regras(folha).find((r) => /\.safe-area-top(?![\w-])/.test(r.selectorText));
    expect(regra, 'nenhuma regra .safe-area-top na folha').toBeTruthy();

    // jsdom não implementa env(): o valor sai do texto autorado, não do motor.
    expect(declaracoesDoBloco(CSS_DE_ESTILO, 'safe-area-top')).toMatch(
      /padding-top:\s*env\(safe-area-inset-top,\s*0\)/,
    );

    const cabecalho = document.createElement('header');
    cabecalho.className = 'fixed top-0 left-0 right-0 z-50 safe-area-top';
    document.body.appendChild(cabecalho);
    expect(cabecalho.matches(regra!.selectorText)).toBe(true);
  });

  it('.safe-area-bottom casa e pede o inset de baixo, com 0 como fallback', () => {
    const regra = regras(folha).find((r) => /\.safe-area-bottom(?![\w-])/.test(r.selectorText));
    expect(regra, 'nenhuma regra .safe-area-bottom na folha').toBeTruthy();

    expect(declaracoesDoBloco(CSS_DE_ESTILO, 'safe-area-bottom')).toMatch(
      /padding-bottom:\s*env\(safe-area-inset-bottom,\s*0\)/,
    );

    const barra = document.createElement('nav');
    barra.className = 'fixed bottom-0 left-0 right-0 z-40 safe-area-bottom';
    document.body.appendChild(barra);
    expect(barra.matches(regra!.selectorText)).toBe(true);
  });

  it('no celular, a barra de rolagem some (scrollbar-none) e o body não faz pull-to-refresh', () => {
    const celular = blocoMedia(css, 'max-width: 767px');

    expect(celular, 'nenhum @media (max-width: 767px) no CSS de utilidades').not.toBe('');
    expect(celular).toMatch(/\.scrollbar-none::-webkit-scrollbar\s*\{\s*display:\s*none;/);
    expect(celular).toMatch(/\.scrollbar-none\s*\{[^}]*scrollbar-width:\s*none;/);
    expect(celular).toMatch(/\.scrollbar-none\s*\{[^}]*(-ms-overflow-style:\s*none|overflow-style)/);
    expect(celular).toMatch(/body\s*\{[^}]*overscroll-behavior-y:\s*none;/);
  });

  it('toda classe safe-area-*/scrollbar-none usada no src tem definição', () => {
    const usadas = classesUsadasNoSrc();

    // Não pode passar vazio: as três classes são o que o app usa de fato.
    expect(usadas).toEqual(['safe-area-bottom', 'safe-area-top', 'scrollbar-none']);

    const semRegra = usadas.filter((token) => !temRegra(token));
    expect(semRegra, `sem definição no CSS: ${semRegra.join(', ')}`).toEqual([]);
  });
});
