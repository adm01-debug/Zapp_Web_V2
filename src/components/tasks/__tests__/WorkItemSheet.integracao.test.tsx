/**
 * Etapas 150 e 151 (plano, linhas 423-424; T46, imagem 03, secao 3.3) do painel
 * "Detalhes da tarefa": 150 testes do painel, 151 acessibilidade.
 * Prova o caminho BOM do motivo obrigatorio (Aguardando + motivo no MESMO
 * Ctrl+Enter), que descartar nao salva nem move nada, e a regua do bottom sheet
 * (axe aberto e com o dialogo de descarte, foco entrando e a tela de tras fora
 * da arvore). O gesto e dirigido nos controles REAIS (Radix Select, input,
 * Ctrl+Enter no item); o que se le e `onSave`/`onMove`.
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
