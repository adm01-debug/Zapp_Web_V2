import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ForwardMessageDialog } from '../ForwardMessageDialog';

const fwd = vi.hoisted(() => ({
  state: {
    searchQuery: '',
    setSearchQuery: vi.fn(),
    activeTab: 'contacts' as 'contacts' | 'groups',
    setActiveTab: vi.fn(),
    selectedContacts: [] as string[],
    selectedGroups: [] as string[],
    filteredContacts: [{ id: 'c1', name: 'Ana', phone: '5511999', avatar_url: undefined }],
    filteredGroups: [{ id: 'g1', name: 'Time', participant_count: 3, avatar_url: undefined }],
    isLoading: false,
    toggleContact: vi.fn(),
    toggleGroup: vi.fn(),
    totalSelected: 0,
    handleForward: vi.fn(),
    handleClose: vi.fn(),
    isSending: false,
    progress: null as { done: number; total: number } | null,
    failedTargets: [] as { id: string; name: string }[],
    retryFailed: vi.fn(),
    lastResult: null as null | { nonForwardable: { itemId: string; reason: string }[] },
  },
}));

vi.mock('@/hooks/chat/useForwardMessage', () => ({
  useForwardMessage: () => fwd.state,
}));

function renderDialog(props = {}) {
  return render(<ForwardMessageDialog open onOpenChange={vi.fn()} onForward={vi.fn()} {...props} />);
}

describe('ForwardMessageDialog — destinos, limites e resultado parcial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fwd.state.totalSelected = 0;
    fwd.state.failedTargets = [];
    fwd.state.progress = null;
    fwd.state.lastResult = null;
    fwd.state.selectedContacts = [];
    fwd.state.selectedGroups = [];
  });

  it('mostra o seletor de destinatários e bloqueia Encaminhar sem seleção', () => {
    renderDialog();
    expect(screen.getByText('Selecione destinatários')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encaminhar/ })).toBeDisabled();
  });

  it('conta os selecionados e habilita Encaminhar', () => {
    fwd.state.totalSelected = 3;
    renderDialog();
    expect(screen.getByText('3 selecionados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encaminhar/ })).toBeEnabled();
  });

  it('esconde a aba Grupos quando targets="contacts"', () => {
    renderDialog({ targets: 'contacts' });
    expect(screen.getByRole('tab', { name: /Contatos/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Grupos/ })).not.toBeInTheDocument();
  });

  it('bloqueia acima de 10 destinos com o motivo visível', () => {
    fwd.state.totalSelected = 11;
    renderDialog();
    expect(screen.getByText(/Máximo de 10 destinos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encaminhar/ })).toBeDisabled();
  });

  it('anuncia o progresso honesto de envio', () => {
    fwd.state.progress = { done: 2, total: 3 };
    renderDialog();
    expect(screen.getByText('2/3 enviados')).toBeInTheDocument();
  });

  it('mostra a falha parcial e o botão de tentar novamente só os que falharam', () => {
    fwd.state.failedTargets = [{ id: 'c1', name: 'Ana' }];
    renderDialog();
    expect(screen.getByTestId('forward-partial-failures')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(fwd.state.retryFailed).toHaveBeenCalledTimes(1);
  });

  it('pede confirmação a partir de 20 envios (2 arquivos × 10 destinos)', () => {
    fwd.state.totalSelected = 10;
    renderDialog({ items: [{ id: 'f1', filename: 'a.pdf' }, { id: 'f2', filename: 'b.pdf' }] as never });
    fireEvent.click(screen.getByRole('button', { name: /Encaminhar/ }));

    expect(screen.getByText('Confirmar encaminhamento')).toBeInTheDocument();
    expect(screen.getByText(/Vai enviar 20 mensagens para 10 contatos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(fwd.state.handleForward).toHaveBeenCalledTimes(1);
  });

  it('lista os arquivos não encaminháveis com o motivo', () => {
    fwd.state.lastResult = { nonForwardable: [{ itemId: 'f9', reason: 'grande demais' }] };
    renderDialog({ items: [{ id: 'f9', filename: 'video.mp4' }] as never });
    expect(screen.getByText('Não encaminháveis:')).toBeInTheDocument();
    expect(screen.getByText(/video\.mp4 — grande demais/)).toBeInTheDocument();
  });
});
