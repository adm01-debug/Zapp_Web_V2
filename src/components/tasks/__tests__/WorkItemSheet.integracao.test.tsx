/**
 * Etapas 150 e 151 (plano, linhas 423–424; T46 — "testes de integração do
 * painel e do modal"; imagem 03, seção 3.3) do painel "Detalhes da tarefa":
 *  - 150 Testes do painel: campos, motivo obrigatório, validações de lembrete,
 *        Concluir, Salvar, estado de edição, descartar e Ctrl+Enter.
 *  - 151 Acessibilidade do painel: foco, teclado e bottom sheet.
 *
 * O que este arquivo prova, e por quê (o que as etapas 132–147 ainda NÃO
 * cobriam por cartão):
 *  - o caminho BOM do motivo obrigatório: com Aguardando escolhido e o motivo
 *    digitado, o Ctrl+Enter salva ESTADO + MOTIVO no MESMO patch (o teste da
 *    etapa 135 só cobre o bloqueio com a caixa vazia);
 *  - descartar não salva e não move nada — só fecha (a etapa 143 prova o
 *    diálogo e o fechamento, não o "nada foi enviado");
 *  - o bottom sheet do celular (etapas 23/81/D14): acessível pelo mesmo título
 *    do painel, sem violação de axe (aberto e com o diálogo de descarte), e com
 *    o foco PRESO dentro dele — o mesmo contrato de
 *    `src/components/a11y/__tests__/CustomModalFocus.test.tsx`.
 *
 * O gesto é dirigido nos controles REAIS (Radix Select, input, Ctrl+Enter no
 * item), não num mock que já traz a resposta; o que se lê é `onSave`/`onMove`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: vi.fn() }));

import { WorkItemSheet } from '@/components/tasks/shared/WorkItemSheet';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const matchMediaOriginal = window.matchMedia;

/** Etapa 145: abaixo de `md` o painel é o bottom sheet MODAL do celular. */
function telaNarrow() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const base: WorkItem = {
  id: 't1',
  title: 'Ligar para o cliente',
  description: null,
  status: 'todo',
  priority: 'medium',
  due_date: null,
  remind_at: null,
  notified_at: null,
  waiting_reason: null,
  position: 0,
  started_at: null,
  status_changed_at: '2026-10-01T10:00:00.000Z',
  completed_at: null,
  contact_id: null,
  created_by: 'u1',
  assigned_to: 'u1',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  contact: null,
};

function props(over: Record<string, unknown> = {}) {
  return {
    item: base,
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    onMove: vi.fn(),
    onSnooze: vi.fn(),
    onSetReminder: vi.fn(),
    onCancel: vi.fn(),
    contactOptions: [{ id: 'c1', name: 'Ana Souza' }],
    doingCount: 0,
    ...over,
  };
}

/** Radix Select abre pelo teclado no jsdom (pointerdown não basta). */
async function abrirSelect(testid: string) {
  const trigger = screen.getByTestId(testid);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return screen.findByRole('listbox');
}

describe('WorkItemSheet — etapas 150–151 (integração e acessibilidade do painel)', () => {
  beforeEach(() => cleanup());
  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    cleanup();
  });

  it('150: com Aguardando e o motivo digitado, o Ctrl+Enter salva estado e motivo no mesmo patch', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    // O estado vem do option REAL do select de Estado (etapa 134).
    await abrirSelect('sheet-estado');
    fireEvent.click(await screen.findByRole('option', { name: 'Aguardando' }));

    // A caixa do motivo (etapa 135) aparece e o painel se marca como editando.
    expect(await screen.findByTestId('sheet-motivo-caixa')).toBeTruthy();
    expect(screen.getByTestId('sheet-estado-edicao')).toHaveTextContent('Alterações não salvas');

    // Salvar com a caixa vazia trava: erro inline e NADA sai para o chamador.
    fireEvent.click(screen.getByTestId('sheet-salvar'));
    expect(await screen.findByTestId('sheet-motivo-erro')).toHaveTextContent('Diga por que parou');
    expect(p.onSave).not.toHaveBeenCalled();

    // Com o motivo, o atalho do rodapé (etapa 141) salva o par inteiro.
    fireEvent.change(screen.getByTestId('sheet-motivo'), {
      target: { value: 'Cliente não respondeu' },
    });
    fireEvent.keyDown(screen.getByTestId('sheet-motivo'), {
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
    });

    await waitFor(() => expect(p.onMove).toHaveBeenCalledTimes(1));
    // O estado é da máquina de estados (`onMove`), com o motivo junto (etapa 28).
    expect(p.onMove).toHaveBeenCalledWith(base, 'waiting', 'Cliente não respondeu');
    // E o motivo também vai no patch dos campos (caminho do `onSave`).
    expect(p.onSave).toHaveBeenCalledWith(base, { waitingReason: 'Cliente não respondeu' });
  });

  it('150: descartar com alterações fecha o painel sem salvar nem mover a tarefa', async () => {
    const p = props();
    render(<WorkItemSheet {...p} />);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    // A proteção da etapa 143 aparece e o "Descartar" é quem fecha.
    fireEvent.click(await screen.findByTestId('sheet-descartar-confirmar'));

    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onSave).not.toHaveBeenCalled();
    expect(p.onMove).not.toHaveBeenCalled();
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('151: o bottom sheet do celular é o mesmo painel, com o título como nome acessível', async () => {
    telaNarrow();
    render(<WorkItemSheet {...props()} />);

    const painel = screen.getByTestId('work-item-sheet');
    // O título do SheetContent dá o nome acessível do diálogo.
    expect(screen.getByRole('dialog', { name: 'Detalhes da tarefa' })).toBe(painel);
  });

  it('151: o bottom sheet não tem violação de acessibilidade (axe)', async () => {
    telaNarrow();
    render(<WorkItemSheet {...props()} />);

    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('151: nem com o diálogo de descarte aberto sobre o painel', async () => {
    render(<WorkItemSheet {...props()} />);

    fireEvent.change(screen.getByTestId('sheet-titulo'), { target: { value: 'Outro título' } });
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    await screen.findByTestId('sheet-descartar');

    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('151: o foco entra no bottom sheet e a tela de trás sai da árvore de acessibilidade (foco preso)', async () => {
    telaNarrow();
    const tela = (open: boolean) => (
      <>
        <WorkItemSheet {...props({ open })} />
        <button type="button">Controle externo</button>
      </>
    );
    // O botão de fora é lido ANTES de o sheet abrir: aberto, ele fica aria-hidden.
    const { rerender } = render(tela(false));
    const externo = screen.getByRole('button', { name: 'Controle externo' });
    rerender(tela(true));

    const painel = screen.getByTestId('work-item-sheet');

    // O foco entra no painel ao abrir (o título recebe o `autoFocus`).
    await waitFor(() => expect(painel).toContainElement(document.activeElement as HTMLElement));

    // O resto da tela fica fora da árvore de acessibilidade — o bottom sheet é a
    // única região alcançável pelo foco/leitor enquanto está aberto (o ciclo do
    // TAB nativo é do navegador e não roda no jsdom; ver a nota do
    // NewTaskDialog.integracao.test.tsx).
    expect(externo.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(painel.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelectorAll('[data-radix-focus-guard]').length).toBe(2);
  });
});
