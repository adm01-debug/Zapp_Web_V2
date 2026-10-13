import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UniversityHelp } from '../UniversityHelp';

const help = vi.hoisted(() => ({
  state: {
    selectedIds: new Set<string>(),
    loading: false,
    response: null as { text?: string } | null,
    selectedTone: 'profissional',
    setSelectedTone: vi.fn(),
    error: null as string | null,
    filterMode: 'all' as 'all' | 'client' | 'agent',
    setFilterMode: vi.fn(),
    filteredMessages: [
      { id: 'm1', content: 'oi', sender: 'client' },
      { id: 'm2', content: 'olá', sender: 'agent' },
    ] as { id: string; content: string; sender: string }[],
    periodFilter: {
      analysisPeriod: '30d',
      setAnalysisPeriod: vi.fn(),
      customDateFrom: null,
      customDateTo: null,
      setCustomDateFrom: vi.fn(),
      setCustomDateTo: vi.fn(),
      clearCustomDates: vi.fn(),
      filteredMessages: [] as unknown[],
    },
    toggleMessage: vi.fn(),
    selectAll: vi.fn(),
    generateResponse: vi.fn(),
    handleRegenerate: vi.fn(),
    lastCallRef: { current: 0 },
  },
}));

vi.mock('@/hooks/ui/useUniversityHelp', () => ({
  useUniversityHelp: () => help.state,
}));

const messages = [
  { id: 'm1', content: 'oi', sender: 'client', timestamp: '2026-01-01' },
  { id: 'm2', content: 'olá', sender: 'agent', timestamp: '2026-01-01' },
];

function renderHelp() {
  return render(<UniversityHelp contactId="c1" contactName="Ana" messages={messages} onSelectSuggestion={vi.fn()} />);
}

describe('UniversityHelp — seleção, atalho e erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    help.state.selectedIds = new Set<string>();
    help.state.loading = false;
    help.state.error = null;
    help.state.response = null;
    help.state.filteredMessages = [
      { id: 'm1', content: 'oi', sender: 'client' },
      { id: 'm2', content: 'olá', sender: 'agent' },
    ];
  });

  it('bloqueia Gerar resposta sem mensagem selecionada', () => {
    renderHelp();
    expect(screen.getByRole('button', { name: /Gerar resposta \(0 msgs\)/ })).toBeDisabled();
  });

  it('mostra a contagem selecionada e libera o botão', () => {
    help.state.selectedIds = new Set(['m1']);
    renderHelp();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar resposta \(1 msg\)/ })).toBeEnabled();
  });

  it('Ctrl+Enter gera a resposta quando há seleção', () => {
    help.state.selectedIds = new Set(['m1']);
    renderHelp();

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(help.state.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Enter não gera nada sem seleção', () => {
    renderHelp();
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(help.state.generateResponse).not.toHaveBeenCalled();
  });

  it('mostra o erro e reenvia ao clicar em Tentar novamente', () => {
    help.state.error = 'Falha na IA';
    renderHelp();

    expect(screen.getByText('Erro ao gerar resposta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(help.state.generateResponse).toHaveBeenCalledTimes(1);
  });

  it('os filtros trocam o modo de remetente', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Só cliente' }));
    expect(help.state.setFilterMode).toHaveBeenCalledWith('client');
  });
});
