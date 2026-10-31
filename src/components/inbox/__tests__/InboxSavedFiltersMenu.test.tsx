/**
 * Menu "Filtros salvos" da lista de conversas — salvar o atual, aplicar,
 * renomear e excluir (com Desfazer).
 *
 * O componente testado é o REAL (`InboxSavedFiltersMenu`, o mesmo que o
 * `InboxFilters` renderiza). Só o hook `useInboxFilterPresets` é trocado por um
 * dublê — a ida ao servidor dele já tem teste próprio
 * (`useInboxFilterPresets.test.tsx`); aqui o que se prova é a tela: o conteúdo
 * do preset que sai para `onApply`, o que é gravado, o anúncio do erro e o
 * Desfazer. `validateInboxPresetName` NÃO é dublado (o `importOriginal` mantém a
 * regra real) — nome duplicado tem de ser bloqueado pela mesma função do hook.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { InboxSavedFiltersMenu } from '../InboxSavedFiltersMenu';
import { InboxFilters } from '../InboxFilters';
import type { InboxFilterPreset, InboxFilterPresetContent } from '@/hooks/inbox/useInboxFilterPresets';

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const hook = vi.hoisted(() => ({
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  presets: [] as unknown[],
  isSaving: false,
  isDeleting: false,
}));

vi.mock('@/hooks/inbox/useInboxFilterPresets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/inbox/useInboxFilterPresets')>();
  return {
    ...actual,
    useInboxFilterPresets: () => ({
      presets: hook.presets,
      isLoading: false,
      savePreset: hook.savePreset,
      deletePreset: hook.deletePreset,
      isSaving: hook.isSaving,
      isDeleting: hook.isDeleting,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({ useAgents: () => ({ agents: [] }) }));
vi.mock('@/hooks/inbox/useInboxFilterTags', () => ({ useInboxFilterTags: () => ({ data: [] }) }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false, roles: ['admin'] }),
}));
vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [{ id: 'q1', name: 'Suporte' }], loading: false }),
}));

const CURRENT: InboxFilterPresetContent = {
  chipTab: 'attending',
  contactType: null,
  queueId: 'q1',
};

const preset = (overrides: Partial<InboxFilterPreset> = {}): InboxFilterPreset => ({
  id: 'p1',
  name: 'Feriado',
  created_at: '2026-10-13T00:00:00.000Z',
  user_id: 'u1',
  filters: { chipTab: 'waiting', contactType: 'grupo', queueId: 'q9' },
  ...overrides,
});

const renderMenu = (onApply = vi.fn(), current = CURRENT) =>
  render(<InboxSavedFiltersMenu current={current} onApply={onApply} />);

const abrirMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Filtros salvos' }));
const nome = () => screen.getByLabelText('Nome do filtro') as HTMLInputElement;

/**
 * Teclado. O jsdom nao implementa o comportamento PADRAO do teclado: `Tab` nao move o
 * foco e Enter/Espaco num <button> nao gera o `click` nativo. O
 * `@testing-library/user-event` cobriria justamente isso, mas NAO e dependencia deste
 * projeto (e o cartao proibe dependencia nova). Os dois dubles abaixo fazem SO a parte
 * que falta no ambiente: quem reage a tecla e sempre o componente/Radix, e o foco
 * resultante e ASSERTADO a cada passo — um handler que quebre o teclado reprova o teste.
 */
const focaveisDe = (raiz: HTMLElement) =>
  Array.from(
    raiz.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );

function tab(shift = false) {
  const atual = document.activeElement as HTMLElement | null;
  if (!atual) return;
  const tecla = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(atual, tecla);
  if (tecla.defaultPrevented) return; // o Radix tratou (loop do FocusScope)
  const lista = focaveisDe(document.body);
  const i = lista.indexOf(atual);
  act(() => lista[i + (shift ? -1 : 1)]?.focus());
}

function enter(el: HTMLElement) {
  fireEvent.keyDown(el, { key: 'Enter' });
  fireEvent.keyUp(el, { key: 'Enter' });
  if (el instanceof HTMLButtonElement && !el.disabled) act(() => el.click());
}

const focar = (el: HTMLElement) => act(() => el.focus());

beforeEach(() => {
  hook.presets = [];
  hook.savePreset.mockReset().mockResolvedValue(undefined);
  hook.deletePreset.mockReset().mockResolvedValue(undefined);
});

