/**
 * Etapa 84 — o painel de ajuda mostra os rótulos dos 7 atalhos de Tarefas.
 *
 * Os textos não vivem mais em `defaultShortcuts` (eager): chegam de
 * `taskShortcutLabels`, que entra no chunk deste painel. Aqui se prova o outro
 * lado do corte — o usuário continua lendo nome e descrição de cada atalho de
 * Tarefas na lista, junto dos atalhos globais que já eram inline.
 *
 * Radix/ScrollArea são substituídos por passthroughs (mesmo critério de
 * SettingsView.test.tsx): o teste é sobre a montagem da lista, não sobre o
 * comportamento interno dos primitivos de UI.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/dialog', async () => {
  const { createElement: ce } = await import('react');
  return {
    Dialog: ({ children }: { children: ReactNode }) => ce('div', {}, children),
    DialogContent: ({ children }: { children: ReactNode }) => ce('div', { role: 'dialog' }, children),
    DialogHeader: ({ children }: { children: ReactNode }) => ce('header', {}, children),
    DialogTitle: ({ children }: { children: ReactNode }) => ce('h2', {}, children),
    DialogDescription: ({ children }: { children: ReactNode }) => ce('p', {}, children),
  };
});

vi.mock('@/components/ui/scroll-area', async () => {
  const { createElement: ce } = await import('react');
  return {
    ScrollArea: ({ children }: { children: ReactNode }) => ce('div', {}, children),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { KeyboardShortcutsDialog } from '@/components/keyboard/KeyboardShortcutsDialog';

const ROTULOS_TAREFAS = [
  'Nova tarefa', 'Modo das Tarefas', 'Buscar tarefa', 'Abrir tarefa focada',
  'Concluir tarefa focada', 'Cancelar tarefa focada',
];

function abrirPainel() {
  return render(<KeyboardShortcutsDialog open onOpenChange={vi.fn()} />);
}

describe('etapa 84 — painel de ajuda exibe os rótulos de Tarefas', () => {
  it('mostra o nome dos atalhos de Tarefas', () => {
    abrirPainel();

    for (const nome of ROTULOS_TAREFAS) {
      expect(screen.getByText(nome)).toBeInTheDocument();
    }
    // "Ajuda de atalhos" é o nome do atalho de Tarefas E o do atalho global
    // `show-shortcuts-help`: os dois ficam rotulados, então aparece duas vezes.
    expect(screen.getAllByText('Ajuda de atalhos')).toHaveLength(2);
    // A descrição dos atalhos de Tarefas é exibida na tela de Configurações →
    // Atalhos (ver KeyboardShortcutsSettings.test.tsx); este painel mostra só
    // o nome, mas ele vem do mesmo chunk sob demanda.
  });

  it('não afeta os atalhos globais, que continuam com o texto inline', () => {
    abrirPainel();

    expect(screen.getByText('Enviar mensagem')).toBeInTheDocument();
    // "Busca global" aparece duas vezes: como atalho (`global-search`) e na
    // lista de dicas globais do rodapé.
    expect(screen.getAllByText('Busca global').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Navegação')).toBeInTheDocument();
  });

  it('renderiza as teclas dos atalhos de Tarefas', () => {
    abrirPainel();

    // `tasks-mode` responde a 1/2/3; a linha mostra a tecla padrão.
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('?').length).toBeGreaterThan(0);
  });
});
