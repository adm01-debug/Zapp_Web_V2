/**
 * Etapa 169 — responsivo do modal "Nova tarefa" (plano, linha 449; imagem 04,
 * seção 3.4), medido nas três larguras do cartão: 360 (telefone estreito),
 * 768 (tablet) e 1280 (desktop).
 *
 * O que este arquivo prova, e por quê:
 *  - abaixo de 900 px a prévia é um ACORDEÃO SOB o formulário, e em ≥900 px ela
 *    vira COLUNA LATERAL sempre visível. O corte é o de 900 px, não o `md` de
 *    768 px: as duas regras vivem em faixas DISJUNTAS (o gatilho só existe em
 *    <900 px; o painel fechado só é escondido em <900 px), então em 768 px o
 *    acordeão ainda vale e em 1280 px ele não existe mais. Um `md:flex-row`
 *    quebraria justamente a faixa de 768 px;
 *  - a prévia é o cartão REAL de tarefa (`WorkItemCard`), não um mock, e o
 *    painel é `forceMount`: fechado continua montado, porque a MESMA prévia
 *    serve às duas visões;
 *  - a ordem é medida por `compareDocumentPosition`: no desenho estreito a
 *    prévia vem DEPOIS do formulário;
 *  - em 360 px o rodapé fica fixo no pé do modal (sticky + bottom-0 + z-10 +
 *    fundo opaco próprio) e o modal é o contêiner que rola; em ≥640 px o rodapé
 *    volta ao fluxo;
 *  - nenhuma peça do modal exige largura fixa maior que a área útil da viewport
 *    (360/768/1280), e os flex filhos têm `min-w-0` para poderem encolher.
 *
 * Por que o teste NÃO mede `document.documentElement.scrollWidth`: o jsdom não
 * tem motor de layout — `scrollWidth` e `clientWidth` são sempre 0, então
 * `scrollWidth <= clientWidth` passaria mesmo com um filho de 400 px. A medida
 * equivalente (e que pode falhar) é aritmética: a largura RESOLVIDA de cada
 * elemento nesta viewport, comparada com a área útil. A resolução do valor das
 * classes é feita por um resolvedor mínimo no fim do arquivo, e o instrumento
 * tem a sua própria checagem (teste "o instrumento está de pé"): o resolvedor
 * precisa ver os 224 px (`w-56`) em 1280 px e NÃO vê-los em 360 px.
 *
 * Lacuna conhecida: a largura real pintada pelo navegador (Tailwind compilado)
 * só o E2E prova — este arquivo mede a intenção declarada nas classes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const ESTREITO = 360;
const TABLET = 768;
const DESKTOP = 1280;

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => cleanup());

/** Monta o modal REAL aberto e devolve o nó do diálogo. */
function montar() {
  const onOpenChange = vi.fn();
  render(<NewTaskDialog open onOpenChange={onOpenChange} now={new Date(2026, 9, 16, 12, 0, 0, 0)} />);
  return { modal: screen.getByTestId('new-task-dialog'), onOpenChange };
}