describe('InboxSavedFiltersMenu — filtros salvos do inbox', () => {
  it('lista vazia: orienta e mantém "Salvar filtro atual"', () => {
    renderMenu();
    abrirMenu();
    expect(screen.getByText('Nenhum filtro salvo ainda.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar filtro atual' })).toBeInTheDocument();
  });

  it('aplicar: o conteúdo do preset chega ao onApply e o menu fecha', () => {
    const onApply = vi.fn();
    hook.presets = [preset()];
    renderMenu(onApply);
    abrirMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtro Feriado' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      chipTab: 'waiting',
      contactType: 'grupo',
      queueId: 'q9',
    });
    expect(screen.queryByRole('button', { name: 'Aplicar filtro Feriado' })).not.toBeInTheDocument();
  });

  it('salvar: grava o filtro que está na tela, com o nome digitado', async () => {
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filtro atual' }));

    expect(screen.getByRole('heading', { name: 'Salvar filtro atual' })).toBeInTheDocument();
    fireEvent.change(nome(), { target: { value: '  Meu filtro  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(hook.savePreset).toHaveBeenCalledTimes(1);
    expect(hook.savePreset).toHaveBeenCalledWith({ name: 'Meu filtro', filters: CURRENT });
    // sem `id` = criação, não edição
    expect(hook.savePreset.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('salvar: nome duplicado não vai ao servidor e o erro é anunciado', () => {
    hook.presets = [preset({ name: 'Feriado' })];
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filtro atual' }));

    fireEvent.change(nome(), { target: { value: 'feriado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(hook.savePreset).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um filtro com esse nome.');
    expect(screen.getByRole('heading', { name: 'Salvar filtro atual' })).toBeInTheDocument();
  });

  it('salvar: nome vazio é recusado com mensagem ao lado do campo', () => {
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filtro atual' }));
    fireEvent.change(nome(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(hook.savePreset).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome para o filtro.');
  });

  it('teclado: Enter no campo salva o filtro', () => {
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filtro atual' }));
    fireEvent.change(nome(), { target: { value: 'Urgente' } });
    fireEvent.keyDown(nome(), { key: 'Enter' });

    expect(hook.savePreset).toHaveBeenCalledWith({ name: 'Urgente', filters: CURRENT });
  });

  it('renomear: grava pelo id e mantém o conteúdo do preset', () => {
    const alvo = preset();
    hook.presets = [alvo];
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear filtro Feriado' }));

    expect(screen.getByRole('heading', { name: 'Renomear filtro' })).toBeInTheDocument();
    expect(nome().value).toBe('Feriado');
    fireEvent.change(nome(), { target: { value: 'Feriados' } });
    fireEvent.keyDown(nome(), { key: 'Enter' });

    expect(hook.savePreset).toHaveBeenCalledWith({
      id: 'p1',
      name: 'Feriados',
      filters: alvo.filters,
    });
  });

  it('renomear: o próprio nome não é acusado como duplicado', () => {
    hook.presets = [preset({ name: 'Feriado' })];
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear filtro Feriado' }));
    fireEvent.change(nome(), { target: { value: 'Feriado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(hook.savePreset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Feriado' })
    );
  });

  it('excluir: remove no servidor e oferece Desfazer que regrava o filtro', async () => {
    hook.presets = [preset()];
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir filtro Feriado' }));

    expect(hook.deletePreset).toHaveBeenCalledWith('p1');
    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent('Filtro “Feriado” excluído.');

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(hook.savePreset).toHaveBeenCalledWith({
      name: 'Feriado',
      filters: preset().filters,
    });
  });

  it('excluir: falha do servidor é anunciada e o preset continua na lista', async () => {
    hook.presets = [preset()];
    hook.deletePreset.mockRejectedValue(new Error('permissão negada'));
    renderMenu();
    abrirMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir filtro Feriado' }));

    const erro = await screen.findByRole('alert');
    expect(erro).toHaveTextContent('permissão negada');
    expect(screen.getByRole('button', { name: 'Aplicar filtro Feriado' })).toBeInTheDocument();
  });

  it('abre pelo teclado: o foco entra no painel e o Tab circula entre as pontas', async () => {
    hook.presets = [preset()];
    renderMenu();

    const gatilho = screen.getByRole('button', { name: 'Filtros salvos' });
    focar(gatilho);
    expect(gatilho).toHaveFocus();

    enter(gatilho);
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');

    const painel = await screen.findByRole('dialog', { name: 'Filtros salvos do inbox' });
    await waitFor(() => expect(painel.contains(document.activeElement)).toBe(true));

    const primeiro = screen.getByRole('button', { name: 'Salvar filtro atual' });
    const ultimo = screen.getByRole('button', { name: 'Excluir filtro Feriado' });

    // Tab do ultimo focavel volta ao primeiro (e Shift+Tab faz o caminho inverso):
    // prova que o Tab e tratado e que o foco nao escapa do popover.
    focar(ultimo);
    tab();
    expect(primeiro).toHaveFocus();

    tab(true);
    expect(ultimo).toHaveFocus();
  });

  it('aplicar pelo teclado: Enter aplica o filtro e o foco volta ao gatilho', async () => {
    const onApply = vi.fn();
    hook.presets = [preset()];
    renderMenu(onApply);

    const gatilho = screen.getByRole('button', { name: 'Filtros salvos' });
    focar(gatilho);
    enter(gatilho);

    const aplicar = screen.getByRole('button', { name: 'Aplicar filtro Feriado' });
    focar(aplicar);
    enter(aplicar);

    expect(onApply).toHaveBeenCalledWith(preset().filters);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Aplicar filtro Feriado' })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(gatilho).toHaveFocus());
  });

  it('renomear pelo teclado: o foco vai ao campo ao abrir e volta ao botao ao fechar', async () => {
    hook.presets = [preset()];
    renderMenu();

    const gatilho = screen.getByRole('button', { name: 'Filtros salvos' });
    focar(gatilho);
    enter(gatilho);

    const renomear = screen.getByRole('button', { name: 'Renomear filtro Feriado' });
    focar(renomear);
    enter(renomear);

    const campo = nome();
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo.value).toBe('Feriado');

    fireEvent.change(campo, { target: { value: 'Feriados' } });
    fireEvent.keyDown(campo, { key: 'Enter' }); // o handler do campo salva (nao o mouse)
    expect(hook.savePreset).toHaveBeenCalledWith({
      id: 'p1',
      name: 'Feriados',
      filters: preset().filters,
    });

    await waitFor(() => expect(screen.queryByLabelText('Nome do filtro')).not.toBeInTheDocument());
    await waitFor(() => expect(renomear).toHaveFocus());
  });

  it('excluir pelo teclado: Enter no botao de excluir chama o servidor', async () => {
    hook.presets = [preset()];
    renderMenu();

    const gatilho = screen.getByRole('button', { name: 'Filtros salvos' });
    focar(gatilho);
    enter(gatilho);

    const excluir = screen.getByRole('button', { name: 'Excluir filtro Feriado' });
    focar(excluir);
    expect(excluir).toHaveFocus();
    enter(excluir);

    expect(hook.deletePreset).toHaveBeenCalledWith('p1');
  });

  it('Escape fecha o dialogo aberto de dentro do popover e devolve o foco ao popover', async () => {
    hook.presets = [preset()];
    renderMenu();

    const gatilho = screen.getByRole('button', { name: 'Filtros salvos' });
    focar(gatilho);
    enter(gatilho);

    const salvar = screen.getByRole('button', { name: 'Salvar filtro atual' });
    focar(salvar);
    enter(salvar);
    await waitFor(() => expect(nome()).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByLabelText('Nome do filtro')).not.toBeInTheDocument());
    // o popover continua aberto, com o foco de volta no botao que abriu o dialogo
    expect(screen.getByRole('button', { name: 'Salvar filtro atual' })).toBeInTheDocument();
    await waitFor(() => expect(salvar).toHaveFocus());
  });

  it('o axe não acusa botão sem nome no menu aberto', async () => {
    hook.presets = [preset()];
    renderMenu();
    abrirMenu();

    const results = await axe(document.body, {
      runOnly: { type: 'rule', values: ['button-name', 'label'] },
    });

    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('InboxFilters: o menu só aparece quando a tela entrega o filtro atual', () => {
    const baseProps = {
      filters: { status: [], tags: [], agentId: null, dateRange: { from: null, to: null } },
      onFiltersChange: vi.fn(),
    };

    const semIntegracao = render(<InboxFilters {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Filtros salvos' })).not.toBeInTheDocument();
    semIntegracao.unmount();

    render(<InboxFilters {...baseProps} savedFilters={{ current: CURRENT, onApply: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'Filtros salvos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeInTheDocument();
  });
});
