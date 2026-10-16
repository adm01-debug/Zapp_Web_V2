/**
 * E22 — acessibilidade do MODO QUADRO (etapa E22 do plano
 * `docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md`).
 *
 * Arquivo novo: nenhuma linha de produção mudou neste cartão. O que ele prova,
 * e por qual caminho REAL:
 *
 *  1. **A região viva anuncia a movimentação.** O módulo tem uma região
 *     `role="status"` + `aria-live="polite"` (`tasks-live`); ela nasce vazia e
 *     passa a narrar quando um card do Quadro muda de coluna, com a contagem
 *     REAL do alvo ("Movida para Fazendo (2 de 3)").
 *  2. **O menu "Mover para" do card opera SÓ com teclado.** É ele que assume
 *     quando o arrasto sai de cena (`pointer: coarse`); o caso dirige o fluxo
 *     inteiro por eventos de teclado (Enter no gatilho, ↓ para andar no menu,
 *     Enter para mover) e confere que a escrita chegou na fronteira (Supabase).
 *  3. **A faixa de colunas nomeia cada coluna.** Na tela estreita as 5 colunas
 *     viram um carrossel: cada coluna tem um dot com nome acessível
 *     "Ir para <coluna>" (e o dot da coluna à vista carrega `aria-current`),
 *     além das setas "Coluna anterior"/"Próxima coluna".
 *
 * LACUNA REGISTRADA (o `it.todo` no fim do arquivo): o CONTÊINER da coluna não
 * tem papel nem nome acessível — `BoardColumn.tsx` é uma `<div>` sem
 * `role`/`aria-label`, e a lib de DnD não nomeia droppable nenhum. Cobrir isso
 * exige mexer em produção (`BoardColumn.tsx`), que este cartão proíbe (a lista
 * de arquivos permitidos tem só este teste). O `it.todo` documenta a lacuna
 * sem fingir cobertura.
 *
 * Prova por mutação: como o cartão não muda produção, a regra é quebrada de
 * propósito, o caso fica vermelho e a árvore é restaurada — as duas saídas
 * (vermelha e verde) estão no relato do cartão.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  supabaseMock as h,
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';

import { TasksModule } from '@/components/tasks/TasksModule';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Rótulos das 5 colunas como o produto os chama (spec do Quadro). É uma lista
 * LITERAL de propósito: se ela vier de `KANBAN_COLUMNS`, o esperado passa a ser
 * uma cópia do código testado e a asserção vira tautologia.
 */
const ROTULOS_DAS_COLUNAS = ['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído'];

/** O módulo guarda o último modo em `tasks-mode` (é ele que escolhe o Quadro). */
function usarModoQuadro() {
  localStorage.setItem('tasks-mode', 'board');
}

