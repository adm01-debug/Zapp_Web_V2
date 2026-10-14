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
import { render, screen, fireEvent } from '@testing-library/react';
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
  mainTab: 'open',
  subTab: 'attending',
  contactType: null,
  queueId: 'q1',
};

const preset = (overrides: Partial<InboxFilterPreset> = {}): InboxFilterPreset => ({
  id: 'p1',
  name: 'Feriado',
  created_at: '2026-10-13T00:00:00.000Z',
  user_id: 'u1',
  filters: { mainTab: 'open', subTab: 'waiting', contactType: 'grupo', queueId: 'q9' },
  ...overrides,
});

const renderMenu = (onApply = vi.fn(), current = CURRENT) =>
  render(<InboxSavedFiltersMenu current={current} onApply={onApply} />);

const abrirMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Filtros salvos' }));
const nome = () => screen.getByLabelText('Nome do filtro') as HTMLInputElement;

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
      mainTab: 'open',
      subTab: 'waiting',
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

  it('os controles do menu são botões nativos (Enter/Espaço acionam)', () => {
    hook.presets = [preset()];
    renderMenu();
    abrirMenu();

    for (const nomeBotao of [
      'Salvar filtro atual',
      'Aplicar filtro Feriado',
      'Renomear filtro Feriado',
      'Excluir filtro Feriado',
    ]) {
      expect(screen.getByRole('button', { name: nomeBotao }).tagName).toBe('BUTTON');
    }
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
