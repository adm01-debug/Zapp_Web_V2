import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  shortcuts: [
    { id: 'select-all', name: 'Selecionar tudo', defaultKey: 'a', defaultModifiers: { ctrlKey: true }, category: 'selection' },
    { id: 'clear-selection', name: 'Limpar seleção', defaultKey: 'Escape', defaultModifiers: {}, category: 'selection' },
    { id: 'global-search', name: 'Busca global', defaultKey: 'k', defaultModifiers: { ctrlKey: true }, category: 'navigation' },
    { id: 'next-conversation', name: 'Próxima conversa', defaultKey: 'ArrowDown', defaultModifiers: { altKey: true }, category: 'navigation' },
    { id: 'prev-conversation', name: 'Conversa anterior', defaultKey: 'ArrowUp', defaultModifiers: { altKey: true }, category: 'navigation' },
    { id: 'send-message', name: 'Enviar mensagem', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' },
    { id: 'archive-chat', name: 'Arquivar chat', defaultKey: 'Delete', defaultModifiers: {}, category: 'actions' },
  ],
}));

vi.mock('@/hooks/ui/useCustomShortcuts', () => ({
  useCustomShortcuts: () => ({
    shortcuts: mocks.shortcuts,
    formatShortcut: (s: { defaultModifiers?: { ctrlKey?: boolean; altKey?: boolean }; defaultKey: string }) => [
      ...(s.defaultModifiers?.ctrlKey ? ['Ctrl'] : []),
      ...(s.defaultModifiers?.altKey ? ['Alt'] : []),
      s.defaultKey,
    ],
  }),
}));

import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';

async function abrirPainel() {
  render(<KeyboardShortcutsHelp />);
  fireEvent.click(screen.getByRole('button'));
  return screen.findByText('Selecionar tudo');
}

describe('KeyboardShortcutsHelp — filtra os atalhos da inbox', () => {
  it('mostra seleção e navegação da inbox e esconde chat/actions', async () => {
    await abrirPainel();
    expect(screen.getByText('Busca global')).toBeInTheDocument();
    expect(screen.getByText('Próxima conversa')).toBeInTheDocument();
    expect(screen.getByText('Conversa anterior')).toBeInTheDocument();
    expect(screen.queryByText('Enviar mensagem')).not.toBeInTheDocument();
    expect(screen.queryByText('Arquivar chat')).not.toBeInTheDocument();
  });

  it('desenha cada tecla que compõe o atalho', async () => {
    await abrirPainel();
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
    expect(screen.getAllByText('a').length).toBeGreaterThan(0);
  });
});
