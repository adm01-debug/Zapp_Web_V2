/**
 * Etapa 169 (plano, linha 449; seção 3.4) — responsivo do modal "Nova tarefa":
 * abaixo de 900 px a prévia vira acordeão sob o formulário; em 360 px o rodapé
 * fica fixo; sem rolagem horizontal.
 *
 * O que este arquivo prova, e por quê:
 *  - o corte é o de 900 px (`min-[900px]`), não o `md` de 768 px: o gatilho do
 *    acordeão é do desenho estreito e o painel fechado só é escondido na faixa
 *    <900 px (`max-[899px]:data-[state=closed]:hidden`), pelo estado REAL do
 *    Radix (`data-state`) — nunca por uma classe `hidden` solta, que apagaria a
 *    prévia no desktop também. Abrir pelo gatilho muda esse estado;
 *  - em ≥900 px o painel aparece sempre (`min-[900px]:block`), e as duas regras
 *    vivem em faixas de mídia DISJUNTAS: nenhuma disputa o mesmo caso;
 *  - a rolagem horizontal é medida por ARITMÉTICA sobre as classes: a largura
 *    útil em 360 px é 360 − 2×24 (`p-6` do `DialogContent`) = 312 px, e nenhuma
 *    peça do modal fixa largura acima disso FORA de uma media query ≥900 px (os
 *    224 px da prévia são fixados só em ≥900 px, onde há espaço). O modal é
 *    `overflow-y-auto`, que pela regra do CSS também faz o overflow-x computar
 *    `auto` — logo qualquer filho mais largo que 312 px criaria a barra;
 *  - o rodapé fica fixo em telas estreitas (`max-sm:sticky bottom-0`) e é o
 *    último filho EM FLUXO do `DialogContent`, que é o contêiner que rola;
 *  - os alvos de toque têm ≥40 px (o gatilho do acordeão inclusive);
 *  - o texto novo usa os tokens do tema e fecha AA (mesmo medidor WCAG de
 *    `movimentoEContraste.test.tsx`: ≥4,5:1 para texto, nas duas skins).
 */
import { resetSupabaseMock, setWriteResult } from '@/test/mocks/tarefas';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TasksUiProvider } from '@/components/tasks/shared/TasksUiContext';
import { useTasksUi } from '@/components/tasks/shared/tasksUi';
import { NewTaskDialog } from '@/components/tasks/shared/NewTaskDialog';

const NOW = new Date(2026, 9, 13, 12, 0, 0, 0);

/** Largura útil de um viewport de 360 px dentro do `p-6` (24 px por lado). */
const VIEWPORT_ESTREITO = 360;
const PADDING_DIALOGO = 24;
const LARGURA_UTIL_360 = VIEWPORT_ESTREITO - 2 * PADDING_DIALOGO; // 312

beforeEach(() => {
  resetSupabaseMock();
  setWriteResult({ data: { id: 'nt-1' }, error: null });
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

function AbrirEMontar() {
  const { modalOpen, openModal } = useTasksUi();
  return (
    <>
      <button type="button" onClick={openModal}>abrir modal</button>
      {modalOpen && <NewTaskDialog now={NOW} />}
    </>
  );
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TasksUiProvider>
        <AbrirEMontar />
      </TasksUiProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'abrir modal' }));
}

const classes = (el: Element) => (el as HTMLElement).className;

/** O modal é o contêiner que rola (é ele que o rodapé `sticky` usa como âncora). */
function dialogo() {
  return screen.getByTestId('new-task-dialog');
}

/**
 * Pisos de largura (em px) declarados SEM porta de breakpoint/estado — os que
 * valem já em 360 px. Classe com `:` (variante) fica de fora, porque só entra
 * quando o breakpoint/estado bate; `min-w-[Npx]`, `w-N` e `min-w-N` contam.
 */
