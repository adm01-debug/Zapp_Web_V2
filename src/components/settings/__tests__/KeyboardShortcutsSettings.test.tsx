/**
 * Etapa 84 — a tela de atalhos (Configurações) exibe os rótulos dos 7 atalhos
 * de Tarefas que saíram do chunk de entrada.
 *
 * Esta tela é uma rota lazy (`SettingsView`), então `taskShortcutLabels` chega
 * junto com ela — nunca no `initial-js`. Aqui se prova que nome e descrição
 * continuam aparecendo para o usuário final.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/ui/useCustomShortcuts', () => ({
  useCustomShortcuts: vi.fn(),
}));

import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';

const CASOS: Array<{ nome: string; descricao: string }> = [
  { nome: 'Nova tarefa', descricao: 'Foca o campo de nova tarefa' },
  { nome: 'Modo das Tarefas', descricao: 'Troca o modo: Lista (1), Quadro (2), Agenda (3)' },
  { nome: 'Buscar tarefa', descricao: 'Foca o campo de busca das Tarefas' },
  { nome: 'Abrir tarefa focada', descricao: 'Abre o painel da tarefa em foco' },
  { nome: 'Concluir tarefa focada', descricao: 'Conclui — ou reabre — a tarefa em foco' },
  { nome: 'Cancelar tarefa focada', descricao: 'Cancela a tarefa em foco, com desfazer' },
];

const SHORTCUTS_DEFAULT = [
  { id: 'send-message', name: 'Enviar mensagem', description: 'Envia a mensagem atual', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' as const },
  { id: 'ai-suggestions', name: 'Sugestões de IA', description: 'Abre o painel de sugestões de IA', defaultKey: 'i', defaultModifiers: { ctrlKey: true }, category: 'chat' as const },
  { id: 'templates', name: 'Templates', description: 'Abre o menu de templates', defaultKey: 't', defaultModifiers: { ctrlKey: true }, category: 'chat' as const },
  { id: 'focus-input', name: 'Focar no campo', description: 'Move o foco para o campo de mensagem', defaultKey: '/', defaultModifiers: {}, category: 'chat' as const },
  { id: 'emoji-picker', name: 'Seletor de Emoji', description: 'Abre o seletor de emojis', defaultKey: 'e', defaultModifiers: { ctrlKey: true }, category: 'chat' as const },
  { id: 'attach-file', name: 'Anexar arquivo', description: 'Abre o seletor de arquivos', defaultKey: 'u', defaultModifiers: { ctrlKey: true }, category: 'chat' as const },
  { id: 'global-search', name: 'Busca global', description: 'Abre a busca global', defaultKey: 'k', defaultModifiers: { ctrlKey: true }, category: 'navigation' as const },
  { id: 'next-conversation', name: 'Próxima conversa', description: 'Navega para a próxima conversa', defaultKey: 'ArrowDown', defaultModifiers: { altKey: true }, category: 'navigation' as const },
  { id: 'prev-conversation', name: 'Conversa anterior', description: 'Navega para a conversa anterior', defaultKey: 'ArrowUp', defaultModifiers: { altKey: true }, category: 'navigation' as const },
  { id: 'open-tasks-tab', name: 'Tarefas da conversa', description: 'Abre a aba Tarefas com o foco no campo de nova tarefa', defaultKey: 't', defaultModifiers: { altKey: true }, category: 'navigation' as const },
  { id: 'show-shortcuts-help', name: 'Ajuda de atalhos', description: 'Mostra todos os atalhos disponíveis', defaultKey: '/', defaultModifiers: { ctrlKey: true }, category: 'navigation' as const },
  { id: 'toggle-sidebar', name: 'Alternar barra lateral', description: 'Mostra ou oculta a barra lateral', defaultKey: 'b', defaultModifiers: { ctrlKey: true }, category: 'navigation' as const },
  { id: 'go-to-inbox', name: 'Ir para Inbox', description: 'Navega para a caixa de entrada', defaultKey: '1', defaultModifiers: { ctrlKey: true }, category: 'navigation' as const },
  { id: 'go-to-dashboard', name: 'Ir para Dashboard', description: 'Navega para o painel principal', defaultKey: '2', defaultModifiers: { ctrlKey: true }, category: 'navigation' as const },
  { id: 'mark-resolved', name: 'Marcar como resolvido', description: 'Marca a conversa atual como resolvida', defaultKey: 'r', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' as const },
  { id: 'transfer-chat', name: 'Transferir chat', description: 'Abre o diálogo de transferência', defaultKey: 't', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' as const },
  { id: 'archive-chat', name: 'Arquivar chat', description: 'Arquiva a conversa selecionada', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions' as const },
  { id: 'pin-conversation', name: 'Fixar conversa', description: 'Fixa ou desfixa a conversa', defaultKey: 'p', defaultModifiers: { ctrlKey: true }, category: 'actions' as const },
  { id: 'mute-conversation', name: 'Silenciar conversa', description: 'Silencia notificações da conversa', defaultKey: 'm', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'actions' as const },
  { id: 'new-message', name: 'Nova mensagem', description: 'Inicia uma nova conversa', defaultKey: 'n', defaultModifiers: { ctrlKey: true }, category: 'actions' as const },
  { id: 'refresh-data', name: 'Atualizar dados', description: 'Recarrega os dados da página', defaultKey: 'r', defaultModifiers: { ctrlKey: true }, category: 'actions' as const },
  { id: 'select-all', name: 'Selecionar tudo', description: 'Seleciona todas as conversas', defaultKey: 'a', defaultModifiers: { ctrlKey: true }, category: 'selection' as const },
  { id: 'clear-selection', name: 'Limpar seleção', description: 'Remove a seleção atual', defaultKey: 'Escape', defaultModifiers: {}, category: 'selection' as const },
  { id: 'mark-read', name: 'Marcar como lido', description: 'Marca selecionados como lidos', defaultKey: 'r', defaultModifiers: {}, category: 'selection' as const },
  { id: 'bulk-archive', name: 'Arquivar selecionados', description: 'Arquiva todas as conversas selecionadas', defaultKey: 'e', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'selection' as const },
  { id: 'tasks-focus-quickadd', defaultKey: 'n', defaultModifiers: {}, category: 'actions' as const, scope: ['tasks'] },
  { id: 'tasks-mode', defaultKey: '1', alternateKeys: ['2', '3'], defaultModifiers: {}, category: 'navigation' as const, scope: ['tasks'] },
  { id: 'tasks-search', defaultKey: '/', defaultModifiers: {}, category: 'navigation' as const, scope: ['tasks'] },
  { id: 'tasks-open-sheet', defaultKey: 'e', defaultModifiers: {}, category: 'actions' as const, scope: ['tasks'] },
  { id: 'tasks-complete', defaultKey: 'x', defaultModifiers: {}, category: 'actions' as const, scope: ['tasks'] },
  { id: 'tasks-cancel', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions' as const, scope: ['tasks'] },
  { id: 'tasks-help', defaultKey: '?', defaultModifiers: { shiftKey: true }, category: 'navigation' as const, scope: ['tasks'] },
];

const SHORTCUTS_CUSTOMIZED = SHORTCUTS_DEFAULT.map(s =>
  s.id === 'tasks-focus-quickadd' ? { ...s, customKey: 'n', customModifiers: { ctrlKey: true } } : s
);

function mockHook(shortcuts: typeof SHORTCUTS_DEFAULT, isRecording: string | null = null) {
  return {
    shortcuts,
    isRecording,
    pendingShortcut: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    resetShortcut: vi.fn(),
    checkConflict: vi.fn(() => null),
    formatShortcut: vi.fn((s: ShortcutBinding) => {
      const parts: string[] = [];
      if (s.defaultModifiers?.ctrlKey) parts.push('Ctrl');
      if (s.defaultModifiers?.shiftKey) parts.push('Shift');
      if (s.defaultModifiers?.altKey) parts.push('Alt');
      parts.push(s.defaultKey === ' ' ? 'Space' : s.defaultKey);
      return parts;
    }),
    getActiveBinding: vi.fn((s: ShortcutBinding) => ({ key: s.defaultKey, modifiers: s.defaultModifiers })),
    getShortcutById: vi.fn((id: string) => shortcuts.find(x => x.id === id)),
    updateShortcut: vi.fn(),
    resetAllShortcuts: vi.fn(),
  };
}

describe('etapa 84 — tela de atalhos exibe nome e descrição das Tarefas', () => {
  beforeEach(() => {
    vi.mocked(useCustomShortcuts).mockReturnValue(mockHook(SHORTCUTS_DEFAULT));
  });

  it('lista os atalhos de Tarefas com o rótulo carregado sob demanda', () => {
    render(<KeyboardShortcutsSettings />);

    for (const { nome, descricao } of CASOS) {
      expect(screen.getByText(nome)).toBeInTheDocument();
      expect(screen.getByText(descricao)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Ajuda de atalhos')).toHaveLength(2);
    expect(screen.getByText('Mostra o painel de atalhos')).toBeInTheDocument();
  });

  it('mantém os atalhos globais intactos', () => {
    render(<KeyboardShortcutsSettings />);

    expect(screen.getByText('Enviar mensagem')).toBeInTheDocument();
    expect(screen.getByText('Envia a mensagem atual')).toBeInTheDocument();
    expect(screen.getByText('Busca global')).toBeInTheDocument();
  });
});

describe('acessibilidade dos botões de ação', () => {
  it('o botão de confirmar tem aria-label "Confirmar atalho"', () => {
    vi.mocked(useCustomShortcuts).mockReturnValue(
      mockHook(SHORTCUTS_DEFAULT, 'tasks-focus-quickadd')
    );

    render(<KeyboardShortcutsSettings />);

    expect(screen.getByRole('button', { name: 'Confirmar atalho' })).toBeInTheDocument();
  });

  it('o botão de cancelar tem aria-label "Cancelar"', () => {
    vi.mocked(useCustomShortcuts).mockReturnValue(
      mockHook(SHORTCUTS_DEFAULT, 'tasks-focus-quickadd')
    );

    render(<KeyboardShortcutsSettings />);

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('o botão de restaurar tem aria-label "Restaurar atalho"', () => {
    vi.mocked(useCustomShortcuts).mockReturnValue(
      mockHook(SHORTCUTS_CUSTOMIZED, null)
    );

    render(<KeyboardShortcutsSettings />);

    expect(screen.getByRole('button', { name: 'Restaurar atalho' })).toBeInTheDocument();
  });

  it('o axe não acusa `button-name` na tela', async () => {
    vi.mocked(useCustomShortcuts).mockReturnValue(
      mockHook(SHORTCUTS_CUSTOMIZED, 'tasks-focus-quickadd')
    );

    render(<KeyboardShortcutsSettings />);

    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'button-name')).toEqual([]);
  });
});