/** Abre o acordeão pelo gatilho (clicável mesmo oculto no desktop). */
function abrirPrevia(modal: HTMLElement) {
  fireEvent.click(within(modal).getByTestId('nt-previa-gatilho'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolvedor de classes (o instrumento da medida de largura e de posição)
// ─────────────────────────────────────────────────────────────────────────────

type Contexto = { largura: number; dataState?: string | null };

const PONTO_DE_QUEBRA = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/** A media query (ou o estado) da variante vale nesta medição? */
function varianteVale(variante: string, ctx: Contexto): boolean {
  const min = variante.match(/^min-\[(\d+)px\]$/);
  if (min) return ctx.largura >= Number(min[1]);
  const max = variante.match(/^max-\[(\d+)px\]$/);
  if (max) return ctx.largura <= Number(max[1]);
  const maxNome = variante.match(/^max-(sm|md|lg|xl)$/);
  if (maxNome) return ctx.largura < PONTO_DE_QUEBRA[maxNome[1] as keyof typeof PONTO_DE_QUEBRA];
  const nome = variante.match(/^(sm|md|lg|xl)$/);
  if (nome) return ctx.largura >= PONTO_DE_QUEBRA[nome[1] as keyof typeof PONTO_DE_QUEBRA];
  const estado = variante.match(/^data-\[state=(open|closed)\]$/);
  if (estado) return ctx.dataState === estado[1];
  return false; // variante fora do conjunto deste arquivo (ex.: motion-safe): não conta
}

/** Só as propriedades que este arquivo mede; o resto das classes é ignorado de propósito. */
function declaracao(utilitario: string): Record<string, string> | null {
  if (utilitario === 'sticky') return { position: 'sticky' };
  if (utilitario === 'static') return { position: 'static' };
  if (utilitario === 'hidden') return { display: 'none' };
  if (utilitario === 'block') return { display: 'block' };
  if (utilitario === 'flex') return { display: 'flex' };
  if (utilitario === 'contents') return { display: 'contents' };
  if (utilitario === 'flex-col') return { flexDirection: 'column' };
  if (utilitario === 'flex-row') return { flexDirection: 'row' };
  if (utilitario === 'bottom-0') return { bottom: '0px' };
  if (utilitario === 'overflow-y-auto') return { overflowY: 'auto' };
  const z = utilitario.match(/^z-(\d+)$/);
  if (z) return { zIndex: z[1] };
  const fundo = utilitario.match(/^bg-([a-z-]+)/);
  if (fundo) return { backgroundColor: fundo[1] };
  if (utilitario === 'w-full') return { width: '100%' };
  const largura = utilitario.match(/^w-(\d+(?:\.\d+)?)$/);
  if (largura) return { width: `${Number(largura[1]) * 4}px` };
  const larguraFixa = utilitario.match(/^w-\[(\d+(?:\.\d+)?)px\]$/);
  if (larguraFixa) return { width: `${Number(larguraFixa[1])}px` };
  if (utilitario === 'min-w-0') return { minWidth: '0px' };
  const altura = utilitario.match(/^h-(\d+(?:\.\d+)?)$/);
  if (altura) return { height: `${Number(altura[1]) * 4}px` };
  const alturaMin = utilitario.match(/^min-h-(\d+(?:\.\d+)?)$/);
  if (alturaMin) return { minHeight: `${Number(alturaMin[1]) * 4}px` };
  return null;
}

/** Valor RESOLVIDO das classes de um elemento nesta viewport/estado. */
function resolvido(el: Element, contexto: Contexto): Record<string, string> {
  const ctx: Contexto = { largura: contexto.largura, dataState: el.getAttribute('data-state') };
  const saida: Record<string, string> = {};
  for (const classe of (el.getAttribute('class') ?? '').split(/\s+/)) {
    if (!classe) continue;
    const partes = classe.split(':');
    const utilitario = partes.pop() as string;
    if (!partes.every((v) => varianteVale(v, ctx))) continue;
    Object.assign(saida, declaracao(utilitario) ?? {});
  }
  return saida;
}

/**
 * Área útil dentro do diálogo: `max-w-[min(538px,calc(100vw-2rem))]` menos o
 * `p-6` do `DialogContent` (24 px por lado).
 */
function areaUtil(viewport: number): number {
  return Math.min(538, viewport - 2 * 16) - 2 * 24;
}

/** Larguras fixas (px) exigidas pelas peças do modal nesta viewport. */
function largurasFixas(raiz: Element, largura: number): { caminho: string; px: number }[] {
  const achados: { caminho: string; px: number }[] = [];
  raiz.querySelectorAll('*').forEach((el) => {
    const d = resolvido(el, { largura });
    for (const chave of ['width', 'minWidth'] as const) {
      const valor = d[chave];
      if (!valor || !valor.endsWith('px') || valor === '0px') continue;
      achados.push({
        caminho: `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${chave}`,
        px: parseFloat(valor),
      });
    }
  });
  return achados;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('NewTaskDialog — responsivo 360/768/1280 (etapa 169)', () => {
  it.each([ESTREITO, TABLET])(
    'em %i px a prévia é acordeão fechado sob o formulário (gatilho visível, painel montado e escondido)',
    (largura) => {
      const { modal } = montar();

      const gatilho = within(modal).getByTestId('nt-previa-gatilho');
      expect(gatilho.tagName).toBe('BUTTON');
      expect(gatilho).toHaveAttribute('aria-expanded', 'false');
      expect(resolvido(gatilho, { largura }).display).not.toBe('none');

      const painel = within(modal).getByTestId('nt-previa-painel');
      expect(painel).toHaveAttribute('data-state', 'closed');
      // fechado = escondido NESTA faixa, mas o conteúdo segue montado (forceMount)
      expect(resolvido(painel, { largura: largura }).display).toBe('none');
      expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();

      // acordeão SOB o formulário: a prévia vem depois dele, na mesma linha empilhada
      const formulario = within(modal).getByTestId('nt-formulario');
      const coluna = within(modal).getByTestId('nt-previa-coluna');
      expect(
        formulario.compareDocumentPosition(coluna) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(resolvido(within(modal).getByTestId('nt-linha'), { largura }).flexDirection).toBe(
        'column',
      );
    },
  );

  it('em 360 px abrir o gatilho revela a prévia REAL (cartão de tarefa) e alterna o estado', () => {
    const { modal } = montar();
    const gatilho = within(modal).getByTestId('nt-previa-gatilho');

    abrirPrevia(modal);

    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    const painel = within(modal).getByTestId('nt-previa-painel');
    expect(painel).toHaveAttribute('data-state', 'open');
    expect(resolvido(painel, { largura: ESTREITO }).display).not.toBe('none');

    const previa = within(painel).getByTestId('nt-previa');
    expect(within(previa).getByTestId('work-item-card')).toBeInTheDocument();
  });

  it('em 1280 px a prévia é coluna lateral sempre visível: o acordeão não existe ali', () => {
    const { modal } = montar();

    const gatilho = within(modal).getByTestId('nt-previa-gatilho');
    expect(resolvido(gatilho, { largura: DESKTOP }).display).toBe('none');

    const painel = within(modal).getByTestId('nt-previa-painel');
    // ainda FECHADO, e já visível: quem manda nesta faixa é a coluna, não o acordeão
    expect(painel).toHaveAttribute('data-state', 'closed');
    expect(resolvido(painel, { largura: DESKTOP }).display).toBe('block');
    expect(within(painel).getByTestId('nt-previa')).toBeInTheDocument();

    // usar o gatilho (oculto) não pode esconder a prévia no desktop
    abrirPrevia(modal);
    expect(painel).toHaveAttribute('data-state', 'open');
    expect(resolvido(painel, { largura: DESKTOP }).display).toBe('block');

    expect(resolvido(within(modal).getByTestId('nt-linha'), { largura: DESKTOP }).flexDirection).toBe(
      'row',
    );
    // coluna lateral: 56 × 4 px = 224 px, fixos só onde há espaço
    expect(resolvido(within(modal).getByTestId('nt-previa-coluna'), { largura: DESKTOP }).width).toBe(
      '224px',
    );
  });

  it('em 360 px o rodapé fica fixo no pé do modal; em 768 px volta ao fluxo', () => {
    const { modal, onOpenChange } = montar();

    const rodape = within(modal).getByTestId('nt-rodape');
    const estreito = resolvido(rodape, { largura: ESTREITO });
    expect(estreito.position).toBe('sticky');
    expect(estreito.bottom).toBe('0px');
    expect(estreito.zIndex).toBe('10');
    expect(estreito.backgroundColor).toBe('background'); // fundo opaco próprio

    // o modal é o contêiner que rola — a âncora do rodapé sticky
    expect(resolvido(modal, { largura: ESTREITO }).overflowY).toBe('auto');
    expect(modal).toContainElement(rodape);
    // e o rodapé está no FIM do conteúdo: depois da linha do formulário/prévia
    const linha = within(modal).getByTestId('nt-linha');
    expect(linha.compareDocumentPosition(rodape) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // ≥640 px: sem posicionamento declarado = volta ao fluxo normal (static)
    expect(resolvido(rodape, { largura: TABLET }).position).toBeUndefined();

    fireEvent.click(within(rodape).getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([ESTREITO, TABLET, DESKTOP])(
    'em %i px nenhuma peça do modal exige largura fixa maior que a área útil',
    (largura) => {
      const { modal } = montar();
      const util = areaUtil(largura);
      const exigidas = largurasFixas(modal, largura);
      const infratores = exigidas.filter((e) => e.px > util);

      expect(
        infratores,
        `área útil ${util}px; exigências medidas: ${JSON.stringify(exigidas)}`,
      ).toEqual([]);
    },
  );

  it('em 360 px os flex filhos podem encolher (min-w-0) — é o que evita a rolagem lateral', () => {
    const { modal } = montar();

    for (const id of ['nt-formulario', 'nt-previa-coluna']) {
      expect(resolvido(within(modal).getByTestId(id), { largura: ESTREITO }).minWidth).toBe('0px');
    }
  });

  it('o instrumento da medida de largura está de pé: os 224 px contam em 1280 px e não em 360 px', () => {
    const { modal } = montar();

    expect(largurasFixas(modal, DESKTOP).map((e) => e.px)).toContain(224);
    // em 360 px a regra de ≥900 px não vale: nada exige os 224 px da coluna lateral
    const estreito = largurasFixas(modal, ESTREITO);
    expect(estreito.map((e) => e.px)).not.toContain(224);
    expect(estreito.every((e) => e.px <= areaUtil(ESTREITO))).toBe(true);
  });

  it('os alvos de toque do modal medem ao menos 40 px em 360 px (gatilho e rodapé)', () => {
    const { modal } = montar();

    const alvos = [
      within(modal).getByTestId('nt-previa-gatilho'),
      ...within(within(modal).getByTestId('nt-rodape')).getAllByRole('button'),
    ];
    expect(alvos).toHaveLength(3);

    for (const alvo of alvos) {
      const d = resolvido(alvo, { largura: ESTREITO });
      const altura = parseFloat(d.height ?? d.minHeight ?? '0');
      expect(altura, `${alvo.textContent?.trim()} mede ${altura}px`).toBeGreaterThanOrEqual(40);
    }
  });
});