function pisosDeLarguraSemPorta(raiz: HTMLElement): { px: number; classe: string }[] {
  const achadas: { px: number; classe: string }[] = [];
  raiz.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const atual = el.className;
    if (typeof atual !== 'string') return;
    for (const c of atual.split(/\s+/)) {
      if (!c || c.includes(':')) continue;
      const arbitrario = c.match(/^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/);
      if (arbitrario) {
        achadas.push({ px: parseFloat(arbitrario[1]), classe: `${el.tagName.toLowerCase()}.${c}` });
        continue;
      }
      const escala = c.match(/^(?:min-)?w-(\d+(?:\.\d+)?)$/);
      if (escala) achadas.push({ px: parseFloat(escala[1]) * 4, classe: `${el.tagName.toLowerCase()}.${c}` });
    }
  });
  return achadas;
}

// ─── HSL → sRGB → luminância relativa → contraste WCAG (mesmo medidor de
//     `movimentoEContraste.test.tsx`) ───
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
function luminancia([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
/** Como o navegador pinta `cor` com alfa sobre `base`. */
const compor = (cor: string, alfa: number, base: string): RGB => {
  const [r, g, b] = hslToRgb(...parseHsl(cor));
  const [br, bg, bb] = hslToRgb(...parseHsl(base));
  return [r * alfa + br * (1 - alfa), g * alfa + bg * (1 - alfa), b * alfa + bb * (1 - alfa)];
};
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const razao = (cor: string, base: string): number => razaoRgb(compor(cor, 1, base), compor(base, 1, base));

/** Variáveis de cor das duas skins, lidas do arquivo real de tokens. */
function tokensDasSkins(): { claro: Record<string, string>; escuro: Record<string, string> } {
  const css = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
  const corte = css.indexOf('.dark {');
  const varrer = (trecho: string) => {
    const mapa: Record<string, string> = {};
    for (const linha of trecho.split('\n')) {
      const m = linha.match(/--([\w-]+):\s*([^;]+);/);
      if (m) mapa[m[1]] = m[2].trim();
    }
    return mapa;
  };
  return { claro: varrer(css.slice(0, corte)), escuro: varrer(css.slice(corte)) };
}

describe('NewTaskDialog — responsivo (etapa 169)', () => {
  it('abaixo de 900px a prévia é acordeão: gatilho existe, painel fechado e oculto', () => {
    montar();

    const gatilho = screen.getByTestId('nt-previa-gatilho');
    const painel = screen.getByTestId('nt-previa-painel');

    // O gatilho só vive abaixo do corte — some em ≥900px.
    expect(gatilho).toHaveAccessibleName('Prévia da tarefa');
    expect(classes(gatilho)).toContain('min-[900px]:hidden');

    // Fechado: quem esconde a prévia em <900 px é a classe presa ao estado do
    // Radix. `forceMount` mantém a MESMA prévia montada (o desktop a reusa), mas
    // em tela estreita ela não aparece sob o formulário.
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    expect(painel).toHaveAttribute('data-state', 'closed');
    expect(classes(painel)).toContain('max-[899px]:data-[state=closed]:hidden');
    expect(screen.getByTestId('nt-previa')).toBeInTheDocument();
  });

  it('o gatilho abre e fecha o acordeão (a prévia já está montada, é só revelá-la)', () => {
    montar();
    const gatilho = screen.getByTestId('nt-previa-gatilho');
    const painel = screen.getByTestId('nt-previa-painel');

    fireEvent.click(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    expect(painel).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('nt-previa-cartao')).toBeInTheDocument();

    fireEvent.click(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    expect(painel).toHaveAttribute('data-state', 'closed');
    // Só a faixa <900 fechada esconde: nenhuma classe `hidden` solta (sem porta
    // de mídia) esconderia a prévia também no desktop.
    expect(classes(painel).split(/\s+/)).not.toContain('hidden');
  });

  it('em ≥900px a prévia ocupa a coluna da direita, sempre visível (o `min-[900px]:block` vence o acordeão)', () => {
    montar();

    // A faixa ≥900 sempre mostra e a faixa <900 fechada esconde: as duas são de
    // faixas de mídia DISJUNTAS, então não há regra disputando o mesmo caso — a
    // prévia não pode sumir no desktop (nem aparecer fechada no celular).
    const painel = screen.getByTestId('nt-previa-painel');
    expect(classes(painel)).toContain('min-[900px]:block');
    expect(classes(painel)).toContain('min-[900px]:pt-0');
    expect(classes(painel)).toContain('max-[899px]:data-[state=closed]:hidden');

    // A coluna da prévia só ganha os 224px em ≥900px, onde há espaço.
    const coluna = screen.getByTestId('nt-previa').closest('div.min-w-0');
    expect(coluna).not.toBeNull();
    expect(classes(coluna!)).toContain('min-[900px]:w-56');
    expect(classes(coluna!)).toContain('min-[900px]:shrink-0');

    // E o layout vira duas colunas no mesmo corte.
    const linha = coluna!.parentElement;
    expect(linha).not.toBeNull();
    expect(classes(linha!)).toContain('flex-col');
    expect(classes(linha!)).toContain('min-[900px]:flex-row');
  });

  it('não há rolagem horizontal: nenhuma largura fixa passa dos 312px úteis de um 360', () => {
    montar();

    const pisos = pisosDeLarguraSemPorta(dialogo());
    const maior = pisos.reduce((max, atual) => Math.max(max, atual.px), 0);

    expect(pisos.length).toBeGreaterThan(0); // a varredura achou o que medir
    expect(maior, `maior piso fixo: ${pisos.map((p) => `${p.classe}=${p.px}px`).join(', ')}`)
      .toBeLessThanOrEqual(LARGURA_UTIL_360);
    // A prévia (224px) NÃO fixa largura sem porta: ela é fluida em 360px.
    expect(classes(screen.getByTestId('nt-previa'))).not.toMatch(/(^|\s)w-\d/);
    expect(classes(screen.getByTestId('nt-previa'))).not.toMatch(/(^|\s)md:w-/);

    // As colunas do formulário podem encolher (min-w-0) — é o que evita o
    // estouro quando o conteúdo é mais largo que a coluna.
    const colunaFormulario = screen.getByTestId('new-task-title').closest('div.min-w-0');
    expect(colunaFormulario).not.toBeNull();

    // A única peça com piso em linha (a prioridade, 4 × 72px) quebra linha, então
    // nem somando os irmãos ela chega a estourar os 312px.
    expect(classes(screen.getByTestId('new-task-priority'))).toContain('flex-wrap');
  });

  it('em 360px o rodapé fica fixo no pé do modal, que é quem rola', () => {
    montar();
    const modal = dialogo();
    const rodape = screen.getByTestId('nt-rodape');

    // O sticky só gruda dentro do contêiner que rola.
    expect(classes(modal)).toContain('overflow-y-auto');
    expect(classes(rodape)).toContain('max-sm:sticky');
    expect(classes(rodape)).toContain('max-sm:bottom-0');
    expect(classes(rodape)).toContain('max-sm:bg-background');
    // Estica até as bordas do `p-6` do diálogo: sem o recuo negativo sobraria
    // uma faixa de 24px mostrando o formulário rolando sob o rodapé.
    expect(classes(rodape)).toContain('max-sm:-mx-6');
    expect(classes(rodape)).toContain('max-sm:-mb-6');
    expect(classes(rodape)).toContain('max-sm:px-6');
    expect(classes(rodape)).toContain('max-sm:pb-6');
    expect(modal.contains(rodape)).toBe(true);

    // O rodapé é o último filho EM FLUXO: o único irmão depois dele é o "X"
    // absoluto, que não empurra o rodapé para fora do pé.
    let irmao = rodape.nextElementSibling;
    while (irmao) {
      expect(classes(irmao)).toContain('absolute');
      irmao = irmao.nextElementSibling;
    }
  });

  it('os alvos de toque têm ≥40px, o gatilho do acordeão inclusive', () => {
    montar();

    // h-10 / min-h-10 valem 40px (escala 4px do Tailwind).
    const gatilho = screen.getByTestId('nt-previa-gatilho');
    expect(classes(gatilho)).toMatch(/(^|\s)(min-)?h-10(\s|$)/);

    for (const nome of ['Cancelar', 'Criar tarefa']) {
      expect(classes(screen.getByRole('button', { name: nome }))).toContain('h-10');
    }
  });

  it('o texto novo usa tokens do tema e fecha AA (≥4,5:1) nas duas skins', () => {
    montar();
    const { claro, escuro } = tokensDasSkins();

    // O gatilho pinta texto sobre `bg-muted/30` composto no fundo; a dica e a
    // legenda da prévia sobre o fundo puro.
    expect(classes(screen.getByTestId('nt-previa-gatilho'))).toContain('bg-muted/30');
    expect(classes(screen.getByTestId('nt-dica'))).toContain('text-muted-foreground');

    for (const skin of [claro, escuro]) {
      const fundo = skin['background'];
      const fundoGatilho = skin['muted'];
      // `bg-muted/30`: 30% da tinta sobre o fundo.
      const misto: RGB = (() => {
        const [r, g, b] = hslToRgb(...parseHsl(fundoGatilho));
        const [br, bg, bb] = hslToRgb(...parseHsl(fundo));
        return [r * 0.3 + br * 0.7, g * 0.3 + bg * 0.7, b * 0.3 + bb * 0.7];
      })();

      // Título do gatilho e da prévia: `--foreground`.
      expect(razaoRgb(compor(skin['foreground'], 1, fundo), compor(fundo, 1, fundo))).toBeGreaterThanOrEqual(4.5);
      expect(razaoRgb(compor(skin['foreground'], 1, fundo), misto)).toBeGreaterThanOrEqual(4.5);
      // Dica e "Confira antes de criar.": `--muted-foreground`.
      expect(razao(skin['muted-foreground'], fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('nas três larguras do critério (360, 768, 1280) nenhum piso fixo estoura a área útil', () => {
    montar();
    const modal = dialogo();
    const clsModal = classes(modal).split(/\s+/);

    // As constantes saem das classes REAIS do `DialogContent` (size="lg"): o
    // `p-6` (24px por lado) e o teto `max-w-2xl` (42rem = 672px). Se alguém
    // trocar a medida, este teste cai e obriga a remedir.
    expect(clsModal).toContain('p-6');
    expect(clsModal).toContain('max-w-2xl');
    const padding = 6 * 4; // escala de 4px do Tailwind
    const teto = 42 * 16;

    const maior = pisosDeLarguraSemPorta(modal).reduce((m, p) => Math.max(m, p.px), 0);
    for (const largura of [360, 768, 1280]) {
      const util = Math.min(largura, teto) - 2 * padding;
      expect(
        maior,
        `em ${largura}px: maior piso fixo ${maior}px vs área útil ${util}px`,
      ).toBeLessThanOrEqual(util);
    }

    // Em ≥900px a prévia ganha 224px (`w-56`) ao lado da coluna do formulário,
    // que encolhe a zero (`min-w-0`), mais o `gap-5`. Em 1280px sobram 624px
    // úteis: 224 + 20 + 0 cabe com folga.
    const coluna = screen.getByTestId('nt-previa').closest('div.min-w-0');
    const linha = coluna!.parentElement!;
    expect(classes(coluna!)).toContain('min-[900px]:w-56');
    expect(classes(linha).split(/\s+/)).toContain('gap-5');
    const larguraPrevia = 56 * 4;
    const gap = 5 * 4;
    expect(larguraPrevia + gap).toBeLessThanOrEqual(Math.min(1280, teto) - 2 * padding);
  });

  it('o gatilho do acordeão é botão nativo, entra no Tab e mostra foco visível', () => {
    montar();
    const gatilho = screen.getByTestId('nt-previa-gatilho');

    expect(gatilho.tagName).toBe('BUTTON');
    expect(gatilho).toHaveAccessibleName('Prévia da tarefa');
    expect(gatilho).not.toHaveAttribute('tabindex', '-1');
    expect(classes(gatilho)).toContain('focus-visible:ring-2');
    expect(classes(gatilho)).toContain('focus-visible:ring-ring');
  });
});