/** Mente sobre as media queries do ambiente (§ pointerMedia.ts) e devolve o desfazer. */
function fingirMidia(matches: (consulta: string) => boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((consulta: string) => ({
    matches: matches(consulta),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

/** Touch: o arrasto sai de cena e o `MoveToMenu` do card assume (etapa 81). */
const PONTEIRO_GROSSO = (consulta: string) => consulta.includes('pointer: coarse');
/** Tela estreita: as 5 colunas viram carrossel com dots e setas (etapa 81). */
const TELA_ESTREITA = (consulta: string) => consulta.includes('max-width: 767px');

function renderQuadro() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      {/* O Quadro usa Tooltip (`BoardColumn`); a app monta o mesmo provider. */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** A região viva do módulo (etapa 78). */
const regiaoViva = () => screen.getByTestId('tasks-live');

/**
 * O card, achado pelo próprio NOME acessível (o `aria-label` que o leitor de
 * tela lê). Não uso `getByRole`: o papel do card muda com o ambiente — com o
 * arrasto ligado a lib de DnD põe `role="button"` nele; com o arrasto desligado
 * (ponteiro grosso) sobra o `role="article"` do próprio card. O nome, não.
 */
const acharCard = (titulo: string, status: string) =>
  screen.findByLabelText(`${titulo}, ${status}`);

beforeEach(() => {
  cleanup();
  resetSupabaseMock();
  localStorage.clear();
  window.history.replaceState(null, '', '/?view=tasks');
  usarModoQuadro();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('E22 — o Quadro anuncia a movimentação na região viva', () => {
  it('nasce vazia e narra "Movida para Fazendo (2 de 3)" com a contagem real do alvo', async () => {
    setSelectResult({
      data: [
        makeTaskRow({ id: 't1', title: 'Ligar para o cliente', status: 'todo' }),
        makeTaskRow({ id: 't2', title: 'Orçamento da feira', status: 'doing' }),
      ],
      error: null,
    });
    const devolverMidia = fingirMidia(PONTEIRO_GROSSO);
    try {
      renderQuadro();
      const card = await acharCard('Ligar para o cliente', 'todo');

      expect(regiaoViva()).toHaveAttribute('aria-live', 'polite');
      expect(regiaoViva().textContent).toBe('');

      // Caminho do card no Quadro: o menu "Mover para" (o toque abre o menu no
      // `pointerdown`, como o navegador faz).
      fireEvent.pointerDown(within(card).getByTestId('move-to-menu'), { button: 0 });
      const menu = await screen.findByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Fazendo' }));

      // "Fazendo" já tem 1 item: a narração conta o alvo REAL (1 + o que chegou).
      await waitFor(() => expect(regiaoViva().textContent).toBe('Movida para Fazendo (2 de 3)'));
    } finally {
      devolverMidia();
    }
  });
});

describe('E22 — o menu "Mover para" do card opera só com teclado', () => {
  it('o foco entra no menu por Enter e o Enter de novo move a tarefa', async () => {
    setSelectResult({
      data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente', status: 'todo' })],
      error: null,
    });
    const devolverMidia = fingirMidia(PONTEIRO_GROSSO);
    try {
      renderQuadro();
      const card = await acharCard('Ligar para o cliente', 'todo');
      const gatilho = within(card).getByTestId('move-to-menu');

      // Está na ordem de tabulação: é um <button> habilitado e visível ao foco.
      expect(gatilho.tagName).toBe('BUTTON');
      expect(gatilho).toBeEnabled();
      expect(gatilho.tabIndex).toBe(0);
      expect(gatilho).toHaveAttribute('aria-haspopup', 'menu');
      expect(gatilho).toHaveAttribute('aria-expanded', 'false');

      // O jsdom não implementa a tecla Tab: o foco é posto onde o Tab o levaria.
      gatilho.focus();
      expect(document.activeElement).toBe(gatilho);

      // Enter (só teclado, nenhum evento de ponteiro) abre o menu e leva o foco
      // para dentro dele — o primeiro item habilitado é quem recebe o foco.
      fireEvent.keyDown(gatilho, { key: 'Enter' });
      await waitFor(() => expect(gatilho).toHaveAttribute('aria-expanded', 'true'));
      await waitFor(() =>
        expect((document.activeElement as HTMLElement | null)?.getAttribute('role')).toBe('menuitem'),
      );
      // Os itens do menu usam o rótulo curto da coluna (`shortLabel`).
      expect((document.activeElement as HTMLElement).textContent).toBe('Entrada');

      // ↓ anda no menu e PULA a coluna atual ("A fazer"), que está desabilitada.
      // (o grupo de foco do Radix move no próximo `tick` — por isso o `waitFor`)
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
      await waitFor(() =>
        expect((document.activeElement as HTMLElement).textContent).toBe('Fazendo'),
      );

      // Enter no item move de verdade: a escrita chega na fronteira (Supabase).
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });

      await waitFor(() => expect(h.update).toHaveBeenCalled());
      expect(h.update.mock.calls[0][0]).toMatchObject({ status: 'doing' });
      expect(h.toast.error).not.toHaveBeenCalled();
    } finally {
      devolverMidia();
    }
  });
});

describe('E22 — a faixa de colunas nomeia cada coluna do Quadro', () => {
  it('cada coluna tem um dot com nome acessível e o da coluna à vista fica marcado', async () => {
    setSelectResult({ data: [], error: null });
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro();
      await screen.findByTestId('board-dots');

      for (const rotulo of ROTULOS_DAS_COLUNAS) {
        expect(
          screen.getByRole('button', { name: `Ir para ${rotulo}` }),
          `dot da coluna "${rotulo}"`,
        ).toBeTruthy();
      }

      // O dot diz QUAL coluna está à vista (não só existe e é nomeado).
      expect(screen.getByRole('button', { name: 'Ir para Caixa de entrada' }))
        .toHaveAttribute('aria-current', 'true');
      for (const rotulo of ROTULOS_DAS_COLUNAS.slice(1)) {
        expect(screen.getByRole('button', { name: `Ir para ${rotulo}` }))
          .not.toHaveAttribute('aria-current');
      }

      // As setas da faixa também são controles nomeados, com o limite de cada ponta.
      expect(screen.getByRole('button', { name: 'Coluna anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Próxima coluna' })).toBeEnabled();
    } finally {
      devolverMidia();
    }
  });

  // Lacuna aberta, registrada sem fingir cobertura: o contêiner da coluna não é
  // uma região nomeada. `BoardColumn.tsx` renderiza uma `<div>` sem
  // `role`/`aria-label` (só o rótulo visível e o botão "Política da coluna"),
  // então `getByRole('region', { name: /A fazer/ })` não acha nada — nem o
  // `@hello-pangea/dnd`, que nomeia apenas a alça de arrasto do card. Fechar
  // isso exige mudar PRODUÇÃO (`BoardColumn.tsx`), fora da lista de arquivos
  // deste cartão; fica como lacuna para a etapa que mexe na coluna (E16).
  it.todo('coluna do Quadro é região com nome acessível (role="region" + aria-label) — exige mudar BoardColumn.tsx');
});
